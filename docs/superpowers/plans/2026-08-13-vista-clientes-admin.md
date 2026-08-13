# Vista de clientes desde Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al administrador una pantalla para ver las cuentas de clientes, resetearles la contraseña, y eliminar una cuenta cuando corresponda.

**Architecture:** Dos páginas nuevas (`/admin/clientes` listado, `/admin/clientes/[id]` detalle) + un archivo de Server Actions, siguiendo el mismo patrón exacto que `app/admin/usuarios/`. Reutiliza el componente `BotonEliminarUsuario` ya existente sin duplicarlo.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), Supabase (Postgres + Auth), TypeScript.

## Global Constraints

- Exclusivo del rol `administrador` — ni siquiera `acreedor` ve esta sección (a diferencia de Pagos/Usuarios).
- Sin JavaScript de cliente salvo el wrapper de `confirm()` ya existente (`BotonEliminarUsuario`) — no crear ningún componente cliente nuevo.
- `eliminarCliente` NO lleva ningún chequeo explícito de "sin deuda" — se apoya exclusivamente en la restricción de FK real de Postgres, igual que `eliminarUsuarioStaff`. Confirmado explícitamente por Gabriel como suficiente.
- El input de la nueva contraseña es `type="text"` (no `password`), a propósito, para que el admin pueda leérsela al cliente.
- Ninguna migración de base de datos hace falta — todo el trabajo es sobre tablas ya existentes (`profiles`, `lotes`, `cuotas`).
- Cada Server Action nueva empieza con `await requireAdministrador()`.

---

### Task 1: Listado `/admin/clientes` + link en la nav

**Files:**
- Create: `app/admin/clientes/page.tsx`
- Modify: `components/NavAdmin.tsx`
- Test: `tests/e2e/clientes-admin.spec.ts` (nuevo archivo, se sigue extendiendo en las tareas siguientes)

**Interfaces:**
- Consumes: `requireAdministrador` de `lib/auth/require-admin.ts` (ya existe, firma `() => Promise<void>`, redirige si no es administrador).
- Produces: la ruta `/admin/clientes` renderiza una tabla de clientes; nada de esto lo consume ninguna tarea posterior directamente (las tareas siguientes agregan la ruta `/admin/clientes/[id]`, independiente).

- [ ] **Step 1: Crear la página de listado**

```tsx
// app/admin/clientes/page.tsx
import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'

export default async function ClientesPage() {
  await requireAdministrador()

  const supabase = await createClient()

  const { data: clientes } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'cliente')
    .order('full_name')

  const clienteIds = (clientes ?? []).map((cliente) => cliente.id)

  const { data: lotes } =
    clienteIds.length > 0
      ? await supabase.from('lotes').select('cliente_id').in('cliente_id', clienteIds)
      : { data: [] }

  const cantidadLotesPorCliente = new Map<string, number>()
  for (const lote of lotes ?? []) {
    const actual = cantidadLotesPorCliente.get(lote.cliente_id as string) ?? 0
    cantidadLotesPorCliente.set(lote.cliente_id as string, actual + 1)
  }

  return (
    <main className="max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">Clientes</h1>
      {(clientes ?? []).length === 0 ? (
        <p className="text-sm text-gray-600">Todavía no hay ningún cliente cargado.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Nombre</th>
              <th>Email</th>
              <th>Cantidad de lotes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clientes!.map((cliente) => (
              <tr key={cliente.id} className="border-b">
                <td className="py-2">{cliente.full_name}</td>
                <td>{cliente.email ?? '—'}</td>
                <td>{cantidadLotesPorCliente.get(cliente.id) ?? 0}</td>
                <td>
                  <a href={`/admin/clientes/${cliente.id}`} className="underline">
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

- [ ] **Step 2: Agregar "Clientes" a la nav, solo para administrador**

```tsx
// components/NavAdmin.tsx
import { logout } from '@/app/login/actions'

