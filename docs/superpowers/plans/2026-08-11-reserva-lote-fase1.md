# Reserva de lote (fase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el salto directo `disponible → vendido` por un paso intermedio real de **reserva** (datos del comprador + seña + comprobante), utilizable por administrador, acreedor, vendedor y cobrador — abriendo por primera vez acceso acotado a `/admin/*` para estos dos últimos roles.

**Architecture:** Mismo patrón de siempre: Server Components para lectura + Server Actions para escritura, chequeos de autorización en `lib/auth/require-admin.ts` reutilizados tanto en la página como en la action (defensa en profundidad), sin RLS (deshabilitado en todo el proyecto, no se toca acá). El "claim" atómico de `lotes.estado` (update condicionado por `WHERE estado = 'disponible'`) sigue el mismo patrón ya usado para el claim de pagos en `confirmarPago`/`subirComprobante`.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind CSS, Supabase (Postgres + Auth + Storage), Vitest, Playwright.

## Global Constraints

- Spec source de verdad: `docs/superpowers/specs/2026-08-11-reserva-lote-fase1-design.md`.
- RLS sigue deshabilitado en todo el proyecto — no se toca acá. Toda la autorización vive en Server Actions/guards, como en el resto de la app.
- No se agrega ninguna librería nueva.
- Idioma: todo el copy de UI, nombres de variables/funciones y mensajes de commit en español.
- `/admin/lotes/[id]/vender` **no se toca en esta tanda** — sigue funcionando exactamente igual que hoy (sin chequeo de `estado`), lo cual como efecto colateral ya permite venderlo tanto desde `disponible` como desde `reservado`. Es intencional, ver spec.
- Fuera de alcance explícito (no construir nada de esto): cancelar una reserva, rediseño de "pase a vendido" con boleto/escritura real, caja/efectivo, motor de comisiones, fotos de DNI/cónyuge/divorcio (fase 2).
- El selector "quién recibió la seña" muestra nombre + rol de TODO el staff (administrador/acreedor/vendedor/cobrador), sin acotar por acreedor — decisión deliberada: a diferencia de la visibilidad acotada de `/admin/usuarios` (que protege que un acreedor vea la red de negocio de otro acreedor), acá solo se exponen nombres y roles de compañeros de la misma oficina para un propósito puntual (atribuir quién recibió físicamente la seña), no datos bancarios ni de negocio.
- Si la subida del comprobante o el insert de `reservas` fallan DESPUÉS de que el lote ya quedó reclamado como `reservado` (el `update` atómico ya se aplicó), el lote queda en un estado inconsistente que requiere arreglo manual. Es un riesgo aceptado, igual que el archivo huérfano que puede quedar en el bucket `comprobantes` si `subirComprobante` falla después de subir el archivo — no hay transacciones en este proyecto, no se agregan acá.
- Principio de UX (del spec): pantallas para vendedor/cobrador deben sentirse completas por sí solas, no una versión recortada de la de admin; mensajes de error en español llano; el caso común (recibido por uno mismo) no debe pedir un click de más.

---

### Task 1: Migración de schema — tabla `reservas` + enums

**Files:**
- Create: `supabase/migrations/0008_reservas.sql`

**Interfaces:**
- Produces: tabla `public.reservas` (columnas: `id`, `lote_id`, `nombre_completo`, `dni`, `domicilio`, `email`, `telefono`, `telefono_alternativo`, `estado_civil`, `instrumentacion`, `monto_sena`, `moneda_sena`, `recibido_por`, `recibido_por_otro`, `comprobante_sena_path`, `created_by`, `created_at`); enums `public.estado_civil` (`soltero`/`casado`/`divorciado`/`viudo`) y `public.instrumentacion` (`boleto`/`escritura`).

- [ ] **Step 1: Escribir la migración**

Create `supabase/migrations/0008_reservas.sql`:

```sql
create type public.estado_civil as enum ('soltero', 'casado', 'divorciado', 'viudo');
create type public.instrumentacion as enum ('boleto', 'escritura');

create table public.reservas (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes(id) on delete cascade,
  nombre_completo text not null,
  dni text not null,
  domicilio text not null,
  email text not null,
  telefono text not null,
  telefono_alternativo text,
  estado_civil public.estado_civil not null,
  instrumentacion public.instrumentacion,
  monto_sena numeric(14,2) not null,
  moneda_sena public.moneda not null,
  recibido_por uuid references public.profiles(id),
  recibido_por_otro text,
  comprobante_sena_path text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint reservas_recibido_por_check check (
    (recibido_por is not null) or (recibido_por_otro is not null)
  )
);

-- Antes de esta tanda, el admin podía asignar un vendedor a cualquier lote a
-- mano, sin relación con una reserva real. A partir de ahora, vendedor_id de
-- un lote disponible recién se completa cuando alguien lo reserva -- limpiamos
-- cualquier asignación previa que haya quedado en lotes que siguen disponibles
-- (los ya reservados/vendidos no se tocan, esa asignación histórica sigue
-- siendo válida).
update public.lotes set vendedor_id = null where estado = 'disponible';
```

- [ ] **Step 2: Aplicar la migración**

Usar `mcp__supabase__apply_migration` con `name: "reservas"` y el SQL de arriba como `query`.

- [ ] **Step 3: Verificar**

