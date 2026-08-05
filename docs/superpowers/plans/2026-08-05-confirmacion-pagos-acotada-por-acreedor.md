# Confirmación de pagos acotada al acreedor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un acreedor solo puede confirmar (y ver en `/admin/pagos`) los pagos de clientes cuyo lote tiene su propio `acreedor_id` — no los de cualquier cliente. El administrador no cambia.

**Architecture:** Mismo patrón de siempre: el chequeo de autorización vive en la Server Action (defensa real), y el listado se acota con una query distinta según el rol de quien mira la página (mismo patrón ya usado en `/admin/lotes` y `/admin/usuarios`).

**Tech Stack:** Next.js (App Router) + TypeScript, Supabase, Playwright.

## Global Constraints

- Spec source de verdad: `docs/superpowers/specs/2026-08-05-confirmacion-pagos-acotada-por-acreedor-design.md`.
- El lado `administrador` de la confirmación cruzada NO cambia — cualquier administrador confirma, sin comparar contra ningún dueño.
- No se toca la lógica de FIFO, el claim atómico de `estado`, ni la captura de `monto_recibido`/`moneda_recibida` — solo se agrega el chequeo de autorización antes de esa lógica.
- No se agrega ningún concepto de "política de confirmación configurable" — eso quedó explícitamente descartado por ahora.
- Idioma: todo el copy de UI, nombres de variables/funciones y mensajes de commit en español.
- **Acoplamiento importante a tener en cuenta en la Task 3**: el spec E2E existente `tests/e2e/pago-flujo-completo.spec.ts` hoy loguea como `fixtures.acreedor` (el acreedor de prueba "de a secas", SIN datos de transferencia) para confirmar el pago del lote principal ("E2E Test Lote"). Pero ese lote tiene `acreedor_id` seteado a `fixtures.acreedorConDatos.id` (lo hizo un feature anterior, ver `tests/e2e/fixtures/test-data.ts`). Una vez aplicada la Task 1 de este plan, `fixtures.acreedor` YA NO va a poder confirmar ese pago (no es el dueño del lote) — ese spec existente se va a romper si no se actualiza para loguear con `fixtures.acreedorConDatos` en ese paso. Esto está identificado a propósito, no lo descubras de cero: arreglalo como parte de la Task 3.

---

### Task 1: `confirmarPago` exige que el acreedor sea el dueño del lote

**Files:**
- Modify: `app/admin/pagos/actions.ts`

**Interfaces:**
- Consumes: tablas `pagos`, `lotes`
- Produces: nada nuevo — cierra el hueco de autorización de esta función

- [ ] **Step 1: Agregar el chequeo de ownership**

Modify `app/admin/pagos/actions.ts`. Cambiar el `select` de `pago` para incluir `cliente_id`, y agregar el chequeo de ownership justo después, antes de calcular `campoPor`/`campoAt`.

Cambiar:
```typescript
  const { data: pago } = await supabase
    .from('pagos')
    .select('comprobante_path')
    .eq('id', pagoId)
    .single()

  if (!pago || !pago.comprobante_path) {
    revalidatePath('/admin/pagos')
    return
  }

  const campoPor = perfil.role === 'acreedor' ? 'confirmado_acreedor_por' : 'confirmado_admin_por'
```
por:
```typescript
  const { data: pago } = await supabase
    .from('pagos')
    .select('comprobante_path, cliente_id')
    .eq('id', pagoId)
    .single()

  if (!pago || !pago.comprobante_path) {
    revalidatePath('/admin/pagos')
    return
  }

  if (perfil.role === 'acreedor') {
    const { data: lote } = await supabase
      .from('lotes')
      .select('acreedor_id')
      .eq('cliente_id', pago.cliente_id)
      .single()

    if (!lote || lote.acreedor_id !== user.id) {
      // No es el acreedor de este lote -- mismo tratamiento que no ser
      // acreedor en absoluto para este pago puntual.
      revalidatePath('/admin/pagos')
      return
    }
  }

  const campoPor = perfil.role === 'acreedor' ? 'confirmado_acreedor_por' : 'confirmado_admin_por'
```

(el resto de la función -- captura de `montoRecibido`, el `update` de confirmación, el claim atómico de `estado`, y todo el loop de imputación FIFO -- queda exactamente igual, no lo toques).

- [ ] **Step 2: Verificar que compila**

```bash
npm run build
```
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add app/admin/pagos/actions.ts
git commit -m "feat: confirmar pago exige que el acreedor sea el dueño del lote"
```

---

### Task 2: `/admin/pagos` acota el listado para un acreedor

**Files:**
- Modify: `app/admin/pagos/page.tsx`

**Interfaces:**
- Consumes: `createClient()`, tablas `lotes`/`pagos`
- Produces: nada nuevo

- [ ] **Step 1: Branch por rol de quien mira la página**

Modify `app/admin/pagos/page.tsx` completo:

```tsx
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { confirmarPago } from './actions'

