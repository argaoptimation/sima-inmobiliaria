# Visibilidad acotada acreedor-vendedor + navegación de Mi perfil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un acreedor solo puede ver los datos de transferencia de los vendedores que comparten al menos un lote con él (no los de todo el staff), y `/mi-perfil` muestra la misma barra de navegación que el resto del área admin para `administrador`/`acreedor`.

**Architecture:** Mismo patrón de siempre: Server Components leyendo con el client de sesión (RLS deshabilitado, el filtro de visibilidad se hace con `where` explícito en la query, no con políticas de base). Se extrae un componente de navegación compartido, sin agregar ninguna librería ni capa de estado nueva.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind CSS, Supabase, Playwright.

## Global Constraints

- Spec source de verdad: Addendum 2 (2026-08-04) en `docs/superpowers/specs/2026-08-04-cuentas-cobro-y-gestion-de-lotes-design.md`.
- RLS sigue deshabilitado — no tocar.
- La regla de visibilidad es: el acreedor X puede ver al vendedor Y si y solo si existe al menos un lote con `acreedor_id = X` y `vendedor_id = Y`. No depende del `estado` del lote.
- `administrador` no cambia: sigue viendo y editando todo el staff sin restricciones.
- El formulario de invitar staff (`crearUsuarioStaff`) no se toca — sigue disponible para `acreedor` igual que antes.
- La vista acotada del acreedor es de **solo lectura** — sin links de "Editar" (ya estaba bloqueado a nivel de escritura desde una revisión anterior; esto cierra el lado de lectura).
- Idioma: todo el copy de UI, nombres de variables/funciones y mensajes de commit en español.
- No se agrega ninguna librería nueva.

---

### Task 1: Componente de navegación compartido + wiring en Mi perfil

**Files:**
- Create: `components/NavAdmin.tsx`
- Modify: `app/admin/layout.tsx`
- Modify: `app/mi-perfil/page.tsx`

**Interfaces:**
- Produces: `<NavAdmin />` — componente sin props, misma barra de nav que ya existe hoy en `app/admin/layout.tsx`.

- [ ] **Step 1: Extraer el componente**

Create `components/NavAdmin.tsx`:

```tsx
export function NavAdmin() {
  return (
    <nav className="flex gap-4 border-b p-4 text-sm">
      <a href="/admin/lotes">Lotes</a>
      <a href="/admin/pagos">Pagos</a>
      <a href="/admin/usuarios">Usuarios</a>
      <a href="/mi-perfil">Mi perfil</a>
    </nav>
  )
}
```

- [ ] **Step 2: Usarlo en el layout de admin**

Modify `app/admin/layout.tsx`: agregar el import y reemplazar el `<nav>` inline por `<NavAdmin />`.

```typescript
import { NavAdmin } from '@/components/NavAdmin'
```

Cambiar:
```tsx
      <nav className="flex gap-4 border-b p-4 text-sm">
        <a href="/admin/lotes">Lotes</a>
        <a href="/admin/pagos">Pagos</a>
        <a href="/admin/usuarios">Usuarios</a>
        <a href="/mi-perfil">Mi perfil</a>
      </nav>
```
por:
```tsx
      <NavAdmin />
```

(el resto del archivo, incluido el chequeo de rol que redirige a `/`, queda igual — no lo toques).

- [ ] **Step 3: Mostrarlo también en Mi perfil, solo para administrador/acreedor**

Modify `app/mi-perfil/page.tsx`: agregar el import, y renderizar `<NavAdmin />` justo antes del `<main>` cuando el rol del perfil sea `administrador` o `acreedor`.

Agregar el import junto a los demás:
```typescript
import { NavAdmin } from '@/components/NavAdmin'
```

Cambiar el inicio del `return`, de:
```tsx
  return (
    <main className="mx-auto mt-12 max-w-md p-6">
```
a:
```tsx
  return (
    <>
      {(perfil!.role === 'administrador' || perfil!.role === 'acreedor') && <NavAdmin />}
      <main className="mx-auto mt-12 max-w-md p-6">
```

Y cerrar el fragmento agregado al final del archivo, cambiando el cierre de:
```tsx
    </main>
  )
}
```
a:
```tsx
      </main>
    </>
  )
}
```

- [ ] **Step 4: Verificar que compila**

```bash
npm run build
```
Expected: build exitoso.

- [ ] **Step 5: Commit**

```bash
git add components/NavAdmin.tsx app/admin/layout.tsx app/mi-perfil/page.tsx
git commit -m "feat: mi-perfil muestra la misma navegacion que el resto del area admin"
```

