# Fotos en la reserva Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar a la reserva de un lote las fotos del DNI (frente y dorso, siempre obligatorias) y, condicionalmente según el estado civil, el DNI del cónyuge (si casado/a) o la sentencia de divorcio (si divorciado/a).

**Architecture:** Cuatro columnas nuevas en `reservas`, reutilizando el bucket de storage `comprobantes` ya existente y el mismo patrón de subida/validación que ya usa `comprobante_sena_path`. Los 4 campos de archivo están siempre visibles en el formulario (no hay JS de cliente para mostrar/ocultar según el `<select>` de estado civil); la obligatoriedad de cónyuge/sentencia se valida server-side contra el `estadoCivil` real del submit.

**Tech Stack:** Next.js 16 (Server Components + Server Actions), Supabase (Postgres + Storage), TypeScript.

## Global Constraints

- Sin JavaScript de cliente nuevo.
- Reutilizar el bucket de storage `comprobantes` (no crear uno nuevo) y el mismo patrón de sanitización de nombre de archivo: `nombre.replace(/[^a-zA-Z0-9._-]/g, '_')`.
- Path de cada archivo nuevo: `reservas/${loteId}/${tipo}-${Date.now()}-${nombreSeguro}`, con `tipo` en `dni-frente`, `dni-dorso`, `dni-conyuge`, `sentencia-divorcio`.
- Las 4 columnas nuevas quedan `nullable` a nivel de base (no `not null`) — la obligatoriedad de DNI frente/dorso vive en la validación de la Server Action, igual que ya pasa hoy con `nombreCompleto`/`dni`/etc.
- "Foto de la reserva" (campo separado del documento original de Nicolás) queda fuera de esta tanda — no construir nada para eso.

---

### Task 1: Migración — 4 columnas nuevas en `reservas`

**Files:**
- Create: `supabase/migrations/0015_reservas_fotos.sql`

**Interfaces:**
- Consumes: nada.
- Produces: columnas `reservas.dni_frente_path`, `reservas.dni_dorso_path`, `reservas.dni_conyuge_path`, `reservas.sentencia_divorcio_path`, todas `text` nullable. Tasks 2, 3 y 4 dependen de que estas columnas ya existan.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/0015_reservas_fotos.sql
alter table public.reservas
  add column dni_frente_path text,
  add column dni_dorso_path text,
  add column dni_conyuge_path text,
  add column sentencia_divorcio_path text;
```

- [ ] **Step 2: Aplicar directamente contra la base (el controller, no un subagente — `apply_migration` queda bloqueado por el clasificador de permisos de Auto Mode para subagentes)**

Antes de aplicar, verificar con `mcp__supabase__get_project_url` que coincide con `NEXT_PUBLIC_SUPABASE_URL` de `.env.local`. Aplicar con `mcp__supabase__apply_migration`. Verificar después con una consulta a `information_schema.columns` que las 4 columnas existen en `reservas`.

- [ ] **Step 3: Commit del archivo de migración**

```bash
git add supabase/migrations/0015_reservas_fotos.sql
git commit -m "Migracion: 4 columnas de fotos nuevas en reservas (DNI frente/dorso/conyuge, sentencia divorcio)"
```

---

### Task 2: Server Action + formulario — subir y validar las fotos

**Files:**
- Modify: `app/admin/lotes/[id]/reservar/actions.ts`
- Modify: `app/admin/lotes/[id]/reservar/page.tsx`
- Test: `tests/e2e/fotos-reserva.spec.ts` (nuevo)

**Interfaces:**
- Consumes: las 4 columnas de Task 1. `ESTADOS_CIVILES_VALIDOS` ya existe en `actions.ts` (`['soltero', 'casado', 'divorciado', 'viudo']`) — no redefinir, reusar la constante ya presente en el archivo.
- Produces: `reservarLote` (ya existe, se modifica) sigue con la misma firma `(loteId: string, formData: FormData) => Promise<void>`. Task 3 lee las 4 columnas nuevas de `reservas` — los nombres de columna deben coincidir exacto: `dni_frente_path`, `dni_dorso_path`, `dni_conyuge_path`, `sentencia_divorcio_path`.

- [ ] **Step 1: Escribir el test (falla porque los campos todavía no existen)**

```typescript
// tests/e2e/fotos-reserva.spec.ts
import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