export function NavAdmin({ role }: { role: string }) {
  const puedeVerPagosYUsuarios = role === 'administrador' || role === 'acreedor'
  const esAdministrador = role === 'administrador'

  return (
    <nav className="flex items-center justify-between border-b p-4 text-sm">
      <div className="flex gap-4">
        <a href="/admin/lotes">Lotes</a>
        {puedeVerPagosYUsuarios && <a href="/admin/pagos">Pagos</a>}
        {puedeVerPagosYUsuarios && <a href="/admin/usuarios">Usuarios</a>}
        {esAdministrador && <a href="/admin/clientes">Clientes</a>}
        <a href="/mi-perfil">Mi perfil</a>
      </div>
      <form action={logout}>
        <button type="submit" className="underline">
          Cerrar sesión
        </button>
      </form>
    </nav>
  )
}
```

- [ ] **Step 3: Escribir el primer test e2e**

```typescript
// tests/e2e/clientes-admin.spec.ts
import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Vista de clientes desde Admin', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('el administrador ve el listado de clientes con su cantidad de lotes', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/clientes')

    const fila = page.getByRole('row', { name: new RegExp(fixtures.cliente.email) })
    await expect(fila).toBeVisible()
    // fixtures.cliente es dueño de "E2E Test Lote" -- al menos 1 lote.
    await expect(fila.locator('td').nth(2)).not.toHaveText('0')
  })

  test('un acreedor no puede abrir /admin/clientes navegando directo por URL', async ({ page }) => {
    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/clientes')

    await expect(page).toHaveURL(/\/admin\/lotes/)
  })
})
```

- [ ] **Step 4: Correr el test**

Run: `npx playwright test tests/e2e/clientes-admin.spec.ts`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add app/admin/clientes/page.tsx components/NavAdmin.tsx tests/e2e/clientes-admin.spec.ts
git commit -m "Listado de clientes desde Admin (/admin/clientes)"
```

---

### Task 2: Detalle `/admin/clientes/[id]` (lotes del cliente, sin acciones todavía)

**Files:**
- Create: `app/admin/clientes/[id]/page.tsx`
- Test: `tests/e2e/clientes-admin.spec.ts` (agregar tests)

**Interfaces:**
- Consumes: `requireAdministrador` (igual que Task 1). `calcularEstadoCobranza` de `lib/cobranza/estado-cliente.ts` — firma `(cuotas: {saldoPendiente: number, fechaVencimiento: string}[], hoy: string) => 'normal' | 'moroso' | 'prejudicial'` (ya usada en `app/portal-cliente/lotes/[id]/page.tsx`).
- Produces: la ruta `/admin/clientes/[id]`. Task 3 y Task 4 agregan formularios/botones DENTRO de esta misma página (no una interfaz separada) — el archivo se sigue editando en esas tareas.

- [ ] **Step 1: Crear la página de detalle**

