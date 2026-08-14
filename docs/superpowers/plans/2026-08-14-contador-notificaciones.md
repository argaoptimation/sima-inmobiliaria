# Contador de notificaciones en la nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar en la nav de admin/acreedor cuántos pagos están esperando SU confirmación, recalculado en cada carga de página (sin JS de cliente).

**Architecture:** `app/admin/layout.tsx` calcula el conteo (query condicionada por rol, mismo patrón de scoping ya usado en `/admin/pagos`) y lo pasa como prop nueva a `NavAdmin`, que lo renderiza junto al link "Pagos" ya existente.

**Tech Stack:** Next.js 16 (Server Components), Supabase (Postgres), TypeScript.

## Global Constraints

- Sin JavaScript de cliente nuevo — el contador se recalcula en cada request al layout de `/admin/*`, no en vivo.
- El link "Pagos" sigue yendo a `/admin/pagos` sin cambios de destino.
- Un pago sin `comprobante_path` NO cuenta (no hay nada que confirmar todavía) — mismo criterio que ya usa `confirmarPago` para rechazar confirmaciones sin comprobante.
- Vendedor y cobrador no ven el contador (mismos roles que hoy no ven el link "Pagos").

---

### Task 1: Conteo en el layout + render en la nav

**Files:**
- Modify: `app/admin/layout.tsx`
- Modify: `components/NavAdmin.tsx`
- Test: `tests/e2e/contador-notificaciones.spec.ts` (nuevo)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `NavAdmin` gana la prop `pagosPendientes: number` — si en el futuro otra pantalla renderiza `NavAdmin` directamente (hoy solo lo hace `app/admin/layout.tsx`), tiene que pasar este prop también.

- [ ] **Step 1: Escribir el test (falla porque el contador todavía no existe)**

```typescript
// tests/e2e/contador-notificaciones.spec.ts
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

async function crearPagoPendiente(nombreArchivo: string, loteId: string, conComprobante: boolean) {
  const admin = createAdminClient()
  const fixtures = await ensureTestFixtures()

  let comprobantePath: string | null = null
  if (conComprobante) {
    comprobantePath = `pagos/${loteId}/${Date.now()}-${nombreArchivo}`
    const { error: errorUpload } = await admin.storage
      .from('comprobantes')
      .upload(comprobantePath, COMPROBANTE_BYTES, { contentType: 'application/pdf' })
    if (errorUpload) {
      throw new Error(`No se pudo subir el comprobante de prueba: ${errorUpload.message}`)
    }
  }

  const { data: pago, error } = await admin
    .from('pagos')
    .insert({
      cliente_id: fixtures.cliente.id,
      lote_id: loteId,
      monto: 100,
      moneda: 'USD',
      comprobante_path: comprobantePath,
      estado: 'pendiente',
    })
    .select('id')
    .single()

  if (error || !pago) {
    throw new Error(`No se pudo crear el pago de prueba: ${error?.message}`)
  }

  return pago.id as string
}

test.describe('Contador de pagos pendientes en la nav', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('el acreedor ve el contador de sus pagos pendientes, sube a 1 y baja al confirmar', async ({
    page,
  }) => {
    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/lotes')
    await expect(page.getByRole('link', { name: /^Pagos/ })).toHaveText('Pagos')

    const pagoId = await crearPagoPendiente(
      `e2e-contador-${Date.now()}.pdf`,
      fixtures.loteId,
      true
    )

    await page.goto('/admin/lotes')
    await expect(page.getByRole('link', { name: /^Pagos/ })).toHaveText('Pagos (1)')

    await page.goto('/admin/pagos')
    const fila = page.locator('tr', { has: page.locator(`form[action*="${pagoId}"]`) })
    await fila.getByRole('button', { name: 'Confirmar mi parte' }).click()
    await page.waitForURL(/\/admin\/pagos/)

    await page.goto('/admin/lotes')
    await expect(page.getByRole('link', { name: /^Pagos/ })).toHaveText('Pagos')
  })

  test('un pago sin comprobante todavía no cuenta', async ({ page }) => {
    await crearPagoPendiente(`e2e-sin-comprobante-${Date.now()}.pdf`, fixtures.loteId, false)

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/lotes')
    await expect(page.getByRole('link', { name: /^Pagos/ })).toHaveText('Pagos')
  })

  test('un acreedor no cuenta pagos de lotes que no son suyos', async ({ page }) => {
    await crearPagoPendiente(
      `e2e-lote-ajeno-${Date.now()}.pdf`,
      fixtures.loteSecundarioId,
      true
    )

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/lotes')
    await expect(page.getByRole('link', { name: /^Pagos/ })).toHaveText('Pagos')
  })

  test('el admin cuenta pagos de cualquier lote', async ({ page }) => {
    await crearPagoPendiente(`e2e-admin-${Date.now()}.pdf`, fixtures.loteId, true)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')
    await expect(page.getByRole('link', { name: /^Pagos/ })).toContainText('Pagos (')
  })
})
```

Nota para quien implemente: revisar `tests/e2e/fixtures/test-data.ts` para confirmar `TestFixtures.loteSecundarioId` (ya se usa en otros specs de este repo, ej. `tests/e2e/cliente-varios-lotes.spec.ts`) — tiene que ser un lote que NO pertenezca a `fixtures.acreedorConDatos`, para que el tercer test sea válido. Si el fixture real tiene otro dueño, está bien tal cual; si por algún motivo comparte acreedor, avisar y ajustar el test antes de continuar (no hackear el resultado).

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `npx playwright test tests/e2e/contador-notificaciones.spec.ts`
Expected: FAIL — el link "Pagos" no muestra ningún número todavía.

