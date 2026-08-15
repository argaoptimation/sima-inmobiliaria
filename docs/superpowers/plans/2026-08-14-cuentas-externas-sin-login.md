# Cuentas externas (acreedores sin login) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir redirigir el pago de una cuota a personas/comercios sin cuenta de usuario en SIMA (ej. un corralón al que Nicolás le debe plata), con su propia cuenta corriente simple visible solo para el administrador.

**Architecture:** Dos tablas nuevas (`cuentas_externas`, `cuentas_externas_movimientos`) sin ninguna relación con `auth.users`. `lotes` gana una columna hermana de `cuenta_cobro_id` (`cuenta_cobro_externa_id`) — nunca las dos a la vez. El selector de "Cuenta de cobro" del detalle de lote se unifica: mismo `<select name="cuentaCobroId">` de siempre, pero el valor puede venir con el prefijo `externa:` para distinguir una cuenta externa de un profile. `confirmarPago` gana un chequeo puntual: si el lote apunta a una cuenta externa, el claim atómico exige solo la confirmación del admin, y se genera un movimiento de crédito automático.

**Tech Stack:** Next.js 16 (Server Components + Server Actions), Supabase (Postgres + Storage), TypeScript, Vitest (unitarios), Playwright (e2e).

## Global Constraints

- Sin JavaScript de cliente nuevo (excepto el wrapper de confirm-dialog para eliminar, mismo patrón que `BotonEliminarUsuario`).
- `titular`, `alias`, `banco` son `not null` a nivel de base en `cuentas_externas` — nunca puede existir una fila incompleta (decisión explícita de Gabriel, ver spec). `cbu` sigue opcional.
- Reusar `tieneDatosTransferencia` de `lib/lotes/validar-cuenta-cobro.ts` — no reimplementar esa validación.
- El saldo de una cuenta externa se calcula al vuelo (débitos menos créditos, agrupado por moneda) — no se materializa ninguna columna de "saldo actual".
- Fuera de alcance (no tocar en este plan): pestaña genérica de "otros movimientos" compartida, múltiples participantes por lote, distribución manual por cuota, rediseño completo del circuito de confirmación cruzada, conversión automática entre monedas.

---

### Task 1: Migración — tablas `cuentas_externas` / `cuentas_externas_movimientos` + columna en `lotes`

**Files:**
- Create: `supabase/migrations/0017_cuentas_externas.sql`

**Interfaces:**
- Consumes: nada.
- Produces: tabla `public.cuentas_externas` (columnas: `id`, `nombre`, `titular`, `alias`, `banco`, `cbu`, `created_at`), tabla `public.cuentas_externas_movimientos` (columnas: `id`, `cuenta_externa_id`, `tipo` [enum `debito`/`credito`], `monto`, `moneda`, `concepto`, `pago_id`, `cargado_por`, `created_at`), columna `public.lotes.cuenta_cobro_externa_id`. Todas las tareas siguientes dependen de que estas existan con estos nombres exactos.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/0017_cuentas_externas.sql
create type public.movimiento_externo_tipo as enum ('debito', 'credito');

create table public.cuentas_externas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  titular text not null,
  alias text not null,
  banco text not null,
  cbu text,
  created_at timestamptz not null default now()
);