```tsx
// app/admin/clientes/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { calcularEstadoCobranza } from '@/lib/cobranza/estado-cliente'
import { notFound } from 'next/navigation'

export default async function ClienteDetallePage({
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

  const { data: cliente } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('id', id)
    .maybeSingle()

  if (!cliente || cliente.role !== 'cliente') {
    notFound()
  }

  const { data: lotes } = await supabase
    .from('lotes')
    .select('id, identificador, moneda, estado')
    .eq('cliente_id', id)
    .order('identificador')

  const hoy = new Date().toISOString().slice(0, 10)

  const lotesConSaldo = await Promise.all(
    (lotes ?? []).map(async (lote) => {
      const { data: cuotas } = await supabase
        .from('cuotas')
        .select('saldo_pendiente, fecha_vencimiento')
        .eq('lote_id', lote.id)

      const saldoPendiente = (cuotas ?? []).reduce(
        (acumulado, cuota) => acumulado + cuota.saldo_pendiente,
        0
      )

      const estadoCobranza = calcularEstadoCobranza(
        (cuotas ?? []).map((cuota) => ({
          saldoPendiente: cuota.saldo_pendiente,
          fechaVencimiento: cuota.fecha_vencimiento,
        })),
        hoy
      )

      return { ...lote, saldoPendiente, estadoCobranza }
    })
  )

  return (
    <main className="max-w-2xl">
      <a href="/admin/clientes" className="mb-4 inline-block text-sm underline">
        ← Volver a Clientes
      </a>
      <h1 className="mb-1 text-xl font-semibold">{cliente!.full_name}</h1>
      <p className="mb-6 text-sm text-gray-600">{cliente!.email}</p>

      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      {ok && <p className="mb-4 rounded bg-green-100 p-2 text-sm text-green-700">{ok}</p>}

      <h2 className="mb-2 text-lg font-semibold">Lotes</h2>
      {lotesConSaldo.length === 0 ? (
        <p className="mb-6 text-sm text-gray-600">Este cliente todavía no tiene ningún lote.</p>
      ) : (
        <table className="mb-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Identificador</th>
              <th>Estado</th>
              <th>Saldo pendiente</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lotesConSaldo.map((lote) => (
              <tr key={lote.id} className="border-b">
                <td className="py-2">{lote.identificador}</td>
                <td>{lote.estado === 'vendido' ? lote.estadoCobranza : lote.estado}</td>
                <td>
                  {lote.saldoPendiente} {lote.moneda}
                </td>
                <td>
                  <a href={`/admin/lotes/${lote.id}`} className="underline">
                    Ver lote
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

- [ ] **Step 2: Agregar el test de navegación al detalle**

En `tests/e2e/clientes-admin.spec.ts`, agregar dentro del mismo `describe`:

```typescript
  test('el detalle de un cliente muestra sus lotes con saldo pendiente', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/clientes')

    const fila = page.getByRole('row', { name: new RegExp(fixtures.cliente.email) })
    await fila.getByRole('link', { name: 'Ver detalle' }).click()
    await page.waitForURL(/\/admin\/clientes\/.+$/)

    await expect(page.getByRole('heading', { name: 'E2E Cliente' })).toBeVisible()
    await expect(page.getByRole('row', { name: /E2E Test Lote/ })).toBeVisible()
  })
```

Nota: `TestFixtures.cliente` (en `tests/e2e/fixtures/test-data.ts`) solo expone `{ id, email }` en tiempo de ejecución, no `full_name` — por eso el heading se verifica contra el literal `'E2E Cliente'`, que es el `fullName` real configurado en `TEST_USERS.cliente` de ese mismo archivo.

- [ ] **Step 3: Correr los tests**

Run: `npx playwright test tests/e2e/clientes-admin.spec.ts`
Expected: 3 passed

- [ ] **Step 4: Commit**

```bash
git add app/admin/clientes/[id]/page.tsx tests/e2e/clientes-admin.spec.ts
git commit -m "Detalle de cliente (/admin/clientes/[id]) con sus lotes y saldo pendiente"
```

---

### Task 3: Resetear contraseña

**Files:**
- Create: `app/admin/clientes/actions.ts`
- Modify: `app/admin/clientes/[id]/page.tsx`
- Test: `tests/e2e/clientes-admin.spec.ts`

**Interfaces:**
- Consumes: `requireAdministrador`; `createAdminClient` de `lib/supabase/admin.ts` (cliente Supabase con service role, ya usado en `app/admin/usuarios/actions.ts` y `app/admin/lotes/[id]/vender/actions.ts`).
- Produces: `resetearContrasenaCliente(clienteId: string, formData: FormData): Promise<void>` — Server Action, se bindea con `.bind(null, clienteId)` igual que el resto de las acciones de este proyecto. Task 4 agrega `eliminarCliente` al mismo archivo, no depende de esta función.

- [ ] **Step 1: Crear el archivo de actions con el reset de contraseña**

```typescript
// app/admin/clientes/actions.ts
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'

