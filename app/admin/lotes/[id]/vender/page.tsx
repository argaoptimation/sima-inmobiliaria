import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { venderLote } from './actions'

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
    documentoFirmadoPath?: string
    clienteNuevoId?: string
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
    documentoFirmadoPath,
    clienteNuevoId,
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

  const modo = modoPreservado === 'manual' ? 'manual' : 'automatico'
  const cantidadCuotasNum = cantidadCuotasPreservada ? Number(cantidadCuotasPreservada) : null

  const mostrarPasoMontos = modo === 'manual' && !!cantidadCuotasNum && !documentoFirmadoPath
  const mostrarPasoConfirmarMontos = modo === 'manual' && !!documentoFirmadoPath

  const montosManuales: string[] =
    cantidadCuotasNum && (mostrarPasoMontos || mostrarPasoConfirmarMontos)
      ? Array.from({ length: cantidadCuotasNum }, (_, i) => sp[`cuotaMonto${i + 1}`] ?? '')
      : []

  const sumaManual = montosManuales.reduce((acc, valor) => acc + (Number(valor) || 0), 0)
  const diferenciaManual =
    mostrarPasoConfirmarMontos && lote!.precio_total ? sumaManual - lote!.precio_total : null

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
          {reserva && !mostrarPasoMontos && !mostrarPasoConfirmarMontos && (
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
                confirmar.
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

          {mostrarPasoConfirmarMontos && (
            <div className="mb-4 rounded border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
              <p className="font-medium">Revisá el balance antes de confirmar</p>
              <p className="mt-1">Suma total de las cuotas cargadas: {sumaManual}</p>
              {lote!.precio_total && <p>Precio de lista del lote: {lote!.precio_total}</p>}
              {diferenciaManual !== null && (
                <p className="mt-1 font-medium">
                  Diferencia respecto al precio de lista: {diferenciaManual > 0 ? '+' : ''}
                  {diferenciaManual}
                </p>
              )}
            </div>
          )}

          <form action={venderLoteConId} className="flex flex-col gap-3">
            {confirmarClienteId && (
              <input type="hidden" name="confirmarClienteExistente" value={confirmarClienteId} />
            )}
            {clienteNuevoId && <input type="hidden" name="clienteNuevoId" value={clienteNuevoId} />}

            {mostrarPasoConfirmarMontos ? (
              <>
                <input type="hidden" name="modo" value="manual" />
                <input type="hidden" name="fullName" value={fullNamePreservado ?? ''} />
                <input type="hidden" name="email" value={emailPreservado ?? ''} />
                <input type="hidden" name="cantidadCuotas" value={cantidadCuotasPreservada ?? ''} />
                <input
                  type="hidden"
                  name="fechaPrimeraCuota"
                  value={fechaPrimeraCuotaPreservada ?? ''}
                />
                <input type="hidden" name="documentoFirmadoPath" value={documentoFirmadoPath ?? ''} />
                {montosManuales.map((monto, indice) => (
                  <input key={indice} type="hidden" name={`cuotaMonto${indice + 1}`} value={monto} />
                ))}
                <input type="hidden" name="confirmarMontosManual" value="true" />
                <button type="submit" className="rounded bg-black px-3 py-2 text-white">
                  Confirmar venta
                </button>
              </>
            ) : mostrarPasoMontos ? (
              <>
                <input type="hidden" name="modo" value="manual" />
                <input type="hidden" name="fullName" value={fullNamePreservado ?? ''} />
                <input type="hidden" name="email" value={emailPreservado ?? ''} />
                <input type="hidden" name="cantidadCuotas" value={cantidadCuotasPreservada ?? ''} />
                <input
                  type="hidden"
                  name="fechaPrimeraCuota"
                  value={fechaPrimeraCuotaPreservada ?? ''}
                />
                {lote!.precio_total && (
                  <p className="text-sm text-gray-600">
                    Precio de lista del lote: {lote!.precio_total} — cargá el monto de cada cuota.
                  </p>
                )}
                {Array.from({ length: cantidadCuotasNum ?? 0 }, (_, indice) => (
                  <input
                    key={indice}
                    name={`cuotaMonto${indice + 1}`}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={`Cuota ${indice + 1}`}
                    required
                    className="rounded border px-3 py-2"
                  />
                ))}
                <label className="text-sm">
                  Documento firmado (boleto de compraventa o escritura)
                  <input
                    name="documentoFirmado"
                    type="file"
                    className="mt-1 block w-full rounded border px-3 py-2"
                  />
                </label>
                <button type="submit" className="rounded bg-black px-3 py-2 text-white">
                  Continuar
                </button>
              </>
            ) : (
              <>
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
                <input
                  name="cantidadCuotas"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Cantidad de cuotas (1 para venta al contado)"
                  defaultValue={cantidadCuotasPreservada ?? ''}
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

                <fieldset className="rounded border px-3 py-2">
                  <legend className="text-sm font-medium">Cómo cargar las cuotas</legend>
                  <label className="mr-4 text-sm">
                    <input type="radio" name="modo" value="automatico" defaultChecked className="mr-1" />
                    Automático
                  </label>
                  <label className="text-sm">
                    <input type="radio" name="modo" value="manual" className="mr-1" />
                    Manual
                  </label>
                </fieldset>

                <label className="text-sm">
                  Documento firmado (boleto de compraventa o escritura)
                  <input
                    name="documentoFirmado"
                    type="file"
                    className="mt-1 block w-full rounded border px-3 py-2"
                  />
                </label>

                <button type="submit" className="rounded bg-black px-3 py-2 text-white">
                  {confirmarClienteId
                    ? 'Confirmar venta con esta cuenta existente'
                    : 'Confirmar venta y enviar invitación'}
                </button>
              </>
            )}
          </form>
        </>
      )}
    </main>
  )
}