async function crearLoteDisponible(identificador: string, acreedorId: string) {
  const admin = createAdminClient()
  const { data: lote, error } = await admin
    .from('lotes')
    .insert({
      identificador,
      moneda: 'USD',
      estado: 'disponible',
      acreedor_id: acreedorId,
    })
    .select('id')
    .single()

  if (error || !lote) {
    throw new Error(`No se pudo crear el lote de prueba: ${error?.message}`)
  }

  return lote.id as string
}

function subirArchivo(page: Page, selector: string, nombre: string) {
  return page.setInputFiles(selector, {
    name: nombre,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
}

async function completarCamposBasicos(page: Page, estadoCivil: string) {
  await page.getByPlaceholder('Nombre completo').fill('Comprador Fotos E2E')
  await page.getByPlaceholder('DNI').fill('30111222')
  await page.getByPlaceholder('Domicilio').fill('Calle Falsa 123')
  await page.getByPlaceholder('Email').fill(`fotos.e2e.${Date.now()}@sima-e2e.invalid`)
  await page.getByPlaceholder('Teléfono', { exact: true }).fill('3511234567')
  await page.selectOption('select[name="estadoCivil"]', estadoCivil)
  await page.getByPlaceholder('Monto de la seña').fill('500')
  await subirArchivo(page, 'input[name="comprobante"]', `e2e-comprobante-${Date.now()}.pdf`)
}

test.describe('Fotos en la reserva', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('soltero: DNI frente y dorso alcanzan, no piden cónyuge ni sentencia', async ({ page }) => {
    const loteId = await crearLoteDisponible(
      `E2E Fotos Soltero ${Date.now()}`,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await completarCamposBasicos(page, 'soltero')
    await subirArchivo(page, 'input[name="dniFrente"]', `e2e-dni-frente-${Date.now()}.pdf`)
    await subirArchivo(page, 'input[name="dniDorso"]', `e2e-dni-dorso-${Date.now()}.pdf`)

    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: reserva } = await admin
      .from('reservas')
      .select('dni_frente_path, dni_dorso_path, dni_conyuge_path, sentencia_divorcio_path')
      .eq('lote_id', loteId)
      .single()

    expect(reserva?.dni_frente_path).toBeTruthy()
    expect(reserva?.dni_dorso_path).toBeTruthy()
    expect(reserva?.dni_conyuge_path).toBeNull()
    expect(reserva?.sentencia_divorcio_path).toBeNull()
  })

  test('reservar sin subir el DNI frente es rechazado, el lote sigue disponible', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponible(
      `E2E Fotos Sin DNI Frente ${Date.now()}`,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await completarCamposBasicos(page, 'soltero')
    await subirArchivo(page, 'input[name="dniDorso"]', `e2e-dni-dorso-${Date.now()}.pdf`)
    // dniFrente NO se sube a propósito.

    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await expect(page.getByText('Subí las fotos del DNI (frente y dorso)')).toBeVisible()

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()
    expect(lote?.estado).toBe('disponible')
  })

  test('casado sin subir el DNI del cónyuge es rechazado', async ({ page }) => {
    const loteId = await crearLoteDisponible(
      `E2E Fotos Casado Sin Conyuge ${Date.now()}`,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await completarCamposBasicos(page, 'casado')
    await subirArchivo(page, 'input[name="dniFrente"]', `e2e-dni-frente-${Date.now()}.pdf`)
    await subirArchivo(page, 'input[name="dniDorso"]', `e2e-dni-dorso-${Date.now()}.pdf`)
    // dniConyuge NO se sube a propósito.

    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await expect(
      page.getByText('Subí el DNI del cónyuge (elegiste "Casado/a")')
    ).toBeVisible()

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()
    expect(lote?.estado).toBe('disponible')
  })

  test('divorciado sin subir la sentencia es rechazado', async ({ page }) => {
    const loteId = await crearLoteDisponible(
      `E2E Fotos Divorciado Sin Sentencia ${Date.now()}`,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await completarCamposBasicos(page, 'divorciado')
    await subirArchivo(page, 'input[name="dniFrente"]', `e2e-dni-frente-${Date.now()}.pdf`)
    await subirArchivo(page, 'input[name="dniDorso"]', `e2e-dni-dorso-${Date.now()}.pdf`)
    // sentenciaDivorcio NO se sube a propósito.

    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await expect(
      page.getByText('Subí la sentencia de divorcio (elegiste "Divorciado/a")')
    ).toBeVisible()

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()
    expect(lote?.estado).toBe('disponible')
  })

  test('casado subiendo todo lo requerido reserva con éxito', async ({ page }) => {
    const loteId = await crearLoteDisponible(
      `E2E Fotos Casado Completo ${Date.now()}`,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await completarCamposBasicos(page, 'casado')
    await subirArchivo(page, 'input[name="dniFrente"]', `e2e-dni-frente-${Date.now()}.pdf`)
    await subirArchivo(page, 'input[name="dniDorso"]', `e2e-dni-dorso-${Date.now()}.pdf`)
    await subirArchivo(page, 'input[name="dniConyuge"]', `e2e-dni-conyuge-${Date.now()}.pdf`)

    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: reserva } = await admin
      .from('reservas')
      .select('dni_conyuge_path')
      .eq('lote_id', loteId)
      .single()

    expect(reserva?.dni_conyuge_path).toBeTruthy()
  })
})
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `npx playwright test tests/e2e/fotos-reserva.spec.ts`
Expected: FAIL — los `input[name="dniFrente"]` etc. todavía no existen en el formulario.

- [ ] **Step 3: Agregar los campos al formulario**

En `app/admin/lotes/[id]/reservar/page.tsx`, agregar después del bloque de "Comprobante de la seña" (antes del `<button type="submit">`):

```tsx
          <label className="text-sm">
            DNI - frente
            <input
              name="dniFrente"
              type="file"
              required
              className="mt-1 block w-full rounded border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            DNI - dorso
            <input
              name="dniDorso"
              type="file"
              required
              className="mt-1 block w-full rounded border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            DNI del cónyuge (solo si elegiste &quot;Casado/a&quot; arriba)
            <input
              name="dniConyuge"
              type="file"
              className="mt-1 block w-full rounded border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Sentencia de divorcio (solo si elegiste &quot;Divorciado/a&quot; arriba)
            <input
              name="sentenciaDivorcio"
              type="file"
              className="mt-1 block w-full rounded border px-3 py-2"
            />
          </label>
```

Nota: `dniFrente` y `dniDorso` llevan `required` en el HTML (igual que `comprobante` ya lo lleva) porque siempre son obligatorios. `dniConyuge` y `sentenciaDivorcio` NO llevan `required` en el HTML (el navegador no sabe del estado civil elegido) — su obligatoriedad condicional se valida en el Step 4, del lado del servidor.

- [ ] **Step 4: Validar y subir los archivos en la Server Action**

En `app/admin/lotes/[id]/reservar/actions.ts`, agregar después de la línea que lee `comprobante` (`const comprobante = formData.get('comprobante') as File`):

```typescript
  const dniFrente = formData.get('dniFrente') as File
  const dniDorso = formData.get('dniDorso') as File
  const dniConyuge = formData.get('dniConyuge') as File | null
  const sentenciaDivorcio = formData.get('sentenciaDivorcio') as File | null
```

Después del bloque `if (!comprobante || comprobante.size === 0) { redirect(...) }` ya existente, agregar:

```typescript
  if (!dniFrente || dniFrente.size === 0 || !dniDorso || dniDorso.size === 0) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('Subí las fotos del DNI (frente y dorso)')}`
    )
  }
```

Después del bloque `if (!ESTADOS_CIVILES_VALIDOS.includes(estadoCivil)) { redirect(...) }` ya existente (donde `estadoCivil` ya está validado como un valor real), agregar:

```typescript
  if (estadoCivil === 'casado' && (!dniConyuge || dniConyuge.size === 0)) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent(
        'Subí el DNI del cónyuge (elegiste "Casado/a")'
      )}`
    )
  }

  if (estadoCivil === 'divorciado' && (!sentenciaDivorcio || sentenciaDivorcio.size === 0)) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent(
        'Subí la sentencia de divorcio (elegiste "Divorciado/a")'
      )}`
    )
  }