Usar `mcp__supabase__list_tables`. Esperado: existe `public.reservas` con las columnas de arriba, y los enums `estado_civil`/`instrumentacion` existen.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0008_reservas.sql
git commit -m "feat: tabla reservas y enums estado_civil/instrumentacion"
```

---

### Task 2: Funciones puras — validación de "recibido por" y asignación de vendedor

**Files:**
- Create: `lib/reservas/validar-recibido-por.ts`
- Create: `lib/reservas/validar-recibido-por.test.ts`
- Create: `lib/lotes/asignar-vendedor-al-reservar.ts`
- Create: `lib/lotes/asignar-vendedor-al-reservar.test.ts`

**Interfaces:**
- Produces: `tieneRecibidoPorValido(datos: { recibidoPor: string | null; recibidoPorOtro: string | null }): boolean`; `vendedorIdAlReservar(rolQuienReserva: string, userId: string): string | null`. La Task 6 (Server Action `reservarLote`) consume ambas.

- [ ] **Step 1: Escribir el test de `tieneRecibidoPorValido`**

Create `lib/reservas/validar-recibido-por.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { tieneRecibidoPorValido } from './validar-recibido-por'

describe('tieneRecibidoPorValido', () => {
  it('es false cuando los dos campos son null', () => {
    expect(tieneRecibidoPorValido({ recibidoPor: null, recibidoPorOtro: null })).toBe(false)
  })

  it('es false cuando recibidoPorOtro es solo espacios', () => {
    expect(tieneRecibidoPorValido({ recibidoPor: null, recibidoPorOtro: '   ' })).toBe(false)
  })

  it('es true cuando hay un recibidoPor (id de perfil) cargado', () => {
    expect(tieneRecibidoPorValido({ recibidoPor: 'uuid-de-perfil', recibidoPorOtro: null })).toBe(
      true
    )
  })

  it('es true cuando hay un recibidoPorOtro con contenido real', () => {
    expect(
      tieneRecibidoPorValido({ recibidoPor: null, recibidoPorOtro: 'Persona Externa' })
    ).toBe(true)
  })

  it('es true si por algún motivo llegan los dos cargados', () => {
    expect(
      tieneRecibidoPorValido({ recibidoPor: 'uuid-de-perfil', recibidoPorOtro: 'Persona Externa' })
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx vitest run lib/reservas/validar-recibido-por.test.ts
```
Expected: FAIL — el módulo `./validar-recibido-por` todavía no existe.

- [ ] **Step 3: Implementación**

Create `lib/reservas/validar-recibido-por.ts`:

```typescript
export interface RecibidoPor {
  recibidoPor: string | null
  recibidoPorOtro: string | null
}

export function tieneRecibidoPorValido(datos: RecibidoPor): boolean {
  return Boolean(datos.recibidoPor) || Boolean(datos.recibidoPorOtro?.trim())
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npx vitest run lib/reservas/validar-recibido-por.test.ts
```
Expected: `5 passed`.

- [ ] **Step 5: Escribir el test de `vendedorIdAlReservar`**

Create `lib/lotes/asignar-vendedor-al-reservar.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { vendedorIdAlReservar } from './asignar-vendedor-al-reservar'

describe('vendedorIdAlReservar', () => {
  it('asigna a quien reserva si su rol es vendedor', () => {
    expect(vendedorIdAlReservar('vendedor', 'uuid-del-vendedor')).toBe('uuid-del-vendedor')
  })

  it('no asigna a nadie si reserva un cobrador', () => {
    expect(vendedorIdAlReservar('cobrador', 'uuid-del-cobrador')).toBeNull()
  })

  it('no asigna a nadie si reserva un administrador', () => {
    expect(vendedorIdAlReservar('administrador', 'uuid-del-admin')).toBeNull()
  })

  it('no asigna a nadie si reserva un acreedor', () => {
    expect(vendedorIdAlReservar('acreedor', 'uuid-del-acreedor')).toBeNull()
  })
})
```

- [ ] **Step 6: Correr el test y verificar que falla**

```bash
npx vitest run lib/lotes/asignar-vendedor-al-reservar.test.ts
```
Expected: FAIL — el módulo `./asignar-vendedor-al-reservar` todavía no existe.

- [ ] **Step 7: Implementación**

Create `lib/lotes/asignar-vendedor-al-reservar.ts`:

```typescript
export function vendedorIdAlReservar(rolQuienReserva: string, userId: string): string | null {
  return rolQuienReserva === 'vendedor' ? userId : null
}
```

- [ ] **Step 8: Correr el test y verificar que pasa**

```bash
npx vitest run lib/lotes/asignar-vendedor-al-reservar.test.ts
```
Expected: `4 passed`.

- [ ] **Step 9: Commit**

```bash
git add lib/reservas/validar-recibido-por.ts lib/reservas/validar-recibido-por.test.ts lib/lotes/asignar-vendedor-al-reservar.ts lib/lotes/asignar-vendedor-al-reservar.test.ts
git commit -m "feat: funciones puras de validacion de reserva (recibido-por, asignacion de vendedor)"
```

---

### Task 3: Guard de acceso para reservar

**Files:**
- Modify: `lib/auth/require-admin.ts`

**Interfaces:**
- Consumes: `createClient()` de `@/lib/supabase/server`
- Produces: `requireAccesoParaReservar(loteId: string): Promise<void>` — deja pasar a `administrador` (cualquier lote), `vendedor`/`cobrador` (cualquier lote), y `acreedor` (solo si es dueño de ese lote); redirige a `/login` si no hay sesión o el rol no tiene acceso, y a `/admin/lotes` si es un acreedor sobre un lote ajeno. Las Tasks 5 y 6 la consumen.

- [ ] **Step 1: Agregar la función al archivo existente**

Modify `lib/auth/require-admin.ts`. Agregar al final del archivo (después de `requireAdminSobreLote`):

```typescript
export async function requireAccesoParaReservar(loteId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const rolesConAcceso = ['administrador', 'acreedor', 'vendedor', 'cobrador']

  if (!profile || !rolesConAcceso.includes(profile.role)) {
    redirect('/login')
  }

  if (profile!.role === 'acreedor') {
    const { data: lote } = await supabase
      .from('lotes')
      .select('acreedor_id')
      .eq('id', loteId)
      .single()

    if (!lote || lote.acreedor_id !== user!.id) {
      redirect('/admin/lotes')
    }
  }
}
```

- [ ] **Step 2: Verificar que compila**

```bash
npm run build
```
Expected: build exitoso (esta función todavía no la usa nadie, pero no rompe nada existente).

- [ ] **Step 3: Commit**

```bash
git add lib/auth/require-admin.ts
git commit -m "feat: guard de acceso para reservar lotes (admin, acreedor dueno, vendedor, cobrador)"
```

---

### Task 4: Acceso de vendedor/cobrador a `/admin` — layout, nav, ruteo raíz, detalle de lote

**Files:**
- Modify: `app/admin/layout.tsx`
- Modify: `components/NavAdmin.tsx`
- Modify: `app/page.tsx`
- Modify: `app/mi-perfil/page.tsx`
- Modify: `app/admin/lotes/[id]/page.tsx`

**Interfaces:**
- Produces: `NavAdmin({ role }: { role: string })` — firma nueva, ahora requiere `role` (antes no tomaba props). Todos los call sites se actualizan en esta misma task.

- [ ] **Step 1: `NavAdmin` oculta Pagos/Usuarios para vendedor y cobrador**

Modify `components/NavAdmin.tsx` completo:

```tsx
export function NavAdmin({ role }: { role: string }) {
  const puedeVerPagosYUsuarios = role === 'administrador' || role === 'acreedor'

  return (
    <nav className="flex gap-4 border-b p-4 text-sm">
      <a href="/admin/lotes">Lotes</a>
      {puedeVerPagosYUsuarios && <a href="/admin/pagos">Pagos</a>}
      {puedeVerPagosYUsuarios && <a href="/admin/usuarios">Usuarios</a>}
      <a href="/mi-perfil">Mi perfil</a>
    </nav>
  )
}
```

- [ ] **Step 2: `app/admin/layout.tsx` deja entrar a vendedor y cobrador**

Modify `app/admin/layout.tsx`. Cambiar:
```tsx
  if (profile.role !== 'administrador' && profile.role !== 'acreedor') {
    redirect('/')
  }

  return (
    <div>
      <NavAdmin />
      <div className="p-6">{children}</div>
    </div>
  )
```
por:
```tsx
  const rolesConAcceso = ['administrador', 'acreedor', 'vendedor', 'cobrador']

  if (!rolesConAcceso.includes(profile.role)) {
    redirect('/')
  }

  return (
    <div>
      <NavAdmin role={profile.role} />
      <div className="p-6">{children}</div>
    </div>
  )
```

- [ ] **Step 3: `app/page.tsx` redirige a vendedor/cobrador a `/admin` (que a su vez redirige a `/admin/lotes`)**

Modify `app/page.tsx`. Cambiar:
```tsx
  if (profile.role === 'administrador' || profile.role === 'acreedor') {
    redirect('/admin')
  }
```
por:
```tsx
  const rolesConAcceso = ['administrador', 'acreedor', 'vendedor', 'cobrador']

  if (rolesConAcceso.includes(profile.role)) {
    redirect('/admin')
  }
```

- [ ] **Step 4: `Mi perfil` muestra la nav para los 4 roles de staff**

Modify `app/mi-perfil/page.tsx`. Cambiar:
```tsx
      {(perfil!.role === 'administrador' || perfil!.role === 'acreedor') && <NavAdmin />}
```
por:
```tsx
      {['administrador', 'acreedor', 'vendedor', 'cobrador'].includes(perfil!.role) && (
        <NavAdmin role={perfil!.role} />
      )}
```

- [ ] **Step 5: El detalle completo de un lote sigue bloqueado para vendedor/cobrador**

Modify `app/admin/lotes/[id]/page.tsx`. Cambiar:
```tsx
  if (!perfilPropio) {
    redirect('/login')
  }

  const { data: lote } = await supabase
```
por:
```tsx
  if (!perfilPropio) {
    redirect('/login')
  }

  if (perfilPropio!.role === 'vendedor' || perfilPropio!.role === 'cobrador') {
    redirect('/admin/lotes')
  }

  const { data: lote } = await supabase
```

- [ ] **Step 6: Verificar que compila**

```bash
npm run build
```
Expected: build exitoso.

- [ ] **Step 7: Commit**

```bash
git add app/admin/layout.tsx components/NavAdmin.tsx app/page.tsx app/mi-perfil/page.tsx "app/admin/lotes/[id]/page.tsx"
git commit -m "feat: abrir acceso acotado de admin a vendedor y cobrador"
```

---

### Task 5: `/admin/lotes` — listado filtrado por rol + link "Reservar"

**Files:**
- Modify: `app/admin/lotes/page.tsx`

**Interfaces:**
- Consumes: nada nuevo de tasks anteriores (solo lee `role` de `profiles` como ya hacía).
- Produces: nada nuevo — solo cambia qué se renderiza según rol.

- [ ] **Step 1: Filtrar y ocultar columnas/acciones para vendedor y cobrador**

Modify `app/admin/lotes/page.tsx` completo:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function LotesPage() {
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

  const esVendedorOCobrador = perfilPropio!.role === 'vendedor' || perfilPropio!.role === 'cobrador'

  let queryLotes = supabase
    .from('lotes')
    .select('id, identificador, moneda, estado, cantidad_cuotas')
    .order('created_at', { ascending: false })

  if (perfilPropio!.role === 'acreedor') {
    queryLotes = queryLotes.eq('acreedor_id', user!.id)
  }

  if (esVendedorOCobrador) {
    queryLotes = queryLotes.eq('estado', 'disponible')
  }

  const { data: lotes } = await queryLotes

  return (
    <main>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Lotes</h1>
        {!esVendedorOCobrador && (
          <a href="/admin/lotes/nuevo" className="rounded bg-black px-3 py-2 text-sm text-white">
            + Nuevo lote
          </a>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Identificador</th>
            <th>Moneda</th>
            <th>Estado</th>
            {!esVendedorOCobrador && <th>Cuotas</th>}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lotes?.map((lote) => (
            <tr key={lote.id} className="border-b">
              <td className="py-2">{lote.identificador}</td>
              <td>{lote.moneda}</td>
              <td>{lote.estado}</td>
              {!esVendedorOCobrador && <td>{lote.cantidad_cuotas}</td>}
              <td>
                {esVendedorOCobrador ? (
                  <a href={`/admin/lotes/${lote.id}/reservar`} className="text-sm underline">
                    Reservar
                  </a>
                ) : (
                  <>
                    <a href={`/admin/lotes/${lote.id}`} className="text-sm underline">
                      Ver detalle
                    </a>
                    {lote.estado === 'disponible' && (
                      <a
                        href={`/admin/lotes/${lote.id}/reservar`}
                        className="ml-3 text-sm underline"
                      >
                        Reservar
                      </a>
                    )}
                    {lote.estado !== 'vendido' && (
                      <a href={`/admin/lotes/${lote.id}/vender`} className="ml-3 text-sm underline">
                        Vender / asignar cliente
                      </a>
                    )}
                    {lote.moneda === 'ARS' && (
                      <a
                        href={`/admin/lotes/${lote.id}/indexar`}
                        className="ml-3 text-sm underline"
                      >
                        Indexar
                      </a>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
git add app/admin/lotes/page.tsx
git commit -m "feat: listado de lotes filtrado por rol y link para reservar"
```

---

### Task 6: Nueva ruta `/admin/lotes/[id]/reservar`

**Files:**
- Create: `app/admin/lotes/[id]/reservar/page.tsx`
- Create: `app/admin/lotes/[id]/reservar/actions.ts`

**Interfaces:**
- Consumes: `requireAccesoParaReservar(loteId)` (Task 3), `tieneRecibidoPorValido` (Task 2), `vendedorIdAlReservar` (Task 2), `createClient()`, `createAdminClient()`.
- Produces: `reservarLote(loteId: string, formData: FormData): Promise<void>` Server Action. Nombres de campos del form (consumidos por la Task 8 vía Playwright): `nombreCompleto`, `dni`, `domicilio`, `email`, `telefono`, `telefonoAlternativo`, `estadoCivil`, `instrumentacion`, `montoSena`, `monedaSena`, `recibidoPor`, `recibidoPorOtro`, `comprobante`.

- [ ] **Step 1: La Server Action**

Create `app/admin/lotes/[id]/reservar/actions.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAccesoParaReservar } from '@/lib/auth/require-admin'
import { tieneRecibidoPorValido } from '@/lib/reservas/validar-recibido-por'
import { vendedorIdAlReservar } from '@/lib/lotes/asignar-vendedor-al-reservar'

export async function reservarLote(loteId: string, formData: FormData) {
  await requireAccesoParaReservar(loteId)

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: perfilPropio } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const nombreCompleto = formData.get('nombreCompleto') as string
  const dni = formData.get('dni') as string
  const domicilio = formData.get('domicilio') as string
  const email = formData.get('email') as string
  const telefono = formData.get('telefono') as string
  const telefonoAlternativo = ((formData.get('telefonoAlternativo') as string) || '').trim() || null
  const estadoCivil = formData.get('estadoCivil') as string
  const instrumentacion = ((formData.get('instrumentacion') as string) || '').trim() || null
  const montoSena = Number(formData.get('montoSena'))
  const monedaSena = formData.get('monedaSena') as string
  const recibidoPor = ((formData.get('recibidoPor') as string) || '').trim() || null
  const recibidoPorOtro = ((formData.get('recibidoPorOtro') as string) || '').trim() || null
  const comprobante = formData.get('comprobante') as File

  if (!tieneRecibidoPorValido({ recibidoPor, recibidoPorOtro })) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent(
        'Indicá quién recibió la seña, de la lista o escribiendo el nombre'
      )}`
    )
  }

  if (!comprobante || comprobante.size === 0) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('Subí el comprobante de la seña')}`
    )
  }

  const admin = createAdminClient()

  const nuevoVendedorId = vendedorIdAlReservar(perfilPropio!.role, user!.id)

  // Claim atomico: el update solo pega si el lote SIGUE disponible en este
  // instante (mismo patron que el claim de pagos en confirmarPago /
  // subirComprobante). Si alguien lo reservo un segundo antes, esto no
  // afecta ninguna fila y lo tratamos como "ya no disponible".
  const { data: loteReservado, error: errorLote } = await admin
    .from('lotes')
    .update({
      estado: 'reservado',
      ...(nuevoVendedorId ? { vendedor_id: nuevoVendedorId } : {}),
    })
    .eq('id', loteId)
    .eq('estado', 'disponible')
    .select('id')
    .single()

  if (errorLote || !loteReservado) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent(
        'Este lote ya no está disponible para reservar'
      )}`
    )
  }

  const comprobantePath = `reservas/${loteId}/${Date.now()}-${comprobante.name}`

  const { error: errorUpload } = await admin.storage
    .from('comprobantes')
    .upload(comprobantePath, comprobante)

  if (errorUpload) {
    redirect(`/admin/lotes/${loteId}/reservar?error=${encodeURIComponent(errorUpload.message)}`)
  }

  const { error: errorReserva } = await admin.from('reservas').insert({
    lote_id: loteId,
    nombre_completo: nombreCompleto,
    dni,
    domicilio,
    email,
    telefono,
    telefono_alternativo: telefonoAlternativo,
    estado_civil: estadoCivil,
    instrumentacion,
    monto_sena: montoSena,
    moneda_sena: monedaSena,
    recibido_por: recibidoPor,
    recibido_por_otro: recibidoPorOtro,
    comprobante_sena_path: comprobantePath,
    created_by: user!.id,
  })

  if (errorReserva) {
    redirect(`/admin/lotes/${loteId}/reservar?error=${encodeURIComponent(errorReserva.message)}`)
  }

  redirect('/admin/lotes')
}
```

- [ ] **Step 2: La página con el formulario**

Create `app/admin/lotes/[id]/reservar/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { requireAccesoParaReservar } from '@/lib/auth/require-admin'
import { reservarLote } from './actions'