create table public.cuentas_externas_movimientos (
  id uuid primary key default gen_random_uuid(),
  cuenta_externa_id uuid not null references public.cuentas_externas(id),
  tipo public.movimiento_externo_tipo not null,
  monto numeric(14,2) not null,
  moneda public.moneda not null,
  concepto text not null,
  pago_id uuid references public.pagos(id),
  cargado_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.lotes
  add column cuenta_cobro_externa_id uuid references public.cuentas_externas(id);
```

- [ ] **Step 2: Aplicar directamente contra la base (el controller, no un subagente)**

Antes de aplicar, verificar con `mcp__supabase__get_project_url` que coincide con `NEXT_PUBLIC_SUPABASE_URL` de `.env.local`. Aplicar con `mcp__supabase__apply_migration`. Verificar después con una consulta a `information_schema.columns` que las tablas y la columna nueva existen.

- [ ] **Step 3: Commit del archivo de migración**

```bash
git add supabase/migrations/0017_cuentas_externas.sql
git commit -m "Migracion: tablas cuentas_externas / cuentas_externas_movimientos + lotes.cuenta_cobro_externa_id"
```

---

### Task 2: Helper de saldo + alta y listado de cuentas externas

**Files:**
- Create: `lib/cuentas-externas/calcular-saldo.ts`
- Create: `lib/cuentas-externas/calcular-saldo.test.ts`
- Create: `app/admin/cuentas-externas/actions.ts`
- Create: `app/admin/cuentas-externas/page.tsx`
- Create: `app/admin/cuentas-externas/nuevo/page.tsx`
- Modify: `components/NavAdmin.tsx`
- Test: `tests/e2e/cuentas-externas.spec.ts` (nuevo)

**Interfaces:**
- Consumes: tablas de Task 1. `requireAdministrador` de `@/lib/auth/require-admin`. `tieneDatosTransferencia` de `@/lib/lotes/validar-cuenta-cobro`.
- Produces: `calcularSaldoPorMoneda(movimientos: {tipo: 'debito' | 'credito', monto: number, moneda: string}[]): Record<string, number>` — Task 3 la reusa en el detalle. `crearCuentaExterna(formData: FormData): Promise<void>` en `app/admin/cuentas-externas/actions.ts` — Task 3 no la toca pero comparte el mismo archivo de actions. Ruta `/admin/cuentas-externas` (listado) y `/admin/cuentas-externas/nuevo` (alta) — Task 3 agrega `/admin/cuentas-externas/[id]`. Task 4 depende de que la tabla `cuentas_externas` tenga datos reales para poblar el selector.

- [ ] **Step 1: Escribir el test del helper de saldo (falla porque el archivo no existe)**

```typescript
// lib/cuentas-externas/calcular-saldo.test.ts
import { describe, expect, it } from 'vitest'
import { calcularSaldoPorMoneda } from './calcular-saldo'

describe('calcularSaldoPorMoneda', () => {
  it('un débito solo deja saldo positivo (le debemos)', () => {
    expect(
      calcularSaldoPorMoneda([{ tipo: 'debito', monto: 2000, moneda: 'ARS' }])
    ).toEqual({ ARS: 2000 })
  })

  it('un crédito solo deja saldo negativo (le pagamos sin deberle)', () => {
    expect(
      calcularSaldoPorMoneda([{ tipo: 'credito', monto: 500, moneda: 'USD' }])
    ).toEqual({ USD: -500 })
  })

  it('débito y crédito de la misma moneda se compensan', () => {
    expect(
      calcularSaldoPorMoneda([
        { tipo: 'debito', monto: 2000, moneda: 'ARS' },
        { tipo: 'credito', monto: 1500, moneda: 'ARS' },
      ])
    ).toEqual({ ARS: 500 })
  })

  it('monedas distintas se acumulan por separado', () => {
    expect(
      calcularSaldoPorMoneda([
        { tipo: 'debito', monto: 2000, moneda: 'ARS' },
        { tipo: 'debito', monto: 100, moneda: 'USD' },
      ])
    ).toEqual({ ARS: 2000, USD: 100 })
  })

  it('sin movimientos, saldo vacío', () => {
    expect(calcularSaldoPorMoneda([])).toEqual({})
  })
})
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `npx vitest run lib/cuentas-externas/calcular-saldo.test.ts`
Expected: FAIL — el módulo `./calcular-saldo` no existe.

- [ ] **Step 3: Implementar el helper**

```typescript
// lib/cuentas-externas/calcular-saldo.ts
export interface MovimientoParaSaldo {
  tipo: 'debito' | 'credito'
  monto: number
  moneda: string
}

// Saldo positivo: lo que todavia le debemos a esta cuenta externa.
// Saldo negativo: le transferimos de mas / esta a favor nuestro.
export function calcularSaldoPorMoneda(movimientos: MovimientoParaSaldo[]): Record<string, number> {
  const saldos: Record<string, number> = {}

  for (const movimiento of movimientos) {
    const signo = movimiento.tipo === 'debito' ? 1 : -1
    saldos[movimiento.moneda] = (saldos[movimiento.moneda] ?? 0) + signo * movimiento.monto
  }

  return saldos
}
```

- [ ] **Step 4: Correr el test de nuevo para confirmar que pasa**

Run: `npx vitest run lib/cuentas-externas/calcular-saldo.test.ts`
Expected: 5 passed

- [ ] **Step 5: Escribir la Server Action de alta**

```typescript
// app/admin/cuentas-externas/actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'

export async function crearCuentaExterna(formData: FormData) {
  await requireAdministrador()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const nombre = ((formData.get('nombre') as string) || '').trim()
  const titular = ((formData.get('titular') as string) || '').trim()
  const alias = ((formData.get('alias') as string) || '').trim()
  const banco = ((formData.get('banco') as string) || '').trim()
  const cbu = ((formData.get('cbu') as string) || '').trim() || null

  if (!nombre) {
    redirect(`/admin/cuentas-externas/nuevo?error=${encodeURIComponent('Ingresá un nombre')}`)
  }

  if (!tieneDatosTransferencia({ titular, alias, banco })) {
    redirect(
      `/admin/cuentas-externas/nuevo?error=${encodeURIComponent(
        'Titular, alias y banco son obligatorios'
      )}`
    )
  }

  const { data: cuentaExterna, error } = await supabase
    .from('cuentas_externas')
    .insert({ nombre, titular, alias, banco, cbu })
    .select('id')
    .single()

  if (error || !cuentaExterna) {
    redirect(
      `/admin/cuentas-externas/nuevo?error=${encodeURIComponent(error?.message ?? 'error desconocido')}`
    )
  }

  const deudaInicialTexto = ((formData.get('deudaInicialMonto') as string) || '').trim()
  const deudaInicialMonto = deudaInicialTexto ? Number(deudaInicialTexto) : null

  if (deudaInicialMonto && deudaInicialMonto > 0) {
    const deudaInicialMoneda = (formData.get('deudaInicialMoneda') as string) || 'USD'
    const deudaInicialConcepto =
      ((formData.get('deudaInicialConcepto') as string) || '').trim() || 'Deuda inicial'

    const { error: errorMovimiento } = await supabase.from('cuentas_externas_movimientos').insert({
      cuenta_externa_id: cuentaExterna!.id,
      tipo: 'debito',
      monto: deudaInicialMonto,
      moneda: deudaInicialMoneda,
      concepto: deudaInicialConcepto,
      cargado_por: user!.id,
    })

    if (errorMovimiento) {
      redirect(
        `/admin/cuentas-externas/${cuentaExterna!.id}?error=${encodeURIComponent(
          `La cuenta se creó pero no se pudo cargar la deuda inicial: ${errorMovimiento.message}`
        )}`
      )
    }
  }

  redirect(`/admin/cuentas-externas/${cuentaExterna!.id}`)
}
```

- [ ] **Step 6: Página de listado**

```tsx
// app/admin/cuentas-externas/page.tsx
import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { calcularSaldoPorMoneda } from '@/lib/cuentas-externas/calcular-saldo'

export default async function CuentasExternasPage() {
  await requireAdministrador()

  const supabase = await createClient()

  const { data: cuentasExternas } = await supabase
    .from('cuentas_externas')
    .select('id, nombre')
    .order('nombre')

  const { data: movimientos } = await supabase
    .from('cuentas_externas_movimientos')
    .select('cuenta_externa_id, tipo, monto, moneda')

  const movimientosPorCuenta = new Map<string, { tipo: string; monto: number; moneda: string }[]>()
  for (const movimiento of movimientos ?? []) {
    const lista = movimientosPorCuenta.get(movimiento.cuenta_externa_id) ?? []
    lista.push(movimiento as { tipo: string; monto: number; moneda: string })
    movimientosPorCuenta.set(movimiento.cuenta_externa_id, lista)
  }

  function formatearSaldo(cuentaExternaId: string) {
    const propios = movimientosPorCuenta.get(cuentaExternaId) ?? []
    const saldos = calcularSaldoPorMoneda(
      propios.map((m) => ({ tipo: m.tipo as 'debito' | 'credito', monto: m.monto, moneda: m.moneda }))
    )
    const entradas = Object.entries(saldos)
    if (entradas.length === 0) return '—'
    return entradas.map(([moneda, monto]) => `${monto} ${moneda}`).join(' / ')
  }

  return (
    <main className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cuentas externas</h1>
        <a href="/admin/cuentas-externas/nuevo" className="rounded bg-black px-3 py-2 text-sm text-white">
          + Nueva cuenta externa
        </a>
      </div>
      {(cuentasExternas ?? []).length === 0 ? (
        <p className="text-sm text-gray-600">Todavía no hay ninguna cuenta externa cargada.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Nombre</th>
              <th>Saldo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cuentasExternas!.map((cuentaExterna) => (
              <tr key={cuentaExterna.id} className="border-b">
                <td className="py-2">{cuentaExterna.nombre}</td>
                <td>{formatearSaldo(cuentaExterna.id)}</td>
                <td>
                  <a href={`/admin/cuentas-externas/${cuentaExterna.id}`} className="underline">
                    Ver detalle
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
```

- [ ] **Step 7: Página de alta**

```tsx
// app/admin/cuentas-externas/nuevo/page.tsx
import { requireAdministrador } from '@/lib/auth/require-admin'
import { crearCuentaExterna } from '../actions'

export default async function NuevaCuentaExternaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireAdministrador()
  const { error } = await searchParams

  return (
    <main className="max-w-md">
      <a href="/admin/cuentas-externas" className="mb-4 inline-block text-sm underline">
        ← Volver a Cuentas externas
      </a>
      <h1 className="mb-6 text-xl font-semibold">Nueva cuenta externa</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      <form action={crearCuentaExterna} className="flex flex-col gap-3">
        <label className="text-sm">
          Nombre del destinatario
          <input name="nombre" required className="mt-1 block w-full rounded border px-3 py-2" />
        </label>
        <label className="text-sm">
          Titular de la cuenta
          <input name="titular" required className="mt-1 block w-full rounded border px-3 py-2" />
        </label>
        <label className="text-sm">
          Alias
          <input name="alias" required className="mt-1 block w-full rounded border px-3 py-2" />
        </label>
        <label className="text-sm">
          Banco
          <input name="banco" required className="mt-1 block w-full rounded border px-3 py-2" />
        </label>
        <label className="text-sm">
          CBU (opcional)
          <input name="cbu" className="mt-1 block w-full rounded border px-3 py-2" />
        </label>
        <h2 className="mt-4 text-sm font-semibold">Deuda inicial (opcional)</h2>
        <label className="text-sm">
          Monto
          <input
            name="deudaInicialMonto"
            type="number"
            step="0.01"
            min="0"
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Moneda
          <select name="deudaInicialMoneda" defaultValue="USD" className="mt-1 block w-full rounded border px-3 py-2">
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </label>
        <label className="text-sm">
          Concepto
          <input
            name="deudaInicialConcepto"
            placeholder="Ej: Materiales de construcción"
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Crear cuenta externa
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 8: Link nuevo en la navegación**

En `components/NavAdmin.tsx`, agregar el link junto al de "Clientes" (mismo `esAdministrador &&`):

```tsx
        {esAdministrador && <a href="/admin/clientes">Clientes</a>}
        {esAdministrador && <a href="/admin/cuentas-externas">Cuentas externas</a>}
```

- [ ] **Step 9: Escribir el test e2e de alta y listado**

```typescript
// tests/e2e/cuentas-externas.spec.ts
import { test, expect } from '@playwright/test'
import { ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Cuentas externas', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('crear una cuenta externa con deuda inicial y verla en el listado con el saldo correcto', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/cuentas-externas/nuevo')

    const nombre = `E2E Corralón ${Date.now()}`
    await page.getByLabel('Nombre del destinatario').fill(nombre)
    await page.getByLabel('Titular de la cuenta').fill('Materiales del Centro SRL')
    await page.getByLabel('Alias').fill('materiales.centro')
    await page.getByLabel('Banco').fill('Banco Test')
    await page.getByLabel('Monto').fill('2000')
    await page.getByLabel('Concepto').fill('Materiales de construcción')
    await page.getByRole('button', { name: 'Crear cuenta externa' }).click()

    await page.waitForURL(/\/admin\/cuentas-externas\/.+$/)

    await page.goto('/admin/cuentas-externas')
    const fila = page.getByRole('row', { name: new RegExp(nombre) })
    await expect(fila).toContainText('2000 USD')
  })

  test('crear una cuenta externa sin banco es rechazado', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/cuentas-externas/nuevo')

    await page.getByLabel('Nombre del destinatario').fill(`E2E Sin Banco ${Date.now()}`)
    await page.getByLabel('Titular de la cuenta').fill('Alguien')
    await page.getByLabel('Alias').fill('alguien.alias')
    // Banco NO se completa a propósito.
    await page.getByRole('button', { name: 'Crear cuenta externa' }).click()

    await expect(page.getByText('Titular, alias y banco son obligatorios')).toBeVisible()
  })

  test('un acreedor no puede acceder a /admin/cuentas-externas navegando directo por URL', async ({
    page,
  }) => {
    await login(page, fixtures.acreedor.email, fixtures.password)
    await page.goto('/admin/cuentas-externas')
    await expect(page).toHaveURL(/\/admin\/lotes$/)
  })
})
```

- [ ] **Step 10: Correr el test e2e**

Run: `npx playwright test tests/e2e/cuentas-externas.spec.ts --project=chromium`
Expected: 3 passed

- [ ] **Step 11: Commit**

```bash
git add lib/cuentas-externas app/admin/cuentas-externas components/NavAdmin.tsx tests/e2e/cuentas-externas.spec.ts
git commit -m "Cuentas externas: helper de saldo, alta y listado"
```

---

### Task 3: Detalle — editar, agregar deuda pendiente, eliminar

**Files:**
- Modify: `app/admin/cuentas-externas/actions.ts`
- Create: `app/admin/cuentas-externas/[id]/page.tsx`
- Create: `app/admin/cuentas-externas/BotonEliminarCuentaExterna.tsx`
- Test: `tests/e2e/cuentas-externas.spec.ts`

**Interfaces:**
- Consumes: `calcularSaldoPorMoneda` de Task 2. `crearCuentaExterna` de Task 2 (no se toca, se agrega al lado).
- Produces: `actualizarCuentaExterna(cuentaExternaId: string, formData: FormData): Promise<void>`, `agregarMovimiento(cuentaExternaId: string, formData: FormData): Promise<void>`, `eliminarCuentaExterna(cuentaExternaId: string): Promise<void>` — ninguna tarea posterior las consume directamente, pero Task 5 depende de que la tabla `cuentas_externas_movimientos` ya tenga filas reales para probar el crédito automático end-to-end.

- [ ] **Step 1: Agregar las tres Server Actions nuevas**

Agregar al final de `app/admin/cuentas-externas/actions.ts` (después de `crearCuentaExterna`):

```typescript
export async function actualizarCuentaExterna(cuentaExternaId: string, formData: FormData) {
  await requireAdministrador()

  const nombre = ((formData.get('nombre') as string) || '').trim()
  const titular = ((formData.get('titular') as string) || '').trim()
  const alias = ((formData.get('alias') as string) || '').trim()
  const banco = ((formData.get('banco') as string) || '').trim()
  const cbu = ((formData.get('cbu') as string) || '').trim() || null

  if (!nombre) {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent('Ingresá un nombre')}`
    )
  }

  if (!tieneDatosTransferencia({ titular, alias, banco })) {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent(
        'Titular, alias y banco son obligatorios'
      )}`
    )
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('cuentas_externas')
    .update({ nombre, titular, alias, banco, cbu })
    .eq('id', cuentaExternaId)

  if (error) {
    redirect(`/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent(error.message)}`)
  }

  redirect(`/admin/cuentas-externas/${cuentaExternaId}?ok=1`)
}

