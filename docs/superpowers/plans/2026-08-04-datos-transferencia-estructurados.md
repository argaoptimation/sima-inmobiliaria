# Datos de transferencia estructurados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el campo único de texto libre `profiles.datos_transferencia` por cuatro campos estructurados (`titular`, `alias`, `banco` obligatorios; `cbu` opcional), en todos los lugares donde se carga, valida y muestra.

**Architecture:** Mismo patrón que el resto de la app: Server Actions, sin RLS, sin librerías nuevas. "Nombre completo" y "Datos de transferencia" pasan a ser dos formularios independientes (dos botones) tanto en `/mi-perfil` como en la edición inline de `/admin/usuarios`, para que completar el nombre nunca fuerce a completar datos bancarios.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind CSS, Supabase (Postgres + Auth), Vitest, Playwright.

## Global Constraints

- Spec source de verdad: Addendum (2026-08-04) en `docs/superpowers/specs/2026-08-04-cuentas-cobro-y-gestion-de-lotes-design.md`.
- RLS sigue deshabilitado — no tocar.
- `titular`, `alias`, `banco` son obligatorios (HTML `required` + validación server-side) en el formulario de "Datos de transferencia"; `cbu` es el único opcional. Las 4 columnas en la base son nullable (un perfil recién invitado no tiene nada cargado).
- "Tiene datos cargados" (para poder ser `cuenta_cobro_id` de un lote) significa: `alias`, `banco` y `titular` no vacíos. `cbu` no cuenta.
- "Nombre completo" y "Datos de transferencia" son formularios/acciones separados en `/mi-perfil` y en `/admin/usuarios` — no un único form combinado.
- Idioma: todo el copy de UI, nombres de variables/funciones y mensajes de commit en español.
- No se agrega ninguna librería nueva.

---

### Task 1: Migración + función pura de validación estructurada

**Files:**
- Create: `supabase/migrations/0007_profiles_datos_transferencia_estructurados.sql`
- Modify: `lib/lotes/validar-cuenta-cobro.ts`
- Modify: `lib/lotes/validar-cuenta-cobro.test.ts`

**Interfaces:**
- Produces: columnas `profiles.alias`/`banco`/`cbu`/`titular` (text, nullable) reemplazando `profiles.datos_transferencia`; `tieneDatosTransferencia(datos: { alias: string | null; banco: string | null; titular: string | null }): boolean` — nueva firma, todas las tareas siguientes la consumen así.

- [ ] **Step 1: Escribir la migración**

Create `supabase/migrations/0007_profiles_datos_transferencia_estructurados.sql`:

```sql
alter table public.profiles
  add column alias text,
  add column banco text,
  add column cbu text,
  add column titular text,
  drop column datos_transferencia;
```

- [ ] **Step 2: Aplicar la migración**

Usar `mcp__supabase__apply_migration` con `name: "profiles_datos_transferencia_estructurados"` y el SQL de arriba como `query`.

- [ ] **Step 3: Verificar**

Usar `mcp__supabase__list_tables`. Esperado: `profiles` tiene `alias`, `banco`, `cbu`, `titular` (todas nullable) y ya NO tiene `datos_transferencia`.

- [ ] **Step 4: Actualizar el test de la función pura (nueva firma)**

Modify `lib/lotes/validar-cuenta-cobro.test.ts` completo:

```typescript
import { describe, expect, it } from 'vitest'
import { tieneDatosTransferencia } from './validar-cuenta-cobro'

describe('tieneDatosTransferencia', () => {
  it('es false cuando los tres campos son null', () => {
    expect(tieneDatosTransferencia({ alias: null, banco: null, titular: null })).toBe(false)
  })

  it('es false si falta alguno de los tres, aunque los otros dos estén completos', () => {
    expect(
      tieneDatosTransferencia({ alias: 'juan.perez', banco: 'Banco Test', titular: null })
    ).toBe(false)
    expect(
      tieneDatosTransferencia({ alias: 'juan.perez', banco: '', titular: 'Juan Pérez' })
    ).toBe(false)
    expect(
      tieneDatosTransferencia({ alias: '   ', banco: 'Banco Test', titular: 'Juan Pérez' })
    ).toBe(false)
  })

  it('es true cuando los tres campos tienen contenido real', () => {
    expect(
      tieneDatosTransferencia({ alias: 'juan.perez', banco: 'Banco Test', titular: 'Juan Pérez' })
    ).toBe(true)
  })
})
```

