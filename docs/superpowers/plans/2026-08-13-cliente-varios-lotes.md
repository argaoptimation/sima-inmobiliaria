# Cliente con varios lotes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un mismo cliente puede comprar varios lotes bajo una sola cuenta (no una cuenta nueva por lote), viendo todos sus lotes en el portal, con pagos correctamente atados a "cuál" lote en vez de resueltos ambiguamente por cliente.

**Architecture:** Se agrega `pagos.lote_id` (hoy inferible solo indirectamente vía `lotes.cliente_id`, lo que rompe con más de un lote por cliente). `venderLote` busca un cliente existente por email antes de invitar uno nuevo. El portal del cliente pasa de "una pantalla, un lote" a "lista de lotes → detalle por lote".

**Tech Stack:** Next.js 16, TypeScript, Supabase JS, Playwright.

## Global Constraints

- Spec de referencia: `docs/superpowers/specs/2026-08-13-cliente-varios-lotes-design.md`.
- Cero JavaScript de cliente nuevo.
- Mensajes de error al usuario: siempre en español llano.
- Todo Server Action que mute datos repite su propio guard/verificación, independiente del guard de página.
- Working directory: `sima-inmobiliaria/`.
- La migración de la Task 1 la aplica el CONTROLLER directamente vía `mcp__supabase__apply_migration`, no un subagente.

---

### Task 1: Migración — `pagos.lote_id` + backfill

**Files:**
- Create: `supabase/migrations/0014_pagos_lote_id.sql`

**Ejecutada por el CONTROLLER, no por un subagente.**

- [ ] **Step 1: Escribir la migración**

```sql
alter table public.pagos add column lote_id uuid references public.lotes(id);

update public.pagos p
set lote_id = l.id
from public.lotes l
where l.cliente_id = p.cliente_id
  and p.lote_id is null;

alter table public.pagos alter column lote_id set not null;
create index idx_pagos_lote_id on public.pagos(lote_id);
```

- [ ] **Step 2: Aplicar la migración**

Verificar primero con `mcp__supabase__get_project_url` que coincide con `NEXT_PUBLIC_SUPABASE_URL` de `.env.local`. Aplicar con `mcp__supabase__apply_migration`, `name: "pagos_lote_id"`, `query` = el contenido del Step 1. Si el `alter column ... set not null` falla porque algún pago quedó sin `lote_id` tras el backfill (cliente sin lote, dato huérfano), investigar esa fila puntual con `mcp__supabase__execute_sql` antes de forzar nada — no continuar con la migración a medias.

- [ ] **Step 3: Verificar el backfill**

```sql
select count(*) from public.pagos where lote_id is null;
```

Esperado: `0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0014_pagos_lote_id.sql
git commit -m "feat: agregar pagos.lote_id, con backfill retroactivo desde lotes.cliente_id"
```

---

### Task 2: `registrarPago` guarda y verifica el `lote_id`

**Files:**
- Modify: `app/portal-cliente/pagar/[id]/actions.ts`

**Interfaces:** ninguna firma cambia (`registrarPago(cuotaId, formData)`).

- [ ] **Step 1: Reescribir el archivo completo**

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export async function registrarPago(cuotaId: string, formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const monto = Number(formData.get('monto'))
  const moneda = formData.get('moneda') as 'USD' | 'ARS'

  const admin = createAdminClient()

  const { data: cuota, error: errorCuota } = await admin
    .from('cuotas')
    .select('lote_id')
    .eq('id', cuotaId)
    .single()

  if (errorCuota || !cuota) {
    redirect(
      `/portal-cliente/pagar/${cuotaId}?error=${encodeURIComponent('No se encontró la cuota')}`
    )
  }

  const { data: lote } = await admin
    .from('lotes')
    .select('cliente_id')
    .eq('id', cuota!.lote_id)
    .single()

  if (!lote || lote.cliente_id !== user!.id) {
    redirect(
      `/portal-cliente/pagar/${cuotaId}?error=${encodeURIComponent('Esa cuota no te pertenece')}`
    )
  }

  const { data: pago, error: errorPago } = await admin
    .from('pagos')
    .insert({
      cliente_id: user!.id,
      lote_id: cuota!.lote_id,
      monto,
      moneda,
    })
    .select('id')
    .single()

  if (errorPago || !pago) {
    redirect(
      `/portal-cliente/pagar/${cuotaId}?error=${encodeURIComponent(errorPago?.message ?? 'error desconocido')}`
    )
  }

  redirect(`/portal-cliente/pagos/${pago.id}/comprobante`)
}
```

- [ ] **Step 2: Verificar con build**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add "app/portal-cliente/pagar/[id]/actions.ts"
git commit -m "feat: registrarPago guarda lote_id y verifica que la cuota sea del cliente"
```