export async function agregarMovimiento(cuentaExternaId: string, formData: FormData) {
  await requireAdministrador()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const montoTexto = ((formData.get('monto') as string) || '').trim()
  const monto = montoTexto ? Number(montoTexto) : NaN
  const moneda = (formData.get('moneda') as string) || 'USD'
  const concepto = ((formData.get('concepto') as string) || '').trim()

  if (!Number.isFinite(monto) || monto <= 0) {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent(
        'Ingresá un monto válido, mayor a cero'
      )}`
    )
  }

  if (!concepto) {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent('Ingresá un concepto')}`
    )
  }

  const { error } = await supabase.from('cuentas_externas_movimientos').insert({
    cuenta_externa_id: cuentaExternaId,
    tipo: 'debito',
    monto,
    moneda,
    concepto,
    cargado_por: user!.id,
  })

  if (error) {
    redirect(`/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent(error.message)}`)
  }

  redirect(`/admin/cuentas-externas/${cuentaExternaId}?ok=1`)
}

export async function eliminarCuentaExterna(cuentaExternaId: string) {
  await requireAdministrador()

  const supabase = await createClient()

  const { count: movimientos } = await supabase
    .from('cuentas_externas_movimientos')
    .select('id', { count: 'exact', head: true })
    .eq('cuenta_externa_id', cuentaExternaId)

  if (movimientos && movimientos > 0) {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent(
        'No se puede eliminar: esta cuenta ya tiene movimientos'
      )}`
    )
  }

  const { count: lotesAsociados } = await supabase
    .from('lotes')
    .select('id', { count: 'exact', head: true })
    .eq('cuenta_cobro_externa_id', cuentaExternaId)

  if (lotesAsociados && lotesAsociados > 0) {
    redirect(
      `/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent(
        'No se puede eliminar: está asignada como cuenta de cobro de algún lote'
      )}`
    )
  }

  const { error } = await supabase.from('cuentas_externas').delete().eq('id', cuentaExternaId)

  if (error) {
    redirect(`/admin/cuentas-externas/${cuentaExternaId}?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/admin/cuentas-externas')
}
```

- [ ] **Step 2: Botón de eliminar (wrapper de confirm-dialog)**

```tsx
// app/admin/cuentas-externas/BotonEliminarCuentaExterna.tsx
'use client'

