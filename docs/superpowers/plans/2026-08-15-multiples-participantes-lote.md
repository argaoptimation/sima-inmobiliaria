# Múltiples participantes por lote Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir sumar participantes adicionales a un lote (ej. un segundo vendedor compartiendo comisión) más allá de los 3 casilleros fijos (admin/acreedor/vendedor), sin tocar permisos ni confirmación cruzada existentes, dejando la base para que "distribución manual por cuota" (próxima pieza) tenga de dónde leer quiénes participan.

**Architecture:** Tabla nueva `lote_participantes`, extensión aditiva que convive con `lotes.admin_id`/`acreedor_id`/`vendedor_id` (ninguna de las tres se toca). Cada fila apunta a un `profile_id` **o** a un `cuenta_externa_id` (nunca ambos, reforzado con un `check` de Postgres), con `unique` por combinación para evitar duplicados. Nueva subsección "Participantes adicionales" en el detalle del lote (agregar/quitar, exclusivo admin). El selector de "Cuenta de cobro" ya lista globalmente a todo admin/acreedor/vendedor con datos de transferencia (comportamiento preexistente, sin cambios de UI) — lo único que hace falta es relajar la validación del lado servidor en `actualizarCobro` para aceptar también a un participante adicional del lote, no solo a los tres roles principales.

**Tech Stack:** Next.js 16 (Server Components + Server Actions), Supabase (Postgres), TypeScript, Playwright (e2e).

## Global Constraints

- Extensión aditiva: `lotes.admin_id`, `lotes.acreedor_id`, `lotes.vendedor_id` no se tocan — siguen gobernando permisos y `confirmarPago` exactamente como hoy.
- `lote_participantes.profile_id` o `lote_participantes.cuenta_externa_id`, nunca los dos a la vez (constraint `check` de Postgres) y nunca duplicados dentro del mismo lote (`unique` por columna).
- Solo profiles con rol `administrador`, `acreedor` o `vendedor` pueden ser participantes adicionales (nunca `cliente` ni `cobrador`).
- Bloqueado agregar como participante adicional a alguien que ya es `admin_id`/`acreedor_id`/`vendedor_id` de ese mismo lote.
- Agregar/quitar participantes es exclusivo del administrador (`requireAdministrador`, mismo criterio que el resto de la sección "Cobro").
- No se toca `confirmarPago` (`app/admin/pagos/actions.ts`) en este plan.
- Fuera de alcance: distribución manual por cuota (montos/porcentajes), rediseño completo de confirmación cruzada, reemplazar `admin_id`/`acreedor_id`/`vendedor_id` por esta tabla.

---

### Task 1: Migración — tabla `lote_participantes`

**Files:**
- Create: `supabase/migrations/0018_lote_participantes.sql`

**Interfaces:**
- Consumes: nada.
- Produces: tabla `public.lote_participantes` (columnas: `id`, `lote_id`, `profile_id`, `cuenta_externa_id`, `etiqueta`, `created_at`). Todas las tareas siguientes dependen de que exista con este nombre exacto.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/0018_lote_participantes.sql
create table public.lote_participantes (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes(id) on delete cascade,
  profile_id uuid references public.profiles(id),
  cuenta_externa_id uuid references public.cuentas_externas(id),
  etiqueta text,
  created_at timestamptz not null default now(),
  constraint lote_participantes_uno_u_otro check (
    (profile_id is not null and cuenta_externa_id is null)
    or (profile_id is null and cuenta_externa_id is not null)
  ),
  unique (lote_id, profile_id),
  unique (lote_id, cuenta_externa_id)
);
```

- [ ] **Step 2: Aplicar directamente contra la base (el controller, no un subagente)**

Antes de aplicar, verificar con `mcp__supabase__get_project_url` que coincide con `NEXT_PUBLIC_SUPABASE_URL` de `.env.local`. Aplicar con `mcp__supabase__apply_migration`. Verificar después con una consulta a `information_schema.columns` que la tabla y sus columnas existen.

- [ ] **Step 3: Commit del archivo de migración**

```bash
git add supabase/migrations/0018_lote_participantes.sql
git commit -m "Migracion: tabla lote_participantes"
```

---

### Task 2: Agregar/quitar participantes — actions + UI en el detalle del lote

**Files:**
- Create: `app/admin/lotes/[id]/participantes-actions.ts`
- Modify: `app/admin/lotes/[id]/page.tsx`
- Modify: `app/admin/cuentas-externas/actions.ts`
- Test: `tests/e2e/lote-participantes.spec.ts` (nuevo)

**Interfaces:**
- Consumes: tabla `lote_participantes` de Task 1. `requireAdministrador` de `@/lib/auth/require-admin`. `createAdminClient` de `@/lib/supabase/admin`. La query `cuentasExternas` que ya existe en `app/admin/lotes/[id]/page.tsx` (agregada en el plan de cuentas externas) — se reusa, no se duplica.
- Produces: `agregarParticipante(loteId: string, formData: FormData): Promise<void>` y `quitarParticipante(loteId: string, participanteId: string): Promise<void>` en `app/admin/lotes/[id]/participantes-actions.ts`. Filas reales en `lote_participantes` — Task 3 depende de que existan para poder probar la ampliación del selector de cuenta de cobro end-to-end.

- [ ] **Step 1: Escribir las Server Actions de agregar/quitar participante**

```typescript
// app/admin/lotes/[id]/participantes-actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'