```

Después del bloque que sube `comprobante` a storage y calcula `comprobantePath` (justo antes del `admin.from('reservas').insert({...})`), agregar la subida de los archivos nuevos:

```typescript
  async function subirArchivoReserva(archivo: File, tipo: string) {
    const nombreSeguro = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `reservas/${loteId}/${tipo}-${Date.now()}-${nombreSeguro}`
    const { error } = await admin.storage.from('comprobantes').upload(filePath, archivo)
    return { filePath, error }
  }

  const { filePath: dniFrentePath, error: errorDniFrente } = await subirArchivoReserva(
    dniFrente,
    'dni-frente'
  )
  if (errorDniFrente) {
    console.error('Error al subir el DNI frente:', errorDniFrente)
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('No se pudo subir el DNI (frente). Probá de nuevo.')}`
    )
  }

  const { filePath: dniDorsoPath, error: errorDniDorso } = await subirArchivoReserva(
    dniDorso,
    'dni-dorso'
  )
  if (errorDniDorso) {
    console.error('Error al subir el DNI dorso:', errorDniDorso)
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('No se pudo subir el DNI (dorso). Probá de nuevo.')}`
    )
  }

  let dniConyugePath: string | null = null
  if (dniConyuge && dniConyuge.size > 0) {
    const { filePath, error: errorDniConyuge } = await subirArchivoReserva(dniConyuge, 'dni-conyuge')
    if (errorDniConyuge) {
      console.error('Error al subir el DNI del cónyuge:', errorDniConyuge)
      redirect(
        `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('No se pudo subir el DNI del cónyuge. Probá de nuevo.')}`
      )
    }
    dniConyugePath = filePath
  }

  let sentenciaDivorcioPath: string | null = null
  if (sentenciaDivorcio && sentenciaDivorcio.size > 0) {
    const { filePath, error: errorSentencia } = await subirArchivoReserva(
      sentenciaDivorcio,
      'sentencia-divorcio'
    )
    if (errorSentencia) {
      console.error('Error al subir la sentencia de divorcio:', errorSentencia)
      redirect(
        `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('No se pudo subir la sentencia de divorcio. Probá de nuevo.')}`
      )
    }
    sentenciaDivorcioPath = filePath
  }