export default async function ReservarLotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams

  await requireAccesoParaReservar(id)

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: lote } = await supabase
    .from('lotes')
    .select('id, identificador, estado')
    .eq('id', id)
    .single()

  if (!lote) {
    notFound()
  }

  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['administrador', 'acreedor', 'vendedor', 'cobrador'])
    .order('full_name')

  const reservarLoteConId = reservarLote.bind(null, id)

  return (
    <main className="max-w-md">
      <h1 className="mb-6 text-xl font-semibold">Reservar {lote!.identificador}</h1>

      {lote!.estado !== 'disponible' ? (
        <>
          <p className="mb-4 rounded bg-amber-100 p-2 text-sm text-amber-800">
            Este lote ya no está disponible para reservar (estado actual: {lote!.estado}).
          </p>
          <a href="/admin/lotes" className="text-sm underline">
            Volver a Lotes
          </a>
        </>
      ) : (
        <form action={reservarLoteConId} className="flex flex-col gap-3">
          {error && <p className="rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}

          <input
            name="nombreCompleto"
            placeholder="Nombre completo"
            required
            className="rounded border px-3 py-2"
          />
          <input name="dni" placeholder="DNI" required className="rounded border px-3 py-2" />
          <input
            name="domicilio"
            placeholder="Domicilio"
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
          <input
            name="telefono"
            placeholder="Teléfono"
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="telefonoAlternativo"
            placeholder="Teléfono alternativo (opcional)"
            className="rounded border px-3 py-2"
          />

          <label className="text-sm">
            Estado civil
            <select
              name="estadoCivil"
              required
              className="mt-1 block w-full rounded border px-3 py-2"
            >
              <option value="soltero">Soltero/a</option>
              <option value="casado">Casado/a</option>
              <option value="divorciado">Divorciado/a</option>
              <option value="viudo">Viudo/a</option>
            </select>
          </label>

          <label className="text-sm">
            Instrumentación prevista (opcional)
            <select
              name="instrumentacion"
              defaultValue=""
              className="mt-1 block w-full rounded border px-3 py-2"
            >
              <option value="">— sin definir —</option>
              <option value="boleto">Boleto de compraventa</option>
              <option value="escritura">Escritura</option>
            </select>
          </label>

          <input
            name="montoSena"
            type="number"
            step="0.01"
            min="0"
            placeholder="Monto de la seña"
            required
            className="rounded border px-3 py-2"
          />
          <label className="text-sm">
            Moneda de la seña
            <select
              name="monedaSena"
              required
              defaultValue="USD"
              className="mt-1 block w-full rounded border px-3 py-2"
            >
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
            </select>
          </label>

          <label className="text-sm">
            Quién recibió la seña
            <select
              name="recibidoPor"
              defaultValue={user!.id}
              className="mt-1 block w-full rounded border px-3 py-2"
            >
              <option value="">— no está en la lista, especificar abajo —</option>
              {staff?.map((persona) => (
                <option key={persona.id} value={persona.id}>
                  {persona.full_name} ({persona.role})
                </option>
              ))}
            </select>
          </label>
          <input
            name="recibidoPorOtro"
            placeholder="Si no está en la lista: nombre de quien la recibió"
            className="rounded border px-3 py-2"
          />

          <label className="text-sm">
            Comprobante de la seña
            <input
              name="comprobante"
              type="file"
              required
              className="mt-1 block w-full rounded border px-3 py-2"
            />
          </label>

          <button type="submit" className="rounded bg-black px-3 py-2 text-white">
            Confirmar reserva
          </button>
        </form>
      )}
    </main>
  )
}
```

Nota: `defaultValue={user!.id}` en el selector de "Quién recibió la seña" precarga a quien está completando el formulario (el caso común), sin obligar a un click extra — cumple el principio de UX del spec. `user` sale del mismo `getUser()` que ya se llama arriba para poder mostrar ese default; `requireAccesoParaReservar` hace su propia llamada interna a `getUser()` por separado (mismo patrón de doble chequeo ya usado en el resto del proyecto entre página y action).

- [ ] **Step 3: Verificar que compila**

```bash
npm run build
```
Expected: build exitoso.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/lotes/[id]/reservar"
git commit -m "feat: nueva ruta para reservar un lote (texto + comprobante de sena)"
```

