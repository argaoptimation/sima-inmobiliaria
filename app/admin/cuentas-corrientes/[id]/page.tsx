import { createClient } from '@/lib/supabase/server'
import { requireAdminOTitularCuenta } from '@/lib/auth/require-admin'
import { notFound } from 'next/navigation'
import { resumirCuentaCorrientePorMoneda, describirSituacion } from '@/lib/cuenta-corriente/situacion'
import { monedasOrdenadas } from '@/lib/cuenta-corriente/totales-a-transferir'
import {
  obtenerMesAMesDelAcreedor,
  pivotarPorLote,
  describirDiferencia,
} from '@/lib/cuenta-corriente/mes-a-mes'
import { etiquetaMes, etiquetaMesCorta, ultimoDiaDelMes, mesRelativoAHoy } from '@/lib/fecha/meses'
import { agregarMovimientoManual } from '../actions'
import { FormularioMovimientoManual } from '@/components/FormularioMovimientoManual'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { EncabezadoPagina } from '@/components/EncabezadoPagina'
import {
  ENTRADA,
  BOTON_SECUNDARIO,
  BOTON_CABECERA,
  BOTON_CABECERA_AZUL,
  ENLACE,
  ENLACE_TABLA,
  BANNER_ERROR,
  BANNER_OK,
  PANEL_SIN_PADDING,
  PANEL_HEADER,
  PANEL_HEADER_ICONO,
  PANEL_TITULO,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
  TABLA_CELDA_PRINCIPAL,
  NUMERO_TABULAR,
  TARJETA_KPI,
  LOTE_KPI_ETIQUETA,
  LOTE_KPI_VALOR,
  LOTE_KPI_PILL,
  LOTE_KPI_DATO,
  PILL_CUOTA,
  DESPLEGABLE_CABECERA,
  DESPLEGABLE_CABECERA_CONTADOR,
} from '@/lib/ui/clases'
import { ETIQUETA_ORIGEN } from '@/lib/cuenta-corriente/etiquetas'
import { armarFilasDeMovimiento } from '@/lib/cuenta-corriente/filas-movimiento'
import {
  traerDatosDeLotes,
  traerDatosDeCuotas,
} from '@/lib/cuenta-corriente/traer-datos-planilla'
import { Wallet, CalendarRange, TrendingUp, ListChecks, ArrowLeftRight, Download } from 'lucide-react'