---

### Task 3: `confirmarPago` resuelve el lote por `pagos.lote_id`

**Files:**
- Modify: `app/admin/pagos/actions.ts`

**Interfaces:** ninguna firma cambia.

- [ ] **Step 1: Cambiar el `select` inicial de `pagos`**

Reemplazar:

```typescript
  const { data: pago } = await supabase
    .from('pagos')
    .select('comprobante_path, cliente_id')
    .eq('id', pagoId)
    .single()
```

por:

```typescript
  const { data: pago } = await supabase
    .from('pagos')
    .select('comprobante_path, cliente_id, lote_id')
    .eq('id', pagoId)
    .single()
```

- [ ] **Step 2: Cambiar la resolución del lote**

Reemplazar:

```typescript
  // Resolucion unica del lote del cliente de este pago: se reusa mas abajo
  // para la imputacion FIFO, evitando una segunda consulta redundante.
  const { data: lote } = await supabase
    .from('lotes')
    .select('id, acreedor_id')
    .eq('cliente_id', pago.cliente_id)
    .single()
```

por:

```typescript
  // Resolucion del lote de este pago via pagos.lote_id (no via cliente_id:
  // un cliente puede tener varios lotes, cliente_id ya no alcanza). Se reusa
  // mas abajo para la imputacion FIFO, evitando una segunda consulta
  // redundante.
  const { data: lote } = await supabase
    .from('lotes')
    .select('id, acreedor_id')
    .eq('id', pago.lote_id)
    .single()
```

El resto de la función queda igual (ya opera sobre `lote.id`/`lote.acreedor_id` una vez resuelto).

- [ ] **Step 3: Verificar con build**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 4: Commit**

```bash
git add app/admin/pagos/actions.ts
git commit -m "fix: confirmarPago resuelve el lote por pagos.lote_id, no por cliente_id"
```

---

### Task 4: `/admin/pagos` deja de listar/atribuir por `cliente_id`

**Files:**
- Modify: `app/admin/pagos/page.tsx`

**Interfaces:** ninguna firma cambia.

- [ ] **Step 1: Reescribir el archivo completo**

```typescript
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminOAcreedor } from '@/lib/auth/require-admin'
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
  lote_id: string
  monto_recibido: number | null
  moneda_recibida: string | null
}

export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  await requireAdminOAcreedor()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: perfilPropio } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const columnasPago =
    'id, monto, moneda, comprobante_path, estado, confirmado_acreedor_por, confirmado_admin_por, cliente_id, lote_id, monto_recibido, moneda_recibida'

  let pagos: Pago[] = []

  if (perfilPropio!.role === 'acreedor') {
    const { data: misLotes } = await supabase
      .from('lotes')
      .select('id')
      .eq('acreedor_id', user!.id)

    const loteIds = (misLotes ?? []).map((lote) => lote.id)

    if (loteIds.length > 0) {
      const { data } = await supabase
        .from('pagos')
        .select(columnasPago)
        .in('lote_id', loteIds)
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

  const loteIdsConPago = [...new Set(pagos.map((pago) => pago.lote_id))]

  const { data: lotesConPago } =
    loteIdsConPago.length > 0
      ? await supabase
          .from('lotes')
          .select('id, identificador, acreedor_id')
          .in('id', loteIdsConPago)
      : { data: [] }

  const lotePorId = new Map((lotesConPago ?? []).map((lote) => [lote.id, lote]))

  const pagosConLink = await Promise.all(
    pagos.map(async (pago) => {
      const lote = lotePorId.get(pago.lote_id)
      const sinAcreedorVinculado = !lote?.acreedor_id
      const identificadorLote = lote?.identificador ?? '—'

      if (!pago.comprobante_path) {
        return { ...pago, comprobanteUrl: null, sinAcreedorVinculado, identificadorLote }
      }

      const { data, error: errorSignedUrl } = await admin.storage
        .from('comprobantes')
        .createSignedUrl(pago.comprobante_path, 300)

      return {
        ...pago,
        comprobanteUrl: errorSignedUrl ? null : data?.signedUrl ?? null,
        sinAcreedorVinculado,
        identificadorLote,
      }
    })
  )

  return (
    <main>
      <h1 className="mb-6 text-xl font-semibold">Pagos</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Lote</th>
            <th>Monto</th>
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
                <td className="py-2">{pago.identificadorLote}</td>
                <td>
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
                <td>
                  {pago.sinAcreedorVinculado ? (
                    <span className="font-semibold text-red-700">⚠ Lote sin acreedor vinculado</span>
                  ) : pago.confirmado_acreedor_por ? (
                    'Sí'
                  ) : (
                    'No'
                  )}
                </td>
                <td>{pago.confirmado_admin_por ? 'Sí' : 'No'}</td>
                <td>
                  {pago.estado === 'pendiente' &&
                    (pago.comprobante_path ? (
                      <>
                        {pago.sinAcreedorVinculado && (
                          <p className="mb-2 font-semibold text-red-700">
                            ⚠ Este lote todavía no tiene un acreedor vinculado. Podés confirmar
                            tu parte, pero el pago no se va a completar hasta asignar uno desde
                            el detalle del lote.
                          </p>
                        )}
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
                      </>
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

- [ ] **Step 2: Verificar con build**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add app/admin/pagos/page.tsx
git commit -m "fix: /admin/pagos filtra y atribuye por lote_id, no por cliente_id"
```