export function BotonEliminarCuentaExterna({
  eliminarCuentaExternaAction,
}: {
  eliminarCuentaExternaAction: () => Promise<void>
}) {
  return (
    <form
      action={eliminarCuentaExternaAction}
      onSubmit={(evento) => {
        if (!confirm('¿Seguro que querés eliminar esta cuenta externa? No se puede deshacer.')) {
          evento.preventDefault()
        }
      }}
    >
      <button type="submit" className="rounded border border-red-600 px-3 py-2 text-sm text-red-700">
        Eliminar cuenta externa
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Página de detalle**

```tsx
// app/admin/cuentas-externas/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { notFound } from 'next/navigation'
import { calcularSaldoPorMoneda } from '@/lib/cuentas-externas/calcular-saldo'
import { actualizarCuentaExterna, agregarMovimiento, eliminarCuentaExterna } from '../actions'
import { BotonEliminarCuentaExterna } from '../BotonEliminarCuentaExterna'

export default async function CuentaExternaDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; ok?: string }>
}) {
  await requireAdministrador()

  const { id } = await params
  const { error, ok } = await searchParams

  const supabase = await createClient()

  const { data: cuentaExterna } = await supabase
    .from('cuentas_externas')
    .select('id, nombre, titular, alias, banco, cbu')
    .eq('id', id)
    .maybeSingle()

  if (!cuentaExterna) {
    notFound()
  }

  const { data: movimientos } = await supabase
    .from('cuentas_externas_movimientos')
    .select('id, tipo, monto, moneda, concepto, created_at')
    .eq('cuenta_externa_id', id)
    .order('created_at', { ascending: false })

  const saldos = calcularSaldoPorMoneda(
    (movimientos ?? []).map((m) => ({
      tipo: m.tipo as 'debito' | 'credito',
      monto: m.monto,
      moneda: m.moneda,
    }))
  )

  const actualizarCuentaExternaConId = actualizarCuentaExterna.bind(null, id)
  const agregarMovimientoConId = agregarMovimiento.bind(null, id)
  const eliminarCuentaExternaConId = eliminarCuentaExterna.bind(null, id)

  return (
    <main className="max-w-2xl">
      <a href="/admin/cuentas-externas" className="mb-4 inline-block text-sm underline">
        ← Volver a Cuentas externas
      </a>
      <h1 className="mb-6 text-xl font-semibold">{cuentaExterna!.nombre}</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      {ok && <p className="mb-4 rounded bg-green-100 p-2 text-sm text-green-700">Guardado.</p>}

      <h2 className="mb-2 text-lg font-semibold">Saldo</h2>
      {Object.keys(saldos).length === 0 ? (
        <p className="mb-6 text-sm text-gray-600">Sin movimientos todavía.</p>
      ) : (
        <p className="mb-6 text-sm">
          {Object.entries(saldos)
            .map(([moneda, monto]) => `${monto} ${moneda}`)
            .join(' / ')}
        </p>
      )}

      <h2 className="mb-2 text-lg font-semibold">Datos de transferencia</h2>
      <form action={actualizarCuentaExternaConId} className="mb-8 flex flex-col gap-3">
        <label className="text-sm">
          Nombre del destinatario
          <input
            name="nombre"
            defaultValue={cuentaExterna!.nombre}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Titular
          <input
            name="titular"
            defaultValue={cuentaExterna!.titular}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Alias
          <input
            name="alias"
            defaultValue={cuentaExterna!.alias}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Banco
          <input
            name="banco"
            defaultValue={cuentaExterna!.banco}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          CBU (opcional)
          <input
            name="cbu"
            defaultValue={cuentaExterna!.cbu ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Guardar
        </button>
      </form>

      <h2 className="mb-2 text-lg font-semibold">Agregar deuda pendiente</h2>
      <form action={agregarMovimientoConId} className="mb-8 flex flex-col gap-3 max-w-sm">
        <label className="text-sm">
          Monto
          <input
            name="monto"
            type="number"
            step="0.01"
            min="0"
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Moneda
          <select name="moneda" defaultValue="USD" className="mt-1 block w-full rounded border px-3 py-2">
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </label>
        <label className="text-sm">
          Concepto
          <input
            name="concepto"
            required
            placeholder="Ej: Materiales de construcción, agosto 2026"
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Agregar deuda
        </button>
      </form>

      <h2 className="mb-2 text-lg font-semibold">Movimientos</h2>
      {(movimientos ?? []).length === 0 ? (
        <p className="mb-8 text-sm text-gray-600">Sin movimientos todavía.</p>
      ) : (
        <table className="mb-8 w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Fecha</th>
              <th>Tipo</th>
              <th>Concepto</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            {movimientos!.map((movimiento) => (
              <tr key={movimiento.id} className="border-b">
                <td className="py-2">{new Date(movimiento.created_at).toLocaleDateString('es-AR')}</td>
                <td>{movimiento.tipo === 'debito' ? 'Débito (le debemos)' : 'Crédito (le pagamos)'}</td>
                <td>{movimiento.concepto}</td>
                <td>
                  {movimiento.monto} {movimiento.moneda}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="mb-2 text-lg font-semibold">Eliminar</h2>
      <BotonEliminarCuentaExterna eliminarCuentaExternaAction={eliminarCuentaExternaConId} />
    </main>
  )
}
```

- [ ] **Step 4: Agregar los tests e2e de detalle, edición, deuda y eliminación**

Agregar dentro del mismo `describe` de `tests/e2e/cuentas-externas.spec.ts`:

```typescript
  test('agregar deuda pendiente desde el detalle actualiza el saldo, más de una vez', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/cuentas-externas/nuevo')

    await page.getByLabel('Nombre del destinatario').fill(`E2E Deuda ${Date.now()}`)
    await page.getByLabel('Titular de la cuenta').fill('Alguien')
    await page.getByLabel('Alias').fill('alguien.alias')
    await page.getByLabel('Banco').fill('Banco Test')
    await page.getByRole('button', { name: 'Crear cuenta externa' }).click()
    await page.waitForURL(/\/admin\/cuentas-externas\/.+$/)

    await page.getByLabel('Monto', { exact: true }).fill('1000')
    await page.getByLabel('Concepto').fill('Primera deuda')
    await page.getByRole('button', { name: 'Agregar deuda' }).click()
    await expect(page.getByText('Guardado.')).toBeVisible()

    await page.getByLabel('Monto', { exact: true }).fill('500')
    await page.getByLabel('Concepto').fill('Segunda deuda')
    await page.getByRole('button', { name: 'Agregar deuda' }).click()

    await expect(page.getByText('1500 USD')).toBeVisible()
    await expect(page.getByText('Primera deuda')).toBeVisible()
    await expect(page.getByText('Segunda deuda')).toBeVisible()
  })

  test('editar datos de transferencia y eliminar una cuenta externa sin movimientos', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/cuentas-externas/nuevo')

    await page.getByLabel('Nombre del destinatario').fill(`E2E Editar ${Date.now()}`)
    await page.getByLabel('Titular de la cuenta').fill('Nombre Original')
    await page.getByLabel('Alias').fill('alias.original')
    await page.getByLabel('Banco').fill('Banco Test')
    await page.getByRole('button', { name: 'Crear cuenta externa' }).click()
    await page.waitForURL(/\/admin\/cuentas-externas\/.+$/)

    await page.getByLabel('Titular').fill('Nombre Corregido')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Guardado.')).toBeVisible()
    await expect(page.getByLabel('Titular')).toHaveValue('Nombre Corregido')

    page.on('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Eliminar cuenta externa' }).click()
    await page.waitForURL('**/admin/cuentas-externas')
  })
```

- [ ] **Step 5: Correr todos los tests de cuentas externas**

Run: `npx playwright test tests/e2e/cuentas-externas.spec.ts --project=chromium`
Expected: 5 passed

- [ ] **Step 6: Commit**

```bash
git add app/admin/cuentas-externas tests/e2e/cuentas-externas.spec.ts
git commit -m "Cuentas externas: detalle con edicion, agregar deuda pendiente y eliminar"
```

---

### Task 4: Ampliar el selector "Cuenta de cobro" del lote

**Files:**
- Modify: `app/admin/lotes/[id]/page.tsx`
- Modify: `app/admin/lotes/[id]/actions.ts`
- Test: `tests/e2e/cuentas-externas.spec.ts`

**Interfaces:**
- Consumes: tabla `cuentas_externas` de Task 1 (con datos reales de Task 2/3). `tieneDatosTransferencia` de `@/lib/lotes/validar-cuenta-cobro`.
- Produces: `lotes.cuenta_cobro_externa_id` queda seteable desde la UI — Task 5 depende de esto para poder probar el crédito automático y la confirmación de un solo lado sobre un lote real.

- [ ] **Step 1: Extender `actualizarCobro` para aceptar un valor con prefijo `externa:`**

En `app/admin/lotes/[id]/actions.ts`, reemplazar ÚNICAMENTE la línea `const cuentaCobroId = idOVacio(formData.get('cuentaCobroId'))` (no tocar nada más de lo que sigue debajo — ni las validaciones de `adminId`/`acreedorId`/`vendedorId`, ni el `if (cuentaCobroId) { ... }` que ya existe y sigue intacto, validando el caso de un profile) por:

```typescript
  const cuentaCobroRaw = idOVacio(formData.get('cuentaCobroId'))
  const esExterna = cuentaCobroRaw?.startsWith('externa:') ?? false
  const cuentaCobroId = esExterna ? null : cuentaCobroRaw
  const cuentaCobroExternaId = esExterna ? cuentaCobroRaw!.slice('externa:'.length) : null
```

Inmediatamente después del bloque `if (cuentaCobroId) { ... }` ya existente, agregar el caso nuevo:

```typescript
  if (cuentaCobroExternaId) {
    const admin = createAdminClient()
    const { data: cuentaExterna } = await admin
      .from('cuentas_externas')
      .select('id, titular, alias, banco')
      .eq('id', cuentaCobroExternaId)
      .maybeSingle()

    if (
      !cuentaExterna ||
      !tieneDatosTransferencia({
        titular: cuentaExterna.titular,
        alias: cuentaExterna.alias,
        banco: cuentaExterna.banco,
      })
    ) {
      redirect(
        `/admin/lotes/${loteId}?error=${encodeURIComponent(
          'Esa cuenta externa todavía no tiene datos de transferencia completos'
        )}`
      )
    }
  }
```

Y en el `update` final de `actualizarCobro`, agregar la columna nueva:

```typescript
  const supabase = await createClient()
  const { error } = await supabase
    .from('lotes')
    .update({
      admin_id: adminId,
      acreedor_id: acreedorId,
      vendedor_id: vendedorId,
      cuenta_cobro_id: cuentaCobroId,
      cuenta_cobro_externa_id: cuentaCobroExternaId,
    })
    .eq('id', loteId)
```

- [ ] **Step 2: Traer las cuentas externas y ampliar el `<select>` en el detalle del lote**

En `app/admin/lotes/[id]/page.tsx`, agregar la query de `lotes` con la columna nueva (modificar el `select` ya existente de la query de `lote`):

```typescript
  const { data: lote } = await supabase
    .from('lotes')
    .select(
      'id, identificador, moneda, estado, cliente_id, admin_id, acreedor_id, vendedor_id, cuenta_cobro_id, cuenta_cobro_externa_id, ubicacion, precio_total'
    )
    .eq('id', id)
    .single()
```

Después del bloque que arma `conDatos` (justo debajo de `const conDatos = (staff ?? []).filter(...)`), agregar la carga de cuentas externas:

```typescript
  const { data: cuentasExternas } = await supabase
    .from('cuentas_externas')
    .select('id, nombre')
    .order('nombre')
```

Reemplazar el `<select name="cuentaCobroId">` completo (desde `<label className="text-sm">\n          Cuenta de cobro actual` hasta su `</label>` de cierre) por:

```tsx
        <label className="text-sm">
          Cuenta de cobro actual
          <select
            name="cuentaCobroId"
            defaultValue={
              lote!.cuenta_cobro_externa_id
                ? `externa:${lote!.cuenta_cobro_externa_id}`
                : (lote!.cuenta_cobro_id ?? '')
            }
            className="mt-1 block w-full rounded border px-3 py-2"
          >
            <option value="">— sin asignar —</option>
            {conDatos.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.full_name} ({persona.role})
                {!tieneDatosTransferencia({ alias: persona.alias, banco: persona.banco, titular: persona.titular }) &&
                  ' — sin datos de transferencia'}
              </option>
            ))}
            {(cuentasExternas ?? []).map((cuentaExterna) => (
              <option key={cuentaExterna.id} value={`externa:${cuentaExterna.id}`}>
                {cuentaExterna.nombre} (cuenta externa)
              </option>
            ))}
          </select>
        </label>
```

- [ ] **Step 3: Escribir el test e2e**

Agregar dentro del mismo `describe` de `tests/e2e/cuentas-externas.spec.ts`:

```typescript
  test('seleccionar una cuenta externa como cuenta de cobro de un lote, sin asociarla antes', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)

    await page.goto('/admin/cuentas-externas/nuevo')
    const nombreCuentaExterna = `E2E Cobro Externo ${Date.now()}`
    await page.getByLabel('Nombre del destinatario').fill(nombreCuentaExterna)
    await page.getByLabel('Titular de la cuenta').fill('Corralón Test')
    await page.getByLabel('Alias').fill('corralon.test')
    await page.getByLabel('Banco').fill('Banco Test')
    await page.getByRole('button', { name: 'Crear cuenta externa' }).click()
    await page.waitForURL(/\/admin\/cuentas-externas\/.+$/)

    await page.goto(`/admin/lotes/${fixtures.loteId}`)
    await page.selectOption('select[name="cuentaCobroId"]', {
      label: `${nombreCuentaExterna} (cuenta externa)`,
    })
    await page.getByRole('button', { name: 'Guardar cobro' }).click()

    await page.reload()
    await expect(page.locator('select[name="cuentaCobroId"]')).toHaveValue(
      new RegExp(`^externa:`)
    )
  })
```

- [ ] **Step 4: Correr el test**

Run: `npx playwright test tests/e2e/cuentas-externas.spec.ts --project=chromium`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add app/admin/lotes/\[id\]/page.tsx app/admin/lotes/\[id\]/actions.ts tests/e2e/cuentas-externas.spec.ts
git commit -m "Ampliar selector de cuenta de cobro para incluir cuentas externas"
```

---

### Task 5: Confirmación de un solo lado + crédito automático

**Files:**
- Modify: `app/admin/pagos/actions.ts`
- Modify: `app/admin/pagos/page.tsx`
- Test: `tests/e2e/cuentas-externas.spec.ts`

**Interfaces:**
- Consumes: `lotes.cuenta_cobro_externa_id` de Task 4 (con datos reales). Tabla `cuentas_externas_movimientos` de Task 1.
- Produces: nada que otra tarea de este plan consuma — última pieza funcional.

- [ ] **Step 1: Ampliar la consulta inicial de `pago` y `lote` en `confirmarPago`**

En `app/admin/pagos/actions.ts`, reemplazar el `select` de `pago`:

```typescript
  const { data: pago } = await supabase
    .from('pagos')
    .select('comprobante_path, cliente_id, lote_id, moneda, motivo')
    .eq('id', pagoId)
    .single()
```

Y reemplazar el `select` de `lote`:

```typescript
  const { data: lote } = await supabase
    .from('lotes')
    .select('id, acreedor_id, identificador, cuenta_cobro_externa_id')
    .eq('id', pago.lote_id)
    .single()
```

- [ ] **Step 2: Hacer condicional el claim atómico**

Reemplazar el bloque del "Claim atomico" (desde el comentario `// Claim atomico: solo un llamador...` hasta el `.select('id, monto').single()` de ese `update`) por:

```typescript
  // Claim atomico: solo un llamador puede ganar este UPDATE, ya sea contra
  // una carrera de doble click o contra un reintento tras una falla parcial.
  // Si el lote redirige el cobro a una cuenta externa (sin login), alcanza
  // con la confirmacion del admin -- no tiene sentido pedirle a alguien sin
  // cuenta que confirme nada. Dos ramas explicitas (en vez de armar un solo
  // query condicional) para que quede clara la diferencia exacta entre
  // ambos casos, sin depender de como encadena internamente el builder.
  const { data: pagoClaimado, error: errorClaim } = lote!.cuenta_cobro_externa_id
    ? await supabase
        .from('pagos')
        .update({ estado: 'confirmado' })
        .eq('id', pagoId)
        .eq('estado', 'pendiente')
        .not('confirmado_admin_por', 'is', null)
        .select('id, monto')
        .single()
    : await supabase
        .from('pagos')
        .update({ estado: 'confirmado' })
        .eq('id', pagoId)
        .eq('estado', 'pendiente')
        .not('confirmado_acreedor_por', 'is', null)
        .not('confirmado_admin_por', 'is', null)
        .select('id, monto')
        .single()
```

- [ ] **Step 3: Generar el crédito automático después del claim**

Justo después del bloque `if (errorClaim || !pagoClaimado || !lote) { ... }` ya existente (que sigue igual, sin tocar), agregar:

```typescript
  if (lote.cuenta_cobro_externa_id) {
    const { data: cliente } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', pago.cliente_id)
      .single()

    const conceptoMovimiento = `Pago de ${pago.motivo === 'sena' ? 'seña' : 'cuota'} — Lote ${
      lote.identificador
    } — ${cliente?.full_name ?? 'cliente'}`

    const { error: errorMovimientoExterno } = await supabase.from('cuentas_externas_movimientos').insert({
      cuenta_externa_id: lote.cuenta_cobro_externa_id,
      tipo: 'credito',
      monto: pagoClaimado.monto,
      moneda: pago.moneda,
      concepto: conceptoMovimiento,
      pago_id: pagoClaimado.id,
      cargado_por: user.id,
    })

    if (errorMovimientoExterno) {
      // El pago ya quedo "confirmado" y el FIFO de abajo sigue corriendo --
      // no revertimos nada, pero queda para revision manual el hecho de que
      // no se registro el credito en la cuenta externa.
      console.error('No se pudo registrar el crédito en la cuenta externa:', errorMovimientoExterno)
    }
  }
```

- [ ] **Step 4: Mostrar "N/A (cuenta externa)" en vez de "No" en la columna de confirmación del acreedor**

En `app/admin/pagos/page.tsx`, agregar `cuenta_cobro_externa_id` al `select` de `lotesConPago`:

```typescript
  const { data: lotesConPago } =
    loteIdsConPago.length > 0
      ? await supabase
          .from('lotes')
          .select('id, identificador, acreedor_id, cuenta_cobro_externa_id')
          .in('id', loteIdsConPago)
      : { data: [] }
```

En el `.map()` que arma `pagosConLink`, agregar `cuentaCobroExterna: Boolean(lote?.cuenta_cobro_externa_id)` a los dos `return` (el de `!pago.comprobante_path` y el final):

```typescript
      if (!pago.comprobante_path) {
        return {
          ...pago,
          comprobanteUrl: null,
          sinAcreedorVinculado,
          identificadorLote,
          nombreCliente,
          cuentaCobroExterna: Boolean(lote?.cuenta_cobro_externa_id),
        }
      }

      const { data, error: errorSignedUrl } = await admin.storage
        .from('comprobantes')
        .createSignedUrl(pago.comprobante_path, 300)

      return {
        ...pago,
        comprobanteUrl: errorSignedUrl ? null : data?.signedUrl ?? null,
        sinAcreedorVinculado,
        identificadorLote,
        nombreCliente,
        cuentaCobroExterna: Boolean(lote?.cuenta_cobro_externa_id),
      }
```

Reemplazar la celda de "Confirmado acreedor" (`<td>{pago.sinAcreedorVinculado ? ... }</td>`) por:

```tsx
                <td>
                  {pago.cuentaCobroExterna ? (
                    <span className="text-gray-500">— (cuenta externa)</span>
                  ) : pago.sinAcreedorVinculado ? (
                    <span className="font-semibold text-red-700">⚠ Lote sin acreedor vinculado</span>
                  ) : pago.confirmado_acreedor_por ? (
                    'Sí'
                  ) : (
                    'No'
                  )}
                </td>
```

- [ ] **Step 5: Escribir el test e2e completo del flujo**

Agregar dentro del mismo `describe` de `tests/e2e/cuentas-externas.spec.ts`, arriba del archivo agregar el import de `readFileSync`/`path` (mismo patrón que `pago-flujo-completo.spec.ts`):

```typescript
import path from 'node:path'
import { readFileSync } from 'node:fs'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)
```

Y el test:

```typescript
  test('confirmar un pago redirigido a una cuenta externa: alcanza con el admin, se genera el crédito', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)

    await page.goto('/admin/cuentas-externas/nuevo')
    const nombreCuentaExterna = `E2E Credito Auto ${Date.now()}`
    await page.getByLabel('Nombre del destinatario').fill(nombreCuentaExterna)
    await page.getByLabel('Titular de la cuenta').fill('Corralón Crédito')
    await page.getByLabel('Alias').fill('corralon.credito')
    await page.getByLabel('Banco').fill('Banco Test')
    await page.getByRole('button', { name: 'Crear cuenta externa' }).click()
    await page.waitForURL(/\/admin\/cuentas-externas\/(?<id>[^/?]+)$/)
    const cuentaExternaId = page.url().split('/').pop()!

    await page.goto(`/admin/lotes/${fixtures.loteId}`)
    await page.selectOption('select[name="cuentaCobroId"]', {
      label: `${nombreCuentaExterna} (cuenta externa)`,
    })
    await page.getByRole('button', { name: 'Guardar cobro' }).click()

    await page.context().clearCookies()
    await login(page, fixtures.cliente.email, fixtures.password)
    await page.goto(`/portal-cliente/lotes/${fixtures.loteId}`)
    await page.getByRole('link', { name: /Pagar/ }).first().click()
    await page.setInputFiles('input[type="file"]', {
      name: `e2e-credito-auto-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    await page.getByRole('button', { name: /Subir|Registrar|Pagar/ }).click()

    await page.context().clearCookies()
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')
    const fila = page.locator('main table tbody tr').filter({ hasText: 'E2E Test Lote' }).first()
    await expect(fila.getByText('— (cuenta externa)')).toBeVisible()
    await fila.getByRole('button', { name: 'Confirmar mi parte' }).click()

    await page.goto(`/admin/cuentas-externas/${cuentaExternaId}`)
    await expect(page.getByText('Crédito (le pagamos)')).toBeVisible()
  })
