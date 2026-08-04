# Cuentas de cobro por lote + gestión de lotes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover los datos de transferencia (alias/CBU/banco) del lote a la persona (administrador/acreedor/vendedor), permitir asignar a cada lote quién es su admin/acreedor/vendedor y cuál de ellos cobra actualmente, y completar la gestión de lotes que hoy falta (ver detalle, editar, eliminar), todo con selects sobre usuarios ya creados — nada de texto libre para la asignación.

**Architecture:** Mismo patrón que el resto de la app: Server Actions para todas las escrituras, Supabase Postgres sin RLS (todavía), lógica de negocio pura y testeable en `lib/` cuando aplica, páginas server-rendered sin capa de interactividad de cliente salvo un único componente `'use client'` mínimo para el `confirm()` de borrado.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind CSS, Supabase (Postgres + Auth), Vitest para funciones puras, Playwright para el flujo end-to-end.

## Global Constraints

- Spec source of truth: `docs/superpowers/specs/2026-08-04-cuentas-cobro-y-gestion-de-lotes-design.md`.
- RLS sigue **deshabilitado** en todas las tablas — no agregar `enable row level security` en ninguna migración de este plan.
- Ninguna de las columnas nuevas de `lotes` (`admin_id`, `acreedor_id`, `vendedor_id`, `cuenta_cobro_id`) es obligatoria al crear el lote — se completan después desde el detalle.
- Solo se puede guardar una `cuenta_cobro_id` si esa persona ya tiene `datos_transferencia` cargado, y esa persona tiene que ser una de las tres (`admin_id`/`acreedor_id`/`vendedor_id`) que se está guardando en la misma operación.
- No se construye el motor de distribución/cuentas corrientes de acreedores, ni el pase manual a Prejudicial con bloqueo de pagos, ni la edición de `cantidad_cuotas`/`monto_cuota_base`/`fecha_primera_cuota` de un lote ya creado — todo eso está fuera de alcance según la spec.
- Todas las escrituras administrativas (crear/editar/eliminar lote, editar staff) pasan por `requireAdmin()` (`lib/auth/require-admin.ts`) como primera línea, igual que el resto del código existente.
- Idioma: todo el copy de UI, comentarios (si son inevitables), nombres de variables/funciones y mensajes de commit van en español, siguiendo el resto del proyecto.
- No se agrega ninguna librería nueva (ni de UI ni de manejo de formularios) — se sigue usando HTML nativo + Server Actions, salvo el único componente cliente mínimo del Task 6.

---

### Task 1: Migración de esquema — datos de transferencia se mudan a `profiles`

**Files:**
- Create: `supabase/migrations/0006_lotes_cuenta_cobro.sql`
- Modify: `app/admin/lotes/actions.ts`
- Modify: `app/admin/lotes/nuevo/page.tsx`

**Interfaces:**
- Consumes: tablas `profiles`, `lotes` (migración `0001`)
- Produces: `profiles.datos_transferencia` (text, nullable) y `lotes.admin_id`/`acreedor_id`/`vendedor_id`/`cuenta_cobro_id` (uuid, nullable, `references profiles(id)`) — toda tarea posterior de este plan depende de estas columnas exactas. `lotes.datos_transferencia` deja de existir.

- [ ] **Step 1: Escribir la migración**

Create `supabase/migrations/0006_lotes_cuenta_cobro.sql`:

```sql
alter table public.profiles
  add column datos_transferencia text;

alter table public.lotes
  add column admin_id uuid references public.profiles(id),
  add column acreedor_id uuid references public.profiles(id),
  add column vendedor_id uuid references public.profiles(id),
  add column cuenta_cobro_id uuid references public.profiles(id),
  drop column datos_transferencia;
```

- [ ] **Step 2: Aplicar la migración**

Usar la tool `mcp__supabase__apply_migration` con `name: "lotes_cuenta_cobro"` y el SQL de arriba como `query`.

- [ ] **Step 3: Verificar**

Usar `mcp__supabase__list_tables`. Esperado: `profiles` tiene columna `datos_transferencia`; `lotes` tiene `admin_id`, `acreedor_id`, `vendedor_id`, `cuenta_cobro_id` y ya NO tiene `datos_transferencia`.

- [ ] **Step 4: Sacar el campo de texto libre del alta de lote**

`lotes.datos_transferencia` ya no existe, así que el formulario y la action que lo usaban rompen el build si no se actualizan.

