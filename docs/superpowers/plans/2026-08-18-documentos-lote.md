# Documentos del lote + información de acceso rápido — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir subir/eliminar documentos sueltos (planos, papeles) en un lote, y darle al vendedor/cobrador una pantalla de solo lectura con precio, acreedor y esos documentos, accesible directo desde la lista de lotes sin pasar por "Reservar".

**Architecture:** Tabla nueva `lote_documentos` (una fila por archivo, descripción libre — primera lista de largo variable de archivos del proyecto). Dos Server Actions nuevas en `app/admin/lotes/[id]/actions.ts` (subir/eliminar), gateadas con `requireAdminSobreLote` ya existente. Página nueva de solo lectura `/admin/lotes/[id]/info`, gateada con `requireAccesoParaReservar` ya existente (mismo acceso que `/reservar`).

**Tech Stack:** Next.js 16 App Router, Server Actions, Supabase (Postgres + Storage), Playwright e2e.

## Global Constraints

- Spec completa: `docs/superpowers/specs/2026-08-18-documentos-lote-design.md`.
- Subir/eliminar documentos: administrador, o el acreedor del lote (`requireAdminSobreLote`).
- Ver `/admin/lotes/[id]/info`: administrador, acreedor (si es el suyo), vendedor, cobrador (`requireAccesoParaReservar`).
- Eliminar un documento borra solo la fila de `lote_documentos`, nunca el archivo del storage.
- Bucket de storage: `comprobantes` (el mismo que usa todo el proyecto). Límite de tamaño: `MAX_ARCHIVO_MB`/`excedeTamanioMaximo` de `lib/storage/validar-tamanio-archivo.ts`, sin excepción.
- `/admin/lotes/[id]/info` no depende de `lote.estado` — se ve igual en cualquier estado.

---

### Task 1: Migración — tabla `lote_documentos`

**Files:**
- Create: `supabase/migrations/0025_lote_documentos.sql`

**Interfaces:**
- Produces: tabla `public.lote_documentos(id uuid pk, lote_id uuid not null fk→lotes on delete cascade, path text not null, descripcion text not null, subido_por uuid not null fk→profiles, created_at timestamptz not null default now())`.

**Esta tarea la ejecuta el controller directamente contra la base real vía el MCP de Supabase — no se dispatchea a un implementador** (mismo patrón que las migraciones anteriores de esta sesión).

- [ ] **Paso 1: Verificar el proyecto Supabase correcto**

`mcp__supabase__get_project_url` y confirmar que coincide con `NEXT_PUBLIC_SUPABASE_URL` de `.env.local` (`https://zcdjuxuvsfickymrhynx.supabase.co`).

- [ ] **Paso 2: Escribir y aplicar la migración**

```sql
create table public.lote_documentos (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes(id) on delete cascade,
  path text not null,
  descripcion text not null,
  subido_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
```

Aplicar con `mcp__supabase__apply_migration` (`name: "lote_documentos"`).

- [ ] **Paso 3: Verificar aplicada**

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'lote_documentos'
order by ordinal_position;
```

Esperado: 6 filas (id, lote_id, path, descripcion, subido_por, created_at) con los tipos de arriba.

- [ ] **Paso 4: Commit**

```bash
git add supabase/migrations/0025_lote_documentos.sql
git commit -m "feat: agrega tabla lote_documentos para archivos sueltos por lote"
```

---

### Task 2: Subir/eliminar documentos — Server Actions + sección en el detalle de lote

**Files:**
- Modify: `app/admin/lotes/[id]/actions.ts` (agrega `subirDocumentoLote`, `eliminarDocumentoLote`)
- Modify: `app/admin/lotes/[id]/page.tsx` (agrega sección "Documentos")
- Test: `tests/e2e/documentos-lote.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `requireAdminSobreLote(loteId: string)` de `lib/auth/require-admin.ts`. `excedeTamanioMaximo(archivo: File): boolean` y `MAX_ARCHIVO_MB: number` de `lib/storage/validar-tamanio-archivo.ts`.
- Produces: `subirDocumentoLote(loteId: string, formData: FormData): Promise<void>`, `eliminarDocumentoLote(documentoId: string, loteId: string): Promise<void>`, ambas exportadas de `app/admin/lotes/[id]/actions.ts`.

#### Paso 1: Server Actions

- [ ] Modificar `app/admin/lotes/[id]/actions.ts`: agregar el import y las dos funciones al final del archivo.

```ts
import { excedeTamanioMaximo, MAX_ARCHIVO_MB } from '@/lib/storage/validar-tamanio-archivo'
```