---

### Task 7: Fixtures E2E — usuarios vendedor/cobrador nuevos

**Files:**
- Modify: `tests/e2e/fixtures/test-data.ts`

**Interfaces:**
- Produces: `TestFixtures` gana dos campos nuevos: `cobrador: { id: string; email: string }`, `vendedorSinLotes: { id: string; email: string }`. `createAdminClient` sigue exportado igual que antes (ya lo usa `pagos-acotados-por-acreedor.spec.ts`) — la Task 8 lo reutiliza para crear lotes `disponible` ad-hoc.

- [ ] **Step 1: Agregar los dos usuarios nuevos y ampliar el tipo de rol**

Modify `tests/e2e/fixtures/test-data.ts`. Cambiar:
```typescript
  acreedorSecundario: {
    email: 'test-acreedor-secundario@sima-e2e.invalid',
    fullName: 'E2E Acreedor Secundario',
    role: 'acreedor' as const,
  },
}
```
por:
```typescript
  acreedorSecundario: {
    email: 'test-acreedor-secundario@sima-e2e.invalid',
    fullName: 'E2E Acreedor Secundario',
    role: 'acreedor' as const,
  },
  cobrador: {
    email: 'test-cobrador@sima-e2e.invalid',
    fullName: 'E2E Cobrador',
    role: 'cobrador' as const,
  },
  vendedorSinLotes: {
    email: 'test-vendedor-sin-lotes@sima-e2e.invalid',
    fullName: 'E2E Vendedor Sin Lotes',
    role: 'vendedor' as const,
  },
}
```

