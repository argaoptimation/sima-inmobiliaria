import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { calcularTramosMora } from '@/lib/cobranza/tramos-mora'
import { contarPagosPendientes } from '@/lib/pagos-pendientes'
import { fechaEnArgentina, hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { EncabezadoPagina } from '@/components/EncabezadoPagina'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import {
  KPI_TARJETA,
  KPI_ETIQUETA,
  KPI_NUMERO,
  NUMERO_TABULAR,
  DASHBOARD_TARJETA,
  DASHBOARD_TARJETA_HEADER,
  DASHBOARD_TARJETA_TITULO,
  ENLACE_TABLA,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
  BADGE_BASE,
  BADGE_AMARILLO,
} from '@/lib/ui/clases'
import { MapPinned, Banknote, TriangleAlert, Receipt, ArrowRight } from 'lucide-react'

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Mismos 8 tonos de azul del mockup (MOCKUP 1), de más viejo a más nuevo --
// puramente decorativo, no representa magnitud (eso lo hace la altura).
const TONOS_BARRA = ['#dbeafe', '#dbeafe', '#dbeafe', '#bfdbfe', '#bfdbfe', '#93c5fd', '#60a5fa', '#1e40af']

type Pago = {
  id: string
  monto: number
  moneda: string
  confirmado_acreedor_at: string | null
  confirmado_admin_at: string | null
}

// "Recibido el día/mes X" = cuándo terminó de cerrarse la confirmación (el
// toque más tardío entre acreedor y admin) -- mismo criterio que ya usa
// app/admin/cierre-caja/page.tsx, no se inventa un criterio nuevo.
function fechaDeConfirmacion(pago: Pago): string | null {
  const candidatos = [pago.confirmado_acreedor_at, pago.confirmado_admin_at].filter(
    (valor): valor is string => valor !== null
  )
  if (candidatos.length === 0) return null
  const masTardio = candidatos.reduce((a, b) => (a > b ? a : b))
  return fechaEnArgentina(masTardio)
}

// Dashboard de /admin/inicio (PR2 del rediseño, MOCKUP 1). Solo para
// administrador: las 4 métricas (lotes de TODOS los loteos, cobranza
// global, mora de TODOS los clientes, pagos por aprobar de TODOS los
// acreedores) cruzan datos que hoy ningún otro rol ve agregados -- acreedor/
// vendedor/cobrador siguen entrando por /admin/lotes, como antes de este
// PR (ver app/page.tsx y el link "Inicio" de la sidebar).
export default async function InicioPage() {
  await requireAdministrador()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const hoy = hoyArgentina()
  const mesActual = hoy.slice(0, 7)

  const [{ count: lotesDisponibles }, { count: lotesTotal }, { count: lotesVendidos }] = await Promise.all([
    supabase.from('lotes').select('id', { count: 'exact', head: true }).eq('estado', 'disponible'),
    supabase.from('lotes').select('id', { count: 'exact', head: true }),
    supabase.from('lotes').select('id', { count: 'exact', head: true }).eq('estado', 'vendido'),
  ])

  const tramos = await calcularTramosMora(supabase)
  const totalEnMora =
    tramos.debe1.length + tramos.debe2.length + tramos.posiblePrejudicial.length + tramos.prejudicialOficial.length

  const pagosPendientes = await contarPagosPendientes(supabase, 'administrador', user!.id)

  const { data: pagosPorAprobarData } = await supabase
    .from('pagos')
    .select('id, monto, moneda, created_at, cliente_id, lote_id, lotes(identificador)')
    .eq('estado', 'pendiente')
    .not('comprobante_path', 'is', null)
    .is('confirmado_admin_por', null)
    .order('created_at', { ascending: false })
    .limit(5)

  const pagosPorAprobar = (pagosPorAprobarData ?? []) as unknown as Array<{
    id: string
    monto: number
    moneda: string
    created_at: string
    cliente_id: string
    lote_id: string
    lotes: { identificador: string } | null
  }>

  const clienteIdsPendientes = [...new Set(pagosPorAprobar.map((pago) => pago.cliente_id))]
  const { data: clientesPendientes } =
    clienteIdsPendientes.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', clienteIdsPendientes)
      : { data: [] }
  const nombreClientePorId = new Map((clientesPendientes ?? []).map((cliente) => [cliente.id, cliente.full_name]))

  // Cobrado este mes + gráfico de 8 meses: una sola consulta de pagos
  // confirmados en USD (cierre-caja nunca mezcla ARS+USD en un solo
  // número -- acá se sigue el mismo criterio, no se inventa una
  // conversión), agrupados por mes de confirmación.
  const { data: pagosConfirmadosUsdData } = await supabase
    .from('pagos')
    .select('id, monto, moneda, confirmado_acreedor_at, confirmado_admin_at')
    .eq('estado', 'confirmado')
    .eq('moneda', 'USD')

  const totalPorMes = new Map<string, number>()
  for (const pago of (pagosConfirmadosUsdData ?? []) as Pago[]) {
    const fecha = fechaDeConfirmacion(pago)
    if (!fecha) continue
    const clave = fecha.slice(0, 7)
    totalPorMes.set(clave, (totalPorMes.get(clave) ?? 0) + pago.monto)
  }
  const cobradoUsdEsteMes = totalPorMes.get(mesActual) ?? 0

  const [anioActual, numeroMesActual] = mesActual.split('-').map(Number)
  const ultimos8Meses = Array.from({ length: 8 }, (_, indice) => {
    const desplazamiento = 7 - indice
    const fecha = new Date(Date.UTC(anioActual, numeroMesActual - 1 - desplazamiento, 1))
    const clave = `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`
    return {
      clave,
      etiqueta: MESES_CORTOS[fecha.getUTCMonth()],
      total: totalPorMes.get(clave) ?? 0,
    }
  })
  const maximoMensual = Math.max(1, ...ultimos8Meses.map((mes) => mes.total))

  return (
    <main className="flex flex-col gap-5">
      <EncabezadoPagina titulo="Inicio" migas={['Inicio']} />

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className={KPI_TARJETA}>
          <div className={KPI_ETIQUETA}>
            Lotes disponibles
            <MapPinned className="h-4 w-4 text-slate-500" />
          </div>
          <div className="flex items-baseline gap-[7px]">
            <span className={`${KPI_NUMERO} ${NUMERO_TABULAR}`}>{lotesDisponibles ?? 0}</span>
            <span className={`text-[13px] text-slate-600 ${NUMERO_TABULAR}`}>/ {lotesTotal ?? 0}</span>
          </div>
          <div className="h-[5px] overflow-hidden rounded-[3px] bg-blue-50">
            <div
              className="h-full rounded-[3px] bg-blue-500"
              style={{ width: `${lotesTotal ? Math.round(((lotesDisponibles ?? 0) / lotesTotal) * 100) : 0}%` }}
            />
          </div>
        </div>

        <div className={KPI_TARJETA}>
          <div className={KPI_ETIQUETA}>
            Cobrado este mes
            <Banknote className="h-4 w-4 text-slate-500" />
          </div>
          <div className="flex items-baseline gap-[5px]">
            <span className="text-[15px] font-semibold text-slate-600">USD</span>
            <span className={`${KPI_NUMERO} ${NUMERO_TABULAR}`}>{cobradoUsdEsteMes.toLocaleString('es-AR')}</span>
          </div>
          <span className="text-[12.5px] text-slate-600">pagos confirmados en el mes</span>
        </div>

        <div className={KPI_TARJETA}>
          <div className={KPI_ETIQUETA}>
            Lotes en mora
            <TriangleAlert className="h-4 w-4 text-slate-500" />
          </div>
          <div className="flex items-baseline gap-[7px]">
            <span className={`${KPI_NUMERO} ${NUMERO_TABULAR}`}>{totalEnMora}</span>
            <span className="text-[13px] text-slate-600">de {lotesVendidos ?? 0} vendidos</span>
          </div>
          {totalEnMora > 0 && (
            <div className="flex h-[5px] gap-1">
              {tramos.debe1.length > 0 && (
                <div className="rounded-[3px] bg-amber-300" style={{ flex: tramos.debe1.length }} />
              )}
              {tramos.debe2.length > 0 && (
                <div className="rounded-[3px] bg-amber-500" style={{ flex: tramos.debe2.length }} />
              )}
              {tramos.posiblePrejudicial.length > 0 && (
                <div className="rounded-[3px] bg-orange-600" style={{ flex: tramos.posiblePrejudicial.length }} />
              )}
              {tramos.prejudicialOficial.length > 0 && (
                <div className="rounded-[3px] bg-red-600" style={{ flex: tramos.prejudicialOficial.length }} />
              )}
            </div>
          )}
        </div>

        <div className={KPI_TARJETA}>
          <div className={KPI_ETIQUETA}>
            Pagos por aprobar
            <Receipt className="h-4 w-4 text-slate-500" />
          </div>
          <div className="flex items-baseline gap-[7px]">
            <span className={`${KPI_NUMERO} ${NUMERO_TABULAR} ${pagosPendientes > 0 ? 'text-amber-700' : ''}`}>
              {pagosPendientes}
            </span>
            <span className="text-[13px] text-slate-600">esperando revisión</span>
          </div>
          <EnlaceBoton href="/admin/pagos" className="flex items-center gap-1 text-[12.5px] font-semibold text-blue-800">
            {pagosPendientes > 0 ? 'Revisar ahora' : 'Ver pagos'}
            <ArrowRight className="h-[13px] w-[13px]" />
          </EnlaceBoton>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1fr_340px]">
        <div className={DASHBOARD_TARJETA}>
          <div className={DASHBOARD_TARJETA_HEADER}>
            <span className={DASHBOARD_TARJETA_TITULO}>Cobranza mensual</span>
            <span className="text-xs text-slate-500">USD · últimos 8 meses</span>
          </div>
          {/* Alto FIJO (no flex-1): un alto derivado de flex-grow no cuenta
              como "definido" para que los hijos de más abajo puedan resolver
              height:% de forma confiable -- probado en vivo, con flex-1 acá
              las barras colapsaban a 0 aunque cada contenedor intermedio
              tuviera flex-1/h-full "correctos" sobre el papel. */}
          <div className="flex h-44 gap-3.5 px-[18px] pt-5 pb-3">
            {ultimos8Meses.map((mes, indice) => {
              const esActual = indice === ultimos8Meses.length - 1
              const alturaPorcentaje = Math.max(4, Math.round((mes.total / maximoMensual) * 100))
              return (
                // Los hijos de un flex-row se estiran (stretch, el default de
                // align-items) al alto real de `plot` -- ESO es lo que le da
                // una altura de verdad a esta columna, no h-full: probado que
                // h-full (height:100%) acá quedaba en 0, el % no se resolvía
                // bien contra el alto de un contenedor flex-1 anidado.
                <div key={mes.clave} className="flex flex-1 flex-col items-center gap-2">
                  {/* El div de acá abajo es el que crece para llenar el alto
                      disponible (flex-1) -- la barra de adentro recién ahí
                      puede usar height:% con una referencia real. Ponerle el
                      % directo a un flex item en un contenedor column (como
                      antes) lo hacía competir por alto con las 2 etiquetas y
                      terminaba colapsando a 0 (min-height:auto de flexbox).
                      `relative` vive ACÁ (no en la columna entera) para que
                      el número pueda ubicarse con `bottom: alturaPorcentaje%`
                      -- relativo a la altura real de la barra, no a un
                      `top: 0` fijo. Antes solo se mostraba el número del mes
                      actual porque con `top: 0` fijo, los meses de montos
                      chicos (barras bajitas) quedaban todos amontonados
                      arriba, superpuestos -- Nico lo marcó como "número
                      tapado" en agosto (03/09): esperaba ver el valor en
                      todos los meses con datos, no solo en el último. */}
                  <div className="relative flex w-full flex-1 items-end justify-center">
                    {mes.total > 0 && (
                      <span
                        className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11.5px] ${NUMERO_TABULAR} ${
                          esActual ? 'font-bold text-blue-800' : 'font-semibold text-slate-500'
                        }`}
                        style={{ bottom: `calc(${alturaPorcentaje}% + 4px)` }}
                      >
                        {mes.total >= 1000 ? `${(mes.total / 1000).toLocaleString('es-AR')}k` : mes.total}
                      </span>
                    )}
                    <div
                      className="w-full max-w-[38px] rounded-t-[5px] rounded-b-sm"
                      style={{ height: `${alturaPorcentaje}%`, background: TONOS_BARRA[indice] }}
                    />
                  </div>
                  <span className={`text-[11.5px] font-medium ${esActual ? 'font-bold text-blue-900' : 'text-slate-600'}`}>
                    {mes.etiqueta}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className={DASHBOARD_TARJETA}>
          <div className={DASHBOARD_TARJETA_HEADER}>
            <span className={DASHBOARD_TARJETA_TITULO}>Mora por tramo</span>
            <EnlaceBoton href="/admin/panel-morosos" className="text-xs font-semibold text-blue-800">
              Ver panel
            </EnlaceBoton>
          </div>
          <div className="flex flex-col px-[18px] py-3">
            {[
              { etiqueta: 'Deben 1 cuota', color: 'bg-amber-300', valor: tramos.debe1.length, numeroClase: 'text-blue-900' },
              { etiqueta: 'Deben 2 cuotas', color: 'bg-amber-500', valor: tramos.debe2.length, numeroClase: 'text-blue-900' },
              {
                etiqueta: 'Posible prejudicial',
                color: 'bg-orange-600',
                valor: tramos.posiblePrejudicial.length,
                numeroClase: 'text-amber-700',
              },
              {
                etiqueta: 'Prejudicial marcado',
                color: 'bg-red-600',
                valor: tramos.prejudicialOficial.length,
                numeroClase: 'text-red-700',
              },
            ].map((fila, indice, arreglo) => (
              <div
                key={fila.etiqueta}
                className={`flex items-center gap-[11px] py-[11px] ${indice < arreglo.length - 1 ? 'border-b border-slate-100' : ''}`}
              >
                <span className={`h-[9px] w-[9px] shrink-0 rounded-full ${fila.color}`} />
                <span className="text-[13.5px] font-medium text-slate-600">{fila.etiqueta}</span>
                <span className={`ml-auto text-[15px] font-bold ${NUMERO_TABULAR} ${fila.numeroClase}`}>
                  {fila.valor}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={DASHBOARD_TARJETA}>
        <div className={DASHBOARD_TARJETA_HEADER}>
          <span className={DASHBOARD_TARJETA_TITULO}>Pagos esperando aprobación</span>
          <EnlaceBoton href="/admin/pagos" className="text-[12.5px] font-semibold text-blue-800">
            Ver todos
          </EnlaceBoton>
        </div>
        {pagosPorAprobar.length === 0 ? (
          <p className="px-[18px] py-4 text-sm text-slate-600">No hay pagos esperando aprobación.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={TABLA_HEADER_FILA}>
                  <th className={TABLA_HEADER_CELDA}>Cliente</th>
                  <th className={TABLA_HEADER_CELDA}>Lote</th>
                  <th className={TABLA_HEADER_CELDA}>Fecha</th>
                  <th className={`${TABLA_HEADER_CELDA} text-right`}>Monto</th>
                  <th className={TABLA_HEADER_CELDA}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {pagosPorAprobar.map((pago) => (
                  <tr key={pago.id} className={TABLA_FILA}>
                    <td className={TABLA_CELDA}>
                      <EnlaceBoton href={`/admin/clientes/${pago.cliente_id}`} className={ENLACE_TABLA}>
                        {nombreClientePorId.get(pago.cliente_id) ?? '—'}
                      </EnlaceBoton>
                    </td>
                    <td className={TABLA_CELDA}>{pago.lotes?.identificador ?? '—'}</td>
                    <td className={`${TABLA_CELDA} ${NUMERO_TABULAR}`}>
                      {new Date(pago.created_at).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Cordoba' })}
                    </td>
                    <td className={`${TABLA_CELDA} text-right font-semibold text-slate-900 ${NUMERO_TABULAR}`}>
                      {pago.moneda} {pago.monto.toLocaleString('es-AR')}
                    </td>
                    <td className={TABLA_CELDA}>
                      <span className={`${BADGE_BASE} ${BADGE_AMARILLO}`}>Pendiente</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
