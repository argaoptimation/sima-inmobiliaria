import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { venderLote } from './actions'
import { CuotasYDocumento } from './CuotasYDocumento'

export default async function VenderLotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    error?: string
    confirmarClienteId?: string
    nombreEncontrado?: string
    fullName?: string
    email?: string
    cantidadCuotas?: string
    fechaPrimeraCuota?: string
    dniReserva?: string
    dniPerfil?: string
    modo?: string
    entregaMonto?: string
    interesMoratorioDiario?: string
    [cuotaMontoKey: string]: string | undefined
  }>
}) {
  const { id } = await params
  const sp = await searchParams
  const {
    error,
    confirmarClienteId,
    nombreEncontrado,
    fullName: fullNamePreservado,
    email: emailPreservado,
    cantidadCuotas: cantidadCuotasPreservada,
    fechaPrimeraCuota: fechaPrimeraCuotaPreservada,
    dniReserva,
    dniPerfil,
    modo: modoPreservado,
    entregaMonto: entregaMontoPreservado,
    interesMoratorioDiario: interesMoratorioDiarioPreservado,
  } = sp

  await requireAdministrador()

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

  const modoInicial: 'automatico' | 'manual' = modoPreservado === 'manual' ? 'manual' : 'automatico'
  const cantidadCuotasInicialNum = cantidadCuotasPreservada ? Number(cantidadCuotasPreservada) : 0
  const cantidadCuotasParaMontos =
    Number.isFinite(cantidadCuotasInicialNum) && cantidadCuotasInicialNum > 0
      ? Math.min(cantidadCuotasInicialNum, 600)
      : 0
  const montosInicial: string[] = Array.from(
    { length: cantidadCuotasParaMontos },
    (_, i) => sp[`cuotaMonto${i + 1}`] ?? ''
  )

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

      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}

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

          {confirmarClienteId && (
            <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Ya existe una cuenta de cliente con ese email</p>
              <p className="mt-1">
                Nombre en esa cuenta: <span className="font-medium">{nombreEncontrado}</span>
              </p>
              <p className="mt-1">
                Si confirmás, este lote se va a asociar a esa cuenta ya existente (no se manda
                ningún mail de invitación nuevo). Revisá que sea la persona correcta antes de
                confirmar. Volvé a adjuntar el documento firmado, ya que no se conserva al volver
                a esta pantalla.
              </p>
              {dniReserva && dniPerfil && (
                <p className="mt-2">
                  El DNI de esta reserva ({dniReserva}) no coincide con el que ya tenía guardado (
                  {dniPerfil}). Se mantiene el guardado; si es un error, corregilo después desde la
                  ficha del cliente.
                </p>
              )}
            </div>
          )}

          <form action={venderLoteConId} className="flex flex-col gap-3">
            {confirmarClienteId && (
              <input type="hidden" name="confirmarClienteExistente" value={confirmarClienteId} />
            )}

            <input
              name="fullName"
              placeholder="Nombre completo del comprador"
              defaultValue={fullNamePreservado ?? reserva?.nombre_completo ?? ''}
              required
              className="rounded border px-3 py-2"
            />
            <input
              name="email"
              type="email"
              placeholder="Email del comprador"
              defaultValue={emailPreservado ?? reserva?.email ?? ''}
              required
              className="rounded border px-3 py-2"
            />
            <label className="text-sm">
              Fecha de la primera cuota
              <input
                name="fechaPrimeraCuota"
                type="date"
                defaultValue={fechaPrimeraCuotaPreservada ?? ''}
                required
                className="mt-1 block w-full rounded border px-3 py-2"
              />
            </label>

            <CuotasYDocumento
              precioTotal={lote!.precio_total}
              montoSenaRegistrada={reserva?.monto_sena ?? null}
              monedaSena={reserva?.moneda_sena ?? null}
              cantidadCuotasInicial={cantidadCuotasPreservada ?? ''}
              modoInicial={modoInicial}
              montosInicial={montosInicial}
              entregaInicial={entregaMontoPreservado ?? ''}
              interesMoratorioDiarioInicial={interesMoratorioDiarioPreservado ?? ''}
            />

            <button type="submit" className="rounded bg-black px-3 py-2 text-white">
              {confirmarClienteId
                ? 'Confirmar venta con esta cuenta existente'
                : 'Confirmar venta y enviar invitación'}
            </button>
          </form>
        </>
      )}
    </main>
  )
}