Cambiar:
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
  loteSecundarioId: string
  cuotaIds: string[]
}
```
por:
```typescript
export interface TestFixtures {
  admin: { id: string; email: string }
  acreedor: { id: string; email: string }
  acreedorConDatos: { id: string; email: string }
  acreedorSecundario: { id: string; email: string }
  vendedorLoteA: { id: string; email: string }
  vendedorLoteB: { id: string; email: string }
  cobrador: { id: string; email: string }
  vendedorSinLotes: { id: string; email: string }
  cliente: { id: string; email: string }
  password: string
  loteId: string
  loteSecundarioId: string
  cuotaIds: string[]
}
```

Cambiar la firma de `ensureTestUser` (agregar `'cobrador'` a la unión de roles):
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
por:
```typescript
async function ensureTestUser(
  admin: AdminClient,
  config: {
    email: string
    fullName: string
    role: 'administrador' | 'acreedor' | 'vendedor' | 'cliente' | 'cobrador'
    datosTransferencia?: { alias: string; banco: string; titular: string; cbu?: string }
  }
) {
```

Cambiar el bloque de creación de usuarios dentro de `ensureTestFixtures`:
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
por:
```typescript
  const [
    administrador,
    acreedor,
    cliente,
    acreedorConDatos,
    acreedorSecundario,
    vendedorLoteA,
    vendedorLoteB,
    cobrador,
    vendedorSinLotes,
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
    ensureTestUser(admin, TEST_USERS.cobrador),
    ensureTestUser(admin, TEST_USERS.vendedorSinLotes),
  ])