```

Y agregar las 4 columnas al `insert` de `reservas` ya existente (junto a `comprobante_sena_path: comprobantePath,`):

```typescript
    dni_frente_path: dniFrentePath,
    dni_dorso_path: dniDorsoPath,
    dni_conyuge_path: dniConyugePath,
    sentencia_divorcio_path: sentenciaDivorcioPath,
```

Nota importante de orden: estas subidas van DESPUÉS del claim atómico del lote (`.eq('estado', 'disponible')` ya existente) y DESPUÉS de subir `comprobante`, siguiendo el mismo orden que ya tiene la función — no reordenar el resto de la lógica ya existente.

- [ ] **Step 5: Correr el test de nuevo para confirmar que pasa**

Run: `npx playwright test tests/e2e/fotos-reserva.spec.ts`
Expected: 5 passed

- [ ] **Step 6: Commit**

```bash
git add app/admin/lotes/\[id\]/reservar/actions.ts app/admin/lotes/\[id\]/reservar/page.tsx tests/e2e/fotos-reserva.spec.ts
git commit -m "Fotos en la reserva: DNI frente/dorso obligatorios + conyuge/sentencia condicional"
```

---

### Task 3: Detalle del lote — links para ver las fotos

**Files:**
- Modify: `app/admin/lotes/[id]/page.tsx`
- Test: `tests/e2e/fotos-reserva.spec.ts`

**Interfaces:**
- Consumes: columnas `dni_frente_path`, `dni_dorso_path`, `dni_conyuge_path`, `sentencia_divorcio_path` de `reservas` (Task 1). Patrón de signed URL ya existente en este archivo para `comprobante_sena_path` (`admin.storage.from('comprobantes').createSignedUrl(path, 300)`).
- Produces: nada que otra tarea consuma — es la última pieza de UI del feature.

- [ ] **Step 1: Ampliar la query de `reservas` y generar las signed URLs**

En `app/admin/lotes/[id]/page.tsx`, el `select` de la query de `reservas` ya lista las columnas explícitamente — agregar las 4 nuevas:

```typescript
  const { data: reserva } = await supabase
    .from('reservas')
    .select(
      'nombre_completo, dni, domicilio, email, telefono, telefono_alternativo, estado_civil, instrumentacion, monto_sena, moneda_sena, recibido_por, recibido_por_otro, comprobante_sena_path, dni_frente_path, dni_dorso_path, dni_conyuge_path, sentencia_divorcio_path, created_at'
    )
    .eq('lote_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
```

En el bloque `if (reserva) { ... }` donde ya se genera `reservaComprobanteUrl`, agregar las 4 signed URLs nuevas (mismo patrón, mismo TTL de 300 segundos):

```typescript
  let reservaDniFrenteUrl: string | null = null
  let reservaDniDorsoUrl: string | null = null
  let reservaDniConyugeUrl: string | null = null
  let reservaSentenciaDivorcioUrl: string | null = null

  if (reserva) {
    const admin = createAdminClient()

    const { data: signedUrl } = await admin.storage
      .from('comprobantes')
      .createSignedUrl(reserva.comprobante_sena_path, 300)
    reservaComprobanteUrl = signedUrl?.signedUrl ?? null

    const { data: dniFrenteSigned } = await admin.storage
      .from('comprobantes')
      .createSignedUrl(reserva.dni_frente_path, 300)
    reservaDniFrenteUrl = dniFrenteSigned?.signedUrl ?? null

    const { data: dniDorsoSigned } = await admin.storage
      .from('comprobantes')
      .createSignedUrl(reserva.dni_dorso_path, 300)
    reservaDniDorsoUrl = dniDorsoSigned?.signedUrl ?? null

    if (reserva.dni_conyuge_path) {
      const { data: dniConyugeSigned } = await admin.storage
        .from('comprobantes')
        .createSignedUrl(reserva.dni_conyuge_path, 300)
      reservaDniConyugeUrl = dniConyugeSigned?.signedUrl ?? null
    }

    if (reserva.sentencia_divorcio_path) {
      const { data: sentenciaSigned } = await admin.storage
        .from('comprobantes')
        .createSignedUrl(reserva.sentencia_divorcio_path, 300)
      reservaSentenciaDivorcioUrl = sentenciaSigned?.signedUrl ?? null
    }

    if (reserva.recibido_por) {
      const { data: persona } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', reserva.recibido_por)
        .single()
      reservaRecibidoPorNombre = persona?.full_name ?? null
    }
  }
```

Nota: `reserva.dni_frente_path` y `dni_dorso_path` son `text` nullable a nivel de schema (Task 1), pero para toda reserva creada DESPUÉS de esta tanda siempre van a tener valor (la Server Action los exige). Para reservas viejas (creadas antes de esta tanda, en fase 1) van a ser `null` — `createSignedUrl(null, ...)` con Supabase falla silenciosamente devolviendo `data: null`, así que `reservaDniFrenteUrl` queda `null` y el Step 2 ya maneja ese caso mostrando "no disponible" en vez de romper.

- [ ] **Step 2: Agregar los links al JSX**

Justo después del bloque existente que renderiza "Ver comprobante de la seña" (el `<p className="mb-4 text-sm">{reservaComprobanteUrl ? (...) : (...)}</p>`), agregar:

```tsx
          <p className="mb-1 text-sm">
            {reservaDniFrenteUrl ? (
              <a href={reservaDniFrenteUrl} target="_blank" className="underline">
                Ver DNI (frente)
              </a>
            ) : (
              <span className="text-gray-500">DNI (frente) no disponible</span>
            )}
          </p>
          <p className="mb-1 text-sm">
            {reservaDniDorsoUrl ? (
              <a href={reservaDniDorsoUrl} target="_blank" className="underline">
                Ver DNI (dorso)
              </a>
            ) : (
              <span className="text-gray-500">DNI (dorso) no disponible</span>
            )}
          </p>
          {reserva.dni_conyuge_path && (
            <p className="mb-1 text-sm">
              {reservaDniConyugeUrl ? (
                <a href={reservaDniConyugeUrl} target="_blank" className="underline">
                  Ver DNI del cónyuge
                </a>
              ) : (
                <span className="text-gray-500">DNI del cónyuge no disponible</span>
              )}
            </p>
          )}
          {reserva.sentencia_divorcio_path && (
            <p className="mb-4 text-sm">
              {reservaSentenciaDivorcioUrl ? (
                <a href={reservaSentenciaDivorcioUrl} target="_blank" className="underline">
                  Ver sentencia de divorcio
                </a>
              ) : (
                <span className="text-gray-500">Sentencia de divorcio no disponible</span>
              )}
            </p>
          )}
```

- [ ] **Step 3: Agregar el test**

En `tests/e2e/fotos-reserva.spec.ts`, agregar dentro del mismo `describe`:

```typescript
  test('el detalle del lote muestra los links de las fotos subidas', async ({ page }) => {
    const loteId = await crearLoteDisponible(
      `E2E Fotos Detalle ${Date.now()}`,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await completarCamposBasicos(page, 'casado')
    await subirArchivo(page, 'input[name="dniFrente"]', `e2e-dni-frente-${Date.now()}.pdf`)
    await subirArchivo(page, 'input[name="dniDorso"]', `e2e-dni-dorso-${Date.now()}.pdf`)
    await subirArchivo(page, 'input[name="dniConyuge"]', `e2e-dni-conyuge-${Date.now()}.pdf`)
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL('**/admin/lotes')

    await page.goto(`/admin/lotes/${loteId}`)

    await expect(page.getByRole('link', { name: 'Ver DNI (frente)' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ver DNI (dorso)' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ver DNI del cónyuge' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ver sentencia de divorcio' })).toHaveCount(0)
  })
```

- [ ] **Step 4: Correr el test**

Run: `npx playwright test tests/e2e/fotos-reserva.spec.ts`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add app/admin/lotes/\[id\]/page.tsx tests/e2e/fotos-reserva.spec.ts
git commit -m "Detalle del lote: links para ver las fotos de la reserva"
```

---

### Task 4: Regresión — arreglar los 2 helpers de test rotos + regresión completa + docs

**Files:**
- Modify: `tests/e2e/reserva-lote.spec.ts`
- Modify: `tests/e2e/pase-a-vendido.spec.ts`
- Modify: `Pruebas_Manuales_Pendientes.txt` (fuera del repo git)
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: los inputs `dniFrente`/`dniDorso` agregados en Task 2 al formulario de reservar.
- Produces: nada — última tarea del plan.

**Contexto importante para quien implemente esta tarea:** antes de esta tanda, `dniFrente` y `dniDorso` no existían en el formulario de reservar, así que dos helpers de test que ya reservan lotes por la UI real (no por inserción directa a la base) van a fallar ahora porque no suben esos dos archivos obligatorios nuevos:

1. `completarDatosBasicosDeReserva` en `tests/e2e/reserva-lote.spec.ts` — usado por prácticamente todos los tests de ese archivo (reserva de lote fase 1).
2. `reservarLotePorUI` en `tests/e2e/pase-a-vendido.spec.ts` — usado por varios tests de venta.

- [ ] **Step 1: Arreglar `completarDatosBasicosDeReserva` en `tests/e2e/reserva-lote.spec.ts`**

```typescript
async function completarDatosBasicosDeReserva(page: Page) {
  await page.getByPlaceholder('Nombre completo').fill('Comprador E2E')
  await page.getByPlaceholder('DNI').fill('30111222')
  await page.getByPlaceholder('Domicilio').fill('Calle Falsa 123')
  await page.getByPlaceholder('Email').fill('comprador.e2e@sima-demo.invalid')
  await page.getByPlaceholder('Teléfono', { exact: true }).fill('3511234567')
  await page.selectOption('select[name="estadoCivil"]', 'soltero')
  await page.getByPlaceholder('Monto de la seña').fill('500')
  await page.setInputFiles('input[name="comprobante"]', {
    name: `e2e-reserva-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
  await page.setInputFiles('input[name="dniFrente"]', {
    name: `e2e-dni-frente-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
  await page.setInputFiles('input[name="dniDorso"]', {
    name: `e2e-dni-dorso-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
}
```

(Todos los tests de este archivo usan `estadoCivil = 'soltero'` a través de este helper, así que ninguno necesita `dniConyuge` ni `sentenciaDivorcio`.)

- [ ] **Step 2: Arreglar `reservarLotePorUI` en `tests/e2e/pase-a-vendido.spec.ts`**

```typescript
async function reservarLotePorUI(
  page: Page,
  loteId: string,
  datos: { nombreCompleto: string; email: string; montoSena: string; monedaSena?: string }
) {
  await page.goto(`/admin/lotes/${loteId}/reservar`)
  await page.getByPlaceholder('Nombre completo').fill(datos.nombreCompleto)
  await page.getByPlaceholder('DNI').fill('30111222')
  await page.getByPlaceholder('Domicilio').fill('Calle Falsa 123')
  await page.getByPlaceholder('Email').fill(datos.email)
  await page.getByPlaceholder('Teléfono', { exact: true }).fill('3511234567')
  await page.selectOption('select[name="estadoCivil"]', 'soltero')
  await page.getByPlaceholder('Monto de la seña').fill(datos.montoSena)
  await page.selectOption('select[name="monedaSena"]', datos.monedaSena ?? 'USD')
  await page.setInputFiles('input[name="comprobante"]', {
    name: `e2e-vender-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
  await page.setInputFiles('input[name="dniFrente"]', {
    name: `e2e-dni-frente-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
  await page.setInputFiles('input[name="dniDorso"]', {
    name: `e2e-dni-dorso-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
  await page.getByRole('button', { name: 'Confirmar reserva' }).click()
  await page.waitForURL('**/admin/lotes')
}
```

- [ ] **Step 3: Build limpio**

Run: `npm run build`
Expected: sin errores.

- [ ] **Step 4: Unitarios**

Run: `npx vitest run`
Expected: todos en verde (sin nuevos, este feature no agrega tests unitarios puros).

- [ ] **Step 5: E2E completo, dos corridas**

Run: `npx playwright test`
Expected: todos en verde. Repetir una segunda vez completa para descartar flakes. Si aparece un fallo aislado y claramente no relacionado (ej. "email rate limit exceeded" de Supabase por correr la suite muchas veces seguidas, o el flake de timing de upload+redirect ya documentado en tandas anteriores), no asumir que es una regresión de esta tanda sin antes confirmar la causa real del mensaje de error.

- [ ] **Step 6: Limpieza de datos de prueba**

Antes de cualquier `execute_sql`, verificar con `mcp__supabase__get_project_url` que apunta al proyecto de SIMA. Borrar lotes/reservas/profiles de prueba con el mismo criterio de siempre (`identificador like 'E2E %'` excluyendo los 2 fixtures protegidos, profiles con email `@sima-e2e.invalid` excluyendo los 9 fixtures fijos de `test-data.ts`).

- [ ] **Step 7: Actualizar `Pruebas_Manuales_Pendientes.txt`**

Agregar una sección nueva (siguiente número disponible) describiendo para Gabriel cómo probar a mano: reservar como soltero con DNI frente/dorso; reservar como casado sin el DNI del cónyuge (tiene que rechazar); reservar como divorciado sin la sentencia (tiene que rechazar); y ver los links nuevos en el detalle del lote. Aclarar explícitamente que "foto de la reserva" NO está en esta tanda, queda pendiente de confirmar con Nicolás. Mismo estilo que las secciones anteriores del archivo.

- [ ] **Step 8: Cerrar el ledger**

Agregar una línea a `.superpowers/sdd/progress.md` resumiendo las 4 tareas y el resultado de la regresión/limpieza.

---

## Self-Review

**Cobertura de la spec:** 4 columnas nuevas (Task 1) ✓, DNI frente/dorso siempre obligatorios (Task 2) ✓, cónyuge/sentencia condicionales validados server-side contra el `estadoCivil` real (Task 2) ✓, mismo bucket/patrón de path que el comprobante (Task 2) ✓, links en el detalle del lote (Task 3) ✓, "foto de la reserva" explícitamente fuera de alcance (mencionado en Task 4 Step 7, ninguna tarea la construye) ✓, testing (5 tests de validación + 1 de links + regresión completa) ✓.

**Placeholders:** ninguno — cada step tiene código completo o comando+resultado esperado.

**Consistencia de tipos:** nombres de columna (`dni_frente_path`, `dni_dorso_path`, `dni_conyuge_path`, `sentencia_divorcio_path`) usados idénticos en Task 1 (migración), Task 2 (insert) y Task 3 (select+signed URL). Nombres de campo de formulario (`dniFrente`, `dniDorso`, `dniConyuge`, `sentenciaDivorcio`) usados idénticos en Task 2 (form inputs, `formData.get(...)`) y Task 4 (helpers de test actualizados). Función local `subirArchivoReserva` definida y usada solo dentro de Task 2, firma consistente en las 4 llamadas.
