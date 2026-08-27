import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cancelarReserva } from './actions'
import { BotonCancelarReserva } from './BotonCancelarReserva'
import { eliminarLote } from './[id]/actions'
import { BotonEliminarLote } from './[id]/BotonEliminarLote'
import { guardarCotizacionDolar } from './cotizacion-dolar-actions'
import { calcularEstadoCobranza } from '@/lib/cobranza/estado-cliente'
import { armarLinkWhatsApp, armarMensajeWhatsApp } from '@/lib/cobranza/plantillas-whatsapp'
import { telefonoParaWhatsApp } from '@/lib/telefono/prefijos'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { formatearFechaCorta } from '@/lib/fecha/formatear-fecha-corta'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'

const COLUMNAS_ORDENABLES = ['identificador', 'ubicacion', 'precio_total', 'moneda', 'estado'] as const
type ColumnaOrdenable = (typeof COLUMNAS_ORDENABLES)[number]

const ETIQUETAS_COLUMNA: Record<ColumnaOrdenable, string> = {
  identificador: 'Identificador',
  ubicacion: 'Ubicación',
  precio_total: 'Precio total',
  moneda: 'Moneda',
  estado: 'Estado',
}

const INPUT_CLASE =
  'mt-1 block rounded-lg border border-blue-100 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200'