```

Cambiar el `return` final de `ensureTestFixtures`:
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
    loteSecundarioId: loteSecundario.id,
    cuotaIds: cuotas.map((c) => c.id),
  }
```
por:
```typescript
  return {
    admin: administrador,
    acreedor,
    acreedorConDatos,
    acreedorSecundario,
    vendedorLoteA,
    vendedorLoteB,
    cobrador,
    vendedorSinLotes,
    cliente,
    password: TEST_PASSWORD,
    loteId: lote.id,
    loteSecundarioId: loteSecundario.id,
    cuotaIds: cuotas.map((c) => c.id),
  }
```

- [ ] **Step 2: Verificar que compila**

```bash
npm run build
```
Expected: build exitoso (este archivo no participa del build de Next, pero TypeScript lo valida vía `tsc` si corrés type-check; alcanza con confirmar que no hay errores de tipos al guardar).

```bash
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/fixtures/test-data.ts
git commit -m "test: agregar usuarios de prueba cobrador y vendedor sin lotes a los fixtures"
```

---

### Task 8: E2E de la reserva

**Files:**
- Create: `tests/e2e/reserva-lote.spec.ts`

**Interfaces:**
- Consumes: `ensureTestFixtures()`, `createAdminClient()`, `TestFixtures` (Task 7); `login()`/`logout()`; la ruta `/admin/lotes/[id]/reservar` y sus nombres de campo (Task 6).