type Pago = {
  id: string
  monto: number
  moneda: string
  comprobante_path: string | null
  estado: string
  confirmado_acreedor_por: string | null
  confirmado_admin_por: string | null
  cliente_id: string
  monto_recibido: number | null
  moneda_recibida: string | null
}

export default async function PagosPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: perfilPropio } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  if (!perfilPropio) {
    redirect('/login')
  }

  const columnasPago =
    'id, monto, moneda, comprobante_path, estado, confirmado_acreedor_por, confirmado_admin_por, cliente_id, monto_recibido, moneda_recibida'

  let pagos: Pago[] = []

  if (perfilPropio!.role === 'acreedor') {
    const { data: misLotes } = await supabase
      .from('lotes')
      .select('cliente_id')
      .eq('acreedor_id', user!.id)
      .not('cliente_id', 'is', null)

    const clienteIds = [...new Set((misLotes ?? []).map((lote) => lote.cliente_id as string))]

    if (clienteIds.length > 0) {
      const { data } = await supabase
        .from('pagos')
        .select(columnasPago)
        .in('cliente_id', clienteIds)
        .order('created_at', { ascending: false })
      pagos = data ?? []
    }
  } else {
    const { data } = await supabase
      .from('pagos')
      .select(columnasPago)
      .order('created_at', { ascending: false })
    pagos = data ?? []
  }

  const admin = createAdminClient()

  const pagosConLink = await Promise.all(
    pagos.map(async (pago) => {
      if (!pago.comprobante_path) {
        return { ...pago, comprobanteUrl: null }
      }

      const { data, error } = await admin.storage
        .from('comprobantes')
        .createSignedUrl(pago.comprobante_path, 300)

      return { ...pago, comprobanteUrl: error ? null : data?.signedUrl ?? null }
    })
  )

  return (
    <main>
      <h1 className="mb-6 text-xl font-semibold">Pagos</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Monto</th>
            <th>Comprobante</th>
            <th>Estado</th>
            <th>Confirmado acreedor</th>
            <th>Confirmado admin</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pagosConLink.map((pago) => {
            const confirmarEstePago = confirmarPago.bind(null, pago.id)

            return (
              <tr key={pago.id} className="border-b">
                <td className="py-2">
                  {pago.monto} {pago.moneda}
                </td>
                <td>
                  {pago.comprobante_path ? (
                    pago.comprobanteUrl ? (
                      <a href={pago.comprobanteUrl} target="_blank" className="underline">
                        Ver comprobante
                      </a>
                    ) : (
                      <span className="text-gray-500">Comprobante no disponible</span>
                    )
                  ) : (
                    <span className="text-gray-500">Sin comprobante</span>
                  )}
                </td>
                <td>{pago.estado}</td>
                <td>{pago.confirmado_acreedor_por ? 'Sí' : 'No'}</td>
                <td>{pago.confirmado_admin_por ? 'Sí' : 'No'}</td>
                <td>
                  {pago.estado === 'pendiente' &&
                    (pago.comprobante_path ? (
                      <form action={confirmarEstePago} className="flex flex-col gap-2">
                        <label className="text-xs text-gray-500">
                          Monto recibido (opcional, para cierre de caja)
                          <input
                            name="montoRecibido"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={pago.monto_recibido ?? undefined}
                            className="mt-1 block rounded border px-2 py-1"
                          />
                        </label>
                        <label className="text-xs text-gray-500">
                          Moneda recibida
                          <select
                            name="monedaRecibida"
                            defaultValue={pago.moneda_recibida ?? 'USD'}
                            className="mt-1 block rounded border px-2 py-1"
                          >
                            <option value="USD">USD</option>
                            <option value="ARS">ARS</option>
                          </select>
                        </label>
                        <button type="submit" className="self-start underline">
                          Confirmar mi parte
                        </button>
                      </form>
                    ) : (
                      <span className="text-gray-500">Esperando comprobante</span>
                    ))}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </main>
  )
}
```

Nota: se agregó un tipo `Pago` explícito porque ahora `pagos` se arma en dos ramas distintas (si no le das un tipo a las dos, TypeScript infiere tipos ligeramente distintos entre la rama y el `let pagos: Pago[] = []` inicial). El resto del JSX es exactamente el mismo que ya existía, solo cambió cómo se obtienen los `pagos`.

- [ ] **Step 2: Verificar que compila**

```bash
npm run build
```
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add app/admin/pagos/page.tsx
git commit -m "feat: acreedor solo ve en /admin/pagos los pagos de sus propios lotes"
```

---

### Task 3: Actualizar E2E existente + cobertura nueva

**Files:**
- Modify: `tests/e2e/pago-flujo-completo.spec.ts`
- Create: `tests/e2e/pagos-acotados-por-acreedor.spec.ts`

**Interfaces:**
- Consumes: `ensureTestFixtures()`, `login()`/`logout()`

- [ ] **Step 1: Arreglar el spec existente (acoplamiento ya identificado en los Global Constraints)**

Modify `tests/e2e/pago-flujo-completo.spec.ts`: en el paso `'login como acreedor y confirmación de su parte'`, cambiar el login de `fixtures.acreedor` a `fixtures.acreedorConDatos` (es quien realmente tiene `acreedor_id` en "E2E Test Lote", el lote de este test). Buscá la línea:
```typescript
      await login(page, fixtures.acreedor.email, fixtures.password)
```
dentro de ese `test.step`, y cambiala a:
```typescript
      await login(page, fixtures.acreedorConDatos.email, fixtures.password)
```
No cambies nada más de ese spec (el resto de las aserciones, los otros pasos con `fixtures.admin`/`fixtures.cliente`, quedan igual).

- [ ] **Step 2: Correr ese spec solo, para confirmar el fix antes de seguir**

```bash
npx playwright test tests/e2e/pago-flujo-completo.spec.ts
```
Expected: pasa en verde. Si sigue fallando, investigá la causa real antes de continuar (puede que haga falta releer `test-data.ts` para confirmar exactamente qué fixture es dueña de qué lote).

- [ ] **Step 3: Nuevo spec de la regla acotada**

Create `tests/e2e/pagos-acotados-por-acreedor.spec.ts`. Sigue el mismo patrón que ya usa `pago-flujo-completo.spec.ts` para ubicar "su" fila sin depender del orden de ejecución de otros specs (la base es compartida): registra un pago propio con un nombre de comprobante único por corrida, y verifica quién puede/no puede verlo en `/admin/pagos`.

```typescript
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login, logout } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)
const NOMBRE_COMPROBANTE = `e2e-pagos-acotados-${Date.now()}.pdf`

// "E2E Test Lote" tiene acreedor_id = acreedorConDatos (ver test-data.ts).
// fixtures.acreedorSecundario es dueño de un lote distinto -- no tiene
// ninguna relación con "E2E Test Lote", así que no debería poder ver ni
// confirmar los pagos de ese cliente.
test.describe('Confirmación de pagos acotada al acreedor del lote', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('un acreedor sin relación con el lote no ve el pago del cliente en /admin/pagos', async ({
    page,
  }) => {
    await test.step('el cliente registra un pago y sube comprobante', async () => {
      await login(page, fixtures.cliente.email, fixtures.password)

      const filaCuota1 = page.locator('main table').nth(0).locator('tbody tr').nth(0)
      await filaCuota1.getByRole('link', { name: 'Pagar cuota' }).click()
      await page.waitForURL(/\/portal-cliente\/pagar\//)

      await page.getByPlaceholder('Monto transferido').fill('1')
      await page.selectOption('select[name="moneda"]', 'USD')
      await page.getByRole('button', { name: 'Ya transferí' }).click()
      await page.waitForURL(/\/portal-cliente\/pagos\/.+\/comprobante$/)

      await page.setInputFiles('input[name="comprobante"]', {
        name: NOMBRE_COMPROBANTE,
        mimeType: 'application/pdf',
        buffer: COMPROBANTE_BYTES,
      })
      await page.getByRole('button', { name: 'Finalizar' }).click()
      await page.waitForURL(/\/portal-cliente$/)
    })

    await test.step('acreedorConDatos (dueño real del lote) SÍ ve el pago', async () => {
      await logout(page)
      await login(page, fixtures.acreedorConDatos.email, fixtures.password)
      await page.goto('/admin/pagos')

      await expect(page.locator(`a[href*="${NOMBRE_COMPROBANTE}"]`)).toBeVisible()
    })

    await test.step('acreedorSecundario (sin relación con el lote) NO ve el pago', async () => {
      await logout(page)
      await login(page, fixtures.acreedorSecundario.email, fixtures.password)
      await page.goto('/admin/pagos')

      await expect(page.locator(`a[href*="${NOMBRE_COMPROBANTE}"]`)).toHaveCount(0)
    })
  })
})
```

- [ ] **Step 4: Correr el suite completo (Playwright + Vitest)**

El servidor de dev debería estar corriendo; si no, levantalo con `npm run dev` en background y esperá a que `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login` devuelva 200.

```bash
npm test
npx playwright test
```
Expected: `npm test` en verde. `npx playwright test` con todos los specs en verde (incluye `pago-flujo-completo.spec.ts` ya arreglado, y el nuevo `pagos-acotados-por-acreedor.spec.ts`), sin romper `auth.spec.ts`, `cuenta-cobro.spec.ts`, ni `visibilidad-acreedor.spec.ts`.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e
git commit -m "test: cobertura e2e de confirmacion de pagos acotada al acreedor del lote"
```

---

## Verificación final

```bash
npm run build && npm test && npx playwright test
```

Expected: los tres comandos en verde.