(agregar junto a los imports existentes, después de `import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'`)

```ts
export async function subirDocumentoLote(loteId: string, formData: FormData) {
  await requireAdminSobreLote(loteId)

  const descripcion = ((formData.get('descripcion') as string) || '').trim()
  const archivo = formData.get('archivo') as File

  if (!descripcion) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent('Ingresá una descripción para el documento')}`
    )
  }

  if (!archivo || archivo.size === 0) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent('Elegí un archivo para subir')}`)
  }

  if (excedeTamanioMaximo(archivo)) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent(
        `El archivo pesa más de ${MAX_ARCHIVO_MB} MB — subí uno más liviano.`
      )}`
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const nombreSeguro = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `lotes/${loteId}/documento-${Date.now()}-${nombreSeguro}`

  const { error: errorSubida } = await admin.storage.from('comprobantes').upload(path, archivo)

  if (errorSubida) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent('No se pudo subir el archivo. Probá de nuevo.')}`
    )
  }

  const { error: errorInsert } = await supabase.from('lote_documentos').insert({
    lote_id: loteId,
    path,
    descripcion,
    subido_por: user!.id,
  })

  if (errorInsert) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(errorInsert.message)}`)
  }

  redirect(`/admin/lotes/${loteId}`)
}

export async function eliminarDocumentoLote(documentoId: string, loteId: string) {
  await requireAdminSobreLote(loteId)

  const supabase = await createClient()

  // El .eq('lote_id', loteId) es una segunda barrera además de
  // requireAdminSobreLote: sin esto, alguien con permiso sobre SU lote
  // podría borrar la fila de un documento de OTRO lote si adivinara su id,
  // ya que requireAdminSobreLote solo valida el loteId recibido, no que
  // documentoId realmente pertenezca a ese lote.
  const { error } = await supabase
    .from('lote_documentos')
    .delete()
    .eq('id', documentoId)
    .eq('lote_id', loteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(error.message)}`)
  }

  redirect(`/admin/lotes/${loteId}`)
}
```

#### Paso 2: Sección "Documentos" en `app/admin/lotes/[id]/page.tsx`

- [ ] Agregar el import de las dos acciones nuevas junto al de las existentes:

```ts
import { actualizarDatosGenerales, actualizarCobro, eliminarLote, subirDocumentoLote, eliminarDocumentoLote } from './actions'
```

- [ ] Después de la carga de `participantes`/`cuentasExternas` (antes de la línea `const actualizarDatosGeneralesConId = actualizarDatosGenerales.bind(null, id)`), agregar la carga de documentos:

```ts
const { data: documentos } = await supabase
  .from('lote_documentos')
  .select('id, path, descripcion, subido_por, created_at')
  .eq('lote_id', id)
  .order('created_at', { ascending: false })

const subidoPorIds = [...new Set((documentos ?? []).map((d) => d.subido_por))]
const { data: subidoPorPersonas } =
  subidoPorIds.length > 0
    ? await supabase.from('profiles').select('id, full_name').in('id', subidoPorIds)
    : { data: [] }
const nombreSubidoPorId = new Map((subidoPorPersonas ?? []).map((persona) => [persona.id, persona.full_name]))

const adminDocumentos = createAdminClient()
const documentosConUrl = await Promise.all(
  (documentos ?? []).map(async (documento) => {
    const { data: signedUrl } = await adminDocumentos.storage
      .from('comprobantes')
      .createSignedUrl(documento.path, 300)
    return {
      ...documento,
      url: signedUrl?.signedUrl ?? null,
      nombreSubidoPor: nombreSubidoPorId.get(documento.subido_por) ?? '—',
    }
  })
)
```

- [ ] Junto a los otros `.bind`, agregar:

```ts
const subirDocumentoConId = subirDocumentoLote.bind(null, id)
```

- [ ] Insertar la sección nueva en el JSX, inmediatamente después del `</form>` que cierra "Datos generales" (después de la línea `</form>` que sigue al botón "Guardar" de esa sección) y antes de `{perfilPropio!.role === 'administrador' && ( <> <h2 ...>Cobro</h2>`:

```tsx
      <h2 className="mb-2 mt-8 text-lg font-semibold">Documentos</h2>
      {documentosConUrl.length === 0 ? (
        <p className="mb-3 text-sm text-gray-600">Todavía no se subió ningún documento.</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-2">
          {documentosConUrl.map((documento) => {
            const eliminarDocumentoConId = eliminarDocumentoLote.bind(null, documento.id, id)
            return (
              <li key={documento.id} className="flex items-center gap-3 text-sm">
                {documento.url ? (
                  <a href={documento.url} target="_blank" className="underline">
                    {documento.descripcion}
                  </a>
                ) : (
                  <span>{documento.descripcion} (link no disponible)</span>
                )}
                <span className="text-gray-500">— subido por {documento.nombreSubidoPor}</span>
                <form action={eliminarDocumentoConId}>
                  <button type="submit" className="text-sm text-red-700 underline">
                    Eliminar
                  </button>
                </form>
              </li>
            )
          })}
        </ul>
      )}
      <form action={subirDocumentoConId} className="mb-8 flex flex-col gap-3">
        <label className="text-sm">
          Descripción
          <input
            name="descripcion"
            placeholder="Ej: Plano del lote"
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Archivo
          <input name="archivo" type="file" required className="mt-1 block w-full rounded border px-3 py-2" />
        </label>
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Subir documento
        </button>
      </form>
```

#### Paso 3: Tests e2e

- [ ] Crear `tests/e2e/documentos-lote.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

test.describe('Documentos del lote', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('admin sube un documento y aparece en la sección con su link funcionando', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}`)

    await page.getByPlaceholder('Ej: Plano del lote').fill('Plano de prueba')
    await page.setInputFiles('input[name="archivo"]', {
      name: 'plano-test.pdf',
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    await page.getByRole('button', { name: 'Subir documento' }).click()
    await page.waitForURL(new RegExp(`/admin/lotes/${fixtures.loteId}$`))

    const fila = page.locator('li', { hasText: 'Plano de prueba' })
    await expect(fila).toBeVisible()
    await expect(fila.getByRole('link', { name: 'Plano de prueba' })).toBeVisible()
  })

  test('un acreedor puede subir un documento a su propio lote', async ({ page }) => {
    await login(page, fixtures.acreedorSecundario.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteSecundarioId}`)

    await page.getByPlaceholder('Ej: Plano del lote').fill('Documento del acreedor')
    await page.setInputFiles('input[name="archivo"]', {
      name: 'doc-acreedor.pdf',
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    await page.getByRole('button', { name: 'Subir documento' }).click()
    await page.waitForURL(new RegExp(`/admin/lotes/${fixtures.loteSecundarioId}$`))

    await expect(page.locator('li', { hasText: 'Documento del acreedor' })).toBeVisible()
  })

  test('el rechazo de un acreedor sobre un lote que dejó de ser suyo ocurre en el servidor', async ({
    page,
  }) => {
    const admin = createAdminClient()

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}`)

    await page.getByPlaceholder('Ej: Plano del lote').fill('Intento tardío')
    await page.setInputFiles('input[name="archivo"]', {
      name: 'intento.pdf',
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })

    try {
      // Maniobra clave: el lote cambia de acreedor DESPUÉS de que el
      // formulario ya está renderizado en el browser -- el filtro de
      // render inicial ya no protege nada en este momento.
      await admin
        .from('lotes')
        .update({ acreedor_id: fixtures.acreedorSecundario.id })
        .eq('id', fixtures.loteId)

      await page.getByRole('button', { name: 'Subir documento' }).click()
      await page.waitForURL(/\/admin\/lotes/)

      const { count } = await admin
        .from('lote_documentos')
        .select('id', { count: 'exact', head: true })
        .eq('lote_id', fixtures.loteId)
        .eq('descripcion', 'Intento tardío')
      expect(count).toBe(0)
    } finally {
      await admin
        .from('lotes')
        .update({ acreedor_id: fixtures.acreedorConDatos.id })
        .eq('id', fixtures.loteId)
    }
  })

  test('admin elimina un documento y el resto queda intacto', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}`)

    for (const nombre of ['Doc A', 'Doc B']) {
      await page.getByPlaceholder('Ej: Plano del lote').fill(nombre)
      await page.setInputFiles('input[name="archivo"]', {
        name: `${nombre}.pdf`,
        mimeType: 'application/pdf',
        buffer: COMPROBANTE_BYTES,
      })
      await page.getByRole('button', { name: 'Subir documento' }).click()
      await page.waitForURL(new RegExp(`/admin/lotes/${fixtures.loteId}$`))
    }

    const filaA = page.locator('li', { hasText: 'Doc A' })
    await filaA.getByRole('button', { name: 'Eliminar' }).click()
    await page.waitForURL(new RegExp(`/admin/lotes/${fixtures.loteId}$`))

    await expect(page.locator('li', { hasText: 'Doc A' })).toHaveCount(0)
    await expect(page.locator('li', { hasText: 'Doc B' })).toBeVisible()
  })
})
```