- [ ] **Step 1: Escribir el spec completo**

Create `tests/e2e/reserva-lote.spec.ts`:

```typescript
import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

async function crearLoteDisponible(identificador: string, acreedorId?: string) {
  const admin = createAdminClient()
  const { data: lote, error } = await admin
    .from('lotes')
    .insert({
      identificador,
      moneda: 'USD',
      estado: 'disponible',
      cantidad_cuotas: 1,
      monto_cuota_base: 1,
      acreedor_id: acreedorId ?? null,
    })
    .select('id')
    .single()

  if (error || !lote) {
    throw new Error(`No se pudo crear el lote disponible de prueba: ${error?.message}`)
  }

  return lote.id as string
}

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
}

test.describe('Reserva de lote (fase 1: texto + comprobante de seña)', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('un vendedor reserva un lote disponible y queda asignado como vendedor_id', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponible(
      `E2E Lote Disponible Vendedor ${Date.now()}`,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.vendedorSinLotes.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await completarDatosBasicosDeReserva(page)
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin
      .from('lotes')
      .select('estado, vendedor_id')
      .eq('id', loteId)
      .single()

    expect(lote?.estado).toBe('reservado')
    expect(lote?.vendedor_id).toBe(fixtures.vendedorSinLotes.id)
  })

  test('un cobrador reserva un lote disponible y el lote queda sin vendedor asignado', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponible(`E2E Lote Disponible Cobrador ${Date.now()}`)

    await login(page, fixtures.cobrador.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await completarDatosBasicosDeReserva(page)
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin
      .from('lotes')
      .select('estado, vendedor_id')
      .eq('id', loteId)
      .single()

    expect(lote?.estado).toBe('reservado')
    expect(lote?.vendedor_id).toBeNull()
  })

  test('un acreedor puede reservar su propio lote', async ({ page }) => {
    const loteId = await crearLoteDisponible(
      `E2E Lote Propio Acreedor ${Date.now()}`,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await completarDatosBasicosDeReserva(page)
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()

    expect(lote?.estado).toBe('reservado')
  })

  test('un acreedor no puede reservar un lote que no es suyo', async ({ page }) => {
    const loteId = await crearLoteDisponible(
      `E2E Lote Ajeno ${Date.now()}`,
      fixtures.acreedorSecundario.id
    )

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await page.waitForURL('**/admin/lotes')
    await expect(page).toHaveURL(/\/admin\/lotes$/)
  })

  test('no se puede reservar un lote que ya no está disponible', async ({ page }) => {
    const loteId = await crearLoteDisponible(`E2E Lote Ya Reservado ${Date.now()}`)
    const admin = createAdminClient()
    await admin.from('lotes').update({ estado: 'reservado' }).eq('id', loteId)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)

    await expect(page.getByText('Este lote ya no está disponible para reservar')).toBeVisible()
    await expect(page.locator('form')).toHaveCount(0)
  })

  test('vendedor y cobrador no pueden abrir el detalle del lote ni ven Pagos/Usuarios', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponible(`E2E Lote Detalle Bloqueado ${Date.now()}`)

    await login(page, fixtures.vendedorSinLotes.email, fixtures.password)

    await test.step('no puede abrir el detalle', async () => {
      await page.goto(`/admin/lotes/${loteId}`)
      await page.waitForURL('**/admin/lotes')
      await expect(page).toHaveURL(/\/admin\/lotes$/)
    })

    await test.step('no ve Pagos ni Usuarios en la nav', async () => {
      await page.goto('/admin/lotes')
      await expect(page.getByRole('link', { name: 'Pagos' })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible()
    })
  })

  test('el selector "recibido por" permite elegir a alguien de la lista o escribir un nombre libre', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponible(`E2E Lote Recibido Otro ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)

    await page.selectOption('select[name="recibidoPor"]', '')
    await page
      .getByPlaceholder('Si no está en la lista: nombre de quien la recibió')
      .fill('Persona Externa Sin Cuenta')

    await completarDatosBasicosDeReserva(page)
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: reserva } = await admin
      .from('reservas')
      .select('recibido_por, recibido_por_otro')
      .eq('lote_id', loteId)
      .single()

    expect(reserva?.recibido_por).toBeNull()
    expect(reserva?.recibido_por_otro).toBe('Persona Externa Sin Cuenta')
  })
})
```

- [ ] **Step 2: Levantar el servidor de dev si no está corriendo**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login
```
Si no devuelve `200`, levantar con `npm run dev` en background y esperar a que sí lo devuelva antes de seguir.