export async function agregarParticipante(loteId: string, formData: FormData) {
  await requireAdministrador()

  const participanteRaw = ((formData.get('participanteId') as string) || '').trim() || null
  const etiqueta = ((formData.get('etiqueta') as string) || '').trim() || null

  if (!participanteRaw) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent('Elegí a quién agregar')}`)
  }

  const esExterna = participanteRaw!.startsWith('externa:')
  const profileId = esExterna ? null : participanteRaw
  const cuentaExternaId = esExterna ? participanteRaw!.slice('externa:'.length) : null

  const admin = createAdminClient()

  const { data: lote } = await admin
    .from('lotes')
    .select('admin_id, acreedor_id, vendedor_id')
    .eq('id', loteId)
    .single()

  if (
    profileId &&
    (profileId === lote?.admin_id || profileId === lote?.acreedor_id || profileId === lote?.vendedor_id)
  ) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent(
        'Esa persona ya es admin, acreedor o vendedor de este lote'
      )}`
    )
  }

  if (profileId) {
    const { data: persona } = await admin
      .from('profiles')
      .select('role')
      .eq('id', profileId)
      .maybeSingle()

    if (!persona || !['administrador', 'acreedor', 'vendedor'].includes(persona.role)) {
      redirect(
        `/admin/lotes/${loteId}?error=${encodeURIComponent(
          'Solo se pueden agregar administradores, acreedores o vendedores'
        )}`
      )
    }
  }

  if (cuentaExternaId) {
    const { data: cuentaExterna } = await admin
      .from('cuentas_externas')
      .select('id')
      .eq('id', cuentaExternaId)
      .maybeSingle()

    if (!cuentaExterna) {
      redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent('Esa cuenta externa no existe')}`)
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('lote_participantes').insert({
    lote_id: loteId,
    profile_id: profileId,
    cuenta_externa_id: cuentaExternaId,
    etiqueta,
  })

  if (error) {
    // 23505 = violacion de unique constraint (Postgres): ya esta agregado.
    const mensaje =
      error.code === '23505' ? 'Ese participante ya está agregado a este lote' : error.message
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensaje)}`)
  }

  redirect(`/admin/lotes/${loteId}`)
}