export async function resetearContrasenaCliente(clienteId: string, formData: FormData) {
  await requireAdministrador()

  const nuevaContrasena = (formData.get('nuevaContrasena') as string)?.trim()

  if (!nuevaContrasena || nuevaContrasena.length < 6) {
    redirect(
      `/admin/clientes/${clienteId}?error=${encodeURIComponent(
        'La contraseña tiene que tener al menos 6 caracteres'
      )}`
    )
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(clienteId, {
    password: nuevaContrasena,
  })

  if (error) {
    redirect(`/admin/clientes/${clienteId}?error=${encodeURIComponent(error.message)}`)
  }

  redirect(`/admin/clientes/${clienteId}?ok=${encodeURIComponent('Contraseña actualizada')}`)
}
```

- [ ] **Step 2: Agregar el formulario en la página de detalle**

En `app/admin/clientes/[id]/page.tsx`, agregar el import y el formulario al final del `<main>`, después de la tabla de lotes:

```tsx
import { resetearContrasenaCliente } from '../actions'
```

```tsx
      <h2 className="mb-2 text-lg font-semibold">Resetear contraseña</h2>
      <form
        action={resetearContrasenaCliente.bind(null, cliente!.id)}
        className="flex max-w-sm gap-2"
      >
        <input
          name="nuevaContrasena"
          type="text"
          placeholder="Nueva contraseña"
          minLength={6}
          required
          className="flex-1 rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">
          Guardar
        </button>
      </form>
```

- [ ] **Step 3: Agregar el test e2e**

En `tests/e2e/clientes-admin.spec.ts`, agregar un helper y un test dentro del `describe`:

```typescript
async function crearClienteDescartable(nombre: string) {
  const admin = createAdminClient()
  const email = `${nombre.toLowerCase().replace(/\s+/g, '.')}.${Date.now()}@sima-e2e.invalid`

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'Sima123!',
    email_confirm: true,
  })

  if (error || !data.user) {
    throw new Error(`No se pudo crear el cliente descartable: ${error?.message}`)
  }

  const { error: errorProfile } = await admin
    .from('profiles')
    .insert({ id: data.user.id, role: 'cliente', full_name: nombre, email })

  if (errorProfile) {
    throw new Error(`No se pudo crear el profile descartable: ${errorProfile.message}`)
  }

  return { id: data.user.id, email }
}
```

```typescript
  test('resetear la contraseña de un cliente le permite loguearse con la nueva', async ({
    page,
  }) => {
    const cliente = await crearClienteDescartable(`E2E Cliente Reset ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/clientes/${cliente.id}`)

    await page.getByPlaceholder('Nueva contraseña').fill('NuevaClave456!')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.waitForURL(new RegExp(`/admin/clientes/${cliente.id}`))
    await expect(page.getByText('Contraseña actualizada')).toBeVisible()

    await page.context().clearCookies()
    await login(page, cliente.email, 'NuevaClave456!')
    await expect(page).toHaveURL(/\/portal-cliente/)
  })
```

Nota: `crearClienteDescartable` usa el mismo patrón que `crearAcreedorDescartable` de `tests/e2e/eliminar-usuario.spec.ts` — si `createAdminClient` no está importado todavía en `clientes-admin.spec.ts`, agregar el import junto a los demás en el encabezado del archivo.

- [ ] **Step 4: Correr los tests**

Run: `npx playwright test tests/e2e/clientes-admin.spec.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add app/admin/clientes/actions.ts app/admin/clientes/[id]/page.tsx tests/e2e/clientes-admin.spec.ts
git commit -m "Resetear contraseña de un cliente desde su detalle en Admin"
```

---

### Task 4: Eliminar cuenta de cliente

**Files:**
- Modify: `app/admin/clientes/actions.ts`
- Modify: `app/admin/clientes/[id]/page.tsx`
- Test: `tests/e2e/clientes-admin.spec.ts`

**Interfaces:**
- Consumes: `BotonEliminarUsuario` de `app/admin/usuarios/BotonEliminarUsuario.tsx` — componente cliente ya existente, prop `eliminarUsuarioAction: () => Promise<void>` (genérico, no específico de staff pese al nombre del archivo).
- Produces: `eliminarCliente(clienteId: string): Promise<void>` — Server Action bindeada igual que `resetearContrasenaCliente`.

- [ ] **Step 1: Agregar `eliminarCliente` al archivo de actions**

```typescript
// agregar al final de app/admin/clientes/actions.ts