- [ ] **Step 3: Correr el spec nuevo solo**

```bash
npx playwright test tests/e2e/reserva-lote.spec.ts
```
Expected: los 7 tests en verde. Si algo falla, no asumas que es el test — puede ser un mismatch de texto/placeholder entre el spec y la página real de la Task 6; compará ambos antes de tocar cualquiera de los dos a ciegas.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/reserva-lote.spec.ts
git commit -m "test: cobertura e2e de la reserva de lote (fase 1)"
```

---

### Task 9: Regresión completa + documentación de proyecto

**Files:**
- Modify (si hace falta arreglar algo que se rompió): cualquier archivo tocado en las Tasks 1-8
- Modify: `../Pruebas_Manuales_Pendientes.txt` (ruta relativa al repo: `../Pruebas_Manuales_Pendientes.txt`, fuera de `sima-inmobiliaria/`)
- Modify: `../Notas_Decisiones_SIMA.txt`

**Interfaces:** ninguna nueva — esta task es verificación + documentación.

- [ ] **Step 1: Build completo**

```bash
npm run build
```
Expected: build exitoso, sin warnings de tipos nuevos.

- [ ] **Step 2: Suite unitaria completa (no solo los tests nuevos)**

```bash
npm test
```
Expected: TODOS los tests en verde, incluidos `lib/lotes/generar-cuotas.test.ts`, `lib/lotes/aplicar-indexacion.test.ts`, `lib/cobranza/estado-cliente.test.ts`, `lib/pagos/imputar-fifo.test.ts`, `lib/lotes/validar-cuenta-cobro.test.ts`, y los dos nuevos de la Task 2. Si algo falla, investigá la causa real antes de tocar nada — puede ser una regresión genuina de esta tanda.

- [ ] **Step 3: Suite E2E completa (no solo el spec nuevo)**

```bash
npx playwright test
```
Expected: TODOS los specs en verde — `auth.spec.ts`, `cuenta-cobro.spec.ts`, `visibilidad-acreedor.spec.ts`, `pago-flujo-completo.spec.ts`, `pagos-acotados-por-acreedor.spec.ts`, y el nuevo `reserva-lote.spec.ts`. Nota sobre `vendedor_id`: el `update ... where estado = 'disponible'` de la Task 1 es un cleanup de una sola vez contra los datos que existían al aplicar la migración, no un trigger — `ensureTestFixtures()` recrea `loteSecundarioId` en cada corrida insertando `vendedor_id` explícito en el mismo insert, así que no debería verse afectado. Si igual `visibilidad-acreedor.spec.ts` o `cuenta-cobro.spec.ts` fallan, no asumas que es por esto — investigá la causa real primero.

- [ ] **Step 4: Si algo se rompió, arreglarlo y volver a correr Steps 1-3 hasta que todo esté en verde**

No hace falta un checklist genérico acá — si algo falla, leé el error real, andá al archivo correspondiente, arreglalo, y volvé a correr los tres comandos.

- [ ] **Step 5: Actualizar `Pruebas_Manuales_Pendientes.txt`**

Modify `../Pruebas_Manuales_Pendientes.txt` — agregar una sección nueva al final (respetando el formato de secciones numeradas ya usado en el archivo) describiendo qué probar manualmente: reservar un lote logueado como cada uno de los 4 roles (admin, acreedor sobre su propio lote, vendedor, cobrador), confirmar que `vendedor_id` se autocompleta solo cuando reserva un vendedor, confirmar que vendedor/cobrador no ven Pagos/Usuarios ni el detalle completo de un lote, probar el selector "Otro" de quién recibió la seña, y confirmar que un lote ya reservado no se puede volver a reservar. Incluir também que `/admin/lotes/[id]/vender` sigue funcionando igual que antes (sin cambios) tanto desde `disponible` como desde `reservado`.

- [ ] **Step 6: Actualizar `Notas_Decisiones_SIMA.txt`**

Modify `../Notas_Decisiones_SIMA.txt` — agregar un punto nuevo (siguiente número disponible) documentando: la reserva de lote fase 1 quedó construida (texto + comprobante de seña, sin fotos todavía); `vendedor_id` ya no se asigna a mano por defecto, se autocompleta al reservar; vendedor y cobrador ya tienen acceso acotado a `/admin` (solo lotes disponibles + reservar + su propio perfil); `/admin/lotes/[id]/vender` sigue sin exigir que el lote haya pasado por `reservado` — queda pendiente firme para la próxima tanda ("pase a vendido").

- [ ] **Step 7: Commit final**

```bash
git add Pruebas_Manuales_Pendientes.txt Notas_Decisiones_SIMA.txt
git commit -m "docs: actualizar notas de decisiones y pruebas manuales con la reserva de lote fase 1"
```

(Si el Step 4 requirió cambios de código para arreglar una regresión, esos cambios van en su propio commit previo, con un mensaje que describa qué se rompió y por qué — no los mezcles con este commit de documentación.)

---

## Verificación final

```bash
npm run build && npm test && npx playwright test
```

Expected: los tres comandos en verde.