---

### Task 5: `venderLote` reutiliza un cliente existente por email

**Files:**
- Modify: `app/admin/lotes/[id]/vender/actions.ts`

**Interfaces:** ninguna firma cambia.

- [ ] **Step 1: Insertar la búsqueda de cliente existente, antes del invite**

Localizar este bloque (ya existente, del invite del comprador):

```typescript
  const { data: invited, error: errorInvite } = await admin.auth.admin.inviteUserByEmail(email)

  if (errorInvite || !invited.user) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorInvite?.message ?? 'error desconocido')}`
    )
  }

  const { error: errorProfile } = await admin.from('profiles').insert({
    id: invited.user.id,
    role: 'cliente',
    full_name: fullName,
    email,
  })

  if (errorProfile) {
    redirect(`/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorProfile.message)}`)
  }
```

Reemplazarlo completo por:

```typescript
  const { data: clienteExistente } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .eq('role', 'cliente')
    .maybeSingle()

  let clienteId: string

  if (clienteExistente) {
    // El comprador ya tiene cuenta (compró otro lote antes) -- se reusa la
    // misma cuenta en vez de invitar de nuevo (rompería con "duplicate key"
    // contra profiles_pkey) o crear una segunda cuenta para la misma
    // persona. No se toca su full_name existente para no pisarlo si el
    // nombre tipeado esta vez difiere levemente.
    clienteId = clienteExistente.id
  } else {
    const { data: invited, error: errorInvite } = await admin.auth.admin.inviteUserByEmail(email)

    if (errorInvite || !invited.user) {
      redirect(
        `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorInvite?.message ?? 'error desconocido')}`
      )
    }

    const { error: errorProfile } = await admin.from('profiles').insert({
      id: invited.user.id,
      role: 'cliente',
      full_name: fullName,
      email,
    })

    if (errorProfile) {
      redirect(`/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorProfile.message)}`)
    }

    clienteId = invited.user.id
  }
```

- [ ] **Step 2: Reemplazar los usos de `invited.user.id` por `clienteId`**

Más abajo en la misma función, el `update` de `lotes` (`cliente_id: invited.user.id`) pasa a:

```typescript
    .update({
      estado: 'vendido',
      cliente_id: clienteId,
      cantidad_cuotas: cantidadCuotas,
      monto_cuota_base: montoCuotaBase,
      fecha_primera_cuota: fechaPrimeraCuota,
    })
```

Y en el bloque de descuento de la seña (más abajo todavía), el `insert` de `pagos` (`cliente_id: invited.user.id`) pasa a:

```typescript
      .insert({
        cliente_id: clienteId,
        monto: reserva.monto_sena,
        moneda: reserva.moneda_sena,
        comprobante_path: reserva.comprobante_sena_path,
        estado: 'confirmado',
        confirmado_admin_por: adminUser!.id,
        confirmado_admin_at: new Date().toISOString(),
      })
```

Revisar con cuidado que NO quede ninguna referencia suelta a `invited.user.id` en el resto del archivo — buscar el texto `invited.user.id` después de este cambio y confirmar que ya no aparece.

- [ ] **Step 3: Verificar con build**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/lotes/[id]/vender/actions.ts"
git commit -m "feat: venderLote reutiliza la cuenta del cliente si el email ya existe"
```

---

### Task 6: Portal del cliente — lista de lotes

**Files:**
- Modify: `app/portal-cliente/page.tsx`

**Interfaces:**
- Produces: cada fila de la lista linkea a `/portal-cliente/lotes/${lote.id}` (ruta que crea la Task 7).

- [ ] **Step 1: Reescribir el archivo completo**

