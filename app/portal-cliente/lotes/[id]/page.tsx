import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcularEstadoCobranza } from '@/lib/cobranza/estado-cliente'
import { calcularInteresMoratorio } from '@/lib/cobranza/interes-moratorio'
import { convertirUsdAPesos } from '@/lib/cobranza/cotizacion-dolar'
import { formatearFechaCorta } from '@/lib/fecha/formatear-fecha-corta'
import { posicionesDelPlan } from '@/lib/cuotas/plan-de-cuotas'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { notFound, redirect } from 'next/navigation'
import { eliminarPago } from './actions'
import { BotonEliminarPago } from './BotonEliminarPago'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { ArrowLeft, Check, Clock, Circle, CreditCard, Banknote } from 'lucide-react'

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

const ETIQUETA_MOTIVO: Record<string, string> = {
  sena: 'Seña',
  ajuste: 'Corrección',
  saldar: 'Pago total anticipado',
  entrega: 'Entrega',
  cuota: 'Cuota',
}

// Línea de tiempo de cuotas (PR6 del rediseño, MOCKUP 7): el ícono de estado
// reemplaza tener que leer la columna de saldo para saber en qué cuota está
// parado el cliente. El acento de color a la izquierda de la fila es el mismo
// criterio verde/azul/gris de pagada/actual/futura.
const ACENTO_FILA: Record<string, string> = {
  pagada: 'border-l-[3px] border-l-green-300',
  refinanciada: 'border-l-[3px] border-l-slate-200',
  actual: 'border-l-[3px] border-l-blue-700 bg-blue-50/60',
  futura: 'border-l-[3px] border-l-transparent',
}