Modify `app/admin/lotes/actions.ts` — sacar el manejo de `datosTransferencia` de `crearLote`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { generarCuotas } from '@/lib/lotes/generar-cuotas'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function crearLote(formData: FormData) {
  await requireAdmin()

  const supabase = await createClient()

  const identificador = formData.get('identificador') as string
  const moneda = formData.get('moneda') as 'USD' | 'ARS'
  const cantidadCuotas = Number(formData.get('cantidadCuotas'))
  const montoCuotaBase = Number(formData.get('montoCuotaBase'))
  const fechaPrimeraCuota = formData.get('fechaPrimeraCuota') as string

  const { data: lote, error: errorLote } = await supabase
    .from('lotes')
    .insert({
      identificador,
      moneda,
      cantidad_cuotas: cantidadCuotas,
      monto_cuota_base: montoCuotaBase,
      fecha_primera_cuota: fechaPrimeraCuota,
    })
    .select()
    .single()

  if (errorLote || !lote) {
    redirect(`/admin/lotes/nuevo?error=${encodeURIComponent(errorLote?.message ?? 'error desconocido')}`)
  }

  const cuotas = generarCuotas(cantidadCuotas, montoCuotaBase, fechaPrimeraCuota)

  const { error: errorCuotas } = await supabase.from('cuotas').insert(
    cuotas.map((cuota) => ({
      lote_id: lote.id,
      numero: cuota.numero,
      monto_base: cuota.montoBase,
      saldo_pendiente: cuota.montoBase,
      fecha_vencimiento: cuota.fechaVencimiento,
    }))
  )

  if (errorCuotas) {
    redirect(`/admin/lotes/nuevo?error=${encodeURIComponent(errorCuotas.message)}`)
  }

  redirect('/admin/lotes')
}
```

Modify `app/admin/lotes/nuevo/page.tsx` — sacar el `<textarea name="datosTransferencia">` y su párrafo de placeholder, dejando el resto del form igual:

```tsx
import { crearLote } from '../actions'

export default async function NuevoLotePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="max-w-md">
      <h1 className="mb-6 text-xl font-semibold">Nuevo lote</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      <form action={crearLote} className="flex flex-col gap-3">
        <input
          name="identificador"
          placeholder="Identificador (ej: Loteo San Martín - Manzana 3 - Lote 12)"
          required
          className="rounded border px-3 py-2"
        />
        <select name="moneda" required className="rounded border px-3 py-2">
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>
        <input
          name="cantidadCuotas"
          type="number"
          min="1"
          placeholder="Cantidad de cuotas"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="montoCuotaBase"
          type="number"
          step="0.01"
          min="0"
          placeholder="Monto de cada cuota"
          required
          className="rounded border px-3 py-2"
        />
        <input name="fechaPrimeraCuota" type="date" required className="rounded border px-3 py-2" />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Crear lote
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 5: Verificar que compila**

```bash
npm run build
```
Expected: build exitoso, sin errores de tipos por la columna eliminada.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0006_lotes_cuenta_cobro.sql app/admin/lotes/actions.ts app/admin/lotes/nuevo/page.tsx
git commit -m "feat: mudar datos de transferencia de lotes a profiles y agregar columnas de cobro"
```

---

### Task 2: Autoservicio — pantalla "Mi perfil"

**Files:**
- Create: `app/mi-perfil/page.tsx`
- Create: `app/mi-perfil/actions.ts`
- Modify: `app/admin/layout.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `createClient()` (`lib/supabase/server.ts`), columna `profiles.datos_transferencia` (Task 1)
- Produces: ruta `/mi-perfil` y server action `actualizarMiPerfil(formData)` — accesible para cualquier rol de staff logueado (administrador, acreedor, vendedor, cobrador), no para `cliente`.

- [ ] **Step 1: Server action**

Create `app/mi-perfil/actions.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function actualizarMiPerfil(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const fullName = formData.get('fullName') as string
  const datosTransferenciaRaw = formData.get('datosTransferencia') as string | null
  const datosTransferencia = datosTransferenciaRaw?.trim() ? datosTransferenciaRaw.trim() : null

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName, datos_transferencia: datosTransferencia })
    .eq('id', user!.id)

  if (error) {
    redirect(`/mi-perfil?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/mi-perfil?ok=1')
}
```

- [ ] **Step 2: Página**

Create `app/mi-perfil/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { actualizarMiPerfil } from './actions'

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
    .select('full_name, role, datos_transferencia')
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
      <form action={actualizarMiPerfil} className="flex flex-col gap-3">
        <label className="text-sm">
          Nombre completo
          <input
            name="fullName"
            defaultValue={perfil!.full_name}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Datos de transferencia (alias, CBU, banco)
          <textarea
            name="datosTransferencia"
            defaultValue={perfil!.datos_transferencia ?? ''}
            rows={3}
            placeholder="Alias, CBU, banco..."
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

- [ ] **Step 3: Link desde la nav de admin**

Modify `app/admin/layout.tsx`, agregar el link "Mi perfil" a la nav existente:

```tsx
      <nav className="flex gap-4 border-b p-4 text-sm">
        <a href="/admin/lotes">Lotes</a>
        <a href="/admin/pagos">Pagos</a>
        <a href="/admin/usuarios">Usuarios</a>
        <a href="/mi-perfil">Mi perfil</a>
      </nav>
```

- [ ] **Step 4: Link desde la pantalla placeholder (vendedor/cobrador)**

Modify `app/page.tsx`, el bloque final que hoy es solo texto pasa a incluir un link:

```tsx
  return (
    <main className="mx-auto mt-24 max-w-sm p-6 text-center">
      <p className="mb-4">Tu rol ({profile.role}) todavía no tiene una pantalla propia en esta versión.</p>
      <a href="/mi-perfil" className="underline">
        Cargar mis datos de transferencia
      </a>
    </main>
  )
```

- [ ] **Step 5: Verificar que compila**

```bash
npm run build
```
Expected: build exitoso.

- [ ] **Step 6: Commit**

```bash
git add app/mi-perfil app/admin/layout.tsx app/page.tsx
git commit -m "feat: pantalla de autoservicio Mi perfil para cargar datos de transferencia"
```

---

### Task 3: Admin edita datos de cualquier staff desde `/admin/usuarios`

**Files:**
- Modify: `app/admin/usuarios/actions.ts`
- Modify: `app/admin/usuarios/page.tsx`

**Interfaces:**
- Consumes: `requireAdmin()`, `createAdminClient()` (`lib/supabase/admin.ts`)
- Produces: server action `actualizarUsuarioStaff(userId: string, formData: FormData)` y el patrón de deep-link `/admin/usuarios?editar=<id>` que el Task 5 va a usar para el mensaje de error de "cuenta de cobro sin datos".

- [ ] **Step 1: Server action de edición**

Modify `app/admin/usuarios/actions.ts`, agregar al final del archivo (dejando `crearUsuarioStaff` como está):