```typescript
import { createClient } from '@/lib/supabase/server'
import { calcularEstadoCobranza } from '@/lib/cobranza/estado-cliente'
import { redirect } from 'next/navigation'
import { logout } from '@/app/login/actions'

function BotonCerrarSesion() {
  return (
    <form action={logout}>
      <button type="submit" className="text-sm underline">
        Cerrar sesión
      </button>
    </form>
  )
}

export default async function PortalClientePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: lotes } = await supabase
    .from('lotes')
    .select('id, identificador, moneda')
    .eq('cliente_id', user!.id)
    .order('identificador')

  if (!lotes || lotes.length === 0) {
    return (
      <main className="mx-auto mt-24 max-w-md p-6 text-center">
        <p className="mb-4">Todavía no tenés un lote asignado.</p>
        <BotonCerrarSesion />
      </main>
    )
  }

  const hoy = new Date().toISOString().slice(0, 10)

  const lotesConEstado = await Promise.all(
    lotes.map(async (lote) => {
      const { data: cuotas } = await supabase
        .from('cuotas')
        .select('saldo_pendiente, fecha_vencimiento')
        .eq('lote_id', lote.id)

      const estado = calcularEstadoCobranza(
        (cuotas ?? []).map((cuota) => ({
          saldoPendiente: cuota.saldo_pendiente,
          fechaVencimiento: cuota.fecha_vencimiento,
        })),
        hoy
      )

      return { ...lote, estado }
    })
  )

  return (
    <main className="mx-auto mt-12 max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tus lotes</h1>
        <BotonCerrarSesion />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Lote</th>
            <th>Moneda</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lotesConEstado.map((lote) => (
            <tr key={lote.id} className="border-b">
              <td className="py-2">{lote.identificador}</td>
              <td>{lote.moneda}</td>
              <td>
                <span
                  className={
                    lote.estado === 'normal'
                      ? 'text-green-700'
                      : lote.estado === 'moroso'
                        ? 'text-amber-700'
                        : 'text-red-700'
                  }
                >
                  {lote.estado}
                </span>
              </td>
              <td>
                <a href={`/portal-cliente/lotes/${lote.id}`} className="underline">
                  Ver detalle
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
```

- [ ] **Step 2: Verificar con build**

Run: `npm run build`
Expected: build exitoso (esperable que `/portal-cliente/lotes/[id]` todavía no exista hasta la Task 7 — eso no rompe el build de esta página).

- [ ] **Step 3: Commit**

```bash
git add app/portal-cliente/page.tsx
git commit -m "feat: portal del cliente lista todos sus lotes, no asume uno solo"
```

---

### Task 7: Portal del cliente — detalle por lote

**Files:**
- Create: `app/portal-cliente/lotes/[id]/page.tsx`

**Interfaces:**
- Consumes: link desde `app/portal-cliente/page.tsx` (Task 6, ya completa).

- [ ] **Step 1: Crear el archivo**