---

### Task 2: `/admin/usuarios` acota lo que ve un acreedor

**Files:**
- Modify: `app/admin/usuarios/page.tsx`

**Interfaces:**
- Consumes: `createClient()`, tablas `profiles`/`lotes`
- Produces: nada nuevo — cierra el hallazgo Minor #2 de la revisión final anterior

- [ ] **Step 1: Branch por rol del que mira la página**

Modify `app/admin/usuarios/page.tsx` completo:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  crearUsuarioStaff,
  actualizarNombreStaff,
  actualizarDatosTransferenciaStaff,
} from './actions'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; editar?: string }>
}) {
  const { error, editar } = await searchParams
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

  if (perfilPropio!.role === 'acreedor') {
    const { data: misLotes } = await supabase
      .from('lotes')
      .select('vendedor_id')
      .eq('acreedor_id', user!.id)
      .not('vendedor_id', 'is', null)

    const vendedorIds = [...new Set((misLotes ?? []).map((lote) => lote.vendedor_id as string))]

    const { data: vendedores } =
      vendedorIds.length > 0
        ? await supabase
            .from('profiles')
            .select('id, full_name, alias, banco, cbu, titular')
            .in('id', vendedorIds)
            .order('full_name')
        : { data: [] }

    return (
      <main className="max-w-2xl">
        <h1 className="mb-6 text-xl font-semibold">Usuarios de staff</h1>
        {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
        <form action={crearUsuarioStaff} className="mb-8 flex flex-col gap-3">
          <input
            name="fullName"
            placeholder="Nombre completo"
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            className="rounded border px-3 py-2"
          />
          <select name="role" required className="rounded border px-3 py-2">
            <option value="acreedor">Acreedor</option>
            <option value="vendedor">Vendedor</option>
            <option value="cobrador">Cobrador</option>
          </select>
          <button type="submit" className="rounded bg-black px-3 py-2 text-white">
            Invitar
          </button>
        </form>

        <h2 className="mb-2 text-lg font-semibold">Vendedores de tus lotes</h2>
        {(vendedores ?? []).length === 0 ? (
          <p className="text-sm text-gray-600">
            Todavía no tenés ningún vendedor asociado a tus lotes.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Nombre</th>
                <th>Datos de transferencia</th>
              </tr>
            </thead>
            <tbody>
              {vendedores!.map((persona) => (
                <tr key={persona.id} className="border-b">
                  <td className="py-2">{persona.full_name}</td>
                  <td>
                    {tieneDatosTransferencia({
                      alias: persona.alias,
                      banco: persona.banco,
                      titular: persona.titular,
                    }) ? (
                      `${persona.titular} · ${persona.alias} · ${persona.banco}`
                    ) : (
                      <span className="text-amber-700">Sin datos de transferencia</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    )
  }

  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, role, alias, banco, cbu, titular')
    .in('role', ['administrador', 'acreedor', 'vendedor', 'cobrador'])
    .order('role')

  return (
    <main className="max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">Usuarios de staff</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      <form action={crearUsuarioStaff} className="mb-8 flex flex-col gap-3">
        <input
          name="fullName"
          placeholder="Nombre completo"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="rounded border px-3 py-2"
        />
        <select name="role" required className="rounded border px-3 py-2">
          <option value="acreedor">Acreedor</option>
          <option value="vendedor">Vendedor</option>
          <option value="cobrador">Cobrador</option>
        </select>
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Invitar
        </button>
      </form>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Nombre</th>
            <th>Rol</th>
            <th>Datos de transferencia</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {staff?.map((persona) => {
            const actualizarNombreConId = actualizarNombreStaff.bind(null, persona.id)
            const actualizarDatosConId = actualizarDatosTransferenciaStaff.bind(null, persona.id)
            const tieneDatos = tieneDatosTransferencia({
              alias: persona.alias,
              banco: persona.banco,
              titular: persona.titular,
            })

            if (editar === persona.id) {
              return (
                <tr key={persona.id} className="border-b">
                  <td colSpan={4} className="py-3">
                    <form action={actualizarNombreConId} className="mb-3 flex gap-2">
                      <input
                        name="fullName"
                        defaultValue={persona.full_name}
                        required
                        className="flex-1 rounded border px-3 py-2"
                      />
                      <button
                        type="submit"
                        className="rounded bg-black px-3 py-2 text-sm text-white"
                      >
                        Guardar nombre
                      </button>
                    </form>
                    <form action={actualizarDatosConId} className="flex flex-col gap-2">
                      <input
                        name="titular"
                        defaultValue={persona.titular ?? ''}
                        placeholder="Titular de la cuenta"
                        required
                        className="rounded border px-3 py-2"
                      />
                      <input
                        name="alias"
                        defaultValue={persona.alias ?? ''}
                        placeholder="Alias"
                        required
                        className="rounded border px-3 py-2"
                      />
                      <input
                        name="banco"
                        defaultValue={persona.banco ?? ''}
                        placeholder="Banco"
                        required
                        className="rounded border px-3 py-2"
                      />
                      <input
                        name="cbu"
                        defaultValue={persona.cbu ?? ''}
                        placeholder="CBU (opcional)"
                        className="rounded border px-3 py-2"
                      />
                      <button
                        type="submit"
                        className="self-start rounded bg-black px-3 py-2 text-sm text-white"
                      >
                        Guardar datos de transferencia
                      </button>
                    </form>
                  </td>
                </tr>
              )
            }

            return (
              <tr key={persona.id} className="border-b">
                <td className="py-2">{persona.full_name}</td>
                <td>{persona.role}</td>
                <td>
                  {tieneDatos ? (
                    `${persona.titular} · ${persona.alias} · ${persona.banco}`
                  ) : (
                    <span className="text-amber-700">Sin datos de transferencia</span>
                  )}
                </td>
                <td>
                  <a href={`/admin/usuarios?editar=${persona.id}`} className="underline">
                    Editar
                  </a>
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

Nota: la rama de `administrador` es exactamente el código que ya existía antes de este cambio — no se le tocó nada, solo se agregó el chequeo de rol al principio y la rama nueva para `acreedor`.

- [ ] **Step 2: Verificar que compila**

```bash
npm run build
```
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add app/admin/usuarios/page.tsx
git commit -m "feat: acreedor solo ve los vendedores asociados a sus propios lotes"
```

---

### Task 3: Fixtures y test E2E de la visibilidad acotada

**Files:**
- Modify: `tests/e2e/fixtures/test-data.ts`
- Create: `tests/e2e/visibilidad-acreedor.spec.ts`

**Interfaces:**
- Consumes: `ensureTestFixtures()`, `login()`/`logout()`
- Produces: `TestFixtures.vendedorLoteA`, `TestFixtures.vendedorLoteB`, `TestFixtures.acreedorSecundario` — usuarios de prueba nuevos que reproducen el ejemplo de Gabriel (dos acreedores, cada uno con un vendedor distinto asociado a través de un lote).

- [ ] **Step 1: Agregar 3 usuarios de prueba y 2 lotes para probar la exclusión**

Modify `tests/e2e/fixtures/test-data.ts`.

Agregar a `TEST_USERS`:
```typescript
  vendedorLoteA: {
    email: 'test-vendedor-a@sima-e2e.invalid',
    fullName: 'E2E Vendedor A',
    role: 'vendedor' as const,
  },
  vendedorLoteB: {
    email: 'test-vendedor-b@sima-e2e.invalid',
    fullName: 'E2E Vendedor B',
    role: 'vendedor' as const,
  },
  acreedorSecundario: {
    email: 'test-acreedor-secundario@sima-e2e.invalid',
    fullName: 'E2E Acreedor Secundario',
    role: 'acreedor' as const,
  },
```

Ampliar el tipo de `role` que acepta `ensureTestUser` para incluir `'vendedor'`:
```typescript
async function ensureTestUser(
  admin: AdminClient,
  config: {
    email: string
    fullName: string
    role: 'administrador' | 'acreedor' | 'vendedor' | 'cliente'
    datosTransferencia?: { alias: string; banco: string; titular: string; cbu?: string }
  }
) {
```

Agregar el campo a la interfaz `TestFixtures`:
```typescript
export interface TestFixtures {
  admin: { id: string; email: string }
  acreedor: { id: string; email: string }
  acreedorConDatos: { id: string; email: string }
  acreedorSecundario: { id: string; email: string }
  vendedorLoteA: { id: string; email: string }
  vendedorLoteB: { id: string; email: string }
  cliente: { id: string; email: string }
  password: string
  loteId: string
  cuotaIds: string[]
}
```

Modify el `Promise.all` de `ensureTestFixtures()` para crear los 3 usuarios nuevos:
```typescript
  const [
    administrador,
    acreedor,
    cliente,
    acreedorConDatos,
    acreedorSecundario,
    vendedorLoteA,
    vendedorLoteB,
  ] = await Promise.all([
    ensureTestUser(admin, TEST_USERS.administrador),
    ensureTestUser(admin, TEST_USERS.acreedor),
    ensureTestUser(admin, TEST_USERS.cliente),
    ensureTestUser(admin, {
      ...TEST_USERS.acreedorConDatos,
      datosTransferencia: {
        alias: 'acreedor.cobro',
        banco: 'Test Bank',
        titular: 'E2E Acreedor Con Datos SA',
        cbu: '0000003100000000000001',
      },
    }),
    ensureTestUser(admin, TEST_USERS.acreedorSecundario),
    ensureTestUser(admin, {
      ...TEST_USERS.vendedorLoteA,
      datosTransferencia: { alias: 'vendedor.a', banco: 'Banco A', titular: 'E2E Vendedor A SA' },
    }),
    ensureTestUser(admin, {
      ...TEST_USERS.vendedorLoteB,
      datosTransferencia: { alias: 'vendedor.b', banco: 'Banco B', titular: 'E2E Vendedor B SA' },
    }),
  ])
```

Después de crear el lote de prueba fresco (el bloque que hace `insert` en `lotes` y `select('id').single()`), agregar la asignación de `acreedor_id`/`vendedor_id` a ESE lote (el lote principal del cliente, que va a quedar asociado al `acreedorConDatos` y a `vendedorLoteA`), y crear un SEGUNDO lote de prueba (sin cliente, no hace falta que tenga cuotas) asociado a `acreedorSecundario` y `vendedorLoteB`, para poder probar que `acreedorConDatos` NO ve a `vendedorLoteB`. Agregar esto justo antes del `return` final de `ensureTestFixtures()`:

```typescript
  await admin
    .from('lotes')
    .update({ acreedor_id: acreedorConDatos.id, vendedor_id: vendedorLoteA.id })
    .eq('id', lote.id)

  // Limpieza + creación de un segundo lote, sin cliente, solo para la
  // relación acreedor-vendedor (no participa del flujo de pagos).
  await admin.from('lotes').delete().eq('identificador', 'E2E Test Lote Secundario')

  await admin.from('lotes').insert({
    identificador: 'E2E Test Lote Secundario',
    moneda: 'USD',
    estado: 'disponible',
    cantidad_cuotas: 1,
    monto_cuota_base: 1,
    acreedor_id: acreedorSecundario.id,
    vendedor_id: vendedorLoteB.id,
  })
```

Y actualizar el `return` final para incluir los 3 usuarios nuevos:
```typescript
  return {
    admin: administrador,
    acreedor,
    acreedorConDatos,
    acreedorSecundario,
    vendedorLoteA,
    vendedorLoteB,
    cliente,
    password: TEST_PASSWORD,
    loteId: lote.id,
    cuotaIds: cuotas.map((c) => c.id),
  }
```

- [ ] **Step 2: Spec E2E**

Create `tests/e2e/visibilidad-acreedor.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'
import { ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Visibilidad acotada acreedor-vendedor', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('el acreedor ve solo al vendedor de sus propios lotes, no al de otro acreedor', async ({
    page,
  }) => {
    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/usuarios')

    await expect(page.getByText('E2E Vendedor A')).toBeVisible()
    await expect(page.getByText('vendedor.a')).toBeVisible()

    await expect(page.getByText('E2E Vendedor B')).not.toBeVisible()
    await expect(page.getByText('vendedor.a')).toBeVisible()
    await expect(page.getByText('vendedor.b')).not.toBeVisible()

    // La vista acotada no tiene links de "Editar" (es de solo lectura).
    await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0)
  })

  test('el administrador sigue viendo a todo el staff, incluidos ambos vendedores', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/usuarios')

    await expect(page.getByText('E2E Vendedor A')).toBeVisible()
    await expect(page.getByText('E2E Vendedor B')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Editar' }).first()).toBeVisible()
  })
})
```

- [ ] **Step 3: Correr el suite completo**

El servidor de dev debería estar corriendo; si no, levantalo con `npm run dev` en background y esperá a que `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login` devuelva 200.

```bash
npm test
npx playwright test
```
Expected: `npm test` en verde. `npx playwright test` con todos los specs en verde, incluyendo los 2 nuevos de `visibilidad-acreedor.spec.ts` y sin romper ninguno de los existentes (`auth.spec.ts`, `cuenta-cobro.spec.ts`, `pago-flujo-completo.spec.ts`).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e
git commit -m "test: cobertura e2e de visibilidad acotada acreedor-vendedor"
```

---

## Verificación final

```bash
npm run build && npm test && npx playwright test
```

Expected: los tres comandos en verde.