- [ ] **Step 5: Correr el test y verificar que falla**

```bash
npx vitest run lib/lotes/validar-cuenta-cobro.test.ts
```
Expected: FAIL, la firma vieja de `tieneDatosTransferencia` no acepta un objeto.

- [ ] **Step 6: Nueva implementación**

Modify `lib/lotes/validar-cuenta-cobro.ts` completo:

```typescript
export interface DatosTransferencia {
  alias: string | null
  banco: string | null
  titular: string | null
}

export function tieneDatosTransferencia(datos: DatosTransferencia): boolean {
  return Boolean(datos.alias?.trim() && datos.banco?.trim() && datos.titular?.trim())
}
```

- [ ] **Step 7: Correr el test y verificar que pasa**

```bash
npx vitest run lib/lotes/validar-cuenta-cobro.test.ts
```
Expected: `4 passed`.

- [ ] **Step 8: Commit**

Nota: después de este commit, `npm run build` va a fallar (varios archivos todavía leen/escriben `datos_transferencia` y la nueva firma de `tieneDatosTransferencia`) — las tareas siguientes arreglan cada uno. No es necesario que el build pase todavía en este punto intermedio.

```bash
git add supabase/migrations/0007_profiles_datos_transferencia_estructurados.sql lib/lotes/validar-cuenta-cobro.ts lib/lotes/validar-cuenta-cobro.test.ts
git commit -m "feat: profiles.datos_transferencia pasa a ser 4 columnas estructuradas"
```

---

### Task 2: `/mi-perfil` — dos formularios, campos estructurados

**Files:**
- Modify: `app/mi-perfil/actions.ts`
- Modify: `app/mi-perfil/page.tsx`

**Interfaces:**
- Consumes: columnas de Task 1
- Produces: `actualizarNombre(formData)` y `actualizarDatosTransferencia(formData)` (reemplazan `actualizarMiPerfil`)

- [ ] **Step 1: Dos server actions en vez de una**

Modify `app/mi-perfil/actions.ts` completo:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

async function requireStaffLogueado() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user!.id).single()

  if (!perfil || perfil.role === 'cliente') {
    redirect('/portal-cliente')
  }

  return { supabase, userId: user!.id }
}