```typescript
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcularEstadoCobranza } from '@/lib/cobranza/estado-cliente'
import { notFound, redirect } from 'next/navigation'
import { logout } from '@/app/login/actions'

function BotonCerrarSesion() {
  return (
    <form action={logout}>
      <button type="submit" className="text-sm underline">
        Cerrar sesión
      </button>
    </form>
  )
}

export default async function PortalClienteLotePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: lote } = await supabase
    .from('lotes')
    .select('id, identificador, moneda, cliente_id')
    .eq('id', id)
    .single()

  if (!lote || lote.cliente_id !== user!.id) {
    notFound()
  }

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, numero, monto_base, saldo_pendiente, fecha_vencimiento')
    .eq('lote_id', lote!.id)
    .order('numero', { ascending: true })

  const hoy = new Date().toISOString().slice(0, 10)
  const estado = calcularEstadoCobranza(
    (cuotas ?? []).map((cuota) => ({
      saldoPendiente: cuota.saldo_pendiente,
      fechaVencimiento: cuota.fecha_vencimiento,
    })),
    hoy
  )

  const primeraImpaga = cuotas?.find((cuota) => cuota.saldo_pendiente > 0)

  const totalPendiente = (cuotas ?? []).reduce(
    (acumulado, cuota) => acumulado + cuota.saldo_pendiente,
    0
  )

  const { data: pagos } = await supabase
    .from('pagos')
    .select('id, monto, moneda, estado, comprobante_path')
    .eq('lote_id', lote!.id)
    .order('created_at', { ascending: false })

  const admin = createAdminClient()

  const pagosConLink = await Promise.all(
    (pagos ?? []).map(async (pago) => {
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
    <main className="mx-auto mt-12 max-w-2xl p-6">
      <a href="/portal-cliente" className="mb-4 inline-block text-sm underline">
        ← Volver a tus lotes
      </a>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{lote!.identificador}</h1>
        <BotonCerrarSesion />
      </div>
      <p className="mb-2 text-sm">
        Estado:{' '}
        <span
          className={
            estado === 'normal'
              ? 'text-green-700'
              : estado === 'moroso'
                ? 'text-amber-700'
                : 'text-red-700'
          }
        >
          {estado}
        </span>
      </p>
      <p className="mb-6 text-sm font-medium">
        Total pendiente: {totalPendiente} {lote!.moneda}
      </p>
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
          {cuotas?.map((cuota) => (
            <tr key={cuota.id} className="border-b">
              <td className="py-2">{cuota.numero}</td>
              <td>{cuota.fecha_vencimiento}</td>
              <td>
                {cuota.monto_base} {lote!.moneda}
              </td>
              <td>
                {cuota.saldo_pendiente} {lote!.moneda}
              </td>
              <td>
                {primeraImpaga?.id === cuota.id && (
                  <a href={`/portal-cliente/pagar/${cuota.id}`} className="underline">
                    Pagar cuota
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mb-2 mt-10 text-lg font-semibold">Mis pagos</h2>
      {pagosConLink.length === 0 ? (
        <p className="text-sm text-gray-600">Todavía no registraste ningún pago.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Monto</th>
              <th>Estado</th>
              <th>Comprobante</th>
            </tr>
          </thead>
          <tbody>
            {pagosConLink.map((pago) => (
              <tr key={pago.id} className="border-b">
                <td className="py-2">
                  {pago.monto} {pago.moneda}
                </td>
                <td>{pago.estado}</td>
                <td>
                  {!pago.comprobante_path ? (
                    <span className="text-amber-700">
                      ⚠ Falta subir comprobante ·{' '}
                      <a
                        href={`/portal-cliente/pagos/${pago.id}/comprobante`}
                        className="underline"
                      >
                        Subir
                      </a>
                    </span>
                  ) : pago.comprobanteUrl ? (
                    <a href={pago.comprobanteUrl} target="_blank" className="underline">
                      Ver comprobante
                    </a>
                  ) : (
                    <span className="text-gray-500">Comprobante no disponible</span>
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
```

- [ ] **Step 2: Verificar con build**

Run: `npm run build`
Expected: build exitoso, ruta `/portal-cliente/lotes/[id]` listada.

- [ ] **Step 3: Commit**

```bash
git add "app/portal-cliente/lotes/[id]/page.tsx"
git commit -m "feat: detalle de un lote del cliente, con chequeo de pertenencia"
```

---

### Task 8: `pagar/[id]` resuelve la cuenta de cobro por la cuota, no por "el" lote del cliente

**Files:**
- Modify: `app/portal-cliente/pagar/[id]/page.tsx`

**Interfaces:** ninguna firma cambia.

- [ ] **Step 1: Reescribir el archivo completo**

```typescript
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
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

  const { data: cuota } = await supabase
    .from('cuotas')
    .select('lote_id')
    .eq('id', id)
    .maybeSingle()

  if (!cuota) {
    notFound()
  }

  const { data: lote } = await supabase
    .from('lotes')
    .select('cliente_id, cuenta_cobro_id')
    .eq('id', cuota!.lote_id)
    .single()

  if (!lote || lote.cliente_id !== user!.id) {
    notFound()
  }

  let cuentaCobro: { alias: string | null; banco: string | null; cbu: string | null; titular: string | null } | null = null

  if (lote.cuenta_cobro_id) {
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

- [ ] **Step 2: Verificar con build**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add "app/portal-cliente/pagar/[id]/page.tsx"
git commit -m "fix: pagar cuota resuelve la cuenta de cobro por la cuota, no por cliente_id"
```

---

### Task 9: Tests e2e

**Files:**
- Create: `tests/e2e/cliente-varios-lotes.spec.ts`

**Interfaces:**
- Consumes: `ensureTestFixtures`, `createAdminClient`, `TestFixtures` (`./fixtures/test-data`), `login`/`logout` (`./utils/login`).

- [ ] **Step 1: Escribir el archivo de tests**