export async function quitarParticipante(loteId: string, participanteId: string) {
  await requireAdministrador()

  const supabase = await createClient()

  const { data: participante } = await supabase
    .from('lote_participantes')
    .select('profile_id, cuenta_externa_id')
    .eq('id', participanteId)
    .maybeSingle()

  if (!participante) {
    redirect(`/admin/lotes/${loteId}`)
  }

  const { data: lote } = await supabase
    .from('lotes')
    .select('cuenta_cobro_id, cuenta_cobro_externa_id')
    .eq('id', loteId)
    .single()

  const esLaCuentaDeCobroActual =
    (participante!.profile_id !== null && participante!.profile_id === lote?.cuenta_cobro_id) ||
    (participante!.cuenta_externa_id !== null &&
      participante!.cuenta_externa_id === lote?.cuenta_cobro_externa_id)

  if (esLaCuentaDeCobroActual) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent(
        'No se puede quitar: es la cuenta de cobro actual de este lote. Reasignala primero.'
      )}`
    )
  }

  const { error } = await supabase.from('lote_participantes').delete().eq('id', participanteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(error.message)}`)
  }

  redirect(`/admin/lotes/${loteId}`)
}
```

- [ ] **Step 2: Cerrar el hueco que abre la tabla nueva en `eliminarCuentaExterna`**

La tabla de Task 1 agrega una referencia más a `cuentas_externas` que `eliminarCuentaExterna` (`app/admin/cuentas-externas/actions.ts`) todavía no conoce — sin este chequeo, borrar una cuenta externa que es participante adicional de algún lote (pero no su cuenta de cobro) rompería con un error crudo de foreign key en vez del mensaje prolijo que ya usa el resto de esa función.

En `app/admin/cuentas-externas/actions.ts`, dentro de `eliminarCuentaExterna`, agregar un chequeo nuevo entre el de `lotesAsociados` (cuenta de cobro) y el `delete` final:

```typescript
  const { count: comoParticipante } = await supabase
    .from('lote_participantes')
    .select('id', { count: 'exact', head: true })
    .eq('cuenta_externa_id', cuentaExternaId)

  if (comoParticipante && comoParticipante > 0) {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent(
        'No se puede eliminar: está agregada como participante adicional de algún lote'
      )}`
    )
  }
```

- [ ] **Step 3: Agregar la subsección "Participantes adicionales" en el detalle del lote**

En `app/admin/lotes/[id]/page.tsx`, agregar el import de las nuevas actions junto a los existentes:

```typescript
import { agregarParticipante, quitarParticipante } from './participantes-actions'
```

Después del bloque que ya arma `conDatos` y antes de la carga de `cuentasExternas` (que ya existe), agregar la carga de participantes y su resolución de nombres:

```typescript
  const { data: participantes } = await supabase
    .from('lote_participantes')
    .select('id, profile_id, cuenta_externa_id, etiqueta')
    .eq('lote_id', id)
    .order('created_at', { ascending: true })

  const profileIdsParticipantes = (participantes ?? [])
    .map((p) => p.profile_id)
    .filter((pid): pid is string => pid !== null)
  const cuentaExternaIdsParticipantes = (participantes ?? [])
    .map((p) => p.cuenta_externa_id)
    .filter((cid): cid is string => cid !== null)

  const { data: profilesParticipantes } =
    profileIdsParticipantes.length > 0
      ? await supabase.from('profiles').select('id, full_name, role').in('id', profileIdsParticipantes)
      : { data: [] }

  const { data: cuentasExternasParticipantes } =
    cuentaExternaIdsParticipantes.length > 0
      ? await supabase.from('cuentas_externas').select('id, nombre').in('id', cuentaExternaIdsParticipantes)
      : { data: [] }

  function nombreParticipante(participante: {
    profile_id: string | null
    cuenta_externa_id: string | null
  }) {
    if (participante.profile_id) {
      const persona = profilesParticipantes?.find((p) => p.id === participante.profile_id)
      return persona ? `${persona.full_name} (${persona.role})` : 'Persona eliminada'
    }
    const cuentaExterna = cuentasExternasParticipantes?.find(
      (c) => c.id === participante.cuenta_externa_id
    )
    return cuentaExterna ? `${cuentaExterna.nombre} (cuenta externa)` : 'Cuenta externa eliminada'
  }

  const participantesElegibles = (staff ?? []).filter(
    (persona) =>
      persona.id !== lote!.admin_id &&
      persona.id !== lote!.acreedor_id &&
      persona.id !== lote!.vendedor_id
  )
```

Nota: `staff` ya existe más arriba en este archivo (`const { data: staff } = await supabase.from('profiles').select('id, full_name, role, alias, banco, titular').in('role', ['administrador', 'acreedor', 'vendedor']).order('full_name')`) — no se vuelve a consultar, solo se filtra.

Dentro del bloque `{perfilPropio!.role === 'administrador' && (<>...)}`, justo después del `</form>` que cierra el formulario de "Cobro" (antes del `</>` de cierre), agregar:

```tsx
          <h2 className="mb-2 mt-8 text-lg font-semibold">Participantes adicionales</h2>
          <p className="mb-3 text-sm text-gray-600">
            Gente que comparte la comisión de este lote sin ser el admin, el acreedor ni el vendedor
            principal (ej. un segundo vendedor). Todavía no se cargan montos acá — eso es una pantalla
            aparte que viene después.
          </p>
          {(participantes ?? []).length === 0 ? (
            <p className="mb-4 text-sm text-gray-600">Sin participantes adicionales todavía.</p>
          ) : (
            <ul className="mb-4 flex flex-col gap-2">
              {participantes!.map((participante) => (
                <li key={participante.id} className="flex items-center justify-between text-sm">
                  <span>
                    {nombreParticipante(participante)}
                    {participante.etiqueta && ` — ${participante.etiqueta}`}
                  </span>
                  <form action={quitarParticipante.bind(null, id, participante.id)}>
                    <button type="submit" className="text-red-700 underline">
                      Quitar
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={agregarParticipanteConId} className="flex max-w-sm flex-col gap-3">
            <label className="text-sm">
              Agregar participante
              <select name="participanteId" className="mt-1 block w-full rounded border px-3 py-2">
                <option value="">— elegir —</option>
                {participantesElegibles.map((persona) => (
                  <option key={persona.id} value={persona.id}>
                    {persona.full_name} ({persona.role})
                  </option>
                ))}
                {(cuentasExternas ?? []).map((cuentaExterna) => (
                  <option key={cuentaExterna.id} value={`externa:${cuentaExterna.id}`}>
                    {cuentaExterna.nombre} (cuenta externa)
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Etiqueta (opcional)
              <input
                name="etiqueta"
                placeholder="Ej: Vendedor 2"
                className="mt-1 block w-full rounded border px-3 py-2"
              />
            </label>
            <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
              Agregar participante
            </button>
          </form>
```

El banner de error ya existente cerca del `<h1>` del lote (`{error && <p ...>}`) alcanza para esta subsección también: cualquier redirect con `?error=` recarga la página completa desde el principio, así que ese banner ya queda visible sin necesidad de scroll — mismo criterio que ya usa la sección "Cobro", que tampoco duplica ningún banner propio.

Declarar el bind junto a los otros, cerca de `actualizarCobroConId`:

```typescript
  const agregarParticipanteConId = agregarParticipante.bind(null, id)
```

- [ ] **Step 4: Escribir los tests e2e**