function IconoEstadoCuota({ estado }: { estado: string }) {
  if (estado === 'pagada') {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-green-300 bg-green-50">
        <Check className="h-[15px] w-[15px] text-green-700" />
      </span>
    )
  }
  if (estado === 'actual') {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-blue-300 bg-blue-100">
        <Clock className="h-[15px] w-[15px] text-blue-700" />
      </span>
    )
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
      <Circle className="h-2.5 w-2.5 text-slate-300" fill="currentColor" />
    </span>
  )
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
    .select('id, identificador, moneda, cliente_id, interes_moratorio_diario, ciclo_actual, manzana, numero_lote, loteo_id')
    .eq('id', id)
    .single()

  if (!lote || lote.cliente_id !== user!.id) {
    notFound()
  }

  const { data: loteo } = lote!.loteo_id
    ? await supabase.from('loteos').select('nombre').eq('id', lote!.loteo_id).maybeSingle()
    : { data: null }

  const tieneDatosDeLote = Boolean(lote!.manzana && lote!.numero_lote)
  const tituloLote = tieneDatosDeLote
    ? `Manzana ${lote!.manzana} · Lote ${lote!.numero_lote}`
    : lote!.identificador
  // Sin loteo cargado no repetir el identificador arriba Y como título -- mismo
  // criterio que la home del portal.
  const etiquetaLoteo = loteo?.nombre ?? (tieneDatosDeLote ? lote!.identificador : null)

  // Acotado al ciclo VIGENTE (26/08, bug real encontrado): sin este filtro,
  // un lote que se rescindió y se revendió a otro cliente mezclaba acá la
  // deuda vieja del dueño anterior con la del ciclo actual -- mismo
  // criterio que ya usa el detalle del lote en /admin.
  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, numero, plan, monto_base, saldo_pendiente, fecha_vencimiento, refinanciada, interes_condonado')
    .eq('lote_id', lote!.id)
    .eq('ciclo', lote!.ciclo_actual)
    .order('numero', { ascending: true })

  // Que lugar ocupa cada cuota adentro del plan que el cliente esta pagando
  // hoy (10/09). Si el lote se refinancio, el numero suelto ("Cuota 25")
  // no le dice nada al cliente que venia pagando la 10: al lado va "2 de 20
  // del plan refinanciado", que es lo que si entiende.
  const posicionesDelPlanDeCuotas = posicionesDelPlan(cuotas ?? [])

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
          {
            saldoPendiente: cuota.saldo_pendiente,
            fechaVencimiento: cuota.fecha_vencimiento,
            interesCondonado: cuota.interes_condonado,
          },
          lote!.interes_moratorio_diario,
          hoy
        )
      : 0
    const estadoCuota = cuota.refinanciada
      ? 'refinanciada'
      : cuota.saldo_pendiente <= 0
        ? 'pagada'
        : primeraImpaga?.id === cuota.id
          ? 'actual'
          : 'futura'
    return { ...cuota, interesMoratorio, vencida, estadoCuota }
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

  const mostrarPesos = lote!.moneda === 'USD' && Boolean(cotizacionVigente)
  const enPesos = (montoUsd: number) =>
    cotizacionVigente ? convertirUsdAPesos(montoUsd, cotizacionVigente.valor) : null

  // .eq('cliente_id', ...) además de lote_id -- mismo motivo que el filtro
  // de ciclo en cuotas: si el lote se rescindió y se revendió, los pagos
  // del dueño anterior también cuelgan de este lote_id.
  const { data: pagos } = await supabase
    .from('pagos')
    .select('id, monto, moneda, estado, comprobante_path, confirmado_acreedor_por, confirmado_admin_por, motivo, medio_pago, created_at')
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
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 underline-offset-4 hover:text-blue-900 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a tus lotes
      </EnlaceBoton>

      {error && <p className="mb-4 rounded-lg border-l-4 border-red-600 bg-red-50 p-3 text-sm font-medium text-red-800">{error}</p>}
      {ok && <p className="mb-4 rounded-lg border-l-4 border-green-600 bg-green-50 p-3 text-sm font-medium text-green-800">{ok}</p>}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          {etiquetaLoteo && (
            <span className="text-[11.5px] font-bold uppercase tracking-[0.11em] text-slate-500">
              {etiquetaLoteo}
            </span>
          )}
          <h1 className="text-2xl font-extrabold tracking-tight text-blue-950">{tituloLote}</h1>
        </div>
        <span className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${CLASE_ESTADO[estado]}`}>
          {ETIQUETA_ESTADO[estado]}
        </span>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total pendiente</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-blue-900">
            {totalPendiente} <span className="text-base font-semibold text-slate-500">{lote!.moneda}</span>
          </p>
        </div>
        {mostrarPesos && (
          <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Cotización del dólar hoy</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-blue-900">
              {cotizacionVigente!.valor} <span className="text-base font-semibold text-slate-500">ARS</span>
            </p>
          </div>
        )}
      </div>

      <h2 className="mb-3 text-lg font-bold text-blue-900">Cuotas</h2>

      {/* Mobile: tarjetas apiladas -- la tabla de columnas no entra en 375px
          sin scroll horizontal (checklist del design system lo pide evitar).
          Desktop sigue con la tabla, oculta acá con `md:hidden`. */}
      <div className="mb-10 space-y-2.5 md:hidden">
        {cuotasConDatos.map((cuota) => (
          <div
            key={cuota.id}
            className={`rounded-xl border border-blue-100 bg-white p-4 shadow-sm ${ACENTO_FILA[cuota.estadoCuota]}`}
          >
            <div className="mb-2 flex items-center gap-3">
              <IconoEstadoCuota estado={cuota.estadoCuota} />
              <span className={cuota.refinanciada ? 'font-semibold text-slate-400' : 'font-semibold text-blue-900'}>
                Cuota {cuota.numero}
                {cuota.refinanciada && (
                  <span className="mt-0.5 block w-fit rounded bg-slate-200 px-1.5 py-px text-[10px] font-bold tracking-wide text-slate-600 uppercase">
                    Refinanció
                  </span>
                )}
                {posicionesDelPlanDeCuotas.get(cuota.numero)?.esDeUnPlanRefinanciado && (
                  <span className="block text-[11px] leading-tight font-normal text-slate-500">
                    {posicionesDelPlanDeCuotas.get(cuota.numero)!.textoCorto}
                  </span>
                )}
              </span>
              <span className="ml-auto">
                {cuota.estadoCuota === 'actual' ? (
                  <EnlaceBoton
                    href={`/portal-cliente/pagar/${cuota.id}`}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-800 px-3 py-1.5 text-center text-xs font-semibold text-white transition-colors hover:bg-blue-900"
                    claseInterna="inline-flex items-center gap-1.5"
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    Pagar cuota
                  </EnlaceBoton>
                ) : cuota.estadoCuota === 'pagada' ? (
                  <span className="text-xs font-bold text-green-700">Pagada</span>
                ) : null}
              </span>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 pl-10 text-sm">
              <dt className="text-slate-500">{cuota.vencida ? 'Venció' : 'Vence'}</dt>
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
                    {mostrarPesos && (
                      <span className="ml-auto mt-1 block w-fit rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-800">
                        ≈ {enPesos(cuota.saldo_pendiente)} ARS
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
              <tr
                key={cuota.id}
                className={`border-t border-blue-100 hover:bg-blue-50/40 ${
                  cuota.refinanciada ? 'bg-slate-50/60 text-slate-400' : ACENTO_FILA[cuota.estadoCuota]
                }`}
              >
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2.5 font-medium text-slate-800">
                    <IconoEstadoCuota estado={cuota.estadoCuota} />
                    <span>
                      {cuota.numero}
                      {/* El cartel va al lado del numero y no en la columna
                          del saldo: la fila se lee de izquierda a derecha, y
                          si el aviso llega al final ya leiste el monto como
                          si lo debieras. */}
                      {cuota.refinanciada && (
                        <span className="mt-0.5 block w-fit rounded bg-slate-200 px-1.5 py-px text-[10px] font-bold tracking-wide text-slate-600 uppercase">
                          Refinanció
                        </span>
                      )}
                      {posicionesDelPlanDeCuotas.get(cuota.numero)?.esDeUnPlanRefinanciado && (
                        <span className="block text-[11px] leading-tight font-normal text-slate-500">
                          {posicionesDelPlanDeCuotas.get(cuota.numero)!.textoCorto}
                        </span>
                      )}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{formatearFechaCorta(cuota.fecha_vencimiento)}</td>
                <td className="px-4 py-3 text-slate-600">
                  {cuota.monto_base} {lote!.moneda}
                </td>
                <td className="px-4 py-3">
                  {cuota.refinanciada ? (
                    <span className="text-slate-400">— pasó al plan nuevo</span>
                  ) : (
                    <>
                      <span className="font-medium text-slate-800">
                        {cuota.saldo_pendiente} {lote!.moneda}
                      </span>
                      {mostrarPesos && (
                        <span className="mt-1 block w-fit rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-800">
                          ≈ {enPesos(cuota.saldo_pendiente)} ARS
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
                  {cuota.estadoCuota === 'actual' ? (
                    <EnlaceBoton
                      href={`/portal-cliente/pagar/${cuota.id}`}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-800 px-3 py-1.5 text-center text-xs font-semibold text-white transition-colors hover:bg-blue-900"
                      claseInterna="inline-flex items-center gap-1.5"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      Pagar cuota
                    </EnlaceBoton>
                  ) : cuota.estadoCuota === 'pagada' ? (
                    <span className="text-xs font-bold text-green-700">Pagada</span>
                  ) : null}
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
        <div className="space-y-3">
          {pagosConLink.map((pago) => {
            const puedeEliminar = !pago.confirmado_acreedor_por && !pago.confirmado_admin_por
            const eliminarPagoConId = eliminarPago.bind(null, pago.id)
            const confirmado = pago.estado === 'confirmado'
            const medioTexto = pago.medio_pago === 'efectivo' ? 'efectivo' : 'transferencia'
            const fechaTexto = new Date(pago.created_at).toLocaleDateString('es-AR')
            return (
              <div
                key={pago.id}
                data-testid="pago-cliente"
                className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-white p-4 shadow-sm ${
                  confirmado ? 'border-blue-100' : 'border-red-100'
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    confirmado ? 'bg-green-50' : 'bg-red-50'
                  }`}
                >
                  <Banknote className={`h-[18px] w-[18px] ${confirmado ? 'text-green-700' : 'text-red-700'}`} />
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-bold tabular-nums text-blue-900">
                    {pago.monto} {pago.moneda}
                  </span>
                  <span className="text-xs text-slate-500">
                    {ETIQUETA_MOTIVO[pago.motivo] ?? 'Cuota'} · {medioTexto} · {fechaTexto}
                  </span>
                </div>

                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    CLASE_ESTADO_PAGO[pago.estado] ?? 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {ETIQUETA_ESTADO_PAGO[pago.estado] ?? pago.estado}
                </span>

                <div className="flex items-center gap-3">
                  {!pago.comprobante_path ? (
                    <span className="inline-flex items-center gap-2 text-amber-700">
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold">
                        ⚠ Falta subir comprobante
                      </span>
                      <EnlaceBoton
                        href={`/portal-cliente/pagos/${pago.id}/comprobante`}
                        className="text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
                      >
                        Subir
                      </EnlaceBoton>
                    </span>
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
                  {confirmado && (
                    <EnlaceBoton
                      href={`/portal-cliente/pagos/${pago.id}/recibo`}
                      className="text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
                    >
                      Ver recibo
                    </EnlaceBoton>
                  )}
                  {puedeEliminar && <BotonEliminarPago eliminarPagoAction={eliminarPagoConId} />}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