export async function eliminarCliente(clienteId: string) {
  await requireAdministrador()

  const admin = createAdminClient()
  // Igual que eliminarUsuarioStaff: si el cliente todavía tiene algún lote o
  // pago asociado (lotes.cliente_id / pagos.cliente_id, ambos "references
  // profiles(id)" sin cascade), la restricción de FK real de Postgres
  // rechaza el borrado. No hay chequeo previo de "sin deuda" -- la FK ya es
  // más estricta (también bloquea a un cliente que ya pagó todo pero sigue
  // con el lote asignado), y eso es lo que se quiere.
  const { error } = await admin.auth.admin.deleteUser(clienteId)

  if (error) {
    redirect(
      `/admin/clientes/${clienteId}?error=${encodeURIComponent(
        'No se pudo eliminar: esta cuenta todavía tiene lotes o pagos asociados'
      )}`
    )
  }

  redirect('/admin/clientes')
}
```

- [ ] **Step 2: Agregar el botón en la página de detalle**

En `app/admin/clientes/[id]/page.tsx`, agregar los imports:

```tsx
import { resetearContrasenaCliente, eliminarCliente } from '../actions'
import { BotonEliminarUsuario } from '@/app/admin/usuarios/BotonEliminarUsuario'
```

Y agregar, después del formulario de "Resetear contraseña" (al final del `<main>`):

```tsx
      <h2 className="mb-2 mt-8 text-lg font-semibold">Eliminar cuenta</h2>
      <BotonEliminarUsuario eliminarUsuarioAction={eliminarCliente.bind(null, cliente!.id)} />