// LA PANTALLA DE UN ACREEDOR, UNIFICADA (10/09, pedido de Gabriel después
// de repasar la llamada con Nicolás).
//
// Antes esto eran dos pantallas: acá el saldo y los movimientos, y detrás
// de un link la proyección mes a mes. "No podemos estar navegando entre
// pantallas para ver la proyección": ahora todo vive acá, y la descarga es
// UNA sola con todas las hojas.
//
// Lo que se agrega y no existía en ninguna de las dos: LO ASIGNADO. Ver
// lib/cuenta-corriente/mes-a-mes.ts -- es la cuarta cosa que Nicolás pidió
// en la llamada ("un informe de las cuotas que le asigné, o mejor dicho,
// las órdenes de pago que yo les di a los clientes") y la única que la
// plataforma no sabía contestar.
//
// El orden de la pantalla sigue el orden en que se hacen las preguntas:
//   1. ¿Cómo estamos hoy?          -> el saldo, arriba de todo.
//   2. ¿Qué viene, y le asigné bien? -> el mes a mes (lo nuevo).
//   3. ¿De dónde sale ese número?  -> la proyección por lote y el detalle
//                                     cuota por cuota.
//   4. ¿Qué pasó hasta ahora?      -> los movimientos.
//
// Hay dos barras de filtro y no una a propósito: el rango de MESES manda
// sobre lo que todavía no pasó (proyección, asignado, detalle) y los
// filtros de MOVIMIENTOS sobre lo que ya pasó. Un solo control no puede
// servir a los dos: el rango que sirve para proyectar ("de este mes en
// adelante") dejaría la lista de movimientos casi vacía, porque los
// movimientos son todos anteriores a hoy. Cada form arrastra los valores
// del otro en hidden para no pisárselos (FiltroEnVivo rearma la query
// desde su propio form).
export default async function CuentaCorrienteDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    error?: string
    ok?: string
    lote?: string
    origen?: string
    desde?: string
    hasta?: string
    movDesde?: string
    movHasta?: string
  }>
}) {
  const { id } = await params
  const { esAdmin } = await requireAdminOTitularCuenta(id)
  const {
    error,
    ok,
    lote: filtroLoteId,
    origen: filtroOrigen,
    desde: mesDesde,
    hasta: mesHasta,
    movDesde: filtroDesde,
    movHasta: filtroHasta,
  } = await searchParams

  const supabase = await createClient()

  const agregarMovimientoManualConId = agregarMovimientoManual.bind(null, id)

  const { data: persona } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', id)
    .maybeSingle()

  if (!persona) {
    notFound()
  }

  // Se trae TODO sin filtrar -- el saldo mostrado arriba siempre tiene que
  // ser el real (todos los movimientos), los filtros de abajo son solo
  // para acotar qué se lista en la tabla, no para qué se suma.
  const { data: movimientosData } = await supabase
    .from('movimientos_cuenta_corriente')
    .select(
      'id, tipo, monto, moneda, cotizacion_dia, origen, fecha_evento, de_parte_de, detalle, lote_id, cuota_id, lotes(identificador)'
    )
    .eq('profile_id', id)
    .order('fecha_evento', { ascending: false })
    .order('created_at', { ascending: false })

  const movimientos = (movimientosData ?? []) as unknown as Array<{
    id: string
    tipo: 'debe' | 'haber'
    monto: number
    moneda: string
    cotizacion_dia: number | null
    origen: string
    fecha_evento: string
    de_parte_de: string | null
    detalle: string | null
    lote_id: string | null
    cuota_id: string | null
    lotes: { identificador: string } | null
  }>

  const { data: lotes } = await supabase.from('lotes').select('id, identificador').order('identificador')

  // Sugerencias de "de quién vino la plata" -- puede ser un cliente (el
  // caso más común de "pago directo") o cualquier otra persona del
  // sistema. El campo sigue siendo texto libre (no hay ninguna FK que
  // resolver), el datalist es solo para no tipear de cero. Solo hace falta
  // para el alta manual de movimientos, que es admin-only.
  const { data: personasParaSugerir } = esAdmin
    ? await supabase.from('profiles').select('full_name').order('full_name')
    : { data: [] }

  // Dos personas distintas pueden compartir nombre (ej. dos clientes
  // llamados "Juan Pérez") -- el datalist solo necesita el texto una vez,
  // no una entrada por persona.
  const nombresUnicosParaSugerir = [...new Set((personasParaSugerir ?? []).map((p) => p.full_name))]

  const situacionPorMoneda = resumirCuentaCorrientePorMoneda(
    movimientos.map((m) => ({ tipo: m.tipo, monto: m.monto, moneda: m.moneda }))
  )
  const monedasDelSaldo = monedasOrdenadas(situacionPorMoneda)

  // ------------------------------------------------------------- mes a mes
  const mesDesdeEfectivo = mesDesde || mesRelativoAHoy(0)
  const mesHastaEfectivo = mesHasta || mesRelativoAHoy(5)
  const rangoInvalido = mesDesdeEfectivo > mesHastaEfectivo

  const desde = `${mesDesdeEfectivo}-01`
  const hasta = `${mesHastaEfectivo}-${String(ultimoDiaDelMes(mesHastaEfectivo)).padStart(2, '0')}`

  const mesAMes = rangoInvalido
    ? null
    : await obtenerMesAMesDelAcreedor(supabase, id, desde, hasta)

  // La proyección por lote sale de las MISMAS filas que el cuadro de
  // arriba: es la tabla que Nico ya tenía en su Excel, no una consulta
  // aparte que podría dar otro total.
  const proyeccion = mesAMes ? pivotarPorLote(mesAMes.filas, mesAMes.meses) : null

  // ---------------------------------------------------------- movimientos
  // Filtros solo sobre qué se LISTA (el saldo de arriba ya se calculó con
  // todo) -- pedido de Gabriel 24/08 para no tener que scrollear un
  // historial larguísimo para encontrar un movimiento puntual.
  const movimientosFiltrados = movimientos.filter((movimiento) => {
    if (filtroLoteId && movimiento.lote_id !== filtroLoteId) return false
    if (filtroOrigen && movimiento.origen !== filtroOrigen) return false
    if (filtroDesde && movimiento.fecha_evento < filtroDesde) return false
    if (filtroHasta && movimiento.fecha_evento > filtroHasta) return false
    return true
  })

  const loteIdsConMovimientos = new Set(
    movimientos.map((m) => m.lote_id).filter((loteId): loteId is string => loteId !== null)
  )
  const lotesConMovimientos = (lotes ?? []).filter((lote) => loteIdsConMovimientos.has(lote.id))
  const origenesConMovimientos = [...new Set(movimientos.map((m) => m.origen))]

  const hayFiltrosActivos = Boolean(filtroLoteId || filtroOrigen || filtroDesde || filtroHasta)

  // La tabla de abajo es EXACTAMENTE la misma que se descarga (regla de
  // Gabriel, 09/09: "todas estas tablas que podriamos exportar deberian
  // estar tambien visibles"). Mismo armado, mismas columnas, mismo orden --
  // por eso el calculo vive en lib y no aca.
  const filasPlanilla = armarFilasDeMovimiento(
    movimientosFiltrados,
    await traerDatosDeLotes(
      supabase,
      movimientosFiltrados.map((m) => m.lote_id).filter((id): id is string => Boolean(id))
    ),
    await traerDatosDeCuotas(
      supabase,
      movimientosFiltrados.map((m) => m.cuota_id).filter((id): id is string => Boolean(id))
    )
  )

  // UN SOLO botón de descarga (pedido de Gabriel): se lleva los dos juegos
  // de filtros, así el Excel dice exactamente lo que hay en pantalla.
  const paramsExport = new URLSearchParams()
  if (filtroLoteId) paramsExport.set('lote', filtroLoteId)
  if (filtroOrigen) paramsExport.set('origen', filtroOrigen)
  if (filtroDesde) paramsExport.set('movDesde', filtroDesde)
  if (filtroHasta) paramsExport.set('movHasta', filtroHasta)
  paramsExport.set('desde', mesDesdeEfectivo)
  paramsExport.set('hasta', mesHastaEfectivo)

  return (
    <main>
      <EncabezadoPagina
        titulo={esAdmin ? persona!.full_name : 'Mi cuenta corriente'}
        migas={esAdmin ? ['Cuentas corrientes', persona!.full_name] : ['Mi cuenta corriente']}
        className="mb-2"
        acciones={
          <>
            <EnlaceBoton
              href={esAdmin ? '/admin/cuentas-corrientes' : '/admin/lotes'}
              className={BOTON_CABECERA}
            >
              ← Volver
            </EnlaceBoton>
            {/* Un <a> y no EnlaceBoton: es una descarga, no una navegación
                del router -- con <Link> el .xlsx se pide por el router de
                Next y no dispara la descarga del navegador. */}
            <a
              href={`/admin/cuentas-corrientes/${id}/export?${paramsExport.toString()}`}
              className={BOTON_CABECERA_AZUL}
            >
              <Download className="h-3.5 w-3.5" />
              Descargar Excel
            </a>
          </>
        }
      />
      <p className="mb-6 text-sm text-slate-600 capitalize">{persona!.role}</p>

      {error && <p className={BANNER_ERROR}>{error}</p>}
      {ok && <p className={BANNER_OK}>Guardado.</p>}

      {/* -------------------------------------------------------- saldo */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {monedasDelSaldo.length === 0 ? (
          <div className={TARJETA_KPI}>
            <div className="flex items-center justify-between gap-2">
              <span className={LOTE_KPI_ETIQUETA}>Saldo</span>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <Wallet className="h-4 w-4" />
              </span>
            </div>
            <div className={LOTE_KPI_VALOR}>Sin movimientos</div>
            <p className={LOTE_KPI_DATO} data-testid="saldo-vacio">
              Todavía no se cargó ningún movimiento en esta cuenta.
            </p>
          </div>
        ) : (
          monedasDelSaldo.map((moneda) => {
            const situacion = situacionPorMoneda[moneda]
            return (
              <div key={moneda} className={TARJETA_KPI}>
                <div className="flex items-center justify-between gap-2">
                  <span className={LOTE_KPI_ETIQUETA}>Saldo</span>
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      situacion.saldo > 0
                        ? 'bg-amber-50 text-amber-700'
                        : situacion.saldo < 0
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    <Wallet className="h-4 w-4" />
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={LOTE_KPI_VALOR}>
                    {situacion.saldo.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                  </span>
                  <span className={LOTE_KPI_PILL}>{moneda}</span>
                </div>
                <div className="space-y-0.5">
                  <p
                    data-testid={`saldo-${moneda}`}
                    className={`text-[13px] font-semibold ${
                      situacion.saldo > 0
                        ? 'text-amber-800'
                        : situacion.saldo < 0
                          ? 'text-blue-800'
                          : 'text-emerald-700'
                    }`}
                  >
                    {describirSituacion(situacion.saldo, moneda)}
                  </p>
                  <p className={`${LOTE_KPI_DATO} ${NUMERO_TABULAR}`}>
                    Le corresponde {situacion.leCorresponde.toLocaleString('es-AR')} · cobró{' '}
                    {situacion.cobroDirecto.toLocaleString('es-AR')}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ---------------------------------------------------- mes a mes */}
      <section id="mes-a-mes" className={`mb-6 ${PANEL_SIN_PADDING}`}>
        <div className={PANEL_HEADER}>
          <div className="flex items-center gap-3">
            <span className={PANEL_HEADER_ICONO}>
              <CalendarRange className="h-5 w-5" />
            </span>
            <div>
              <h2 className={PANEL_TITULO}>Mes a mes</h2>
              <p className="text-xs text-slate-500">
                Lo que le toca cobrar contra lo que le asignaste para cobrar
              </p>
            </div>
          </div>
          <FiltroEnVivo className="flex flex-wrap items-end gap-3">
            {/* Los filtros de la tabla de movimientos viajan escondidos:
                FiltroEnVivo rearma la query desde su propio form, así que
                sin esto cambiar el mes borraría el filtro de abajo. */}
            {filtroLoteId && <input type="hidden" name="lote" value={filtroLoteId} />}
            {filtroOrigen && <input type="hidden" name="origen" value={filtroOrigen} />}
            {filtroDesde && <input type="hidden" name="movDesde" value={filtroDesde} />}
            {filtroHasta && <input type="hidden" name="movHasta" value={filtroHasta} />}
            <label className="text-xs font-semibold text-slate-600">
              Desde
              <input type="month" name="desde" defaultValue={mesDesdeEfectivo} className={ENTRADA} />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Hasta
              <input type="month" name="hasta" defaultValue={mesHastaEfectivo} className={ENTRADA} />
            </label>
            <button type="submit" className={`cursor-pointer ${BOTON_SECUNDARIO}`}>
              Filtrar
            </button>
          </FiltroEnVivo>
        </div>

        <div className="space-y-5 p-5">
          <p className="max-w-4xl text-sm text-slate-600">
            <strong className="font-semibold text-slate-800">Le corresponde</strong> es su parte de
            cada cuota según la distribución cargada.{' '}
            <strong className="font-semibold text-slate-800">Le asignaste</strong> es el total de las
            cuotas que le dijiste al cliente que le pague a él. La diferencia es la plata que va a
            pasar por sus manos sin ser suya —{' '}
            <span className="text-slate-500">
              o al revés, lo que todavía le falta cobrar. Es lo que se ve antes de que el cliente
              pague; el saldo de arriba recién se mueve después.
            </span>
          </p>

          {rangoInvalido ? (
            <p className="text-sm text-slate-600">
              El mes &quot;desde&quot; tiene que ser anterior o igual al mes &quot;hasta&quot;.
            </p>
          ) : mesAMes!.monedas.length === 0 ? (
            <p className="text-sm text-slate-600">
              No hay cuotas de esta persona en el rango elegido: ni asignadas para que cobre, ni con
              una parte suya en la distribución.
            </p>
          ) : (
            mesAMes!.monedas.map((moneda) => (
              <div key={moneda}>
                {mesAMes!.monedas.length > 1 && (
                  <p className="mb-2 text-xs font-bold tracking-wider text-slate-500 uppercase">
                    {moneda}
                  </p>
                )}
                <div className={TABLA_CONTENEDOR}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={TABLA_HEADER_FILA}>
                        <th className={TABLA_HEADER_CELDA}>Mes</th>
                        <th className={`${TABLA_HEADER_CELDA} text-right`}>Le corresponde</th>
                        <th className={`${TABLA_HEADER_CELDA} text-right`}>Le asignaste</th>
                        <th className={`${TABLA_HEADER_CELDA} text-right`}>Diferencia</th>
                        <th className={TABLA_HEADER_CELDA}>Cómo queda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mesAMes!.meses.map((mes) => {
                        const celda = mesAMes!.porMes[mes]?.[moneda]
                        return (
                          <tr key={mes} className={TABLA_FILA}>
                            <td className={TABLA_CELDA_PRINCIPAL}>{etiquetaMes(mes)}</td>
                            <td className={`${TABLA_CELDA} text-right ${NUMERO_TABULAR}`}>
                              {celda ? celda.leCorresponde.toLocaleString('es-AR') : '—'}
                            </td>
                            <td className={`${TABLA_CELDA} text-right ${NUMERO_TABULAR}`}>
                              {celda ? celda.asignado.toLocaleString('es-AR') : '—'}
                            </td>
                            <td
                              className={`${TABLA_CELDA} text-right font-semibold ${NUMERO_TABULAR} ${
                                !celda || celda.diferencia === 0
                                  ? 'text-slate-500'
                                  : celda.diferencia > 0
                                    ? 'text-amber-800'
                                    : 'text-blue-800'
                              }`}
                            >
                              {celda
                                ? `${celda.diferencia > 0 ? '+' : ''}${celda.diferencia.toLocaleString('es-AR')}`
                                : '—'}
                            </td>
                            <td className={`${TABLA_CELDA} text-slate-600`}>
                              {celda ? describirDiferencia(celda.diferencia, moneda) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                      <tr className="border-t-2 border-blue-900 bg-blue-50/70 font-bold text-blue-900">
                        <td className="px-4 py-3 uppercase">Total</td>
                        <td className={`px-4 py-3 text-right ${NUMERO_TABULAR}`}>
                          {mesAMes!.totales[moneda].leCorresponde.toLocaleString('es-AR')} {moneda}
                        </td>
                        <td className={`px-4 py-3 text-right ${NUMERO_TABULAR}`}>
                          {mesAMes!.totales[moneda].asignado.toLocaleString('es-AR')} {moneda}
                        </td>
                        <td className={`px-4 py-3 text-right ${NUMERO_TABULAR}`}>
                          {mesAMes!.totales[moneda].diferencia > 0 ? '+' : ''}
                          {mesAMes!.totales[moneda].diferencia.toLocaleString('es-AR')} {moneda}
                        </td>
                        <td className="px-4 py-3">
                          {describirDiferencia(mesAMes!.totales[moneda].diferencia, moneda)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ------------------------------------------- proyección por lote */}
      {proyeccion && proyeccion.filas.length > 0 && (
        <section className={`mb-6 ${PANEL_SIN_PADDING}`}>
          <div className={PANEL_HEADER}>
            <div className="flex items-center gap-3">
              <span className={PANEL_HEADER_ICONO}>
                <TrendingUp className="h-5 w-5" />
              </span>
              <div>
                <h2 className={PANEL_TITULO}>Proyección por lote</h2>
                <p className="text-xs text-slate-500">
                  De dónde sale lo que le corresponde: {etiquetaMesCorta(mesDesdeEfectivo)} a{' '}
                  {etiquetaMesCorta(mesHastaEfectivo)}
                </p>
              </div>
            </div>
          </div>
          <div className="p-5">
            <div className={TABLA_CONTENEDOR}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={TABLA_HEADER_FILA}>
                    <th className={TABLA_HEADER_CELDA}>Lote</th>
                    <th className={TABLA_HEADER_CELDA}>Comprador</th>
                    {proyeccion.meses.map((mes) => (
                      <th key={mes} className={`${TABLA_HEADER_CELDA} text-right whitespace-nowrap`}>
                        {etiquetaMesCorta(mes)}
                      </th>
                    ))}
                    <th className={`${TABLA_HEADER_CELDA} text-right`}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {proyeccion.filas.map((fila) => (
                    <tr key={fila.loteId} className={TABLA_FILA}>
                      <td className={TABLA_CELDA_PRINCIPAL}>
                        <EnlaceBoton href={`/admin/lotes/${fila.loteId}`} className={ENLACE_TABLA}>
                          {fila.loteIdentificador}
                        </EnlaceBoton>
                      </td>
                      <td className={TABLA_CELDA}>{fila.compradorNombre ?? '—'}</td>
                      {proyeccion.meses.map((mes) => (
                        <td
                          key={mes}
                          className={`${TABLA_CELDA} text-right whitespace-nowrap ${NUMERO_TABULAR}`}
                        >
                          {fila.porMes[mes]
                            ? `${fila.porMes[mes].toLocaleString('es-AR')} ${fila.moneda}`
                            : '—'}
                        </td>
                      ))}
                      <td
                        className={`${TABLA_CELDA} text-right font-semibold whitespace-nowrap ${NUMERO_TABULAR}`}
                      >
                        {fila.total.toLocaleString('es-AR')} {fila.moneda}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-blue-900 bg-blue-50/70">
                    <td className={`${TABLA_CELDA_PRINCIPAL} uppercase`}>Total</td>
                    <td className={TABLA_CELDA}></td>
                    {proyeccion.meses.map((mes) => {
                      const porMoneda = Object.entries(proyeccion.totalesPorMes[mes] ?? {})
                      return (
                        <td
                          key={mes}
                          className={`px-4 py-3 text-right font-bold whitespace-nowrap text-blue-900 ${NUMERO_TABULAR}`}
                        >
                          {porMoneda.length === 0
                            ? '—'
                            : porMoneda
                                .map(([moneda, monto]) => `${monto.toLocaleString('es-AR')} ${moneda}`)
                                .join(' / ')}
                        </td>
                      )
                    })}
                    <td
                      className={`px-4 py-3 text-right font-bold whitespace-nowrap text-blue-900 ${NUMERO_TABULAR}`}
                    >
                      {Object.entries(proyeccion.totalGeneral)
                        .map(([moneda, monto]) => `${monto.toLocaleString('es-AR')} ${moneda}`)
                        .join(' / ') || '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* -------------------------------------------- cuota por cuota */}
      {mesAMes && mesAMes.filas.length > 0 && (
        <section className={`mb-6 ${PANEL_SIN_PADDING}`}>
          <div className={PANEL_HEADER}>
            <div className="flex items-center gap-3">
              <span className={PANEL_HEADER_ICONO}>
                <ListChecks className="h-5 w-5" />
              </span>
              <div>
                <h2 className={PANEL_TITULO}>Cuota por cuota</h2>
                <p className="text-xs text-slate-500">
                  Qué cuotas exactas forman los números de arriba
                </p>
              </div>
            </div>
            {/* Cerrado por defecto: con veinte lotes esto son cientos de
                filas, y es la tabla a la que se baja a verificar un número
                puntual, no la que se lee de entrada. */}
          </div>
          <div className="p-5">
            <details>
              <summary className={DESPLEGABLE_CABECERA}>
                Ver el detalle
                <span className={DESPLEGABLE_CABECERA_CONTADOR}>{mesAMes.filas.length}</span>
              </summary>
              <div className={`mt-4 ${TABLA_CONTENEDOR}`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className={TABLA_HEADER_FILA}>
                      <th className={TABLA_HEADER_CELDA}>Vence</th>
                      <th className={TABLA_HEADER_CELDA}>Lote</th>
                      <th className={TABLA_HEADER_CELDA}>Comprador</th>
                      <th className={TABLA_HEADER_CELDA}>Cuota</th>
                      <th className={`${TABLA_HEADER_CELDA} text-right`}>Monto</th>
                      <th className={TABLA_HEADER_CELDA}>Quién la cobra</th>
                      <th className={`${TABLA_HEADER_CELDA} text-right`}>Le corresponde</th>
                      <th className={`${TABLA_HEADER_CELDA} text-right`}>Diferencia</th>
                      <th className={TABLA_HEADER_CELDA}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mesAMes.filas.map((fila) => {
                      const diferencia = Math.round((fila.asignado - fila.leCorresponde) * 100) / 100
                      return (
                        <tr key={fila.cuotaId} className={TABLA_FILA}>
                          <td className={`${TABLA_CELDA_PRINCIPAL} ${NUMERO_TABULAR}`}>
                            {new Date(`${fila.fechaVencimiento}T00:00:00`).toLocaleDateString('es-AR')}
                          </td>
                          <td className={TABLA_CELDA}>
                            <EnlaceBoton href={`/admin/lotes/${fila.loteId}`} className={ENLACE_TABLA}>
                              {fila.loteIdentificador}
                            </EnlaceBoton>
                          </td>
                          <td className={TABLA_CELDA}>{fila.compradorNombre ?? '—'}</td>
                          <td className={`${TABLA_CELDA} ${NUMERO_TABULAR}`}>N° {fila.numero}</td>
                          <td className={`${TABLA_CELDA} text-right ${NUMERO_TABULAR}`}>
                            {fila.montoCuota.toLocaleString('es-AR')} {fila.moneda}
                          </td>
                          <td className={TABLA_CELDA}>
                            {fila.cobraEl ? (
                              <span className="font-medium text-slate-800">Él</span>
                            ) : (
                              <span className="text-slate-500">Otro</span>
                            )}
                          </td>
                          <td className={`${TABLA_CELDA} text-right ${NUMERO_TABULAR}`}>
                            {fila.leCorresponde.toLocaleString('es-AR')} {fila.moneda}
                          </td>
                          <td
                            className={`${TABLA_CELDA} text-right font-semibold ${NUMERO_TABULAR} ${
                              diferencia === 0
                                ? 'text-slate-500'
                                : diferencia > 0
                                  ? 'text-amber-800'
                                  : 'text-blue-800'
                            }`}
                          >
                            {diferencia > 0 ? '+' : ''}
                            {diferencia.toLocaleString('es-AR')}
                          </td>
                          <td className={TABLA_CELDA}>
                            <span className={fila.pagada ? PILL_CUOTA.pagada : PILL_CUOTA.esperando}>
                              {fila.pagada ? 'Pagada' : 'Pendiente'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </section>
      )}

      {/* ------------------------------------------------- movimientos */}
      {esAdmin && (
        <section className={`mb-6 ${PANEL_SIN_PADDING}`}>
          <div className={PANEL_HEADER}>
            <div className="flex items-center gap-3">
              <span className={PANEL_HEADER_ICONO}>
                <Wallet className="h-5 w-5" />
              </span>
              <h2 className={PANEL_TITULO}>Registrar movimiento manual</h2>
            </div>
          </div>
          <div className="p-5">
            <FormularioMovimientoManual
              agregarMovimientoManualAction={agregarMovimientoManualConId}
              nombresUnicosParaSugerir={nombresUnicosParaSugerir}
              lotes={lotes ?? []}
            />
          </div>
        </section>
      )}

      <section className={PANEL_SIN_PADDING}>
        <div className={PANEL_HEADER}>
          <div className="flex items-center gap-3">
            <span className={PANEL_HEADER_ICONO}>
              <ArrowLeftRight className="h-5 w-5" />
            </span>
            <div>
              <h2 className={PANEL_TITULO}>Movimientos</h2>
              <p className="text-xs text-slate-500">Lo que ya pasó: de acá sale el saldo de arriba</p>
            </div>
          </div>
        </div>
        <div className="p-5">
          {movimientos.length === 0 ? (
            <p className="text-sm text-slate-600">Sin movimientos todavía.</p>
          ) : (
            <>
              <FiltroEnVivo className="mb-4 flex flex-wrap items-end gap-3">
                {/* El rango de meses viaja escondido para que filtrar acá
                    no lo pise (ver el comentario de arriba del archivo). Va
                    el rango EFECTIVO y no el de la URL: así, apenas se toca
                    un filtro, el rango que se está mirando queda escrito en
                    la dirección y el link se puede pasar tal cual. */}
                <input type="hidden" name="desde" value={mesDesdeEfectivo} />
                <input type="hidden" name="hasta" value={mesHastaEfectivo} />
                {lotesConMovimientos.length > 0 && (
                  <label className="text-xs font-semibold text-slate-600">
                    Lote
                    <select name="lote" defaultValue={filtroLoteId ?? ''} className={ENTRADA}>
                      <option value="">Todos</option>
                      {lotesConMovimientos.map((lote) => (
                        <option key={lote.id} value={lote.id}>
                          {lote.identificador}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="text-xs font-semibold text-slate-600">
                  Origen
                  <select name="origen" defaultValue={filtroOrigen ?? ''} className={ENTRADA}>
                    <option value="">Todos</option>
                    {origenesConMovimientos.map((origen) => (
                      <option key={origen} value={origen}>
                        {ETIQUETA_ORIGEN[origen] ?? origen}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Desde
                  <input type="date" name="movDesde" defaultValue={filtroDesde ?? ''} className={ENTRADA} />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Hasta
                  <input type="date" name="movHasta" defaultValue={filtroHasta ?? ''} className={ENTRADA} />
                </label>
                <button type="submit" className={`cursor-pointer ${BOTON_SECUNDARIO}`}>
                  Filtrar
                </button>
                {hayFiltrosActivos && (
                  <EnlaceBoton
                    href={`/admin/cuentas-corrientes/${id}?desde=${mesDesdeEfectivo}&hasta=${mesHastaEfectivo}`}
                    className={ENLACE}
                  >
                    Limpiar filtros
                  </EnlaceBoton>
                )}
              </FiltroEnVivo>
              {movimientosFiltrados.length === 0 ? (
                <p className="text-sm text-slate-600">Ningún movimiento coincide con los filtros.</p>
              ) : (
                <div className={TABLA_CONTENEDOR}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={TABLA_HEADER_FILA}>
                        <th className={TABLA_HEADER_CELDA}>Fecha</th>
                        <th className={TABLA_HEADER_CELDA}>Tipo</th>
                        <th className={TABLA_HEADER_CELDA}>Concepto</th>
                        <th className={TABLA_HEADER_CELDA}>Loteo</th>
                        <th className={TABLA_HEADER_CELDA}>Mza</th>
                        <th className={TABLA_HEADER_CELDA}>Lote</th>
                        <th className={TABLA_HEADER_CELDA}>Cliente</th>
                        <th className={TABLA_HEADER_CELDA}>Mes de</th>
                        <th className={TABLA_HEADER_CELDA}>Nro cuota</th>
                        <th className={`${TABLA_HEADER_CELDA} text-right`}>Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filasPlanilla.map((fila) => (
                        <tr key={fila.id} className={TABLA_FILA}>
                          <td className={`${TABLA_CELDA_PRINCIPAL} tabular-nums`}>
                            {new Date(fila.fecha).toLocaleDateString('es-AR')}
                          </td>
                          <td className={TABLA_CELDA}>
                            <span
                              className={
                                fila.tipoMovimiento === 'crédito' ? 'text-emerald-700' : 'text-slate-600'
                              }
                            >
                              {fila.tipoMovimiento}
                            </span>
                          </td>
                          {/* El detalle va DEBAJO del concepto y no en un
                              tooltip: es lo que escribio una persona ("de:
                              Cliente 1", "Adelanto entregado en mano") y es la
                              unica explicacion de por que existe esa fila. En un
                              tooltip no se ve, no se busca con Ctrl+F y no se
                              lee en el celular. */}
                          <td className={TABLA_CELDA}>
                            {fila.concepto}
                            {fila.detalle && (
                              <span className="block text-xs text-slate-500">{fila.detalle}</span>
                            )}
                          </td>
                          <td className={TABLA_CELDA}>{fila.loteo || '—'}</td>
                          <td className={TABLA_CELDA}>{fila.manzana || '—'}</td>
                          <td className={TABLA_CELDA}>
                            {fila.loteId && fila.lote ? (
                              <EnlaceBoton href={`/admin/lotes/${fila.loteId}`} className={ENLACE_TABLA}>
                                {fila.lote}
                              </EnlaceBoton>
                            ) : (
                              fila.lote || '—'
                            )}
                          </td>
                          <td className={TABLA_CELDA}>{fila.cliente || '—'}</td>
                          <td className={TABLA_CELDA}>{fila.mesDe || '—'}</td>
                          <td className={`${TABLA_CELDA} tabular-nums`}>{fila.nroCuota || '—'}</td>
                          <td className={`${TABLA_CELDA} tabular-nums text-right whitespace-nowrap`}>
                            <span className={fila.monto < 0 ? 'text-slate-600' : 'text-emerald-700'}>
                              {fila.monto} {fila.moneda}
                            </span>
                            {fila.cotizacionDia ? (
                              <span className="block text-xs text-slate-500">
                                cotización {fila.cotizacionDia}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  )
}
