import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { venderLote } from './actions'

export default async function VenderLotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  await requireAdministrador()
  const { error } = await searchParams

  const supabase = await createClient()

  const { data: lote } = await supabase
    .from('lotes')
    .select('id, identificador, estado, precio_total')
    .eq('id', id)
    .single()

  if (!lote) {
    notFound()
  }

  const { data: reserva } = await supabase
    .from('reservas')
    .select('nombre_completo, dni, domicilio, telefono, email, monto_sena, moneda_sena')
    .eq('lote_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const venderLoteConId = venderLote.bind(null, id)

  return (
    <main className="max-w-md">
      <div className="mb-4 flex gap-4">
        <a href="/admin/lotes" className="text-sm underline">
          ← Volver a Lotes
        </a>
        <a href={`/admin/lotes/${id}`} className="text-sm underline">
          ← Volver al lote
        </a>
      </div>
      <h1 className="mb-6 text-xl font-semibold">Vender lote y dar de alta al cliente</h1>

      {lote!.estado !== 'reservado' ? (
        <p className="mb-4 rounded bg-amber-100 p-2 text-sm text-amber-800">
          Este lote no está en estado reservado (estado actual: {lote!.estado}), no se puede
          vender. Primero hay que reservarlo.
        </p>
      ) : (
        <>
          {reserva && (
            <div className="mb-4 rounded border border-gray-200 bg-gray-50 p-3 text-sm">
              <p className="mb-1 font-medium">Datos de la reserva</p>
              <p>Persona que reservó: {reserva.nombre_completo}</p>
              <p>DNI: {reserva.dni}</p>
              <p>Domicilio: {reserva.domicilio}</p>
              <p>Teléfono: {reserva.telefono}</p>
              <p>
                Seña: {reserva.monto_sena} {reserva.moneda_sena}
              </p>
              <p className="mt-2 text-gray-600">
                Los campos de comprador de abajo ya vienen completados con estos datos. Si el
                comprador final es otra persona (por ejemplo, alguien reservó en representación
                de otra persona), simplemente sobrescribilos: el usuario que se crea abajo es
                siempre el comprador, no necesariamente quien reservó.
              </p>
            </div>
          )}

          {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}

          <form action={venderLoteConId} className="flex flex-col gap-3">
            <input
              name="fullName"
              placeholder="Nombre completo del comprador"
              defaultValue={reserva?.nombre_completo ?? ''}
              required
              className="rounded border px-3 py-2"
            />
            <input
              name="email"
              type="email"
              placeholder="Email del comprador"
              defaultValue={reserva?.email ?? ''}
              required
              className="rounded border px-3 py-2"
            />
            <input
              name="cantidadCuotas"
              type="number"
              min="1"
              step="1"
              placeholder="Cantidad de cuotas (1 para venta al contado)"
              required
              className="rounded border px-3 py-2"
            />
            <label className="text-sm">
              Fecha de la primera cuota
              <input
                name="fechaPrimeraCuota"
                type="date"
                required
                className="mt-1 block w-full rounded border px-3 py-2"
              />
            </label>
            <button type="submit" className="rounded bg-black px-3 py-2 text-white">
              Confirmar venta y enviar invitación
            </button>
          </form>
        </>
      )}
    </main>
  )
}
