import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cancelarReserva } from './actions'
import { BotonCancelarReserva } from './BotonCancelarReserva'
import { eliminarLote } from './[id]/actions'
import { BotonEliminarLote } from './[id]/BotonEliminarLote'
import { guardarCotizacionDolar } from './cotizacion-dolar-actions'
import { calcularEstadoCobranza, cuotasVencidas } from '@/lib/cobranza/estado-cliente'
import { calcularInteresMoratorio } from '@/lib/cobranza/interes-moratorio'
import { armarLinkWhatsApp, armarMensajeWhatsApp } from '@/lib/cobranza/plantillas-whatsapp'
import { telefonoParaWhatsApp } from '@/lib/telefono/prefijos'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { formatearFechaCorta } from '@/lib/fecha/formatear-fecha-corta'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import { EncabezadoPagina } from '@/components/EncabezadoPagina'
import {
  TARJETA,
  ENTRADA,
  BOTON_PRIMARIO,
  BOTON_SECUNDARIO,
  ENLACE,
  ENLACE_TABLA,
  TITULO_H2,
  BANNER_ERROR,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
  TABLA_CELDA_PRINCIPAL,
  BADGE_BASE,
  BADGE_VERDE,
  BADGE_AMARILLO,
  BADGE_ROJO,
  BADGE_GRIS,
} from '@/lib/ui/clases'

const COLUMNAS_ORDENABLES = ['identificador', 'ubicacion', 'precio_total', 'moneda', 'estado'] as const
type ColumnaOrdenable = (typeof COLUMNAS_ORDENABLES)[number]