```typescript
// tests/e2e/lote-participantes.spec.ts
import { test, expect } from '@playwright/test'
import { createAdminClient, ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Múltiples participantes por lote', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('agregar un profile (vendedor no asociado a este lote) como participante adicional', async ({
    page,
  }) => {
    const admin = createAdminClient()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}`)

    try {
      await page.selectOption('select[name="participanteId"]', { label: 'E2E Vendedor B (vendedor)' })
      await page.getByLabel('Etiqueta (opcional)').fill('Vendedor 2')
      await page.getByRole('button', { name: 'Agregar participante' }).click()

      await expect(page.getByText('E2E Vendedor B (vendedor) — Vendedor 2')).toBeVisible()
    } finally {
      await admin
        .from('lote_participantes')
        .delete()
        .eq('lote_id', fixtures.loteId)
        .eq('profile_id', fixtures.vendedorLoteB.id)
    }
  })

  test('agregar una cuenta externa como participante adicional', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)

    await page.goto('/admin/cuentas-externas/nuevo')
    const nombreCuentaExterna = `E2E Participante Externo ${Date.now()}`
    await page.getByLabel('Nombre del destinatario').fill(nombreCuentaExterna)
    await page.getByLabel('Titular de la cuenta').fill('Corralón Participante')
    await page.getByLabel('Alias').fill('corralon.participante')
    await page.getByLabel('Banco').fill('Banco Test')
    await page.getByRole('button', { name: 'Crear cuenta externa' }).click()
    await page.waitForURL(/\/admin\/cuentas-externas\/[0-9a-f-]{36}$/)

    await page.goto(`/admin/lotes/${fixtures.loteId}`)
    await page.selectOption('select[name="participanteId"]', {
      label: `${nombreCuentaExterna} (cuenta externa)`,
    })
    await page.getByRole('button', { name: 'Agregar participante' }).click()

    await expect(page.getByText(`${nombreCuentaExterna} (cuenta externa)`)).toBeVisible()
  })

  test('agregar como participante a alguien que ya es acreedor de este lote es rechazado', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}`)

    await page.selectOption('select[name="participanteId"]', {
      label: 'E2E Acreedor Con Datos (acreedor)',
    })
    await page.getByRole('button', { name: 'Agregar participante' }).click()

    await expect(page.getByText('Esa persona ya es admin, acreedor o vendedor de este lote')).toBeVisible()
  })

  test('agregar dos veces al mismo participante es rechazado', async ({ page }) => {
    const admin = createAdminClient()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}`)

    try {
      await page.selectOption('select[name="participanteId"]', { label: 'E2E Vendedor B (vendedor)' })
      await page.getByRole('button', { name: 'Agregar participante' }).click()
      await expect(page.getByText('E2E Vendedor B (vendedor)')).toBeVisible()

      await page.selectOption('select[name="participanteId"]', { label: 'E2E Vendedor B (vendedor)' })
      await page.getByRole('button', { name: 'Agregar participante' }).click()

      await expect(page.getByText('Ese participante ya está agregado a este lote')).toBeVisible()
    } finally {
      await admin
        .from('lote_participantes')
        .delete()
        .eq('lote_id', fixtures.loteId)
        .eq('profile_id', fixtures.vendedorLoteB.id)
    }
  })

  test('quitar un participante que no es la cuenta de cobro actual funciona', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteSecundarioId}`)

    await page.selectOption('select[name="participanteId"]', { label: 'E2E Vendedor A (vendedor)' })
    await page.getByRole('button', { name: 'Agregar participante' }).click()
    await expect(page.getByText('E2E Vendedor A (vendedor)')).toBeVisible()

    // quitarParticipante no tiene ningún diálogo de confirmación de por
    // medio (a diferencia de eliminar una cuenta externa o un lote entero):
    // es un submit directo, mismo criterio que "agregar".
    const fila = page.locator('li', { hasText: 'E2E Vendedor A (vendedor)' })
    await fila.getByRole('button', { name: 'Quitar' }).click()

    await expect(page.getByText('Sin participantes adicionales todavía.')).toBeVisible()
  })

  test('quitar un participante que es la cuenta de cobro actual es rechazado', async ({ page }) => {
    const admin = createAdminClient()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteSecundarioId}`)

    await page.selectOption('select[name="participanteId"]', {
      label: 'E2E Acreedor Con Datos (acreedor)',
    })
    await page.getByRole('button', { name: 'Agregar participante' }).click()
    await expect(page.getByText('E2E Acreedor Con Datos (acreedor)')).toBeVisible()

    try {
      // Se asigna directo por base (el selector de "Cuenta de cobro" solo
      // acepta participantes adicionales desde la Task 3 de este mismo
      // plan, que todavía no corrió en este punto) para poder probar el
      // guard de "quitarParticipante" de esta tarea de forma aislada.
      await admin
        .from('lotes')
        .update({ cuenta_cobro_id: fixtures.acreedorConDatos.id })
        .eq('id', fixtures.loteSecundarioId)

      // Misma demora corta y real de lectura-después-de-escritura ya
      // documentada en tests/e2e/cuentas-externas.spec.ts: se confirma por
      // polling que la asignación ya es visible antes de ejercitar el
      // guard, para no confundir esa demora con un guard roto.
      await expect
        .poll(
          async () => {
            const { data: lote } = await admin
              .from('lotes')
              .select('cuenta_cobro_id')
              .eq('id', fixtures.loteSecundarioId)
              .single()
            return lote?.cuenta_cobro_id ?? null
          },
          { timeout: 10000 }
        )
        .toBe(fixtures.acreedorConDatos.id)

      await page.reload()
      const fila = page.locator('li', { hasText: 'E2E Acreedor Con Datos (acreedor)' })
      await fila.getByRole('button', { name: 'Quitar' }).click()

      await expect(
        page.getByText(
          'No se puede quitar: es la cuenta de cobro actual de este lote. Reasignala primero.'
        )
      ).toBeVisible()
    } finally {
      await admin.from('lotes').update({ cuenta_cobro_id: null }).eq('id', fixtures.loteSecundarioId)
      await admin
        .from('lote_participantes')
        .delete()
        .eq('lote_id', fixtures.loteSecundarioId)
        .eq('profile_id', fixtures.acreedorConDatos.id)
    }
  })

  test('un acreedor no puede ver la subsección "Participantes adicionales" ni sus acciones', async ({
    page,
  }) => {
    // Tiene que ser el acreedor REAL de este lote (fixtures.acreedorConDatos)
    // -- un acreedor sin relación con el lote (fixtures.acreedor) ni siquiera
    // llega a ver la página: requireAdminOAcreedor lo redirige antes.
    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}`)

    await expect(page.getByText('Participantes adicionales')).not.toBeVisible()
  })
})
```

- [ ] **Step 5: Correr los tests**

Run: `npx playwright test tests/e2e/lote-participantes.spec.ts --project=chromium`
Expected: 7 passed

- [ ] **Step 6: Commit**

```bash
git add app/admin/lotes/\[id\]/participantes-actions.ts app/admin/lotes/\[id\]/page.tsx app/admin/cuentas-externas/actions.ts tests/e2e/lote-participantes.spec.ts
git commit -m "Participantes adicionales por lote: agregar, quitar y validaciones"
```

---

### Task 3: Ampliar el selector "Cuenta de cobro" para aceptar participantes adicionales

**Files:**
- Modify: `app/admin/lotes/[id]/actions.ts`
- Test: `tests/e2e/lote-participantes.spec.ts`

**Interfaces:**
- Consumes: tabla `lote_participantes` de Task 1, con filas reales de Task 2.
- Produces: nada que otra tarea de este plan consuma — última pieza funcional.

- [ ] **Step 1: Relajar la validación de `cuentaCobroId` en `actualizarCobro`**

En `app/admin/lotes/[id]/actions.ts`, el `<select name="cuentaCobroId">` del detalle del lote ya lista, desde antes de este plan, a TODO admin/acreedor/vendedor del sistema que tenga datos de transferencia (la query `staff` no está filtrada por lote) — la UI no necesita ningún cambio. Lo que bloquea hoy elegir a un participante adicional es la validación del lado servidor, que exige que `cuentaCobroId` sea exactamente uno de los tres valores (`adminId`/`acreedorId`/`vendedorId`) que se están enviando en ese mismo submit.

Reemplazar el bloque `if (cuentaCobroId) { ... }` completo (desde `if (cuentaCobroId) {` hasta su cierre `}`, el que hoy valida contra `idsAsociados` y después contra `tieneDatosTransferencia`) por:

```typescript
  if (cuentaCobroId) {
    const idsAsociados = [adminId, acreedorId, vendedorId]
    const admin = createAdminClient()

    if (!idsAsociados.includes(cuentaCobroId)) {
      const { data: participanteCoincide } = await admin
        .from('lote_participantes')
        .select('id')
        .eq('lote_id', loteId)
        .eq('profile_id', cuentaCobroId)
        .maybeSingle()

      if (!participanteCoincide) {
        redirect(
          `/admin/lotes/${loteId}?error=${encodeURIComponent(
            'La cuenta de cobro tiene que ser el admin, el acreedor, el vendedor o un participante adicional de este lote'
          )}`
        )
      }
    }

    const { data: persona } = await admin
      .from('profiles')
      .select('id, alias, banco, titular')
      .eq('id', cuentaCobroId)
      .single()

    if (
      !persona ||
      !tieneDatosTransferencia({ alias: persona.alias, banco: persona.banco, titular: persona.titular })
    ) {
      redirect(
        `/admin/lotes/${loteId}?error=${encodeURIComponent(
          'Esa persona todavía no tiene datos de transferencia cargados'
        )}&editarUsuario=${cuentaCobroId}`
      )
    }
  }
```

El bloque `if (cuentaCobroExternaId) { ... }` que sigue después no se toca — las cuentas externas ya son seleccionables globalmente sin necesidad de ser participante, comportamiento preexistente sin relación con este cambio.

- [ ] **Step 2: Escribir el test e2e**

Agregar dentro del mismo `describe` de `tests/e2e/lote-participantes.spec.ts`:

```typescript
  test('un participante adicional puede elegirse como cuenta de cobro; alguien no asociado, no', async ({
    page,
  }) => {
    const admin = createAdminClient()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteSecundarioId}`)

    // E2E Vendedor A no es acreedor/vendedor/admin de loteSecundario (esos
    // son acreedorSecundario y vendedorLoteB, ver fixtures/test-data.ts) y sí
    // tiene datos de transferencia -- opción válida para este caso.
    // Todavía no es participante de este lote: la opción existe en el
    // selector (es global), pero el submit se rechaza.
    await page.selectOption('select[name="cuentaCobroId"]', { label: 'E2E Vendedor A (vendedor)' })
    await page.getByRole('button', { name: 'Guardar cobro' }).click()
    await expect(
      page.getByText(
        'La cuenta de cobro tiene que ser el admin, el acreedor, el vendedor o un participante adicional de este lote'
      )
    ).toBeVisible()

    try {
      await page.selectOption('select[name="participanteId"]', { label: 'E2E Vendedor A (vendedor)' })
      await page.getByRole('button', { name: 'Agregar participante' }).click()
      await expect(page.getByText('E2E Vendedor A (vendedor)')).toBeVisible()

      await page.selectOption('select[name="cuentaCobroId"]', { label: 'E2E Vendedor A (vendedor)' })
      await page.getByRole('button', { name: 'Guardar cobro' }).click()

      await page.reload()
      await expect(page.locator('select[name="cuentaCobroId"]')).toHaveValue(fixtures.vendedorLoteA.id)
    } finally {
      await admin.from('lotes').update({ cuenta_cobro_id: null }).eq('id', fixtures.loteSecundarioId)
      await admin
        .from('lote_participantes')
        .delete()
        .eq('lote_id', fixtures.loteSecundarioId)
        .eq('profile_id', fixtures.vendedorLoteA.id)
    }
  })
