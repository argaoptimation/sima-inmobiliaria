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

const ETIQUETA_ESTADO: Record<string, string> = {
  normal: 'Al día',
  moroso: 'Moroso',
  prejudicial: 'Posible prejudicial',
}

const CLASE_ESTADO: Record<string, string> = {
  normal: 'bg-green-50 text-green-700',
  moroso: 'bg-red-50 text-red-600 font-semibold',
  prejudicial: 'bg-amber-50 text-amber-700 font-semibold',
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
      <a
        href="/portal-cliente"
        className="mb-4 inline-block text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
      >
        ← Volver a tus lotes
      </a>

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
      <div className="mb-10 overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm">
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
            {cuotas?.map((cuota) => {
              const vencida = cuota.saldo_pendiente > 0 && cuota.fecha_vencimiento < hoy
              const interesMoratorio = vencida
                ? calcularInteresMoratorio(
                    { saldoPendiente: cuota.saldo_pendiente, fechaVencimiento: cuota.fecha_vencimiento },
                    lote!.interes_moratorio_diario,
                    hoy
                  )
                : 0
              return (
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
                    {interesMoratorio > 0 && (
                      <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-600">
                        +{interesMoratorio} {lote!.moneda}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {primeraImpaga?.id === cuota.id && (
                      <a
                        href={`/portal-cliente/pagar/${cuota.id}`}
                        className="inline-block whitespace-nowrap rounded-lg bg-blue-800 px-3 py-1.5 text-center text-xs font-semibold text-white transition-colors hover:bg-blue-900"
                      >
                        Pagar cuota
                      </a>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 text-lg font-bold text-blue-900">Mis pagos</h2>
      {pagosConLink.length === 0 ? (
        <div className="rounded-xl border border-blue-100 bg-white p-5 text-sm text-slate-600 shadow-sm">
          Todavía no registraste ningún pago.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm">
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
                  <tr key={pago.id} className="border-t border-blue-100 hover:bg-blue-50/40">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {pago.monto} {pago.moneda}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{pago.estado}</td>
                    <td className="px-4 py-3">
                      {!pago.comprobante_path ? (
                        <span className="inline-flex items-center gap-2 text-amber-700">
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold">
                            ⚠ Falta subir comprobante
                          </span>
                          <a
                            href={`/portal-cliente/pagos/${pago.id}/comprobante`}
                            className="font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
                          >
                            Subir
                          </a>
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
      )}
    </div>
  )
}