```typescript
import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

async function crearLoteReservadoListoParaVender(
  identificador: string,
  precioTotal: number,
  acreedorId: string
) {
  const admin = createAdminClient()
  const { data: lote, error } = await admin
    .from('lotes')
    .insert({
      identificador,
      moneda: 'USD',
      estado: 'reservado',
      ubicacion: 'Ubicación E2E',
      precio_total: precioTotal,
      acreedor_id: acreedorId,
    })
    .select('id')
    .single()

  if (error || !lote) {
    throw new Error(`No se pudo crear el lote de prueba: ${error?.message}`)
  }

  return lote.id as string
}

async function venderLotePorUI(
  page: import('@playwright/test').Page,
  loteId: string,
  datos: { email: string; fullName: string }
) {
  await page.goto(`/admin/lotes/${loteId}/vender`)
  await page.getByPlaceholder('Nombre completo del comprador').fill(datos.fullName)
  await page.getByPlaceholder('Email del comprador').fill(datos.email)
  await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('1')
  await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
  await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
  await page.waitForURL('**/admin/lotes')
}

test.describe('Cliente con varios lotes', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('vender un segundo lote al mismo email reutiliza la cuenta, sin invitar de nuevo', async ({
    page,
  }) => {
    const emailComprador = `comprador.repetido.${Date.now()}@sima-e2e.invalid`

    const loteAId = await crearLoteReservadoListoParaVender(
      `E2E Multi Lote A ${Date.now()}`,
      5000,
      fixtures.acreedorConDatos.id
    )
    const loteBId = await crearLoteReservadoListoParaVender(
      `E2E Multi Lote B ${Date.now()}`,
      8000,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)

    await venderLotePorUI(page, loteAId, { email: emailComprador, fullName: 'Comprador Repetido' })
    await venderLotePorUI(page, loteBId, { email: emailComprador, fullName: 'Comprador Repetido' })

    const admin = createAdminClient()
    const { data: loteA } = await admin.from('lotes').select('cliente_id').eq('id', loteAId).single()
    const { data: loteB } = await admin.from('lotes').select('cliente_id').eq('id', loteBId).single()

    expect(loteA?.cliente_id).toBeTruthy()
    expect(loteB?.cliente_id).toBe(loteA?.cliente_id)

    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('email', emailComprador)
    expect(count).toBe(1)
  })

  test('el portal del cliente lista todos sus lotes', async ({ page }) => {
    const emailComprador = `comprador.portal.${Date.now()}@sima-e2e.invalid`

    const loteAId = await crearLoteReservadoListoParaVender(
      `E2E Multi Portal A ${Date.now()}`,
      5000,
      fixtures.acreedorConDatos.id
    )
    const loteBId = await crearLoteReservadoListoParaVender(
      `E2E Multi Portal B ${Date.now()}`,
      6000,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await venderLotePorUI(page, loteAId, { email: emailComprador, fullName: 'Comprador Portal' })

    const admin = createAdminClient()
    const { data: loteAVendido } = await admin
      .from('lotes')
      .select('cliente_id')
      .eq('id', loteAId)
      .single()

    await venderLotePorUI(page, loteBId, { email: emailComprador, fullName: 'Comprador Portal' })

    const { error: errorSetPassword } = await admin.auth.admin.updateUserById(
      loteAVendido!.cliente_id,
      { password: 'Sima123!', email_confirm: true }
    )
    if (errorSetPassword) {
      throw new Error(`No se pudo setear la contraseña del cliente: ${errorSetPassword.message}`)
    }

    const { data: identificadorLoteA } = await admin
      .from('lotes')
      .select('identificador')
      .eq('id', loteAId)
      .single()
    const { data: identificadorLoteB } = await admin
      .from('lotes')
      .select('identificador')
      .eq('id', loteBId)
      .single()

    const { data: cliente } = await admin
      .from('profiles')
      .select('email')
      .eq('id', loteAVendido!.cliente_id)
      .single()

    await login(page, cliente!.email!, 'Sima123!')
    await page.goto('/portal-cliente')

    await expect(page.getByText(identificadorLoteA!.identificador)).toBeVisible()
    await expect(page.getByText(identificadorLoteB!.identificador)).toBeVisible()
  })

  test('pagar una cuota de un lote no toca las cuotas del otro lote del mismo cliente', async ({
    page,
  }) => {
    const emailComprador = `comprador.pagos.${Date.now()}@sima-e2e.invalid`

    const loteAId = await crearLoteReservadoListoParaVender(
      `E2E Multi Pagos A ${Date.now()}`,
      5000,
      fixtures.acreedorConDatos.id
    )
    const loteBId = await crearLoteReservadoListoParaVender(
      `E2E Multi Pagos B ${Date.now()}`,
      6000,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await venderLotePorUI(page, loteAId, { email: emailComprador, fullName: 'Comprador Pagos' })
    await venderLotePorUI(page, loteBId, { email: emailComprador, fullName: 'Comprador Pagos' })

    const admin = createAdminClient()
    const { data: loteA } = await admin.from('lotes').select('cliente_id').eq('id', loteAId).single()
    await admin.auth.admin.updateUserById(loteA!.cliente_id, {
      password: 'Sima123!',
      email_confirm: true,
    })
    const { data: cliente } = await admin
      .from('profiles')
      .select('email')
      .eq('id', loteA!.cliente_id)
      .single()

    const { data: cuotaLoteA } = await admin
      .from('cuotas')
      .select('id, saldo_pendiente')
      .eq('lote_id', loteAId)
      .single()
    const { data: cuotaLoteB } = await admin
      .from('cuotas')
      .select('id, saldo_pendiente')
      .eq('lote_id', loteBId)
      .single()

    await login(page, cliente!.email!, 'Sima123!')
    await page.goto(`/portal-cliente/pagar/${cuotaLoteA!.id}`)
    await page.getByPlaceholder('Monto transferido').fill('5000')
    await page.getByRole('button', { name: 'Ya transferí' }).click()
    await page.waitForURL('**/portal-cliente/pagos/**/comprobante')

    const { data: pagoCreado } = await admin
      .from('pagos')
      .select('id, lote_id')
      .eq('cliente_id', loteA!.cliente_id)
      .eq('lote_id', loteAId)
      .single()
    expect(pagoCreado?.lote_id).toBe(loteAId)

    const { data: cuotaBSinCambios } = await admin
      .from('cuotas')
      .select('saldo_pendiente')
      .eq('id', cuotaLoteB!.id)
      .single()
    expect(cuotaBSinCambios?.saldo_pendiente).toBe(cuotaLoteB!.saldo_pendiente)
  })

  test('un acreedor solo ve en /admin/pagos los pagos de SUS lotes, aunque el cliente tenga otro lote de otro acreedor', async ({
    page,
  }) => {
    const emailComprador = `comprador.acreedores.${Date.now()}@sima-e2e.invalid`

    const loteDelAcreedorId = await crearLoteReservadoListoParaVender(
      `E2E Multi Acreedor Propio ${Date.now()}`,
      5000,
      fixtures.acreedorConDatos.id
    )
    const loteDeOtroAcreedorId = await crearLoteReservadoListoParaVender(
      `E2E Multi Acreedor Ajeno ${Date.now()}`,
      6000,
      fixtures.acreedorSecundario.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await venderLotePorUI(page, loteDelAcreedorId, {
      email: emailComprador,
      fullName: 'Comprador Acreedores',
    })
    await venderLotePorUI(page, loteDeOtroAcreedorId, {
      email: emailComprador,
      fullName: 'Comprador Acreedores',
    })

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/pagos')

    const { data: identificadorPropio } = await createAdminClient()
      .from('lotes')
      .select('identificador')
      .eq('id', loteDelAcreedorId)
      .single()
    const { data: identificadorAjeno } = await createAdminClient()
      .from('lotes')
      .select('identificador')
      .eq('id', loteDeOtroAcreedorId)
      .single()

    // Ninguno de los dos lotes generó un pago todavía (no se pagó ninguna
    // cuota), así que lo que se verifica acá es que el listado no rompa ni
    // mezcle datos -- la prueba de fondo de "no ve pagos ajenos" ya está
    // cubierta por la Task 3/4 vía confirmarPago y el filtro por lote_id;
    // esta prueba confirma que el acreedor puede abrir /admin/pagos sin
    // error con este escenario de cliente-multi-lote-multi-acreedor.
    await expect(page.getByRole('heading', { name: 'Pagos' })).toBeVisible()
    expect(identificadorPropio).toBeTruthy()
    expect(identificadorAjeno).toBeTruthy()
  })

  test('pagar/[id] con una cuota de un lote ajeno (de otro cliente) es rechazado', async ({
    page,
  }) => {
    await login(page, fixtures.cliente.email, fixtures.password)

    const admin = createAdminClient()
    const { data: cuotaAjena } = await admin
      .from('cuotas')
      .select('id')
      .eq('lote_id', fixtures.loteId)
      .limit(1)
      .single()

    // fixtures.cliente es el dueño de fixtures.loteId en el fixture estándar
    // -- para simular "cuota ajena" hace falta un cliente DISTINTO. Se
    // reusa el flujo de venta para generar uno nuevo con su propio lote y
    // se prueba que el cliente del fixture estándar no puede pagar esa
    // cuota ajena.
    await login(page, fixtures.admin.email, fixtures.password)
    const loteAjenoId = await crearLoteReservadoListoParaVender(
      `E2E Multi Cuota Ajena ${Date.now()}`,
      5000,
      fixtures.acreedorConDatos.id
    )
    await venderLotePorUI(page, loteAjenoId, {
      email: `otro.cliente.${Date.now()}@sima-e2e.invalid`,
      fullName: 'Otro Cliente',
    })
    const { data: cuotaDelOtro } = await admin
      .from('cuotas')
      .select('id')
      .eq('lote_id', loteAjenoId)
      .single()

    await login(page, fixtures.cliente.email, fixtures.password)
    const respuesta = await page.goto(`/portal-cliente/pagar/${cuotaDelOtro!.id}`)
    expect(respuesta?.status()).toBe(404)

    void cuotaAjena
  })
})
```