- [ ] Correr: `npx playwright test tests/e2e/documentos-lote.spec.ts`
Expected: 4/4 PASS.

- [ ] Correr `npx tsc --noEmit` y confirmar sin errores nuevos.

- [ ] Commit:

```bash
git add app/admin/lotes/\[id\]/actions.ts app/admin/lotes/\[id\]/page.tsx tests/e2e/documentos-lote.spec.ts
git commit -m "feat: subir y eliminar documentos sueltos en el detalle de lote"
```

---

### Task 3: Pantalla de solo lectura `/info` + link desde la lista de lotes

**Files:**
- Create: `app/admin/lotes/[id]/info/page.tsx`
- Modify: `app/admin/lotes/page.tsx`
- Test: `tests/e2e/documentos-lote.spec.ts` (agrega 3 tests a los 4 de Task 2)

**Interfaces:**
- Consumes: `requireAccesoParaReservar(loteId: string)` de `lib/auth/require-admin.ts`. Tabla `lote_documentos` (Task 1).

#### Paso 1: Página de solo lectura

- [ ] Crear `app/admin/lotes/[id]/info/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { requireAccesoParaReservar } from '@/lib/auth/require-admin'

export default async function InfoLotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  await requireAccesoParaReservar(id)

  const supabase = await createClient()

  const { data: lote } = await supabase
    .from('lotes')
    .select('id, identificador, ubicacion, estado, precio_total, moneda, acreedor_id')
    .eq('id', id)
    .single()

  if (!lote) {
    notFound()
  }

  const { data: acreedor } = lote!.acreedor_id
    ? await supabase.from('profiles').select('full_name').eq('id', lote!.acreedor_id).single()
    : { data: null }

  const { data: documentos } = await supabase
    .from('lote_documentos')
    .select('id, path, descripcion')
    .eq('lote_id', id)
    .order('created_at', { ascending: false })

  const admin = createAdminClient()
  const documentosConUrl = await Promise.all(
    (documentos ?? []).map(async (documento) => {
      const { data: signedUrl } = await admin.storage
        .from('comprobantes')
        .createSignedUrl(documento.path, 300)
      return { ...documento, url: signedUrl?.signedUrl ?? null }
    })
  )

  return (
    <main className="max-w-md">
      <a href="/admin/lotes" className="mb-4 inline-block text-sm underline">
        ← Volver a Lotes
      </a>
      <h1 className="mb-6 text-xl font-semibold">{lote!.identificador}</h1>

      {lote!.ubicacion && <p className="mb-1 text-sm">Ubicación: {lote!.ubicacion}</p>}
      <p className="mb-1 text-sm">Estado: {lote!.estado}</p>
      {lote!.precio_total && (
        <p className="mb-1 text-sm">
          Precio total: {lote!.precio_total} {lote!.moneda}
        </p>
      )}
      <p className="mb-4 text-sm">Acreedor: {acreedor ? acreedor.full_name : '— sin asignar —'}</p>

      <h2 className="mb-2 text-lg font-semibold">Documentos</h2>
      {documentosConUrl.length === 0 ? (
        <p className="text-sm text-gray-600">Todavía no se subió ningún documento.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {documentosConUrl.map((documento) => (
            <li key={documento.id} className="text-sm">
              {documento.url ? (
                <a href={documento.url} target="_blank" className="underline">
                  {documento.descripcion}
                </a>
              ) : (
                <span>{documento.descripcion} (link no disponible)</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

#### Paso 2: Link en la lista de lotes

- [ ] Modificar `app/admin/lotes/page.tsx`. Reemplazar el bloque de la celda de acciones de la tabla principal (la rama `esVendedorOCobrador ? (...) : (...)` alrededor de la línea 270-298):

```tsx
                <td>
                  {esVendedorOCobrador ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <a href={`/admin/lotes/${lote.id}/info`} className="text-sm underline">
                        Ver información del lote →
                      </a>
                      <a href={`/admin/lotes/${lote.id}/reservar`} className="text-sm underline">
                        Reservar
                      </a>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <a href={`/admin/lotes/${lote.id}/info`} className="text-sm underline">
                        Ver información del lote →
                      </a>
                      <a href={`/admin/lotes/${lote.id}`} className="text-sm underline">
                        Ver detalle
                      </a>
                      {lote.estado === 'disponible' && (
                        <a href={`/admin/lotes/${lote.id}/reservar`} className="text-sm underline">
                          Reservar
                        </a>
                      )}
                      {perfilPropio!.role === 'administrador' && lote.estado === 'reservado' && (
                        <a href={`/admin/lotes/${lote.id}/vender`} className="text-sm underline">
                          Vender / asignar cliente
                        </a>
                      )}
                      {lote.moneda === 'ARS' && (
                        <a href={`/admin/lotes/${lote.id}/indexar`} className="text-sm underline">
                          Indexar
                        </a>
                      )}
                      {perfilPropio!.role === 'administrador' && (
                        <BotonEliminarLote eliminarLoteAction={eliminarLoteConId} compacto />
                      )}
                    </div>
                  )}
                </td>