const ETIQUETAS_COLUMNA: Record<ColumnaOrdenable, string> = {
  identificador: 'Identificador',
  ubicacion: 'Ubicación',
  precio_total: 'Precio total',
  moneda: 'Moneda',
  estado: 'Estado',
}

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
      'id, identificador, moneda, estado, cantidad_cuotas, ubicacion, precio_total, acreedor_id, loteo_id, cliente_id, ciclo_actual, marcado_prejudicial, numero_lote, manzana, interes_moratorio_diario'
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
      // moroso/prejudicial: el monto que se manda por WhatsApp incluye el
      // interés moratorio acumulado de cada cuota vencida (pedido explícito
      // de Nicolás en las plantillas del 28/08) -- normal/atrasado siguen
      // usando el saldo de capital nomás, todavía no acumularon mora real.
      const vencidas = cuotasVencidas(
        cuotasDelLote.map((cuota) => ({
          saldoPendiente: cuota.saldo_pendiente,
          fechaVencimiento: cuota.fecha_vencimiento,
        })),
        hoy
      )
      const montoConMora =
        estadoCobranza === 'moroso' || estadoCobranza === 'prejudicial'
          ? saldoPendiente +
            vencidas.reduce(
              (acum, cuota) =>
                acum + calcularInteresMoratorio(cuota, lote.interes_moratorio_diario, hoy),
              0
            )
          : saldoPendiente
      const mensajeWhatsApp =
        saldoPendiente > 0 && proximaCuotaPendiente && cliente
          ? armarMensajeWhatsApp(estadoCobranza, {
              nombre: cliente.full_name,
              lote: lote.identificador,
              numeroLote: lote.numero_lote,
              manzana: lote.manzana,
              nombreLoteo: lote.loteo_id ? (nombreLoteoPorId.get(lote.loteo_id) ?? null) : null,
              monto: montoConMora,
              moneda: lote.moneda,
              fechaVencimiento: proximaCuotaPendiente.fecha_vencimiento,
              fechasVencidas: vencidas.map((cuota) => cuota.fechaVencimiento),
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
              : cobranza.estadoCobranza === 'atrasado'
                ? 'atrasado'
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
    if (cobranza.saldoPendiente === 0) return `${BADGE_BASE} ${BADGE_GRIS}`
    if (cobranza.marcadoPrejudicial) return `${BADGE_BASE} ${BADGE_ROJO} font-bold`
    if (cobranza.estadoCobranza === 'normal') return `${BADGE_BASE} ${BADGE_VERDE}`
    if (cobranza.estadoCobranza === 'atrasado') return `${BADGE_BASE} ${BADGE_AMARILLO}`
    if (cobranza.estadoCobranza === 'moroso') return `${BADGE_BASE} ${BADGE_ROJO}`
    return `${BADGE_BASE} ${BADGE_ROJO} font-bold`
  }

  function etiquetaCobranza(cobranza: { saldoPendiente: number; marcadoPrejudicial: boolean; estadoCobranza: string }) {
    if (cobranza.saldoPendiente === 0) return 'Pagado'
    if (cobranza.marcadoPrejudicial) return 'Prejudicial'
    if (cobranza.estadoCobranza === 'normal') return 'Al día'
    if (cobranza.estadoCobranza === 'atrasado') return 'Atrasado'
    if (cobranza.estadoCobranza === 'moroso') return 'Moroso'
    return 'Posible prejudicial'
  }

  return (
    <main>
      <EncabezadoPagina
        titulo="Lotes"
        migas={['Lotes']}
        acciones={
          !esVendedorOCobrador && (
            <>
              <EnlaceBoton href="/admin/lotes/importar" className={`cursor-pointer ${BOTON_SECUNDARIO}`}>
                Importar varios
              </EnlaceBoton>
              <EnlaceBoton href="/admin/lotes/nuevo" className={`cursor-pointer ${BOTON_PRIMARIO}`}>
                + Nuevo lote
              </EnlaceBoton>
            </>
          )
        }
      />

      {error && <p className={BANNER_ERROR}>{error}</p>}

      <div className={`mb-6 ${TARJETA}`}>
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
              className={ENTRADA}
            />
          </label>
          <BotonEnvio className={`cursor-pointer ${BOTON_PRIMARIO}`}>
            {cotizacionHoy ? 'Corregir' : 'Cargar'}
          </BotonEnvio>
        </form>
        <EnlaceBoton href="/admin/cotizacion-dolar" className={`mt-2 inline-block ${ENLACE}`}>
          Ver historial completo →
        </EnlaceBoton>
      </div>

      {esVendedorOCobrador && (
        <>
          <h2 className={`mb-2 ${TITULO_H2}`}>Lotes que reservaste</h2>
          {(misLotesReservados ?? []).length === 0 ? (
            <p className="mb-8 text-sm text-slate-600">Todavía no reservaste ningún lote.</p>
          ) : (
            <div className={`mb-8 ${TABLA_CONTENEDOR}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={TABLA_HEADER_FILA}>
                    <th className={TABLA_HEADER_CELDA}>Identificador</th>
                    <th className={TABLA_HEADER_CELDA}>Ubicación</th>
                    <th className={TABLA_HEADER_CELDA}>Precio total</th>
                    <th className={TABLA_HEADER_CELDA}>Moneda</th>
                    <th className={TABLA_HEADER_CELDA}>Estado</th>
                    <th className={TABLA_HEADER_CELDA}></th>
                  </tr>
                </thead>
                <tbody>
                  {misLotesReservados!.map((lote) => {
                    const cancelarReservaConId = cancelarReserva.bind(null, lote.id)
                    return (
                      <tr key={lote.id} className={TABLA_FILA}>
                        <td className={TABLA_CELDA_PRINCIPAL}>{lote.identificador}</td>
                        <td className={TABLA_CELDA}>{lote.ubicacion ?? '—'}</td>
                        <td className={TABLA_CELDA}>
                          {lote.precio_total ? `${lote.precio_total} ${lote.moneda}` : '—'}
                        </td>
                        <td className={TABLA_CELDA}>{lote.moneda}</td>
                        <td className={TABLA_CELDA}>{lote.estado}</td>
                        <td className={TABLA_CELDA}>
                          <div className="flex flex-wrap items-center gap-3">
                            <EnlaceBoton href={`/admin/lotes/${lote.id}/info`} className={ENLACE}>
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
          <h2 className={`mb-2 ${TITULO_H2}`}>Lotes disponibles y reservados</h2>
        </>
      )}

      <FiltroEnVivo className={`mb-4 flex flex-wrap items-end gap-3 ${TARJETA}`}>
        <input type="hidden" name="sort" value={columnaOrden} />
        <input type="hidden" name="dir" value={ordenAscendente ? 'asc' : 'desc'} />
        <label className="text-sm text-slate-600">
          Buscar
          <input
            type="text"
            name="q"
            placeholder="Buscar identificador"
            defaultValue={filtroTexto ?? ''}
            className={ENTRADA}
          />
        </label>
        <label className="text-sm text-slate-600">
          Moneda
          <select name="moneda" defaultValue={filtroMoneda ?? ''} className={ENTRADA}>
            <option value="">Todas</option>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </label>
        {perfilPropio!.role !== 'acreedor' && (
          <label className="text-sm text-slate-600">
            Acreedor
            <select name="acreedor" defaultValue={filtroAcreedorId ?? ''} className={ENTRADA}>
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
            <select name="loteo" defaultValue={filtroLoteoId ?? ''} className={ENTRADA}>
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
              className={ENTRADA}
            />
          </label>
        )}
        {!esVendedorOCobrador && (
          <label className="text-sm text-slate-600">
            Estado
            <select name="estado" defaultValue={filtroEstado ?? ''} className={ENTRADA}>
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
            <select name="cobranza" defaultValue={filtroCobranza ?? ''} className={ENTRADA}>
              <option value="">Todas</option>
              <option value="pagado">Pagado</option>
              <option value="al_dia">Al día</option>
              <option value="atrasado">Atrasado</option>
              <option value="moroso">Moroso</option>
              <option value="posible_prejudicial">Posible prejudicial</option>
              <option value="prejudicial">Prejudicial</option>
            </select>
          </label>
        )}
        <button type="submit" className={`cursor-pointer ${BOTON_SECUNDARIO}`}>
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
          <EnlaceBoton href="/admin/lotes" className={ENLACE}>
            Limpiar filtros y orden
          </EnlaceBoton>
        )}
      </FiltroEnVivo>

      {lotesFiltrados.length === 0 && (filtroCliente || filtroCobranza || filtroEstado) ? (
        <p className="text-sm text-slate-600">Ningún lote coincide con los filtros.</p>
      ) : (
        <div className={TABLA_CONTENEDOR}>
          <table className="w-full text-sm">
            <thead>
              <tr className={TABLA_HEADER_FILA}>
                {!esVendedorOCobrador && <th className={TABLA_HEADER_CELDA}>Loteo</th>}
                {COLUMNAS_ORDENABLES.map((columna) => (
                  <th key={columna} className={TABLA_HEADER_CELDA}>
                    <EnlaceBoton href={urlOrden(columna)} className="text-white underline-offset-4 hover:underline">
                      {ETIQUETAS_COLUMNA[columna]}
                      {columnaOrden === columna ? (ordenAscendente ? ' ▲' : ' ▼') : ''}
                    </EnlaceBoton>
                  </th>
                ))}
                {!esVendedorOCobrador && <th className={TABLA_HEADER_CELDA}>Acreedor</th>}
                {!esVendedorOCobrador && <th className={TABLA_HEADER_CELDA}>Cuotas</th>}
                {esAdministrador && <th className={TABLA_HEADER_CELDA}>Cliente</th>}
                {!esVendedorOCobrador && <th className={TABLA_HEADER_CELDA}>Cobranza</th>}
                <th className={TABLA_HEADER_CELDA}></th>
              </tr>
            </thead>
            <tbody>
              {lotesFiltrados.map((lote) => {
                const eliminarLoteConId = eliminarLote.bind(null, lote.id)
                const cobranza = cobranzaPorLote.get(lote.id)
                return (
                  <tr key={lote.id} className={TABLA_FILA}>
                    {!esVendedorOCobrador && (
                      <td className={TABLA_CELDA}>
                        {lote.loteo_id ? nombreLoteoPorId.get(lote.loteo_id) ?? '—' : '— sin asignar —'}
                      </td>
                    )}
                    <td className={TABLA_CELDA_PRINCIPAL}>{lote.identificador}</td>
                    <td className={TABLA_CELDA}>{lote.ubicacion ?? '—'}</td>
                    <td className={TABLA_CELDA}>
                      {lote.precio_total ? `${lote.precio_total} ${lote.moneda}` : '—'}
                    </td>
                    <td className={TABLA_CELDA}>{lote.moneda}</td>
                    <td className={TABLA_CELDA}>{lote.estado}</td>
                    {!esVendedorOCobrador && (
                      <td className={TABLA_CELDA}>
                        {lote.acreedor_id ? (
                          esAdministrador ? (
                            <EnlaceBoton href={`/admin/usuarios?editar=${lote.acreedor_id}`} className={ENLACE_TABLA}>
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
                    {!esVendedorOCobrador && <td className={TABLA_CELDA}>{lote.cantidad_cuotas}</td>}
                    {esAdministrador && (
                      <td className={TABLA_CELDA}>
                        {lote.estado === 'vendido' && lote.cliente_id ? (
                          <EnlaceBoton href={`/admin/clientes/${lote.cliente_id}`} className={ENLACE_TABLA}>
                            {clientePorId.get(lote.cliente_id)?.full_name ?? '—'}
                          </EnlaceBoton>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    )}
                    {!esVendedorOCobrador && (
                      <td className={TABLA_CELDA}>
                        {cobranza ? (
                          <div className="flex items-center gap-2">
                            <span className={claseCobranza(cobranza)}>{etiquetaCobranza(cobranza)}</span>
                            {cobranza.mensajeWhatsApp && cobranza.telefono && (
                              <a
                                href={armarLinkWhatsApp(cobranza.telefono, cobranza.mensajeWhatsApp)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={ENLACE}
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
                    <td className={TABLA_CELDA}>
                      {esVendedorOCobrador ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <EnlaceBoton href={`/admin/lotes/${lote.id}/info`} className={ENLACE}>
                            Ver información del lote →
                          </EnlaceBoton>
                          {lote.estado === 'disponible' && (
                            <EnlaceBoton href={`/admin/lotes/${lote.id}/reservar`} className={ENLACE}>
                              Reservar
                            </EnlaceBoton>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-3">
                          <EnlaceBoton href={`/admin/lotes/${lote.id}/info`} className={ENLACE}>
                            Ver información del lote →
                          </EnlaceBoton>
                          <EnlaceBoton href={`/admin/lotes/${lote.id}`} className={ENLACE}>
                            Ver detalle
                          </EnlaceBoton>
                          {lote.estado === 'disponible' && (
                            <EnlaceBoton href={`/admin/lotes/${lote.id}/reservar`} className={ENLACE}>
                              Reservar
                            </EnlaceBoton>
                          )}
                          {perfilPropio!.role === 'administrador' && lote.estado === 'reservado' && (
                            <EnlaceBoton href={`/admin/lotes/${lote.id}/vender`} className={ENLACE}>
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