export default async function LotesPage({
  searchParams,
}: {
  searchParams: Promise<{
    sort?: string
    dir?: string
    moneda?: string
    acreedor?: string
    loteo?: string
    cliente?: string
    cobranza?: string
    estado?: string
    q?: string
    error?: string
  }>
}) {
  const {
    sort,
    dir,
    moneda: filtroMoneda,
    acreedor: filtroAcreedorId,
    loteo: filtroLoteoId,
    cliente: filtroCliente,
    cobranza: filtroCobranza,
    estado: filtroEstado,
    q: filtroTexto,
    error,
  } = await searchParams

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: perfilPropio } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  if (!perfilPropio) {
    redirect('/login')
  }

  const esVendedorOCobrador = perfilPropio!.role === 'vendedor' || perfilPropio!.role === 'cobrador'

  const hoy = hoyArgentina()
  const { data: cotizacionHoy } = await supabase
    .from('cotizaciones_dolar')
    .select('valor, cargado_por, created_at')
    .eq('fecha', hoy)
    .maybeSingle()

  const { data: cargadorCotizacion } = cotizacionHoy
    ? await supabase.from('profiles').select('full_name').eq('id', cotizacionHoy.cargado_por).single()
    : { data: null }

  const columnaOrden: ColumnaOrdenable = COLUMNAS_ORDENABLES.includes(sort as ColumnaOrdenable)
    ? (sort as ColumnaOrdenable)
    : 'identificador'
  const ordenAscendente = dir !== 'desc'

  let queryLotes = supabase
    .from('lotes')
    .select(
      'id, identificador, moneda, estado, cantidad_cuotas, ubicacion, precio_total, acreedor_id, loteo_id, cliente_id, ciclo_actual, marcado_prejudicial'
    )
    .order(columnaOrden, { ascending: ordenAscendente })

  if (perfilPropio!.role === 'acreedor') {
    queryLotes = queryLotes.eq('acreedor_id', user!.id)
  }

  if (esVendedorOCobrador) {
    queryLotes = queryLotes.in('estado', ['disponible', 'reservado'])
  }

  if (filtroMoneda) {
    queryLotes = queryLotes.eq('moneda', filtroMoneda)
  }

  if (filtroAcreedorId && perfilPropio!.role !== 'acreedor') {
    queryLotes = queryLotes.eq('acreedor_id', filtroAcreedorId)
  }

  if (filtroTexto) {
    queryLotes = queryLotes.ilike('identificador', `%${filtroTexto}%`)
  }

  if (filtroLoteoId) {
    queryLotes = queryLotes.eq('loteo_id', filtroLoteoId)
  }

  if (filtroEstado && !esVendedorOCobrador) {
    queryLotes = queryLotes.eq('estado', filtroEstado)
  }

  const { data: lotes } = await queryLotes

  const { data: todosLosAcreedores } =
    perfilPropio!.role !== 'acreedor'
      ? await supabase.from('profiles').select('id, full_name').eq('role', 'acreedor').order('full_name')
      : { data: [] }

  const { data: todosLosLoteos } = await supabase.from('loteos').select('id, nombre').order('nombre')

  const acreedorIds = [...new Set((lotes ?? []).map((lote) => lote.acreedor_id).filter(Boolean))]

  const { data: acreedores } =
    acreedorIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', acreedorIds)
      : { data: [] }

  const nombreAcreedorPorId = new Map((acreedores ?? []).map((persona) => [persona.id, persona.full_name]))

  const loteoIds = [...new Set((lotes ?? []).map((lote) => lote.loteo_id).filter(Boolean))]
  const { data: loteosConLote } =
    loteoIds.length > 0
      ? await supabase.from('loteos').select('id, nombre').in('id', loteoIds)
      : { data: [] }
  const nombreLoteoPorId = new Map((loteosConLote ?? []).map((loteo) => [loteo.id, loteo.nombre]))

  // Estado de cobranza por lote vendido: para que se vea de un vistazo quién
  // está en mora sin tener que entrar a cada cliente (ver Notas_Decisiones_SIMA.txt).
  const lotesVendidos = (lotes ?? []).filter((lote) => lote.estado === 'vendido' && lote.cliente_id)
  const loteVendidoIds = lotesVendidos.map((lote) => lote.id)
  const clienteIds = [...new Set(lotesVendidos.map((lote) => lote.cliente_id as string))]

  const { data: clientes } =
    clienteIds.length > 0
      ? await supabase
          .from('profiles')
          .select('id, full_name, telefono_prefijo, telefono_numero')
          .in('id', clienteIds)
      : { data: [] }
  const clientePorId = new Map((clientes ?? []).map((cliente) => [cliente.id, cliente]))
  const esAdministrador = perfilPropio!.role === 'administrador'

  const cicloActualPorLoteId = new Map(lotesVendidos.map((lote) => [lote.id, lote.ciclo_actual]))

  const { data: cuotasPorLoteSinFiltrar } =
    loteVendidoIds.length > 0
      ? await supabase
          .from('cuotas')
          .select('lote_id, ciclo, saldo_pendiente, fecha_vencimiento')
          .in('lote_id', loteVendidoIds)
          .order('fecha_vencimiento', { ascending: true })
      : { data: [] }

  // Acotado al ciclo de venta VIGENTE de cada lote (ver migración 0039):
  // un lote rescindido-y-revendido puede tener cuotas viejas sin cobrar de
  // un ciclo anterior, que no tienen que contar para el estado de cobranza
  // del cliente ACTUAL.
  const cuotasPorLote = (cuotasPorLoteSinFiltrar ?? []).filter(
    (cuota) => cuota.ciclo === cicloActualPorLoteId.get(cuota.lote_id)
  )

  const cuotasAgrupadasPorLote = new Map<string, { saldo_pendiente: number; fecha_vencimiento: string }[]>()
  for (const cuota of cuotasPorLote ?? []) {
    const listaActual = cuotasAgrupadasPorLote.get(cuota.lote_id) ?? []
    listaActual.push(cuota)
    cuotasAgrupadasPorLote.set(cuota.lote_id, listaActual)
  }

  const cobranzaPorLote = new Map(
    lotesVendidos.map((lote) => {
      const cuotasDelLote = cuotasAgrupadasPorLote.get(lote.id) ?? []
      const saldoPendiente = cuotasDelLote.reduce((acum, cuota) => acum + cuota.saldo_pendiente, 0)
      const estadoCobranza = calcularEstadoCobranza(
        cuotasDelLote.map((cuota) => ({
          saldoPendiente: cuota.saldo_pendiente,
          fechaVencimiento: cuota.fecha_vencimiento,
        })),
        hoy
      )
      const proximaCuotaPendiente = cuotasDelLote.find((cuota) => cuota.saldo_pendiente > 0)
      const cliente = clientePorId.get(lote.cliente_id as string)
      const mensajeWhatsApp =
        saldoPendiente > 0 && proximaCuotaPendiente && cliente
          ? armarMensajeWhatsApp(estadoCobranza, {
              nombre: cliente.full_name,
              lote: lote.identificador,
              monto: saldoPendiente,
              moneda: lote.moneda,
              fechaVencimiento: proximaCuotaPendiente.fecha_vencimiento,
            })
          : null

      return [
        lote.id,
        {
          saldoPendiente,
          estadoCobranza,
          marcadoPrejudicial: lote.marcado_prejudicial,
          mensajeWhatsApp,
          telefono: telefonoParaWhatsApp(cliente?.telefono_prefijo ?? null, cliente?.telefono_numero ?? null),
        },
      ]
    })
  )

  // Cliente y Cobranza no son columnas de "lotes" (cliente ya viene resuelto
  // arriba, cobranza es calculada) -- se filtran en JS después de tener
  // clientePorId/cobranzaPorLote, en vez de en la consulta SQL.
  const lotesFiltrados = (lotes ?? []).filter((lote) => {
    if (filtroCliente) {
      const nombreCliente = lote.cliente_id ? clientePorId.get(lote.cliente_id)?.full_name : null
      if (!nombreCliente || !nombreCliente.toLowerCase().includes(filtroCliente.toLowerCase())) {
        return false
      }
    }
    if (filtroCobranza) {
      const cobranza = cobranzaPorLote.get(lote.id)
      const etiquetaCobranza = !cobranza
        ? null
        : cobranza.saldoPendiente === 0
          ? 'pagado'
          : cobranza.marcadoPrejudicial
            ? 'prejudicial'
            : cobranza.estadoCobranza === 'normal'
              ? 'al_dia'
              : cobranza.estadoCobranza === 'moroso'
                ? 'moroso'
                : 'posible_prejudicial'
      if (etiquetaCobranza !== filtroCobranza) return false
    }
    return true
  })

  let reservasPropias: { lote_id: string }[] = []

  if (esVendedorOCobrador) {
    const { data } = await supabase
      .from('reservas')
      .select('lote_id')
      .eq('created_by', user!.id)
      .is('cancelada_at', null)

    reservasPropias = data ?? []
  }

  const idsLotesReservadosPorMi = [...new Set(reservasPropias.map((reserva) => reserva.lote_id))]

  const { data: misLotesReservados } =
    idsLotesReservadosPorMi.length > 0
      ? await supabase
          .from('lotes')
          .select('id, identificador, moneda, estado, ubicacion, precio_total')
          .in('id', idsLotesReservadosPorMi)
          .order('created_at', { ascending: false })
      : { data: [] }

  function urlOrden(columna: ColumnaOrdenable) {
    const params = new URLSearchParams()
    if (filtroMoneda) params.set('moneda', filtroMoneda)
    if (filtroAcreedorId) params.set('acreedor', filtroAcreedorId)
    if (filtroLoteoId) params.set('loteo', filtroLoteoId)
    if (filtroCliente) params.set('cliente', filtroCliente)
    if (filtroCobranza) params.set('cobranza', filtroCobranza)
    if (filtroEstado) params.set('estado', filtroEstado)
    if (filtroTexto) params.set('q', filtroTexto)
    params.set('sort', columna)
    params.set('dir', columnaOrden === columna && ordenAscendente ? 'desc' : 'asc')
    return `/admin/lotes?${params.toString()}`
  }

  function claseCobranza(cobranza: { saldoPendiente: number; marcadoPrejudicial: boolean; estadoCobranza: string }) {
    if (cobranza.saldoPendiente === 0) return 'bg-slate-100 text-slate-600'
    if (cobranza.marcadoPrejudicial) return 'bg-red-100 text-red-800 font-bold'
    if (cobranza.estadoCobranza === 'normal') return 'bg-green-50 text-green-700'
    if (cobranza.estadoCobranza === 'moroso') return 'bg-red-50 text-red-600 font-semibold'
    return 'bg-amber-50 text-amber-700 font-semibold'
  }

  function etiquetaCobranza(cobranza: { saldoPendiente: number; marcadoPrejudicial: boolean; estadoCobranza: string }) {
    if (cobranza.saldoPendiente === 0) return 'Pagado'
    if (cobranza.marcadoPrejudicial) return 'Prejudicial'
    if (cobranza.estadoCobranza === 'normal') return 'Al día'
    if (cobranza.estadoCobranza === 'moroso') return 'Moroso'
    return 'Posible prejudicial'
  }

  return (
    <main>
      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mb-6 rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
        {cotizacionHoy ? (
          <p className="mb-3 text-sm text-green-700">
            ✓ Cotización de hoy ({formatearFechaCorta(hoy)}) ya cargada:{' '}
            <span className="font-semibold text-blue-900">{cotizacionHoy.valor}</span> ARS por USD — cargada por{' '}
            {cargadorCotizacion?.full_name ?? '—'} a las{' '}
            {new Date(cotizacionHoy.created_at).toLocaleTimeString('es-AR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            hs.
          </p>
        ) : (
          <p className="mb-3 text-sm font-semibold text-amber-700">
            ⚠ Todavía no cargaste la cotización del dólar de hoy ({formatearFechaCorta(hoy)}).
          </p>
        )}
        <form action={guardarCotizacionDolar} className="flex flex-wrap items-end gap-2">
          <label className="text-sm text-slate-600">
            {cotizacionHoy ? 'Corregir cotización de hoy' : 'Cotización de hoy'} (ARS por USD)
            <input
              name="valor"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Ej: 1500"
              defaultValue={cotizacionHoy?.valor ?? ''}
              required
              className={INPUT_CLASE}
            />
          </label>
          <BotonEnvio className="cursor-pointer rounded-lg bg-blue-800 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-900">
            {cotizacionHoy ? 'Corregir' : 'Cargar'}
          </BotonEnvio>
        </form>
        <EnlaceBoton
          href="/admin/cotizacion-dolar"
          className="mt-2 inline-block text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
        >
          Ver historial completo →
        </EnlaceBoton>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-blue-900">Lotes</h1>
        {!esVendedorOCobrador && (
          <div className="flex gap-3">
            <EnlaceBoton
              href="/admin/lotes/importar"
              className="rounded-lg border border-blue-800 px-3 py-2 text-sm font-semibold text-blue-800 transition-colors hover:bg-blue-50"
            >
              Importar varios
            </EnlaceBoton>
            <EnlaceBoton
              href="/admin/lotes/nuevo"
              className="rounded-lg bg-blue-800 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-900"
            >
              + Nuevo lote
            </EnlaceBoton>
          </div>
        )}
      </div>

      {esVendedorOCobrador && (
        <>
          <h2 className="mb-2 text-lg font-bold text-blue-900">Lotes que reservaste</h2>
          {(misLotesReservados ?? []).length === 0 ? (
            <p className="mb-8 text-sm text-slate-600">Todavía no reservaste ningún lote.</p>
          ) : (
            <div className="mb-8 overflow-x-auto rounded-xl border border-blue-100 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-blue-50 text-left text-blue-900">
                    <th className="px-4 py-3 font-semibold">Identificador</th>
                    <th className="px-4 py-3 font-semibold">Ubicación</th>
                    <th className="px-4 py-3 font-semibold">Precio total</th>
                    <th className="px-4 py-3 font-semibold">Moneda</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {misLotesReservados!.map((lote) => {
                    const cancelarReservaConId = cancelarReserva.bind(null, lote.id)
                    return (
                      <tr key={lote.id} className="border-t border-blue-100 hover:bg-blue-50/40">
                        <td className="px-4 py-3 font-medium text-slate-800">{lote.identificador}</td>
                        <td className="px-4 py-3 text-slate-600">{lote.ubicacion ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {lote.precio_total ? `${lote.precio_total} ${lote.moneda}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{lote.moneda}</td>
                        <td className="px-4 py-3 text-slate-600">{lote.estado}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <EnlaceBoton
                              href={`/admin/lotes/${lote.id}/info`}
                              className="text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
                            >
                              Ver información del lote →
                            </EnlaceBoton>
                            {lote.estado === 'reservado' && (
                              <BotonCancelarReserva cancelarReservaAction={cancelarReservaConId} />
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <h2 className="mb-2 text-lg font-bold text-blue-900">Lotes disponibles y reservados</h2>
        </>
      )}

      <FiltroEnVivo className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
        <input type="hidden" name="sort" value={columnaOrden} />
        <input type="hidden" name="dir" value={ordenAscendente ? 'asc' : 'desc'} />
        <label className="text-sm text-slate-600">
          Buscar
          <input
            type="text"
            name="q"
            placeholder="Buscar identificador"
            defaultValue={filtroTexto ?? ''}
            className={INPUT_CLASE}
          />
        </label>
        <label className="text-sm text-slate-600">
          Moneda
          <select name="moneda" defaultValue={filtroMoneda ?? ''} className={INPUT_CLASE}>
            <option value="">Todas</option>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </label>
        {perfilPropio!.role !== 'acreedor' && (
          <label className="text-sm text-slate-600">
            Acreedor
            <select name="acreedor" defaultValue={filtroAcreedorId ?? ''} className={INPUT_CLASE}>
              <option value="">Todos</option>
              {(todosLosAcreedores ?? []).map((persona) => (
                <option key={persona.id} value={persona.id}>
                  {persona.full_name}
                </option>
              ))}
            </select>
          </label>
        )}
        {!esVendedorOCobrador && (
          <label className="text-sm text-slate-600">
            Loteo
            <select name="loteo" defaultValue={filtroLoteoId ?? ''} className={INPUT_CLASE}>
              <option value="">Todos</option>
              {(todosLosLoteos ?? []).map((loteo) => (
                <option key={loteo.id} value={loteo.id}>
                  {loteo.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        {esAdministrador && (
          <label className="text-sm text-slate-600">
            Cliente
            <input
              type="text"
              name="cliente"
              placeholder="Nombre del cliente"
              defaultValue={filtroCliente ?? ''}
              className={INPUT_CLASE}
            />
          </label>
        )}
        {!esVendedorOCobrador && (
          <label className="text-sm text-slate-600">
            Estado
            <select name="estado" defaultValue={filtroEstado ?? ''} className={INPUT_CLASE}>
              <option value="">Todos</option>
              <option value="disponible">Disponible</option>
              <option value="reservado">Reservado</option>
              <option value="vendido">Vendido</option>
              <option value="rescindido">Rescindido</option>
            </select>
          </label>
        )}
        {!esVendedorOCobrador && (
          <label className="text-sm text-slate-600">
            Cobranza
            <select name="cobranza" defaultValue={filtroCobranza ?? ''} className={INPUT_CLASE}>
              <option value="">Todas</option>
              <option value="pagado">Pagado</option>
              <option value="al_dia">Al día</option>
              <option value="moroso">Moroso</option>
              <option value="posible_prejudicial">Posible prejudicial</option>
              <option value="prejudicial">Prejudicial</option>
            </select>
          </label>
        )}
        <button
          type="submit"
          className="cursor-pointer rounded-lg border border-blue-800 px-3 py-2 text-sm font-semibold text-blue-800 transition-colors hover:bg-blue-50"
        >
          Filtrar
        </button>
        {(filtroMoneda ||
          filtroAcreedorId ||
          filtroLoteoId ||
          filtroCliente ||
          filtroCobranza ||
          filtroEstado ||
          filtroTexto ||
          sort ||
          dir) && (
          <EnlaceBoton
            href="/admin/lotes"
            className="text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
          >
            Limpiar filtros y orden
          </EnlaceBoton>
        )}
      </FiltroEnVivo>

      {lotesFiltrados.length === 0 && (filtroCliente || filtroCobranza || filtroEstado) ? (
        <p className="text-sm text-slate-600">Ningún lote coincide con los filtros.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-blue-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-blue-50 text-left text-blue-900">
                {!esVendedorOCobrador && <th className="px-4 py-3 font-semibold">Loteo</th>}
                {COLUMNAS_ORDENABLES.map((columna) => (
                  <th key={columna} className="px-4 py-3 font-semibold">
                    <EnlaceBoton
                      href={urlOrden(columna)}
                      className="text-blue-900 underline-offset-4 hover:underline"
                    >
                      {ETIQUETAS_COLUMNA[columna]}
                      {columnaOrden === columna ? (ordenAscendente ? ' ▲' : ' ▼') : ''}
                    </EnlaceBoton>
                  </th>
                ))}
                {!esVendedorOCobrador && <th className="px-4 py-3 font-semibold">Acreedor</th>}
                {!esVendedorOCobrador && <th className="px-4 py-3 font-semibold">Cuotas</th>}
                {esAdministrador && <th className="px-4 py-3 font-semibold">Cliente</th>}
                {!esVendedorOCobrador && <th className="px-4 py-3 font-semibold">Cobranza</th>}
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {lotesFiltrados.map((lote) => {
                const eliminarLoteConId = eliminarLote.bind(null, lote.id)
                const cobranza = cobranzaPorLote.get(lote.id)
                return (
                  <tr key={lote.id} className="border-t border-blue-100 hover:bg-blue-50/40">
                    {!esVendedorOCobrador && (
                      <td className="px-4 py-3 text-slate-600">
                        {lote.loteo_id ? nombreLoteoPorId.get(lote.loteo_id) ?? '—' : '— sin asignar —'}
                      </td>
                    )}
                    <td className="px-4 py-3 font-medium text-slate-800">{lote.identificador}</td>
                    <td className="px-4 py-3 text-slate-600">{lote.ubicacion ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {lote.precio_total ? `${lote.precio_total} ${lote.moneda}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{lote.moneda}</td>
                    <td className="px-4 py-3 text-slate-600">{lote.estado}</td>
                    {!esVendedorOCobrador && (
                      <td className="px-4 py-3">
                        {lote.acreedor_id ? (
                          esAdministrador ? (
                            <EnlaceBoton
                              href={`/admin/usuarios?editar=${lote.acreedor_id}`}
                              className="text-blue-800 underline-offset-4 hover:underline"
                            >
                              {nombreAcreedorPorId.get(lote.acreedor_id) ?? '—'}
                            </EnlaceBoton>
                          ) : (
                            <span className="text-slate-600">{nombreAcreedorPorId.get(lote.acreedor_id) ?? '—'}</span>
                          )
                        ) : (
                          <span className="text-slate-500">— sin asignar —</span>
                        )}
                      </td>
                    )}
                    {!esVendedorOCobrador && <td className="px-4 py-3 text-slate-600">{lote.cantidad_cuotas}</td>}
                    {esAdministrador && (
                      <td className="px-4 py-3">
                        {lote.estado === 'vendido' && lote.cliente_id ? (
                          <EnlaceBoton
                            href={`/admin/clientes/${lote.cliente_id}`}
                            className="text-blue-800 underline-offset-4 hover:underline"
                          >
                            {clientePorId.get(lote.cliente_id)?.full_name ?? '—'}
                          </EnlaceBoton>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    )}
                    {!esVendedorOCobrador && (
                      <td className="px-4 py-3">
                        {cobranza ? (
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2.5 py-1 text-xs ${claseCobranza(cobranza)}`}>
                              {etiquetaCobranza(cobranza)}
                            </span>
                            {cobranza.mensajeWhatsApp && cobranza.telefono && (
                              <a
                                href={armarLinkWhatsApp(cobranza.telefono, cobranza.mensajeWhatsApp)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
                              >
                                WhatsApp
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {esVendedorOCobrador ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <EnlaceBoton
                            href={`/admin/lotes/${lote.id}/info`}
                            className="text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
                          >
                            Ver información del lote →
                          </EnlaceBoton>
                          {lote.estado === 'disponible' && (
                            <EnlaceBoton
                              href={`/admin/lotes/${lote.id}/reservar`}
                              className="text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
                            >
                              Reservar
                            </EnlaceBoton>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-3">
                          <EnlaceBoton
                            href={`/admin/lotes/${lote.id}/info`}
                            className="text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
                          >
                            Ver información del lote →
                          </EnlaceBoton>
                          <EnlaceBoton
                            href={`/admin/lotes/${lote.id}`}
                            className="text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
                          >
                            Ver detalle
                          </EnlaceBoton>
                          {lote.estado === 'disponible' && (
                            <EnlaceBoton
                              href={`/admin/lotes/${lote.id}/reservar`}
                              className="text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
                            >
                              Reservar
                            </EnlaceBoton>
                          )}
                          {perfilPropio!.role === 'administrador' && lote.estado === 'reservado' && (
                            <EnlaceBoton
                              href={`/admin/lotes/${lote.id}/vender`}
                              className="text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
                            >
                              Vender / asignar cliente
                            </EnlaceBoton>
                          )}
                          {perfilPropio!.role === 'administrador' && (
                            <BotonEliminarLote eliminarLoteAction={eliminarLoteConId} compacto />
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
