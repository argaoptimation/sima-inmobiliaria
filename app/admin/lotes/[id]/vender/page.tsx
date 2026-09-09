import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { venderLote } from './actions'
import { CuotasYDocumento } from './CuotasYDocumento'
import { FileSignature } from 'lucide-react'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import {
  ENTRADA,
  ENLACE,
  BANNER_ERROR,
  PANEL,
  PANEL_SIN_PADDING,
  SECCION_FORM,
  SECCION_FORM_NUMERO,
  SECCION_FORM_TITULO,
  SECCION_FORM_BAJADA,
  GRILLA_CAMPOS,
  ETIQUETA_CAMPO,
  FICHA_LOTE_TAPA,
  FICHA_LOTE_BADGE,
  FICHA_LOTE_FILA,
  FICHA_LOTE_DESTACADO,
} from '@/lib/ui/clases'
import { calcularSenaADescontar } from '@/lib/lotes/sena-a-descontar'

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
    documentoFirmado?: string
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
    documentoFirmado: documentoFirmadoPreservado,
  } = sp

  await requireAdministrador()

  const supabase = await createClient()

  // Los datos del lote para la ficha de la derecha (09/09, mockup 4):
  // hasta ahora se vendia un lote sin ver en pantalla ni su superficie ni
  // su nomenclatura.
  const { data: lote } = await supabase
    .from('lotes')
    .select(
      'id, identificador, estado, precio_total, moneda, ubicacion, superficie_m2, manzana, numero_lote, nomenclatura_catastral, matricula, loteos(nombre)'
    )
    .eq('id', id)
    .single()

  if (!lote) {
    notFound()
  }

  const { data: reserva } = await supabase
    .from('reservas')
    .select(
      'nombre_completo, dni, domicilio, telefono_prefijo, telefono_numero, email, monto_sena, moneda_sena, created_at'
    )
    .eq('lote_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Cuánto de la seña se descuenta, ya en la moneda del lote. Se calcula
  // acá (y no en el componente) porque convertir una seña cobrada en otra
  // moneda necesita la cotización del día de la reserva, que sale de la
  // base. Es exactamente el mismo cálculo que hace venderLote() al guardar.
  const sena = await calcularSenaADescontar(supabase, {
    montoSena: reserva?.monto_sena ?? null,
    monedaSena: reserva?.moneda_sena ?? null,
    monedaLote: lote!.moneda as string,
    fechaSena: reserva?.created_at ? String(reserva.created_at).slice(0, 10) : null,
  })

  const loteoNombre = Array.isArray(lote!.loteos)
    ? (lote!.loteos[0]?.nombre ?? null)
    : ((lote!.loteos as { nombre: string } | null)?.nombre ?? null)
  const ubicacionEnLaFicha = [
    lote!.manzana ? `Manzana ${lote!.manzana}` : null,
    lote!.numero_lote ? `Lote ${lote!.numero_lote}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

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
    <main>
      <div className="mb-5">
        <div className="flex flex-wrap gap-4">
          <EnlaceBoton href="/admin/lotes" className={`text-sm ${ENLACE}`}>
            ← Volver a Lotes
          </EnlaceBoton>
          <EnlaceBoton href={`/admin/lotes/${id}`} className={`text-sm ${ENLACE}`}>
            ← Volver al lote
          </EnlaceBoton>
        </div>
        <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight text-slate-900">
          Vender lote y dar de alta al cliente
        </h1>
      </div>

      {error && <p className={`mb-4 ${BANNER_ERROR}`}>{error}</p>}

      {lote!.estado !== 'reservado' ? (
        <p className={`${PANEL} text-sm text-amber-800`}>
          Este lote no está en estado reservado (estado actual: {lote!.estado}), no se puede
          vender. Primero hay que reservarlo.
        </p>
      ) : (
        <>
          {/* La reserva vigente, arriba de todo y a lo ancho (mockup 4): es
              el hecho más importante de la pantalla, no un dato más. Antes
              era una listita gris en el medio del formulario. */}
          {reserva && (
            <div className="mb-4 flex flex-wrap items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4 ring-1 ring-amber-300/40">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <FileSignature className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-heading text-sm font-bold text-slate-900">
                  Reserva vigente identificada
                </p>
                <p className="mt-0.5 text-xs text-slate-700">
                  Lote reservado por <strong>{reserva.nombre_completo}</strong> (DNI {reserva.dni}).
                  Seña de{' '}
                  <strong className="tabular-nums">
                    {reserva.monto_sena} {reserva.moneda_sena}
                  </strong>
                  {reserva.created_at
                    ? ` el ${new Date(String(reserva.created_at)).toLocaleDateString('es-AR')}`
                    : ''}
                  .
                </p>
                <p className="mt-1.5 text-xs text-slate-600">
                  Los campos del comprador ya vienen completados con estos datos. Si el comprador
                  final es otra persona (por ejemplo, alguien reservó en representación de otra),
                  sobrescribilos: el usuario que se crea es siempre el comprador, no
                  necesariamente quien reservó.
                </p>
              </div>
            </div>
          )}

          {confirmarClienteId && (
            <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">Ya existe una cuenta de cliente con ese email</p>
              <p className="mt-1">
                Nombre en esa cuenta: <span className="font-medium">{nombreEncontrado}</span>
              </p>
              <p className="mt-1">
                Si confirmás, este lote se va a asociar a esa cuenta ya existente (no se manda
                ningún mail de invitación nuevo). Revisá que sea la persona correcta antes de
                confirmar. El documento firmado que ya adjuntaste se conserva: no hace falta
                volver a subirlo.
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

          <form action={venderLoteConId}>
            {confirmarClienteId && (
              <input type="hidden" name="confirmarClienteExistente" value={confirmarClienteId} />
            )}

            <CuotasYDocumento
              loteId={id}
              precioTotal={lote!.precio_total}
              monedaLote={lote!.moneda}
              montoSenaRegistrada={reserva?.monto_sena ?? null}
              monedaSena={reserva?.moneda_sena ?? null}
              sena={sena}
              cantidadCuotasInicial={cantidadCuotasPreservada ?? ''}
              modoInicial={modoInicial}
              montosInicial={montosInicial}
              entregaInicial={entregaMontoPreservado ?? ''}
              interesMoratorioDiarioInicial={interesMoratorioDiarioPreservado ?? ''}
              documentoInicial={documentoFirmadoPreservado ?? null}
              fechaPrimeraCuotaInicial={fechaPrimeraCuotaPreservada ?? ''}
              textoBotonEnvio={
                confirmarClienteId
                  ? 'Confirmar venta con esta cuenta existente'
                  : 'Confirmar venta y enviar invitación'
              }
              seccionCliente={
                <section className={SECCION_FORM}>
                  <div className="flex items-center gap-3">
                    <span className={SECCION_FORM_NUMERO}>1</span>
                    <div>
                      <h2 className={SECCION_FORM_TITULO}>Cliente comprador</h2>
                      <p className={SECCION_FORM_BAJADA}>
                        Se le crea una cuenta con este mail y se le manda la invitación al portal.
                      </p>
                    </div>
                  </div>

                  <div className={GRILLA_CAMPOS}>
                    <label className="text-sm">
                      <span className={ETIQUETA_CAMPO}>Nombre completo / razón social</span>
                      <input
                        name="fullName"
                        placeholder="Nombre completo del comprador *"
                        defaultValue={fullNamePreservado ?? reserva?.nombre_completo ?? ''}
                        required
                        className={`${ENTRADA} w-full`}
                      />
                    </label>

                    <label className="text-sm">
                      <span className={ETIQUETA_CAMPO}>Correo electrónico</span>
                      <input
                        name="email"
                        type="email"
                        placeholder="Email del comprador *"
                        defaultValue={emailPreservado ?? reserva?.email ?? ''}
                        required
                        className={`${ENTRADA} w-full`}
                      />
                    </label>
                  </div>
                </section>
              }
              seccionParticipantes={
                <section className={SECCION_FORM}>
                  <div className="flex items-center gap-3">
                    <span className={SECCION_FORM_NUMERO}>3</span>
                    <div>
                      <h2 className={SECCION_FORM_TITULO}>Reparto y destino de cobro</h2>
                      <p className={SECCION_FORM_BAJADA}>
                        Quién cobra cada cuota y cómo se reparte. Se carga en el paso siguiente,
                        apenas confirmes la venta: recién ahí existen las cuotas que hay que
                        repartir.
                      </p>
                    </div>
                  </div>
                </section>
              }
              fichaTecnica={
                <div className={PANEL_SIN_PADDING}>
                  <div className={FICHA_LOTE_TAPA}>
                    <div className="relative z-10 flex items-center justify-between">
                      <span className={FICHA_LOTE_BADGE}>
                        {ubicacionEnLaFicha || lote!.identificador}
                      </span>
                    </div>
                    <div className="relative z-10">
                      <h3 className="font-heading text-lg font-bold text-white">
                        {loteoNombre ?? lote!.identificador}
                      </h3>
                      {lote!.ubicacion && (
                        <p className="text-xs text-slate-300">{lote!.ubicacion}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 p-4">
                    <p className="border-b border-slate-100 pb-1 text-xs font-bold tracking-wider text-slate-400 uppercase">
                      Ficha técnica y catastral
                    </p>
                    <div className="space-y-2.5">
                      <div className={FICHA_LOTE_FILA}>
                        <span className="text-slate-500">Identificador</span>
                        <span className="font-semibold text-slate-800">{lote!.identificador}</span>
                      </div>
                      <div className={FICHA_LOTE_FILA}>
                        <span className="text-slate-500">Superficie total</span>
                        <span className="font-bold text-slate-800 tabular-nums">
                          {lote!.superficie_m2 ? `${lote!.superficie_m2} m²` : '—'}
                        </span>
                      </div>
                      <div className={FICHA_LOTE_FILA}>
                        <span className="text-slate-500">Nomenclatura catastral</span>
                        <span className="font-medium text-slate-800">
                          {lote!.nomenclatura_catastral ?? '—'}
                        </span>
                      </div>
                      <div className={FICHA_LOTE_FILA}>
                        <span className="text-slate-500">Matrícula / folio real</span>
                        <span className="font-medium text-slate-800">{lote!.matricula ?? '—'}</span>
                      </div>
                      <div className={FICHA_LOTE_DESTACADO}>
                        <span className="text-xs font-bold text-slate-700">Precio de lista</span>
                        <span className="font-heading text-base font-extrabold text-blue-700 tabular-nums">
                          {lote!.precio_total
                            ? `${lote!.precio_total.toLocaleString('es-AR')} ${lote!.moneda}`
                            : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              }
            />
          </form>
        </>
      )}
    </main>
  )
}