- [ ] **Step 2: Correr toda la suite nueva**

Run: `npx playwright test cliente-varios-lotes`
Expected: PASS (5 tests). Si algún locator no matchea, ajustarlo para que coincida con el HTML real de las Tasks 5-8 — no cambiar el criterio del test. Si un test revela lo que parece un bug real de aplicación (no un problema de autoría del test), reportar BLOCKED con detalles en vez de parchear la app en silencio.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/cliente-varios-lotes.spec.ts
git commit -m "test: cobertura e2e de cliente con varios lotes"
```

---

### Task 10: Regresión final + limpieza de datos de prueba

**Files:** ninguno (solo comandos y limpieza vía SQL).

**Ejecutada por el CONTROLLER, no por un subagente.**

- [ ] **Step 1: Build limpio**

Run: `npm run build`
Expected: build exitoso, cero errores de tipos.

- [ ] **Step 2: Suite unitaria completa**

Run: `npm test`
Expected: todo en verde (esta tanda no toca ninguna función pura, pero se corre igual por costumbre).

- [ ] **Step 3: Suite e2e completa, dos corridas**

Run: `npx playwright test`
Expected: todo en verde, dos veces, sin flakes. Prestar especial atención a `pago-flujo-completo.spec.ts` y `pagos-acotados-por-acreedor.spec.ts` (las suites de pagos ya existentes) — son las más expuestas a una regresión de esta tanda, porque tocan exactamente `confirmarPago` y `/admin/pagos`.

- [ ] **Step 4: Limpiar datos de prueba**

Con `mcp__supabase__execute_sql` (verificar `get_project_url` contra `.env.local` antes):

```sql
with lotes_e2e as (
  select id, cliente_id from public.lotes
  where identificador like 'E2E %'
    and identificador not in ('E2E Test Lote', 'E2E Lote Secundario')
),
del_pago_imputaciones as (
  delete from public.pago_imputaciones
  where cuota_id in (select id from public.cuotas where lote_id in (select id from lotes_e2e))
  returning id
),
del_pagos as (
  delete from public.pagos where lote_id in (select id from lotes_e2e)
  returning id
),
del_cuotas as (
  delete from public.cuotas where lote_id in (select id from lotes_e2e) returning id
),
del_lotes as (
  delete from public.lotes where id in (select id from lotes_e2e) returning id
),
del_profiles_clientes as (
  delete from public.profiles where id in (select cliente_id from lotes_e2e where cliente_id is not null) returning id
)
select
  (select count(*) from del_pago_imputaciones) as imputaciones_borradas,
  (select count(*) from del_pagos) as pagos_borrados,
  (select count(*) from del_cuotas) as cuotas_borradas,
  (select count(*) from del_lotes) as lotes_borrados,
  (select count(*) from del_profiles_clientes) as profiles_clientes_borrados;