```

- [ ] **Step 3: Correr los tests**

Run: `npx playwright test tests/e2e/lote-participantes.spec.ts --project=chromium`
Expected: 8 passed

- [ ] **Step 4: Commit**

```bash
git add app/admin/lotes/\[id\]/actions.ts tests/e2e/lote-participantes.spec.ts
git commit -m "Permitir elegir a un participante adicional como cuenta de cobro"
```

---

### Task 4: Regresión completa, limpieza y documentación

**Files:**
- Modify: `Pruebas_Manuales_Pendientes.txt` (fuera del repo git)
- Modify: `Notas_Decisiones_SIMA.txt` (fuera del repo git)
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: todo lo de Tasks 1-3.
- Produces: nada — última tarea del plan.

- [ ] **Step 1: Build limpio**

Run: `npm run build`
Expected: sin errores. Si falla por memoria, reintentar con `NODE_OPTIONS="--max-old-space-size=4096" npm run build`.

- [ ] **Step 2: Unitarios (sin cambios en este plan, correr igual para descartar regresión)**

Run: `npx vitest run`
Expected: todos en verde.

- [ ] **Step 3: E2E completo, dos corridas**

Run: `npx playwright test`
Expected: todos en verde. Repetir una segunda vez completa para descartar flakes. Si aparece un fallo aislado claramente no relacionado (rate limit de Supabase, resource exhaustion del sistema operativo por muchas corridas seguidas), no asumir regresión de esta tanda sin confirmar la causa real.

- [ ] **Step 4: Limpieza de datos de prueba**

Antes de cualquier `execute_sql`, verificar con `mcp__supabase__get_project_url` que apunta al proyecto de SIMA. `lote_participantes` tiene `on delete cascade` contra `lotes`, así que se limpia sola cuando `ensureTestFixtures` recrea el lote fijo en la próxima corrida — no hace falta un `delete` manual de esa tabla. Sí hace falta la limpieza ya establecida de `cuentas_externas`/`cuentas_externas_movimientos` con `nombre like 'E2E %'` (los tests de este plan crean alguna cuenta externa nueva) y, si algún test de este plan quedó interrumpido a mitad de camino, verificar que `fixtures.loteId` y `fixtures.loteSecundarioId` no hayan quedado con `cuenta_cobro_id` seteado a algo que no sea `null` (los tests de Task 2/3 ya lo resetean en un `finally`, pero conviene confirmarlo con una consulta antes de dar la tanda por cerrada).

- [ ] **Step 5: Actualizar `Pruebas_Manuales_Pendientes.txt`**

Agregar una sección nueva (siguiente número disponible) explicando cómo probar a mano: entrar al detalle de un lote real como admin, agregar un vendedor que no sea el vendedor principal del lote como "participante adicional" con una etiqueta (ej. "Vendedor 2"), verificar que aparece en la lista, intentar agregarlo de nuevo (debe rechazarse), elegirlo como "Cuenta de cobro" del lote y guardar (debe funcionar), intentar quitarlo de la lista de participantes mientras sigue siendo la cuenta de cobro (debe rechazarse), reasignar la cuenta de cobro a otra persona y recién ahí quitarlo (debe funcionar). Mismo estilo que las secciones anteriores del archivo.

- [ ] **Step 6: Actualizar `Notas_Decisiones_SIMA.txt`**

Marcar el punto 30 ("Un lote puede tener varios participantes") como YA CONSTRUIDO (agregar la fecha de hoy y una referencia a este plan), aclarando explícitamente que es una extensión aditiva (no reemplazó `admin_id`/`acreedor_id`/`vendedor_id`, no cambió `confirmarPago`) y que todavía no incluye montos ni porcentajes — eso sigue siendo "distribución manual por cuota" (punto 31), la próxima pieza de la cadena.

- [ ] **Step 7: Cerrar el ledger**

Agregar una línea a `.superpowers/sdd/progress.md` resumiendo las 4 tareas y el resultado de la regresión/limpieza.

---

## Self-Review

**Cobertura de la spec:** tabla `lote_participantes` con exclusividad y no-duplicados (Task 1) ✓, roles elegibles y bloqueo de agregar a alguien ya principal del lote (Task 2) ✓, subsección "Participantes adicionales" con agregar/quitar exclusivo admin (Task 2) ✓, bloqueo de quitar si es la cuenta de cobro actual (Task 2) ✓, cierre del hueco de FK nuevo en `eliminarCuentaExterna` (Task 2) ✓, ampliación del selector de cuenta de cobro para participantes adicionales (Task 3) ✓, `confirmarPago` sin cambios (ningún task lo toca) ✓, fuera de alcance explícitamente no tocado (distribución por cuota, rediseño de confirmación cruzada, reemplazo de columnas fijas) ✓.

**Placeholders:** ninguno — cada step tiene código completo, o comando + resultado esperado.

**Coherencia de fixtures verificada línea por línea contra `tests/e2e/fixtures/test-data.ts`:** cada test usa una combinación lote+participante que es simultáneamente (a) no uno de los tres roles principales de ese lote específico, para no chocar con el guard de "ya es admin/acreedor/vendedor", y (b) con datos de transferencia cargados, para los casos que necesitan ser seleccionables como cuenta de cobro. `fixtures.loteId` (acreedor=acreedorConDatos, vendedor=vendedorLoteA) usa `vendedorLoteB` como participante de prueba; `fixtures.loteSecundarioId` (acreedor=acreedorSecundario, vendedor=vendedorLoteB) usa `vendedorLoteA` y `acreedorConDatos`. El test de Task 2 que necesita "un participante que ya es la cuenta de cobro" asigna esa relación directo por base con `createAdminClient()` (mismo patrón ya usado en `tests/e2e/cuentas-externas.spec.ts`), porque la única forma de lograr ese estado por UI depende de la validación que recién construye Task 3 — no existe todavía en el punto en que corre el test de Task 2.

**Consistencia de tipos:** `agregarParticipante(loteId: string, formData: FormData): Promise<void>` y `quitarParticipante(loteId: string, participanteId: string): Promise<void>` definidas en Task 2, usadas idénticas en el `.bind()` de `page.tsx` (Task 2) y en los tests (Task 2 y Task 3). Nombres de columna (`lote_participantes.profile_id/cuenta_externa_id/etiqueta`) usados idénticos en Task 1 (migración), Task 2 (actions y página) y Task 3 (`actualizarCobro`). El prefijo `externa:` para `<select name="participanteId">` sigue el mismo patrón que `<select name="cuentaCobroId">` ya usa desde el plan de cuentas externas — mismo `startsWith('externa:')` / `.slice('externa:'.length)`.