```

Nota para quien implemente este step: el flujo exacto de "pagar una cuota" del portal cliente (nombres de botones/links) ya está cubierto en detalle en `tests/e2e/pago-flujo-completo.spec.ts` — si algún selector de este test no coincide con la UI real, copiar el patrón exacto de ese archivo en vez de adivinar.

- [ ] **Step 6: Correr todos los tests de cuentas externas**

Run: `npx playwright test tests/e2e/cuentas-externas.spec.ts --project=chromium`
Expected: 7 passed

- [ ] **Step 7: Commit**

```bash
git add app/admin/pagos/actions.ts app/admin/pagos/page.tsx tests/e2e/cuentas-externas.spec.ts
git commit -m "Confirmar pago hacia cuenta externa con un solo lado + credito automatico"
```

---

### Task 6: Regresión completa, limpieza y documentación

**Files:**
- Modify: `Pruebas_Manuales_Pendientes.txt` (fuera del repo git)
- Modify: `Notas_Decisiones_SIMA.txt` (fuera del repo git)
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: todo lo de Tasks 1-5.
- Produces: nada — última tarea del plan.

- [ ] **Step 1: Build limpio**

Run: `npm run build`
Expected: sin errores. Si falla por memoria, reintentar con `NODE_OPTIONS="--max-old-space-size=4096" npm run build`.

- [ ] **Step 2: Unitarios**

Run: `npx vitest run`
Expected: todos en verde, incluyendo los 5 nuevos de `calcularSaldoPorMoneda`.

- [ ] **Step 3: E2E completo, dos corridas**

Run: `npx playwright test`
Expected: todos en verde. Repetir una segunda vez completa para descartar flakes. Si aparece un fallo aislado claramente no relacionado (rate limit de Supabase, resource exhaustion del sistema operativo por muchas corridas seguidas), no asumir regresión de esta tanda sin confirmar la causa real.

- [ ] **Step 4: Limpieza de datos de prueba**

Antes de cualquier `execute_sql`, verificar con `mcp__supabase__get_project_url` que apunta al proyecto de SIMA. Borrar cuentas externas / movimientos / lotes de prueba: `delete from cuentas_externas_movimientos where cuenta_externa_id in (select id from cuentas_externas where nombre like 'E2E %')`, después `delete from cuentas_externas where nombre like 'E2E %'`, más la limpieza de siempre de `lotes`/`reservas`/`cuotas` con `identificador like 'E2E %'` (excluyendo los fixtures fijos de `test-data.ts`). Antes de borrar, si el test de Task 4/5 dejó `fixtures.loteId` (el lote fijo de fixtures) con `cuenta_cobro_externa_id` seteado, volver a dejarlo en `null` para no afectar otros specs que reusan ese mismo lote fijo.

- [ ] **Step 5: Actualizar `Pruebas_Manuales_Pendientes.txt`**

Agregar una sección nueva (siguiente número disponible) explicando cómo probar a mano: crear una cuenta externa con deuda inicial, agregarle más deuda desde el detalle, elegirla como cuenta de cobro de un lote real, hacer que un cliente pague esa cuota, confirmar el pago (solo hace falta el admin) y verificar que aparece el crédito automático en el detalle de la cuenta externa con el saldo actualizado. Mismo estilo que las secciones anteriores del archivo.

- [ ] **Step 6: Actualizar `Notas_Decisiones_SIMA.txt`**

Marcar el punto 27 ("Acreedores sin login") como YA CONSTRUIDO (agregar la fecha de hoy y una referencia a este plan), y actualizar la cadena de dependencias (puntos 28 "cuenta de cobro ampliada" y 35 "confirmación de un solo lado" también quedan resueltos en la parte que dependía de esto). Dejar explícito qué sigue sin construir de la cadena más grande: múltiples participantes por lote (punto 30), distribución manual por cuota (punto 31), rediseño completo de confirmación cruzada (punto 6/35 en la parte que no dependía de esto).

- [ ] **Step 7: Cerrar el ledger**

Agregar una línea a `.superpowers/sdd/progress.md` resumiendo las 6 tareas y el resultado de la regresión/limpieza.

---

## Self-Review

**Cobertura de la spec:** tablas + columna (Task 1) ✓, alta con datos obligatorios + deuda inicial opcional (Task 2) ✓, listado con saldo (Task 2) ✓, sección de menú nueva exclusiva de admin (Task 2) ✓, detalle con edición + agregar deuda en cualquier momento + eliminar bloqueado por FK (Task 3) ✓, selector de cuenta de cobro unificado sin necesidad de asociar antes (Task 4) ✓, validación de datos de transferencia completos antes de poder seleccionarla (Task 4) ✓, crédito automático al confirmar (Task 5) ✓, confirmación de un solo lado cuando el destino es externo (Task 5) ✓, fuera de alcance explícitamente no tocado (otros movimientos genéricos, múltiples participantes, distribución por cuota, rediseño de confirmación cruzada, conversión de monedas) ✓.

**Placeholders:** ninguno — cada step tiene código completo, o comando + resultado esperado.

**Consistencia de tipos:** `calcularSaldoPorMoneda(movimientos: {tipo: 'debito'|'credito', monto: number, moneda: string}[]): Record<string, number>` usado idéntico en Task 2 (página de listado) y Task 3 (página de detalle). Nombres de columna (`cuenta_cobro_externa_id`, `cuentas_externas.titular/alias/banco/cbu`, `cuentas_externas_movimientos.tipo/monto/moneda/concepto/pago_id/cargado_por`) usados idénticos en Task 1 (migración), Task 2/3 (actions y páginas) y Task 5 (`confirmarPago`). El prefijo `externa:` para el valor del `<select name="cuentaCobroId">` se define en Task 4 y se usa igual en los tests de Task 4 y Task 5. Server Actions con la firma `(id: string, formData: FormData) => Promise<void>` consistente con el resto del proyecto (mismo patrón que `actualizarCobro`, `actualizarCuentaExterna`, `agregarMovimiento`).
