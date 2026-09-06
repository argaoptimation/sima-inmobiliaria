import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcularEstadoCobranza } from '@/lib/cobranza/estado-cliente'
import { calcularInteresMoratorio } from '@/lib/cobranza/interes-moratorio'
import { convertirUsdAPesos } from '@/lib/cobranza/cotizacion-dolar'
import { formatearFechaCorta } from '@/lib/fecha/formatear-fecha-corta'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { notFound, redirect } from 'next/navigation'
import { eliminarPago } from './actions'
import { BotonEliminarPago } from './BotonEliminarPago'
import { EnlaceBoton } from '@/components/EnlaceBoton'

const ETIQUETA_ESTADO: Record<string, string> = {
  normal: 'Al día',
  atrasado: 'Atrasado',
  moroso: 'Moroso',
  prejudicial: 'Posible prejudicial',
}

const CLASE_ESTADO: Record<string, string> = {
  normal: 'bg-green-50 text-green-700',
  atrasado: 'bg-amber-50 text-amber-700 font-semibold',
  moroso: 'bg-red-50 text-red-600 font-semibold',
  prejudicial: 'bg-orange-50 text-orange-700 font-semibold',
}

// Píldora del estado de CADA pago en "Mis pagos" (04/09, pedido de Gabriel:
// rojo/verde, redondeada, para que el cliente detecte de un vistazo si se
// olvidó de subir un comprobante o si ya quedó confirmado -- solo visual,
// no es un botón).
const CLASE_ESTADO_PAGO: Record<string, string> = {
  pendiente: 'bg-red-100 text-red-700',
  confirmado: 'bg-green-100 text-green-700',
}
const ETIQUETA_ESTADO_PAGO: Record<string, string> = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
}