- [ ] **Step 3: Calcular el conteo en el layout**

En `app/admin/layout.tsx`, después del bloque que valida `rolesConAcceso` (antes del `return`), agregar:

```typescript
  let pagosPendientes = 0

  if (profile.role === 'acreedor') {
    const { data: misLotes } = await supabase
      .from('lotes')
      .select('id')
      .eq('acreedor_id', user.id)

    const loteIds = (misLotes ?? []).map((lote) => lote.id)

    if (loteIds.length > 0) {
      const { count } = await supabase
        .from('pagos')
        .select('id', { count: 'exact', head: true })
        .in('lote_id', loteIds)
        .eq('estado', 'pendiente')
        .not('comprobante_path', 'is', null)
        .is('confirmado_acreedor_por', null)
      pagosPendientes = count ?? 0
    }
  } else if (profile.role === 'administrador') {
    const { count } = await supabase
      .from('pagos')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'pendiente')
      .not('comprobante_path', 'is', null)
      .is('confirmado_admin_por', null)
    pagosPendientes = count ?? 0
  }
```

Y cambiar el `<NavAdmin role={profile.role} />` existente por:

```tsx
      <NavAdmin role={profile.role} pagosPendientes={pagosPendientes} />
```

- [ ] **Step 4: Recibir y renderizar el prop en `NavAdmin`**

En `components/NavAdmin.tsx`, cambiar la firma y el link "Pagos":

```tsx
export function NavAdmin({ role, pagosPendientes }: { role: string; pagosPendientes: number }) {
  const puedeVerPagosYUsuarios = role === 'administrador' || role === 'acreedor'

  return (
    <nav className="flex items-center justify-between border-b p-4 text-sm">
      <div className="flex gap-4">
        <a href="/admin/lotes">Lotes</a>
        {puedeVerPagosYUsuarios && (
          <a href="/admin/pagos">Pagos{pagosPendientes > 0 ? ` (${pagosPendientes})` : ''}</a>
        )}
```

(El resto del archivo —Usuarios, Clientes, Mi perfil, el form de logout— queda exactamente igual, no tocar.)

- [ ] **Step 5: Correr el test de nuevo para confirmar que pasa**

Run: `npx playwright test tests/e2e/contador-notificaciones.spec.ts`
Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
git add app/admin/layout.tsx components/NavAdmin.tsx tests/e2e/contador-notificaciones.spec.ts
git commit -m "Contador de pagos pendientes de confirmacion en la nav de admin/acreedor"
```

---

### Task 2: Regresión + docs

**Files:**
- Modify: `Pruebas_Manuales_Pendientes.txt` (fuera del repo git)
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada — última tarea.

- [ ] **Step 1: Build limpio**

Run: `npm run build` (usar `NODE_OPTIONS="--max-old-space-size=4096" npm run build` si hace falta, mismo criterio que la tanda anterior).
Expected: sin errores.

- [ ] **Step 2: Unitarios**

Run: `npx vitest run`
Expected: todos en verde.

- [ ] **Step 3: E2E completo**

Run: `npx playwright test`
Expected: todos en verde, salvo fallos aislados ya conocidos de "email rate limit exceeded" (no relacionados a esta tanda).

- [ ] **Step 4: Limpieza de datos de prueba**

Verificar `mcp__supabase__get_project_url` antes de cualquier `execute_sql`. Borrar los `pagos` de prueba creados por `contador-notificaciones.spec.ts` (identificables por `comprobante_path` con prefijo `pagos/.../...-e2e-contador-`, `...-e2e-admin-`, etc., o por no tener ninguna imputación asociada). Confirmar que `fixtures.loteId` y `fixtures.loteSecundarioId` siguen con sus cuotas originales intactas.

- [ ] **Step 5: Actualizar `Pruebas_Manuales_Pendientes.txt`**

Agregar una sección nueva: cómo entrar como acreedor/admin y ver el contador junto a "Pagos", crear un pago pendiente de prueba y confirmar que el número aparece/desaparece al confirmar. Mismo estilo que las secciones anteriores.

- [ ] **Step 6: Cerrar el ledger**

Agregar una línea a `.superpowers/sdd/progress.md`.

---

## Self-Review

**Cobertura de la spec:** contador junto al link "Pagos" (Task 1) ✓, cálculo en el layout condicionado por rol con el mismo scoping que ya usa `/admin/pagos` (Task 1) ✓, pago sin comprobante no cuenta (Task 1, test dedicado) ✓, link sigue yendo a `/admin/pagos` sin cambios (Task 1, no se tocó ningún `href`) ✓, vendedor/cobrador no lo ven (ya cubierto por el `puedeVerPagosYUsuarios` existente, sin tocar) ✓, testing (4 casos de la spec) ✓.

**Placeholders:** ninguno.

**Consistencia de tipos:** `NavAdmin({ role, pagosPendientes }: { role: string; pagosPendientes: number })` — el único call site (`app/admin/layout.tsx`) se actualiza en el mismo Step 3 que agrega el prop, sin dejar ningún otro lugar del código llamando a `NavAdmin` con la firma vieja.