```typescript
export async function actualizarUsuarioStaff(userId: string, formData: FormData) {
  await requireAdmin()

  const fullName = formData.get('fullName') as string
  const datosTransferenciaRaw = formData.get('datosTransferencia') as string | null
  const datosTransferencia = datosTransferenciaRaw?.trim() ? datosTransferenciaRaw.trim() : null

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ full_name: fullName, datos_transferencia: datosTransferencia })
    .eq('id', userId)

  if (error) {
    redirect(`/admin/usuarios?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/admin/usuarios')
}
```

- [ ] **Step 2: Edición inline en la tabla**

Modify `app/admin/usuarios/page.tsx` completo:

```tsx
import { createClient } from '@/lib/supabase/server'
import { crearUsuarioStaff, actualizarUsuarioStaff } from './actions'

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; editar?: string }>
}) {
  const { error, editar } = await searchParams
  const supabase = await createClient()
  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, role, datos_transferencia')
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
            const actualizarConId = actualizarUsuarioStaff.bind(null, persona.id)

            if (editar === persona.id) {
              return (
                <tr key={persona.id} className="border-b">
                  <td colSpan={4} className="py-3">
                    <form action={actualizarConId} className="flex flex-col gap-2">
                      <input
                        name="fullName"
                        defaultValue={persona.full_name}
                        required
                        className="rounded border px-3 py-2"
                      />
                      <textarea
                        name="datosTransferencia"
                        defaultValue={persona.datos_transferencia ?? ''}
                        placeholder="Alias, CBU, banco..."
                        rows={2}
                        className="rounded border px-3 py-2"
                      />
                      <button
                        type="submit"
                        className="self-start rounded bg-black px-3 py-2 text-white"
                      >
                        Guardar
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
                  {persona.datos_transferencia?.trim() ? (
                    persona.datos_transferencia
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
Expected: build exitoso.

- [ ] **Step 4: Commit**

```bash
git add app/admin/usuarios
git commit -m "feat: admin puede editar nombre y datos de transferencia de cualquier staff"
```

---

### Task 4: Detalle de lote (solo lectura) — cuotas, mora, link desde la lista

**Files:**
- Create: `app/admin/lotes/[id]/page.tsx`
- Modify: `app/admin/lotes/page.tsx`

**Interfaces:**
- Consumes: `createClient()`, `calcularEstadoCobranza(cuotas, hoy)` (`lib/cobranza/estado-cliente.ts`, ya existe, usado igual que en `app/portal-cliente/page.tsx`)
- Produces: ruta `/admin/lotes/[id]` — el Task 5 y el Task 6 modifican esta misma página para agregar edición y borrado.

- [ ] **Step 1: Página de detalle**

Create `app/admin/lotes/[id]/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { calcularEstadoCobranza } from '@/lib/cobranza/estado-cliente'
import { notFound } from 'next/navigation'

export default async function LoteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()

  const { data: lote } = await supabase
    .from('lotes')
    .select(
      'id, identificador, moneda, estado, cliente_id, admin_id, acreedor_id, vendedor_id, cuenta_cobro_id'
    )
    .eq('id', id)
    .single()

  if (!lote) {
    notFound()
  }

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, numero, monto_base, saldo_pendiente, fecha_vencimiento')
    .eq('lote_id', id)
    .order('numero', { ascending: true })

  const hoy = new Date().toISOString().slice(0, 10)
  const estado =
    lote!.estado === 'vendido'
      ? calcularEstadoCobranza(
          (cuotas ?? []).map((cuota) => ({
            saldoPendiente: cuota.saldo_pendiente,
            fechaVencimiento: cuota.fecha_vencimiento,
          })),
          hoy
        )
      : null

  const { data: cliente } = lote!.cliente_id
    ? await supabase.from('profiles').select('full_name').eq('id', lote!.cliente_id).single()
    : { data: null }

  return (
    <main className="max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">{lote!.identificador}</h1>

      <p className="mb-1 text-sm">Moneda: {lote!.moneda}</p>
      <p className="mb-1 text-sm">Estado: {lote!.estado}</p>
      {cliente && <p className="mb-1 text-sm">Cliente: {cliente.full_name}</p>}
      {estado && (
        <p className="mb-4 text-sm">
          Estado de cobranza:{' '}
          <span
            className={
              estado === 'normal'
                ? 'text-green-700'
                : estado === 'moroso'
                  ? 'text-amber-700'
                  : 'text-red-700'
            }
          >
            {estado === 'normal' ? 'Normal' : estado === 'moroso' ? 'Moroso' : 'Candidato a prejudicial'}
          </span>
        </p>
      )}

      <h2 className="mb-2 mt-6 text-lg font-semibold">Cuotas</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Cuota</th>
            <th>Vencimiento</th>
            <th>Monto base</th>
            <th>Saldo pendiente</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cuotas?.map((cuota) => {
            const vencida = cuota.saldo_pendiente > 0 && cuota.fecha_vencimiento < hoy
            return (
              <tr key={cuota.id} className="border-b">
                <td className="py-2">{cuota.numero}</td>
                <td>{cuota.fecha_vencimiento}</td>
                <td>
                  {cuota.monto_base} {lote!.moneda}
                </td>
                <td>
                  {cuota.saldo_pendiente} {lote!.moneda}
                </td>
                <td>{vencida && <span className="text-red-700">Vencida</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </main>
  )
}
```

- [ ] **Step 2: Link desde la lista de lotes**

Modify `app/admin/lotes/page.tsx`, agregar el link "Ver detalle" en la última celda de cada fila (junto a los links existentes de "Vender / asignar cliente" e "Indexar"):

```tsx
              <td>
                <a href={`/admin/lotes/${lote.id}`} className="text-sm underline">
                  Ver detalle
                </a>
                {lote.estado !== 'vendido' && (
                  <a href={`/admin/lotes/${lote.id}/vender`} className="ml-3 text-sm underline">
                    Vender / asignar cliente
                  </a>
                )}
                {lote.moneda === 'ARS' && (
                  <a href={`/admin/lotes/${lote.id}/indexar`} className="ml-3 text-sm underline">
                    Indexar
                  </a>
                )}
              </td>
```

- [ ] **Step 3: Verificar que compila**

```bash
npm run build
```
Expected: build exitoso.

- [ ] **Step 4: Commit**

```bash
git add app/admin/lotes
git commit -m "feat: detalle de lote con cuotas y estado de mora calculado"
```

---

### Task 5: Editar lote — identificador y cuenta de cobro

**Files:**
- Create: `lib/lotes/validar-cuenta-cobro.ts`
- Create: `lib/lotes/validar-cuenta-cobro.test.ts`
- Create: `app/admin/lotes/[id]/actions.ts`
- Modify: `app/admin/lotes/[id]/page.tsx`

**Interfaces:**
- Consumes: `requireAdmin()`, `createClient()`, `createAdminClient()`, columnas de Task 1, página de Task 4
- Produces: `tieneDatosTransferencia(datosTransferencia: string | null): boolean`, server actions `actualizarIdentificador(loteId, formData)` y `actualizarCobro(loteId, formData)` — el Task 6 agrega `eliminarLote` al mismo archivo de actions.

- [ ] **Step 1: Test de la función pura de validación**

Create `lib/lotes/validar-cuenta-cobro.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { tieneDatosTransferencia } from './validar-cuenta-cobro'

describe('tieneDatosTransferencia', () => {
  it('es false cuando es null', () => {
    expect(tieneDatosTransferencia(null)).toBe(false)
  })

  it('es false cuando es string vacío o solo espacios', () => {
    expect(tieneDatosTransferencia('')).toBe(false)
    expect(tieneDatosTransferencia('   ')).toBe(false)
  })

  it('es true cuando hay contenido real', () => {
    expect(tieneDatosTransferencia('Alias: juan.perez')).toBe(true)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx vitest run lib/lotes/validar-cuenta-cobro.test.ts
```
Expected: FAIL, `validar-cuenta-cobro` no existe.

- [ ] **Step 3: Implementación mínima**

Create `lib/lotes/validar-cuenta-cobro.ts`:

```typescript
export function tieneDatosTransferencia(datosTransferencia: string | null): boolean {
  return Boolean(datosTransferencia && datosTransferencia.trim().length > 0)
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npx vitest run lib/lotes/validar-cuenta-cobro.test.ts
```
Expected: `3 passed`.

- [ ] **Step 5: Server actions de edición**

Create `app/admin/lotes/[id]/actions.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/require-admin'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'

function idOVacio(valor: FormDataEntryValue | null): string | null {
  const texto = valor as string | null
  return texto && texto.trim() ? texto : null
}

export async function actualizarIdentificador(loteId: string, formData: FormData) {
  await requireAdmin()

  const identificador = formData.get('identificador') as string

  const supabase = await createClient()
  const { error } = await supabase.from('lotes').update({ identificador }).eq('id', loteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(error.message)}`)
  }

  redirect(`/admin/lotes/${loteId}`)
}

export async function actualizarCobro(loteId: string, formData: FormData) {
  await requireAdmin()

  const adminId = idOVacio(formData.get('adminId'))
  const acreedorId = idOVacio(formData.get('acreedorId'))
  const vendedorId = idOVacio(formData.get('vendedorId'))
  const cuentaCobroId = idOVacio(formData.get('cuentaCobroId'))

  if (cuentaCobroId) {
    const idsAsociados = [adminId, acreedorId, vendedorId]

    if (!idsAsociados.includes(cuentaCobroId)) {
      redirect(
        `/admin/lotes/${loteId}?error=${encodeURIComponent(
          'La cuenta de cobro tiene que ser el admin, el acreedor o el vendedor que se está asignando a este lote'
        )}`
      )
    }

    const admin = createAdminClient()
    const { data: persona } = await admin
      .from('profiles')
      .select('id, datos_transferencia')
      .eq('id', cuentaCobroId)
      .single()

    if (!persona || !tieneDatosTransferencia(persona.datos_transferencia)) {
      redirect(
        `/admin/lotes/${loteId}?error=${encodeURIComponent(
          'Esa persona todavía no tiene datos de transferencia cargados'
        )}&editarUsuario=${cuentaCobroId}`
      )
    }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('lotes')
    .update({
      admin_id: adminId,
      acreedor_id: acreedorId,
      vendedor_id: vendedorId,
      cuenta_cobro_id: cuentaCobroId,
    })
    .eq('id', loteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(error.message)}`)
  }

  redirect(`/admin/lotes/${loteId}`)
}
```

- [ ] **Step 6: Agregar los formularios al detalle del lote**

Modify `app/admin/lotes/[id]/page.tsx` completo:

```tsx
import { createClient } from '@/lib/supabase/server'
import { calcularEstadoCobranza } from '@/lib/cobranza/estado-cliente'
import { notFound } from 'next/navigation'
import { actualizarIdentificador, actualizarCobro } from './actions'

export default async function LoteDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; editarUsuario?: string }>
}) {
  const { id } = await params
  const { error, editarUsuario } = await searchParams

  const supabase = await createClient()

  const { data: lote } = await supabase
    .from('lotes')
    .select(
      'id, identificador, moneda, estado, cliente_id, admin_id, acreedor_id, vendedor_id, cuenta_cobro_id'
    )
    .eq('id', id)
    .single()

  if (!lote) {
    notFound()
  }

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, numero, monto_base, saldo_pendiente, fecha_vencimiento')
    .eq('lote_id', id)
    .order('numero', { ascending: true })

  const hoy = new Date().toISOString().slice(0, 10)
  const estado =
    lote!.estado === 'vendido'
      ? calcularEstadoCobranza(
          (cuotas ?? []).map((cuota) => ({
            saldoPendiente: cuota.saldo_pendiente,
            fechaVencimiento: cuota.fecha_vencimiento,
          })),
          hoy
        )
      : null

  const { data: cliente } = lote!.cliente_id
    ? await supabase.from('profiles').select('full_name').eq('id', lote!.cliente_id).single()
    : { data: null }

  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, role, datos_transferencia')
    .in('role', ['administrador', 'acreedor', 'vendedor'])
    .order('full_name')

  const administradores = (staff ?? []).filter((persona) => persona.role === 'administrador')
  const acreedores = (staff ?? []).filter((persona) => persona.role === 'acreedor')
  const vendedores = (staff ?? []).filter((persona) => persona.role === 'vendedor')
  const conDatos = (staff ?? []).filter((persona) => persona.datos_transferencia?.trim())

  const actualizarIdentificadorConId = actualizarIdentificador.bind(null, id)
  const actualizarCobroConId = actualizarCobro.bind(null, id)

  return (
    <main className="max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">{lote!.identificador}</h1>

      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}

      <p className="mb-1 text-sm">Moneda: {lote!.moneda}</p>
      <p className="mb-1 text-sm">Estado: {lote!.estado}</p>
      {cliente && <p className="mb-1 text-sm">Cliente: {cliente.full_name}</p>}
      {estado && (
        <p className="mb-4 text-sm">
          Estado de cobranza:{' '}
          <span
            className={
              estado === 'normal'
                ? 'text-green-700'
                : estado === 'moroso'
                  ? 'text-amber-700'
                  : 'text-red-700'
            }
          >
            {estado === 'normal' ? 'Normal' : estado === 'moroso' ? 'Moroso' : 'Candidato a prejudicial'}
          </span>
        </p>
      )}

      <h2 className="mb-2 mt-6 text-lg font-semibold">Cuotas</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Cuota</th>
            <th>Vencimiento</th>
            <th>Monto base</th>
            <th>Saldo pendiente</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cuotas?.map((cuota) => {
            const vencida = cuota.saldo_pendiente > 0 && cuota.fecha_vencimiento < hoy
            return (
              <tr key={cuota.id} className="border-b">
                <td className="py-2">{cuota.numero}</td>
                <td>{cuota.fecha_vencimiento}</td>
                <td>
                  {cuota.monto_base} {lote!.moneda}
                </td>
                <td>
                  {cuota.saldo_pendiente} {lote!.moneda}
                </td>
                <td>{vencida && <span className="text-red-700">Vencida</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Identificador</h2>
      <form action={actualizarIdentificadorConId} className="mb-8 flex gap-3">
        <input
          name="identificador"
          defaultValue={lote!.identificador}
          required
          className="flex-1 rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">
          Guardar
        </button>
      </form>

      <h2 className="mb-2 text-lg font-semibold">Cobro</h2>
      <p className="mb-3 text-sm text-gray-600">
        Asigná quiénes son el admin, el acreedor y el vendedor de este lote, y cuál de ellos recibe
        las transferencias actualmente. Solo se puede elegir como cuenta de cobro a alguien que ya
        tenga datos de transferencia cargados
        {editarUsuario && (
          <>
            {' '}
            —{' '}
            <a href={`/admin/usuarios?editar=${editarUsuario}`} className="underline">
              cargarlos ahora
            </a>
          </>
        )}
        .
      </p>
      <form action={actualizarCobroConId} className="flex flex-col gap-3">
        <label className="text-sm">
          Admin
          <select
            name="adminId"
            defaultValue={lote!.admin_id ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          >
            <option value="">— sin asignar —</option>
            {administradores.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.full_name}
                {!persona.datos_transferencia?.trim() && ' — sin datos de transferencia'}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Acreedor
          <select
            name="acreedorId"
            defaultValue={lote!.acreedor_id ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          >
            <option value="">— sin asignar —</option>
            {acreedores.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.full_name}
                {!persona.datos_transferencia?.trim() && ' — sin datos de transferencia'}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Vendedor
          <select
            name="vendedorId"
            defaultValue={lote!.vendedor_id ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          >
            <option value="">— sin asignar —</option>
            {vendedores.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.full_name}
                {!persona.datos_transferencia?.trim() && ' — sin datos de transferencia'}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Cuenta de cobro actual
          <select
            name="cuentaCobroId"
            defaultValue={lote!.cuenta_cobro_id ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          >
            <option value="">— sin asignar —</option>
            {conDatos.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.full_name} ({persona.role})
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Guardar cobro
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 7: Verificar que todo compila y los tests unitarios pasan**

```bash
npm test
npm run build
```
Expected: todos los tests en verde, build exitoso.

- [ ] **Step 8: Commit**

```bash
git add lib/lotes/validar-cuenta-cobro.ts lib/lotes/validar-cuenta-cobro.test.ts app/admin/lotes/[id]/actions.ts app/admin/lotes/[id]/page.tsx
git commit -m "feat: editar identificador y asignar cuenta de cobro desde el detalle del lote"
```

---

### Task 6: Eliminar lote

**Files:**
- Modify: `app/admin/lotes/[id]/actions.ts`
- Create: `app/admin/lotes/[id]/BotonEliminarLote.tsx`
- Modify: `app/admin/lotes/[id]/page.tsx`

**Interfaces:**
- Consumes: `requireAdmin()`, `createClient()`, página y actions del Task 5
- Produces: server action `eliminarLote(loteId: string)`, componente cliente `BotonEliminarLote`

- [ ] **Step 1: Server action con guarda de seguridad**

Modify `app/admin/lotes/[id]/actions.ts`, agregar al final:

```typescript
export async function eliminarLote(loteId: string) {
  await requireAdmin()

  const supabase = await createClient()

  const { data: cuotas } = await supabase.from('cuotas').select('id').eq('lote_id', loteId)
  const cuotaIds = (cuotas ?? []).map((cuota) => cuota.id)

  if (cuotaIds.length > 0) {
    const { count } = await supabase
      .from('pago_imputaciones')
      .select('id', { count: 'exact', head: true })
      .in('cuota_id', cuotaIds)

    if (count && count > 0) {
      redirect(
        `/admin/lotes/${loteId}?error=${encodeURIComponent(
          'No se puede eliminar: este lote ya tiene pagos imputados'
        )}`
      )
    }
  }

  const { error } = await supabase.from('lotes').delete().eq('id', loteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/admin/lotes')
}
```

- [ ] **Step 2: Botón con confirmación**

`confirm()` del navegador requiere un manejador de evento, así que este es el único componente `'use client'` de este plan.

Create `app/admin/lotes/[id]/BotonEliminarLote.tsx`:

```tsx
'use client'

export function BotonEliminarLote({
  eliminarLoteAction,
}: {
  eliminarLoteAction: () => void
}) {
  return (
    <form
      action={eliminarLoteAction}
      onSubmit={(evento) => {
        if (!confirm('¿Seguro que querés eliminar este lote? No se puede deshacer.')) {
          evento.preventDefault()
        }
      }}
    >
      <button type="submit" className="rounded bg-red-600 px-3 py-2 text-sm text-white">
        Eliminar lote
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Agregar el botón al detalle del lote**

Modify `app/admin/lotes/[id]/page.tsx`:

Agregar el import junto a los demás:

```tsx
import { actualizarIdentificador, actualizarCobro, eliminarLote } from './actions'
import { BotonEliminarLote } from './BotonEliminarLote'
```

Agregar el bind junto a los otros dos:

```tsx
  const eliminarLoteConId = eliminarLote.bind(null, id)
```

Cambiar el `<h1>` del inicio de la página para que quede junto al botón:

```tsx
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{lote!.identificador}</h1>
        <BotonEliminarLote eliminarLoteAction={eliminarLoteConId} />
      </div>
```

(reemplaza la línea `<h1 className="mb-6 text-xl font-semibold">{lote!.identificador}</h1>` existente)

- [ ] **Step 4: Verificar que compila**

```bash
npm run build
```
Expected: build exitoso.

- [ ] **Step 5: Commit**

```bash
git add app/admin/lotes/[id]
git commit -m "feat: eliminar lote, bloqueado si ya tiene pagos imputados"
```

---

### Task 7: El cliente ve la cuenta de cobro correcta al pagar

**Files:**
- Modify: `app/portal-cliente/pagar/[id]/page.tsx`

**Interfaces:**
- Consumes: `lotes.cuenta_cobro_id` (Task 1), `profiles.datos_transferencia` (Task 1)
- Produces: nada nuevo — es el último punto de consumo de la cadena `lotes.cuenta_cobro_id → profiles.datos_transferencia`

- [ ] **Step 1: Resolver los datos de transferencia vía la cuenta de cobro**

Modify `app/portal-cliente/pagar/[id]/page.tsx` completo:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { registrarPago } from './actions'

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

  let datosTransferencia: string | null = null

  if (lote?.cuenta_cobro_id) {
    const { data: cuentaCobro } = await supabase
      .from('profiles')
      .select('datos_transferencia')
      .eq('id', lote.cuenta_cobro_id)
      .single()

    datosTransferencia = cuentaCobro?.datos_transferencia ?? null
  }

  const registrarPagoConId = registrarPago.bind(null, id)

  return (
    <main className="mx-auto mt-12 max-w-md p-6">
      <h1 className="mb-6 text-xl font-semibold">Registrar pago</h1>
      <p className="mb-6 rounded bg-gray-100 p-3 text-sm">
        {datosTransferencia
          ? `Datos para transferir: ${datosTransferencia}`
          : 'Consultá los datos de la cuenta con SIMA Inmobiliaria.'}
      </p>
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
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add app/portal-cliente/pagar/\[id\]/page.tsx
git commit -m "feat: el cliente ve los datos de transferencia de la cuenta de cobro asignada al lote"
```

---

### Task 8: Tests end-to-end del flujo de cuenta de cobro

**Files:**
- Modify: `tests/e2e/fixtures/test-data.ts`
- Create: `tests/e2e/cuenta-cobro.spec.ts`

**Interfaces:**
- Consumes: `ensureTestFixtures()`, `login()`/`logout()` (`tests/e2e/utils/login.ts`), rutas y forms de los Tasks 4-7
- Produces: `TestFixtures.acreedorConDatos` — nuevo campo que cualquier spec E2E futuro puede reusar como "acreedor con datos de transferencia ya cargados"

- [ ] **Step 1: Agregar un cuarto usuario de prueba, con datos de transferencia ya cargados**

Modify `tests/e2e/fixtures/test-data.ts`.

Agregar a `TEST_USERS`:

```typescript
  acreedorConDatos: {
    email: 'test-acreedor-cobro@sima-e2e.invalid',
    fullName: 'E2E Acreedor Con Datos',
    role: 'acreedor' as const,
  },
```

Agregar el campo al final de la interfaz `TestFixtures`:

```typescript
export interface TestFixtures {
  admin: { id: string; email: string }
  acreedor: { id: string; email: string }
  acreedorConDatos: { id: string; email: string }
  cliente: { id: string; email: string }
  password: string
  loteId: string
  cuotaIds: string[]
}
```

Modify la firma de `ensureTestUser` para aceptar datos de transferencia opcionales, y pasarlos al upsert:

```typescript
async function ensureTestUser(
  admin: AdminClient,
  config: {
    email: string
    fullName: string
    role: 'administrador' | 'acreedor' | 'cliente'
    datosTransferencia?: string
  }
) {
  let userId: string

  const existente = await buscarUsuarioPorEmail(admin, config.email)

  if (existente) {
    userId = existente.id
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: config.email,
      password: TEST_PASSWORD,
      email_confirm: true,
    })

    if (error || !data.user) {
      throw new Error(`No se pudo crear el usuario de prueba ${config.email}: ${error?.message}`)
    }

    userId = data.user.id
  }

  const { error: errorProfile } = await admin.from('profiles').upsert({
    id: userId,
    role: config.role,
    full_name: config.fullName,
    datos_transferencia: config.datosTransferencia ?? null,
  })

  if (errorProfile) {
    throw new Error(`No se pudo upsertear el profile de ${config.email}: ${errorProfile.message}`)
  }

  return { id: userId, email: config.email }
}
```

Modify el `Promise.all` dentro de `ensureTestFixtures()`:

```typescript
  const [administrador, acreedor, cliente, acreedorConDatos] = await Promise.all([
    ensureTestUser(admin, TEST_USERS.administrador),
    ensureTestUser(admin, TEST_USERS.acreedor),
    ensureTestUser(admin, TEST_USERS.cliente),
    ensureTestUser(admin, {
      ...TEST_USERS.acreedorConDatos,
      datosTransferencia: 'Alias: acreedor.cobro · CBU: 0000003100000000000001 · Banco: Test Bank',
    }),
  ])
```

Modify el `return` final de `ensureTestFixtures()`:

```typescript
  return {
    admin: administrador,
    acreedor,
    acreedorConDatos,
    cliente,
    password: TEST_PASSWORD,
    loteId: lote.id,
    cuotaIds: cuotas.map((c) => c.id),
  }
```

- [ ] **Step 2: Nuevo spec E2E**

Create `tests/e2e/cuenta-cobro.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'
import { ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login, logout } from './utils/login'

// Igual que en pago-flujo-completo.spec.ts: la base es compartida con datos
// reales creados a mano por fuera de estos tests, así que ubicamos "el" lote
// de prueba por su identificador único en vez de asumir que es el primero
// de la lista.
function filaDelLoteDePrueba(page: import('@playwright/test').Page) {
  return page.getByRole('row', { name: /E2E Test Lote/ })
}

test.describe('Cuenta de cobro por lote', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('admin asigna una cuenta de cobro y el cliente ve esos datos al pagar', async ({ page }) => {
    await test.step('login como admin y entra al detalle del lote de prueba', async () => {
      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto('/admin/lotes')
      await filaDelLoteDePrueba(page).getByRole('link', { name: 'Ver detalle' }).click()
      await page.waitForURL(/\/admin\/lotes\/.+$/)
    })

    await test.step('asigna al acreedor con datos como cuenta de cobro', async () => {
      await page.selectOption('select[name="acreedorId"]', { label: /E2E Acreedor Con Datos/ })
      await page.selectOption('select[name="cuentaCobroId"]', { label: /E2E Acreedor Con Datos/ })
      await page.getByRole('button', { name: 'Guardar cobro' }).click()
      await page.waitForURL(/\/admin\/lotes\/.+$/)
      await expect(page.locator('select[name="cuentaCobroId"]')).toHaveValue(
        fixtures.acreedorConDatos.id
      )
    })

    await test.step('el cliente ve los datos de transferencia del acreedor asignado al pagar', async () => {
      await logout(page)
      await login(page, fixtures.cliente.email, fixtures.password)
      await page.goto('/portal-cliente')

      const filaCuota1 = page.locator('main table').nth(0).locator('tbody tr').nth(0)
      await filaCuota1.getByRole('link', { name: 'Pagar cuota' }).click()
      await page.waitForURL(/\/portal-cliente\/pagar\//)

      await expect(page.getByText('acreedor.cobro')).toBeVisible()
    })
  })

  test('una persona sin datos de transferencia no aparece como opción de cuenta de cobro', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')
    await filaDelLoteDePrueba(page).getByRole('link', { name: 'Ver detalle' }).click()
    await page.waitForURL(/\/admin\/lotes\/.+$/)

    const opcionesCuentaCobro = await page
      .locator('select[name="cuentaCobroId"] option')
      .allTextContents()

    // El acreedor de prueba "de a secas" (sin datos de transferencia
    // cargados) nunca puede figurar como opción de cuenta de cobro, aunque
    // sí pueda elegirse como acreedor del lote.
    expect(opcionesCuentaCobro.some((texto) => texto.trim() === 'E2E Acreedor (acreedor)')).toBe(
      false
    )
  })
})
```

- [ ] **Step 3: Correr el suite completo de Playwright**

```bash
npx playwright test
```
Expected: todos los specs en verde, incluyendo `cuenta-cobro.spec.ts` (2 tests) y los ya existentes (`auth.spec.ts`, `pago-flujo-completo.spec.ts`).

- [ ] **Step 4: Correr también los unitarios, para confirmar que nada quedó roto**

```bash
npm test
```
Expected: todos los tests en verde.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e
git commit -m "test: cobertura e2e de asignacion de cuenta de cobro por lote"
```

---

## Verificación final

Después del Task 8, correr una vez más ambos suites juntos para confirmar que la secuencia completa de tasks no dejó nada roto:

```bash
npm test && npx playwright test
```

Expected: `npm test` en verde (incluye el nuevo `validar-cuenta-cobro.test.ts`) y `npx playwright test` en verde (incluye `auth.spec.ts`, `pago-flujo-completo.spec.ts` y el nuevo `cuenta-cobro.spec.ts`).