export default async function PortalClienteLotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const { id } = await params
  const { ok, error } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: lote } = await supabase
    .from('lotes')
    .select('id, identificador, moneda, cliente_id, interes_moratorio_diario, ciclo_actual')
    .eq('id', id)
    .single()

  if (!lote || lote.cliente_id !== user!.id) {
    notFound()
  }

  // Acotado al ciclo VIGENTE (26/08, bug real encontrado): sin este filtro,
  // un lote que se rescindió y se revendió a otro cliente mezclaba acá la
  // deuda vieja del dueño anterior con la del ciclo actual -- mismo
  // criterio que ya usa el detalle del lote en /admin.
  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, numero, monto_base, saldo_pendiente, fecha_vencimiento, refinanciada')
    .eq('lote_id', lote!.id)
    .eq('ciclo', lote!.ciclo_actual)
    .order('numero', { ascending: true })

  const hoy = hoyArgentina()
  const estado = calcularEstadoCobranza(
    (cuotas ?? []).map((cuota) => ({
      saldoPendiente: cuota.saldo_pendiente,
      fechaVencimiento: cuota.fecha_vencimiento,
    })),
    hoy
  )

  const primeraImpaga = cuotas?.find((cuota) => cuota.saldo_pendiente > 0)

  // Se calcula una sola vez acá (no en el render): la tabla de escritorio y
  // las tarjetas de mobile muestran la misma cuota de dos formas distintas
  // -- sin esto, "vencida"/interés moratorio quedarían duplicados en dos
  // lugares del JSX, con riesgo real de que se desincronicen a futuro.
  const cuotasConDatos = (cuotas ?? []).map((cuota) => {
    const vencida = cuota.saldo_pendiente > 0 && cuota.fecha_vencimiento < hoy
    const interesMoratorio = vencida
      ? calcularInteresMoratorio(
          { saldoPendiente: cuota.saldo_pendiente, fechaVencimiento: cuota.fecha_vencimiento },
          lote!.interes_moratorio_diario,
          hoy
        )
      : 0
    return { ...cuota, interesMoratorio }
  })

  const totalPendiente = (cuotas ?? []).reduce(
    (acumulado, cuota) => acumulado + cuota.saldo_pendiente,
    0
  )

  // Fallback en cascada: la cotización más reciente en o antes de hoy --
  // mismo criterio que usa la pantalla de pago (resuelve fin de semana / día
  // sin cargar sin iterar día por día a mano).
  const { data: cotizacionVigente } =
    lote!.moneda === 'USD'
      ? await supabase
          .from('cotizaciones_dolar')
          .select('valor, fecha')
          .lte('fecha', hoy)
          .order('fecha', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null }

  // .eq('cliente_id', ...) además de lote_id -- mismo motivo que el filtro
  // de ciclo en cuotas: si el lote se rescindió y se revendió, los pagos
  // del dueño anterior también cuelgan de este lote_id.
  const { data: pagos } = await supabase
    .from('pagos')
    .select('id, monto, moneda, estado, comprobante_path, confirmado_acreedor_por, confirmado_admin_por')
    .eq('lote_id', lote!.id)
    .eq('cliente_id', user!.id)
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
    <div className="mx-auto max-w-3xl px-6 py-10">
      <EnlaceBoton
        href="/portal-cliente"
        className="mb-4 inline-block text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
      >
        ← Volver a tus lotes
      </EnlaceBoton>

      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {ok && <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{ok}</p>}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold text-blue-900">{lote!.identificador}</h1>
        <span className={`rounded-full px-2.5 py-1 text-xs ${CLASE_ESTADO[estado]}`}>
          {ETIQUETA_ESTADO[estado]}
        </span>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total pendiente</p>
          <p className="mt-1 text-2xl font-bold text-blue-900">
            {totalPendiente} <span className="text-base font-semibold text-slate-500">{lote!.moneda}</span>
          </p>
        </div>
        {lote!.moneda === 'USD' && cotizacionVigente && (
          <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Cotización del dólar hoy</p>
            <p className="mt-1 text-2xl font-bold text-blue-900">{cotizacionVigente.valor} <span className="text-base font-semibold text-slate-500">ARS</span></p>
          </div>
        )}
      </div>

      <h2 className="mb-3 text-lg font-bold text-blue-900">Cuotas</h2>

      {/* Mobile: tarjetas apiladas -- la tabla de 6 columnas no entra en
          375px sin scroll horizontal (checklist del design system lo pide
          evitar). Desktop sigue con la tabla, oculta acá con `md:hidden`. */}
      <div className="mb-10 space-y-3 md:hidden">
        {cuotasConDatos.map((cuota) => (
          <div key={cuota.id} className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold text-blue-900">Cuota {cuota.numero}</span>
              {primeraImpaga?.id === cuota.id && (
                <EnlaceBoton
                  href={`/portal-cliente/pagar/${cuota.id}`}
                  className="inline-block whitespace-nowrap rounded-lg bg-blue-800 px-3 py-1.5 text-center text-xs font-semibold text-white transition-colors hover:bg-blue-900"
                >
                  Pagar cuota
                </EnlaceBoton>
              )}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-slate-500">Vencimiento</dt>
              <dd className="text-right text-slate-700">{formatearFechaCorta(cuota.fecha_vencimiento)}</dd>
              <dt className="text-slate-500">Monto base</dt>
              <dd className="text-right text-slate-700">
                {cuota.monto_base} {lote!.moneda}
              </dd>
              <dt className="text-slate-500">Saldo pendiente</dt>
              <dd className="text-right">
                {cuota.refinanciada ? (
                  <span className="italic text-slate-500">Refinanció</span>
                ) : (
                  <>
                    <span className="font-medium text-slate-800">
                      {cuota.saldo_pendiente} {lote!.moneda}
                    </span>
                    {lote!.moneda === 'USD' && cotizacionVigente && (
                      <span className="mt-1 block w-fit rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-800 ml-auto">
                        ≈ {convertirUsdAPesos(cuota.saldo_pendiente, cotizacionVigente.valor)} ARS
                      </span>
                    )}
                  </>
                )}
              </dd>
              {cuota.interesMoratorio > 0 && (
                <>
                  <dt className="text-slate-500">Interés moratorio</dt>
                  <dd className="text-right">
                    <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-600">
                      +{cuota.interesMoratorio} {lote!.moneda}
                    </span>
                  </dd>
                </>
              )}
            </dl>
          </div>
        ))}
      </div>

      <div className="mb-10 hidden overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-50 text-left text-blue-900">
              <th className="px-4 py-3 font-semibold">Cuota</th>
              <th className="px-4 py-3 font-semibold">Vencimiento</th>
              <th className="px-4 py-3 font-semibold">Monto base</th>
              <th className="px-4 py-3 font-semibold">Saldo pendiente</th>
              <th className="px-4 py-3 font-semibold">Interés moratorio</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {cuotasConDatos.map((cuota) => (
              <tr key={cuota.id} className="border-t border-blue-100 hover:bg-blue-50/40">
                <td className="px-4 py-3 font-medium text-slate-800">{cuota.numero}</td>
                <td className="px-4 py-3 text-slate-600">{formatearFechaCorta(cuota.fecha_vencimiento)}</td>
                <td className="px-4 py-3 text-slate-600">
                  {cuota.monto_base} {lote!.moneda}
                </td>
                <td className="px-4 py-3">
                  {cuota.refinanciada ? (
                    <span className="italic text-slate-500">Refinanció</span>
                  ) : (
                    <>
                      <span className="font-medium text-slate-800">
                        {cuota.saldo_pendiente} {lote!.moneda}
                      </span>
                      {lote!.moneda === 'USD' && cotizacionVigente && (
                        <span className="mt-1 block w-fit rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-800">
                          ≈ {convertirUsdAPesos(cuota.saldo_pendiente, cotizacionVigente.valor)} ARS
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td className="px-4 py-3">
                  {cuota.interesMoratorio > 0 && (
                    <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-600">
                      +{cuota.interesMoratorio} {lote!.moneda}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {primeraImpaga?.id === cuota.id && (
                    <EnlaceBoton
                      href={`/portal-cliente/pagar/${cuota.id}`}
                      className="inline-block whitespace-nowrap rounded-lg bg-blue-800 px-3 py-1.5 text-center text-xs font-semibold text-white transition-colors hover:bg-blue-900"
                    >
                      Pagar cuota
                    </EnlaceBoton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 text-lg font-bold text-blue-900">Mis pagos</h2>
      {pagosConLink.length === 0 ? (
        <div className="rounded-xl border border-blue-100 bg-white p-5 text-sm text-slate-600 shadow-sm">
          Todavía no registraste ningún pago.
        </div>
      ) : (
        <>
          {/* Mobile: misma lógica que Cuotas -- tarjetas en vez de tabla. */}
          <div className="space-y-3 md:hidden">
            {pagosConLink.map((pago) => {
              const puedeEliminar = !pago.confirmado_acreedor_por && !pago.confirmado_admin_por
              const eliminarPagoConId = eliminarPago.bind(null, pago.id)
              return (
                <div
                  key={pago.id}
                  data-testid="pago-cliente-mobile"
                  className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-semibold text-blue-900">
                      {pago.monto} {pago.moneda}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          CLASE_ESTADO_PAGO[pago.estado] ?? 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {ETIQUETA_ESTADO_PAGO[pago.estado] ?? pago.estado}
                      </span>
                      {puedeEliminar && <BotonEliminarPago eliminarPagoAction={eliminarPagoConId} />}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {!pago.comprobante_path ? (
                      <div className="flex flex-wrap items-center gap-2 text-sm text-amber-700">
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold">
                          ⚠ Falta subir comprobante
                        </span>
                        <EnlaceBoton
                          href={`/portal-cliente/pagos/${pago.id}/comprobante`}
                          className="font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
                        >
                          Subir
                        </EnlaceBoton>
                      </div>
                    ) : pago.comprobanteUrl ? (
                      <a
                        href={pago.comprobanteUrl}
                        target="_blank"
                        className="text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
                      >
                        Ver comprobante
                      </a>
                    ) : (
                      <span className="text-sm text-slate-500">Comprobante no disponible</span>
                    )}
                    {pago.estado === 'confirmado' && (
                      <EnlaceBoton
                        href={`/portal-cliente/pagos/${pago.id}/recibo`}
                        className="text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
                      >
                        Ver recibo
                      </EnlaceBoton>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="hidden overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-50 text-left text-blue-900">
                  <th className="px-4 py-3 font-semibold">Monto</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Comprobante</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {pagosConLink.map((pago) => {
                  const puedeEliminar = !pago.confirmado_acreedor_por && !pago.confirmado_admin_por
                  const eliminarPagoConId = eliminarPago.bind(null, pago.id)
                  return (
                    <tr
                      key={pago.id}
                      data-testid="pago-cliente"
                      className="border-t border-blue-100 hover:bg-blue-50/40"
                    >
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {pago.monto} {pago.moneda}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            CLASE_ESTADO_PAGO[pago.estado] ?? 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {ETIQUETA_ESTADO_PAGO[pago.estado] ?? pago.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          {!pago.comprobante_path ? (
                            <span className="inline-flex items-center gap-2 text-amber-700">
                              <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold">
                                ⚠ Falta subir comprobante
                              </span>
                              <EnlaceBoton
                                href={`/portal-cliente/pagos/${pago.id}/comprobante`}
                                className="font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
                              >
                                Subir
                              </EnlaceBoton>
                            </span>
                          ) : pago.comprobanteUrl ? (
                            <a
                              href={pago.comprobanteUrl}
                              target="_blank"
                              className="font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
                            >
                              Ver comprobante
                            </a>
                          ) : (
                            <span className="text-slate-500">Comprobante no disponible</span>
                          )}
                          {pago.estado === 'confirmado' && (
                            <EnlaceBoton
                              href={`/portal-cliente/pagos/${pago.id}/recibo`}
                              className="font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
                            >
                              Ver recibo
                            </EnlaceBoton>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {puedeEliminar && <BotonEliminarPago eliminarPagoAction={eliminarPagoConId} />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