```

- [ ] En la tabla "Lotes que reservaste" (la que solo ve `esVendedorOCobrador`, alrededor de la línea 160-179), reemplazar la última `<td>` de cada fila:

```tsx
                      <td>
                        <div className="flex flex-wrap items-center gap-3">
                          <a href={`/admin/lotes/${lote.id}/info`} className="text-sm underline">
                            Ver información del lote →
                          </a>
                          {lote.estado === 'reservado' && (
                            <BotonCancelarReserva cancelarReservaAction={cancelarReservaConId} />
                          )}
                        </div>
                      </td>
```

#### Paso 3: Tests e2e

- [ ] Agregar estos 3 tests al final de `tests/e2e/documentos-lote.spec.ts` (dentro del mismo `test.describe`, después del test "admin elimina un documento..."):

```ts
  test('un vendedor ve precio, acreedor y documentos en /info sin pasar por reservar', async ({ page }) => {
    const admin = createAdminClient()
    const filePath = `lotes/${fixtures.loteSecundarioId}/doc-info-test.pdf`
    await admin.storage
      .from('comprobantes')
      .upload(filePath, COMPROBANTE_BYTES, { contentType: 'application/pdf' })
    await admin.from('lote_documentos').insert({
      lote_id: fixtures.loteSecundarioId,
      path: filePath,
      descripcion: 'Plano visible para vendedor',
      subido_por: fixtures.admin.id,
    })

    await login(page, fixtures.vendedorLoteA.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteSecundarioId}/info`)

    await expect(page.getByText(/Acreedor: E2E Acreedor Secundario/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Plano visible para vendedor' })).toBeVisible()
  })

  test('un cliente no puede acceder a /admin/lotes/[id]/info', async ({ page }) => {
    await login(page, fixtures.cliente.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteSecundarioId}/info`)
    await expect(page).toHaveURL(/\/login/)
  })

  test('el link "Ver información del lote →" aparece en /admin/lotes para un vendedor', async ({ page }) => {
    await login(page, fixtures.vendedorLoteA.email, fixtures.password)
    await page.goto('/admin/lotes')

    const fila = page.locator('tr', { has: page.getByText('E2E Lote Secundario') })
    await expect(fila.getByRole('link', { name: 'Ver información del lote →' })).toBeVisible()
  })