export async function actualizarNombre(formData: FormData) {
  const { supabase, userId } = await requireStaffLogueado()

  const fullName = formData.get('fullName') as string

  if (!fullName?.trim()) {
    redirect(`/mi-perfil?error=${encodeURIComponent('El nombre no puede estar vacío')}`)
  }

  const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', userId)

  if (error) {
    redirect(`/mi-perfil?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/mi-perfil?ok=1')
}

export async function actualizarDatosTransferencia(formData: FormData) {
  const { supabase, userId } = await requireStaffLogueado()

  const titular = (formData.get('titular') as string | null)?.trim()
  const alias = (formData.get('alias') as string | null)?.trim()
  const banco = (formData.get('banco') as string | null)?.trim()
  const cbuRaw = (formData.get('cbu') as string | null)?.trim()

  if (!titular || !alias || !banco) {
    redirect(`/mi-perfil?error=${encodeURIComponent('Titular, alias y banco son obligatorios')}`)
  }

  const { error } = await supabase
    .from('profiles')
    .update({ titular, alias, banco, cbu: cbuRaw ? cbuRaw : null })
    .eq('id', userId)

  if (error) {
    redirect(`/mi-perfil?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/mi-perfil?ok=1')
}
```

- [ ] **Step 2: Página con dos formularios**

Modify `app/mi-perfil/page.tsx` completo:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { actualizarNombre, actualizarDatosTransferencia } from './actions'

export default async function MiPerfilPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>
}) {
  const { error, ok } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('full_name, role, alias, banco, cbu, titular')
    .eq('id', user!.id)
    .single()

  if (!perfil) {
    redirect('/login')
  }

  if (perfil!.role === 'cliente') {
    redirect('/portal-cliente')
  }

  return (
    <main className="mx-auto mt-12 max-w-md p-6">
      <h1 className="mb-6 text-xl font-semibold">Mi perfil</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      {ok && <p className="mb-4 rounded bg-green-100 p-2 text-sm text-green-700">Guardado.</p>}

      <h2 className="mb-2 text-lg font-semibold">Nombre completo</h2>
      <form action={actualizarNombre} className="mb-8 flex gap-3">
        <input
          name="fullName"
          defaultValue={perfil!.full_name}
          required
          className="flex-1 rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">
          Guardar
        </button>
      </form>

      <h2 className="mb-2 text-lg font-semibold">Datos de transferencia</h2>
      <p className="mb-3 text-sm text-gray-600">
        Así los va a ver el cliente para corroborar antes de transferir. El titular tiene que ser
        el nombre tal cual figura en la cuenta bancaria de destino (puede no coincidir con tu
        nombre de arriba).
      </p>
      <form action={actualizarDatosTransferencia} className="flex flex-col gap-3">
        <label className="text-sm">
          Titular de la cuenta
          <input
            name="titular"
            defaultValue={perfil!.titular ?? ''}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Alias
          <input
            name="alias"
            defaultValue={perfil!.alias ?? ''}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Banco
          <input
            name="banco"
            defaultValue={perfil!.banco ?? ''}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          CBU (opcional)
          <input
            name="cbu"
            defaultValue={perfil!.cbu ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Guardar
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 3: Verificar que compila**

```bash
npm run build
```
Expected: build exitoso (los errores de `datos_transferencia` en otros archivos siguen ahí hasta las próximas tareas — está bien, verificá solo que este archivo no aparece más en los errores).

- [ ] **Step 4: Commit**

```bash
git add app/mi-perfil
git commit -m "feat: mi-perfil separa nombre y datos de transferencia estructurados en dos formularios"
```

---

### Task 3: `/admin/usuarios` — dos mini-formularios inline, campos estructurados

**Files:**
- Modify: `app/admin/usuarios/actions.ts`
- Modify: `app/admin/usuarios/page.tsx`

**Interfaces:**
- Consumes: `requireAdministrador()` (`lib/auth/require-admin.ts`), `tieneDatosTransferencia()` (Task 1), columnas de Task 1
- Produces: `actualizarNombreStaff(userId, formData)` y `actualizarDatosTransferenciaStaff(userId, formData)` (reemplazan `actualizarUsuarioStaff`)

- [ ] **Step 1: Dos server actions**

Modify `app/admin/usuarios/actions.ts` completo:

```typescript
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdmin, requireAdministrador } from '@/lib/auth/require-admin'

const ROLES_STAFF = ['acreedor', 'vendedor', 'cobrador'] as const

export async function crearUsuarioStaff(formData: FormData) {
  await requireAdmin()

  const email = formData.get('email') as string
  const fullName = formData.get('fullName') as string
  const role = formData.get('role') as (typeof ROLES_STAFF)[number]

  if (!ROLES_STAFF.includes(role)) {
    redirect('/admin/usuarios?error=rol+invalido')
  }

  const admin = createAdminClient()

  const { data: invited, error: errorInvite } = await admin.auth.admin.inviteUserByEmail(email)

  if (errorInvite || !invited.user) {
    redirect(
      `/admin/usuarios?error=${encodeURIComponent(errorInvite?.message ?? 'error desconocido')}`
    )
  }

  const { error: errorProfile } = await admin
    .from('profiles')
    .insert({ id: invited.user.id, role, full_name: fullName })

  if (errorProfile) {
    redirect(`/admin/usuarios?error=${encodeURIComponent(errorProfile.message)}`)
  }

  redirect('/admin/usuarios')
}

export async function actualizarNombreStaff(userId: string, formData: FormData) {
  await requireAdministrador()

  const fullName = formData.get('fullName') as string

  if (!fullName?.trim()) {
    redirect(`/admin/usuarios?error=${encodeURIComponent('El nombre no puede estar vacío')}`)
  }

  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ full_name: fullName }).eq('id', userId)

  if (error) {
    redirect(`/admin/usuarios?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/admin/usuarios')
}

export async function actualizarDatosTransferenciaStaff(userId: string, formData: FormData) {
  await requireAdministrador()

  const titular = (formData.get('titular') as string | null)?.trim()
  const alias = (formData.get('alias') as string | null)?.trim()
  const banco = (formData.get('banco') as string | null)?.trim()
  const cbuRaw = (formData.get('cbu') as string | null)?.trim()

  if (!titular || !alias || !banco) {
    redirect(
      `/admin/usuarios?error=${encodeURIComponent('Titular, alias y banco son obligatorios')}`
    )
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ titular, alias, banco, cbu: cbuRaw ? cbuRaw : null })
    .eq('id', userId)

  if (error) {
    redirect(`/admin/usuarios?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/admin/usuarios')
}
```

- [ ] **Step 2: Página con dos mini-formularios inline por fila**

Modify `app/admin/usuarios/page.tsx` completo:

```tsx
import { createClient } from '@/lib/supabase/server'
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

- [ ] **Step 3: Verificar que compila**

```bash
npm run build
```
Expected: build exitoso para este archivo (pueden seguir quedando errores en `app/admin/lotes/[id]` y `app/portal-cliente`, las próximas tareas los arreglan).

- [ ] **Step 4: Commit**

```bash
git add app/admin/usuarios
git commit -m "feat: admin edita nombre y datos de transferencia estructurados en formularios separados"
```

---

### Task 4: Detalle de lote — validación y anotaciones con campos estructurados

**Files:**
- Modify: `app/admin/lotes/[id]/page.tsx`
- Modify: `app/admin/lotes/[id]/actions.ts`

**Interfaces:**
- Consumes: `tieneDatosTransferencia({alias, banco, titular})` (Task 1)
- Produces: nada nuevo — cierra el consumo de la columna eliminada en este archivo

- [ ] **Step 1: Actualizar la query de staff y las anotaciones de los selects**

Modify `app/admin/lotes/[id]/page.tsx`: cambiar el `select` de `staff` y las 4 anotaciones de `<option>` para usar los campos nuevos.

Cambiar:
```typescript
  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, role, datos_transferencia')
    .in('role', ['administrador', 'acreedor', 'vendedor'])
    .order('full_name')
```
por:
```typescript
  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, role, alias, banco, titular')
    .in('role', ['administrador', 'acreedor', 'vendedor'])
    .order('full_name')
```

Cambiar la construcción de `conDatos`:
```typescript
  const conDatos = (staff ?? []).filter(
    (persona) => persona.datos_transferencia?.trim() || persona.id === lote!.cuenta_cobro_id
  )
```
por:
```typescript
  const conDatos = (staff ?? []).filter(
    (persona) =>
      tieneDatosTransferencia({ alias: persona.alias, banco: persona.banco, titular: persona.titular }) ||
      persona.id === lote!.cuenta_cobro_id
  )
```

Y agregar el import correspondiente junto a los demás imports del archivo:
```typescript
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'
```

En los 4 `<select>` (Admin, Acreedor, Vendedor, Cuenta de cobro actual), cambiar cada condición de anotación de:
```tsx
{!persona.datos_transferencia?.trim() && ' — sin datos de transferencia'}
```
por:
```tsx
{!tieneDatosTransferencia({ alias: persona.alias, banco: persona.banco, titular: persona.titular }) &&
  ' — sin datos de transferencia'}
```
(las 4 ocurrencias, una por cada `<select>`).

- [ ] **Step 2: Actualizar la validación en `actualizarCobro`**

Modify `app/admin/lotes/[id]/actions.ts`: dentro de `actualizarCobro`, cambiar la parte que valida `cuentaCobroId`:

Cambiar:
```typescript
    const admin = createAdminClient()
    const { data: persona } = await admin
      .from('profiles')
      .select('id, datos_transferencia')
      .eq('id', cuentaCobroId)
      .single()

    if (!persona || !tieneDatosTransferencia(persona.datos_transferencia)) {
```
por:
```typescript
    const admin = createAdminClient()
    const { data: persona } = await admin
      .from('profiles')
      .select('id, alias, banco, titular')
      .eq('id', cuentaCobroId)
      .single()

    if (
      !persona ||
      !tieneDatosTransferencia({ alias: persona.alias, banco: persona.banco, titular: persona.titular })
    ) {
```

(el resto de la función, incluida la validación de roles agregada en la revisión final, queda igual — no la toques).

- [ ] **Step 3: Verificar que compila**

```bash
npm run build
```
Expected: build exitoso para estos dos archivos.

- [ ] **Step 4: Commit**

```bash
git add app/admin/lotes/\[id\]
git commit -m "feat: detalle de lote valida cuenta de cobro con campos estructurados"
```

---

### Task 5: El cliente ve los datos estructurados al pagar

**Files:**
- Modify: `app/portal-cliente/pagar/[id]/page.tsx`

**Interfaces:**
- Consumes: columnas de Task 1, `tieneDatosTransferencia()` (Task 1)

- [ ] **Step 1: Mostrar titular/alias/banco/CBU en vez del blob de texto**

Modify `app/portal-cliente/pagar/[id]/page.tsx` completo:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { registrarPago } from './actions'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'

export default async function PagarCuotaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: lote } = await supabase
    .from('lotes')
    .select('cuenta_cobro_id')
    .eq('cliente_id', user!.id)
    .single()

  let cuentaCobro: { alias: string | null; banco: string | null; cbu: string | null; titular: string | null } | null = null

  if (lote?.cuenta_cobro_id) {
    const { data } = await supabase
      .from('profiles')
      .select('alias, banco, cbu, titular')
      .eq('id', lote.cuenta_cobro_id)
      .single()

    cuentaCobro = data
  }

  const datosCompletos = tieneDatosTransferencia({
    alias: cuentaCobro?.alias ?? null,
    banco: cuentaCobro?.banco ?? null,
    titular: cuentaCobro?.titular ?? null,
  })

  const registrarPagoConId = registrarPago.bind(null, id)

  return (
    <main className="mx-auto mt-12 max-w-md p-6">
      <h1 className="mb-6 text-xl font-semibold">Registrar pago</h1>
      <div className="mb-6 rounded bg-gray-100 p-3 text-sm">
        {datosCompletos ? (
          <>
            <p className="mb-1">Transferí a:</p>
            <p>
              <span className="font-medium">Titular:</span> {cuentaCobro!.titular}
            </p>
            <p>
              <span className="font-medium">Alias:</span> {cuentaCobro!.alias}
            </p>
            <p>
              <span className="font-medium">Banco:</span> {cuentaCobro!.banco}
            </p>
            {cuentaCobro!.cbu?.trim() && (
              <p>
                <span className="font-medium">CBU:</span> {cuentaCobro!.cbu}
              </p>
            )}
          </>
        ) : (
          <p>Consultá los datos de la cuenta con SIMA Inmobiliaria.</p>
        )}
      </div>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      <form action={registrarPagoConId} className="flex flex-col gap-3">
        <input
          name="monto"
          type="number"
          step="0.01"
          min="0.01"
          placeholder="Monto transferido"
          required
          className="rounded border px-3 py-2"
        />
        <select name="moneda" required className="rounded border px-3 py-2">
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Ya transferí
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 2: Verificar que compila**

```bash
npm run build
```
Expected: build exitoso, sin errores de TypeScript en todo el proyecto (esta es la última referencia a la columna eliminada).

- [ ] **Step 3: Commit**

```bash
git add app/portal-cliente/pagar/\[id\]/page.tsx
git commit -m "feat: el cliente ve titular, alias, banco y CBU estructurados al pagar"
```

---

### Task 6: Actualizar fixtures y spec E2E a la nueva estructura

**Files:**
- Modify: `tests/e2e/fixtures/test-data.ts`
- Modify: `tests/e2e/cuenta-cobro.spec.ts`

**Interfaces:**
- Consumes: columnas de Task 1, todas las páginas actualizadas en Tasks 2-5

- [ ] **Step 1: `ensureTestUser` acepta datos estructurados**

Modify `tests/e2e/fixtures/test-data.ts`.

Cambiar la firma de `ensureTestUser`:
```typescript
async function ensureTestUser(
  admin: AdminClient,
  config: {
    email: string
    fullName: string
    role: 'administrador' | 'acreedor' | 'cliente'
    datosTransferencia?: { alias: string; banco: string; titular: string; cbu?: string }
  }
) {
```

Y el upsert dentro de la misma función:
```typescript
  const { error: errorProfile } = await admin.from('profiles').upsert({
    id: userId,
    role: config.role,
    full_name: config.fullName,
    alias: config.datosTransferencia?.alias ?? null,
    banco: config.datosTransferencia?.banco ?? null,
    cbu: config.datosTransferencia?.cbu ?? null,
    titular: config.datosTransferencia?.titular ?? null,
  })
```

Cambiar el `Promise.all` dentro de `ensureTestFixtures()`:
```typescript
  const [administrador, acreedor, cliente, acreedorConDatos] = await Promise.all([
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
  ])
```

(el resto del archivo — `TEST_USERS`, `TestFixtures`, la limpieza de lotes previos, la creación del lote de prueba — queda igual, no lo toques).

- [ ] **Step 2: Ajustar el spec de cuenta de cobro si hace falta**

Modify `tests/e2e/cuenta-cobro.spec.ts`: el alias sigue siendo `'acreedor.cobro'`, así que la aserción `await expect(page.getByText('acreedor.cobro')).toBeVisible()` en el test `'admin asigna una cuenta de cobro...'` debería seguir pasando tal cual sin cambios de código. Verificalo corriendo el suite (Step 3) antes de tocar nada; si falla por algún cambio de layout (ej. el alias ahora aparece dentro de un `<p>` con label "Alias:" en vez de en un párrafo de texto libre), ajustá únicamente esa aserción puntual para que siga verificando que el alias del acreedor asignado es visible en la página — no reescribas el resto del spec.

- [ ] **Step 3: Correr el suite completo (Playwright + Vitest)**

El servidor de dev debería estar corriendo; si no, levantalo con `npm run dev` en background y esperá a que `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login` devuelva 200 antes de continuar.

```bash
npm test
npx playwright test
```
Expected: `npm test` con todos los tests en verde (incluye los 4 nuevos de `validar-cuenta-cobro.test.ts` de la Task 1). `npx playwright test` con los 6 tests en verde (`auth.spec.ts`, `cuenta-cobro.spec.ts`, `pago-flujo-completo.spec.ts`), sin regresiones.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e
git commit -m "test: actualizar fixtures y spec e2e a datos de transferencia estructurados"
```

---

## Verificación final

Después del Task 6, correr una vez más para confirmar que la secuencia completa de tasks no dejó nada roto:

```bash
npm run build && npm test && npx playwright test
```

Expected: build sin errores de TypeScript, `npm test` en verde, `npx playwright test` en verde.