```

- [ ] **Step 3: Agregar los tests e2e**

En `tests/e2e/clientes-admin.spec.ts`, agregar dentro del `describe`:

```typescript
  test('eliminar un cliente sin ningún lote asociado funciona', async ({ page }) => {
    const cliente = await crearClienteDescartable(`E2E Cliente Sin Lote ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/clientes/${cliente.id}`)

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Eliminar usuario' }).click()
    await page.waitForURL(/\/admin\/clientes$/)

    const admin = createAdminClient()
    await expect(async () => {
      const { data } = await admin.from('profiles').select('id').eq('id', cliente.id).maybeSingle()
      expect(data).toBeNull()
    }).toPass({ timeout: 5000 })
  })

  test('eliminar un cliente CON un lote asociado es rechazado con un mensaje claro', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/clientes/${fixtures.cliente.id}`)

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Eliminar usuario' }).click()
    await page.waitForURL(new RegExp(`/admin/clientes/${fixtures.cliente.id}`))

    await expect(page.getByText(/todavía tiene lotes o pagos asociados/)).toBeVisible()

    const admin = createAdminClient()
    const { data: sigueExistiendo } = await admin
      .from('profiles')
      .select('id')
      .eq('id', fixtures.cliente.id)
      .maybeSingle()
    expect(sigueExistiendo).not.toBeNull()
  })
```

- [ ] **Step 4: Correr los tests**

Run: `npx playwright test tests/e2e/clientes-admin.spec.ts`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add app/admin/clientes/actions.ts app/admin/clientes/[id]/page.tsx tests/e2e/clientes-admin.spec.ts
git commit -m "Eliminar cuenta de cliente desde Admin (bloqueado por FK si tiene lote/pago)"
```

---

### Task 5: Regresión completa + documentación

**Files:**
- Modify: `Pruebas_Manuales_Pendientes.txt` (fuera del repo git, en el directorio padre)
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: nada nuevo — esta tarea es verificación y documentación, no código.
- Produces: nada que otra tarea consuma (es la última).

- [ ] **Step 1: Build limpio**

Run: `npm run build`
Expected: sin errores de TypeScript ni build.

- [ ] **Step 2: Unitarios**

Run: `npx vitest run`
Expected: todos en verde (55 + los que hubiera antes de esta tanda, sin nuevos si esta feature no agregó ninguno puro).

- [ ] **Step 3: E2E completo, dos corridas**

Run: `npx playwright test`
Expected: todos en verde. Repetir una segunda vez completa para descartar flakes. Si aparece algún fallo aislado no relacionado a `clientes-admin.spec.ts` (ej. timing de upload, rate limit de emails de Supabase por correr la suite muchas veces seguidas), no es necesariamente una regresión de esta tanda — confirmar la causa antes de asumir que hay que arreglar código.

- [ ] **Step 4: Limpieza de datos de prueba**

Antes de ejecutar cualquier `execute_sql`, verificar con `mcp__supabase__get_project_url` que apunta al proyecto de SIMA (coincide con `NEXT_PUBLIC_SUPABASE_URL` de `.env.local`).

Borrar los `profiles` con `role = 'cliente'` y email `like '%@sima-e2e.invalid'` creados por `crearClienteDescartable` en esta tanda que hayan quedado (los que el propio test de "eliminar sin lote" ya borró no van a aparecer). Mismo criterio de siempre: no tocar los fixtures fijos (`test-cliente@sima-e2e.invalid`, etc.) ni los lotes `E2E Test Lote` / `E2E Lote Secundario`.

- [ ] **Step 5: Actualizar `Pruebas_Manuales_Pendientes.txt`**

Agregar una sección nueva (siguiente número disponible, hoy sería la 15) describiendo la feature para que Gabriel la prueba a mano: cómo entrar a "Clientes" desde la nav (solo como admin), ver el listado, entrar al detalle de un cliente con lotes, resetear su contraseña (probar que el cliente puede loguearse con la nueva), y las dos pruebas negativas (eliminar un cliente sin lote funciona; eliminar uno con lote se rechaza con mensaje claro). Seguir el mismo estilo que las secciones anteriores del archivo (pasos numerados, qué esperar, qué avisar si no coincide).

- [ ] **Step 6: Cerrar el ledger**

Agregar una línea a `.superpowers/sdd/progress.md` resumiendo las 5 tareas, cualquier hallazgo real durante la regresión, y el resultado de la limpieza de datos.

- [ ] **Step 7: Commit final si Step 5 tocó algo dentro del repo**

`Pruebas_Manuales_Pendientes.txt` vive FUERA del repo git (directorio padre) — no requiere commit. `.superpowers/sdd/progress.md` si vive dentro del repo, sí:

```bash
git add .superpowers/sdd/progress.md
git commit -m "Regresión y cierre de la tanda: vista de clientes desde Admin"
```

---

## Self-Review

**Cobertura de la spec:** listado (Task 1) ✓, detalle con lotes y saldo pendiente (Task 2) ✓, resetear contraseña con input de texto sin enmascarar (Task 3) ✓, eliminar cuenta vía FK sin chequeo de deuda (Task 4) ✓, nav solo para administrador (Task 1) ✓, fuera de alcance (modificar deuda, rescindir venta, alta manual) — ninguna tarea los toca, correcto ✓, testing (e2e cubriendo los 5 casos de la spec + regresión) ✓.

**Placeholders:** ninguno — cada step tiene código completo o comando+resultado esperado exacto.

**Consistencia de tipos:** `resetearContrasenaCliente(clienteId: string, formData: FormData)` y `eliminarCliente(clienteId: string)` usados igual en Task 3/4 (definición) y en `[id]/page.tsx` (`.bind(null, cliente!.id)`) — coincide. `BotonEliminarUsuario` recibe `eliminarUsuarioAction: () => Promise<void>`, que es exactamente la forma de `eliminarCliente.bind(null, id)` — coincide con el uso ya probado en `app/admin/usuarios/[id]`.