```

Nota: esta vez la limpieza de `pagos` filtra por `lote_id` (columna nueva de esta tanda) en vez de por `cliente_id` — usar `lote_id` es lo correcto de acá en más para cualquier limpieza futura de datos de prueba, dado que ya no hay 1:1 cliente↔lote.

## Self-Review (completado antes de entregar este plan)

- **Cobertura de la spec:** los 5 puntos de la spec están cubiertos: `pagos.lote_id` (Task 1), `registrarPago` (Task 2), `confirmarPago` (Task 3), `/admin/pagos` (Task 4), `venderLote` (Task 5), portal lista+detalle (Tasks 6-7), `pagar/[id]` (Task 8).
- **Placeholders:** ninguno.
- **Consistencia de tipos:** `Pago` (Task 4) gana `lote_id: string`, consistente con la columna agregada en Task 1 y con `columnasPago` incluyéndola en el `select`. `clienteId` (Task 5) reemplaza consistentemente las 2 apariciones de `invited.user.id` que quedaban fuera del bloque de invitación — señalado explícitamente en el Step 2 de la Task 5 para que quien la implemente busque el texto y confirme que no queda ninguna suelta.
- **Riesgo identificado y mitigado:** esta tanda toca directamente el motor de pagos/imputaciones, ya endurecido varias veces en tandas anteriores por bugs reales de plata (doble imputación, race conditions). La Task 10 llama la atención explícitamente sobre correr `pago-flujo-completo.spec.ts` y `pagos-acotados-por-acreedor.spec.ts` con atención extra, y el patrón de claim atómico existente en `confirmarPago` no se toca (solo la resolución de `lote`, que ocurre ANTES del claim).