```

- [ ] Correr: `npx playwright test tests/e2e/documentos-lote.spec.ts`
Expected: 7/7 PASS.

- [ ] Correr `npx tsc --noEmit` y confirmar sin errores nuevos.

- [ ] Correr una regresión amplia sobre lotes/reservar: `npx playwright test tests/e2e/documentos-lote.spec.ts tests/e2e/reserva-lote.spec.ts tests/e2e/busqueda-lotes.spec.ts tests/e2e/acreedor-al-crear-lote.spec.ts tests/e2e/visibilidad-acreedor.spec.ts`
Expected: todo en verde.

- [ ] Commit:

```bash
git add app/admin/lotes/\[id\]/info/page.tsx app/admin/lotes/page.tsx tests/e2e/documentos-lote.spec.ts
git commit -m "feat: pantalla de solo lectura /info y link de acceso rápido para vendedor/cobrador"
```

---

## Self-Review

**Cobertura de la spec:** Modelo de datos → Task 1. Quién sube/borra y desde dónde → Task 2. Pantalla de solo lectura → Task 3 Paso 1. Acceso desde la lista de lotes → Task 3 Paso 2. Los 7 casos de testing de la spec → los 7 tests repartidos entre Task 2 (4) y Task 3 (3), mapeo 1 a 1.

**Placeholders:** ninguno — código completo en cada paso.

**Consistencia de tipos:** `subirDocumentoLote(loteId: string, formData: FormData)` y `eliminarDocumentoLote(documentoId: string, loteId: string)` se definen una vez en Task 2 y se consumen tal cual en Task 2 (misma tarea, `.bind`) — Task 3 no las toca. `requireAccesoParaReservar(loteId: string)` se reusa sin modificar.
