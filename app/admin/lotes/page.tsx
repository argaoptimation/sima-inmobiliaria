import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  ChevronRight,
  Upload,
  Plus,
  FileSignature,
  CheckCircle2,
  TriangleAlert,
  Search,
  SlidersHorizontal,
  Eye,
  FileText,
  BookmarkPlus,
} from 'lucide-react'
import { cancelarReserva } from './actions'
import { BotonCancelarReserva } from './BotonCancelarReserva'
import { eliminarLote } from './[id]/actions'
import { BotonEliminarLote } from './[id]/BotonEliminarLote'
import { guardarCotizacionDolar } from './cotizacion-dolar-actions'
import { calcularEstadoCobranza } from '@/lib/cobranza/estado-cliente'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { Paginador } from '@/components/Paginador'
import { TablaDesplazable } from '@/components/TablaDesplazable'
import { leerPagina, estadoDePaginado } from '@/lib/ui/paginacion'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { formatearFechaCorta } from '@/lib/fecha/formatear-fecha-corta'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import {
  BANNER_ERROR,
  BANNER_OK,
  PANEL,
  PANEL_SIN_PADDING,
  MIGAS_PANEL,
  TITULO_PANTALLA,
  CONTADOR_PILL,
  BOTON_NEUTRO,
  BOTON_ACCION,
  TAB_FILTRO,
  TAB_FILTRO_ACTIVO,
  CAMPO_FILTRO,
  TABLA_PANEL_HEADER,
  TABLA_PANEL_TH,
  TABLA_PANEL_TH_FIJO,
  TABLA_PANEL_TH_ORDEN,
  TABLA_PANEL_TR,
  TABLA_PANEL_TR_ALTERNA,
  TABLA_PANEL_TD,
  TABLA_PANEL_PIE,
  BOTON_ICONO,
  BOTON_FILA_VERDE,
  BOTON_FILA_AZUL,
  PILL_ESTADO,
  PILL_ESTADO_NEUTRO,
  PILL_MONEDA_ARS,
  PILL_MONEDA_USD,
  PILL_COBRANZA,
  PUNTO_COBRANZA,
} from '@/lib/ui/clases'

// Manzana y lote reemplazan al identificador (09/09, pedido de Nico via
// Gabriel: esa es la distribucion de columnas a la que esta acostumbrado).
// El `identificador` sigue existiendo -- es el nombre del lote en el resto
// de la app -- pero se arma solo a partir de estos dos, asi que como
// columna era la misma informacion dos veces.
const COLUMNAS_ORDENABLES = [
  'manzana',
  'numero_lote',
  'ubicacion',
  'precio_total',
  'moneda',
  'estado',
] as const
type ColumnaOrdenable = (typeof COLUMNAS_ORDENABLES)[number]

const ETIQUETAS_COLUMNA: Record<ColumnaOrdenable, string> = {
  manzana: 'Manzana',
  numero_lote: 'Lote',
  ubicacion: 'Ubicación',
  precio_total: 'Precio total',
  moneda: 'Moneda',
  estado: 'Estado',
}

// Las columnas que necesita el listado. Estan afuera de la funcion porque
// la consulta se arma varias veces (la pagina, los contadores) y una lista
// de columnas copiada es una lista que un dia se desincroniza.
const COLUMNAS_DEL_LISTADO =
  'id, identificador, manzana, numero_lote, moneda, estado, cantidad_cuotas, ubicacion, ' +
  'precio_total, acreedor_id, loteo_id, cliente_id, ciclo_actual, marcado_prejudicial'

interface LoteDelListado {
  id: string
  identificador: string
  manzana: string | null
  numero_lote: string | null
  moneda: string
  estado: string
  cantidad_cuotas: number | null
  ubicacion: string | null
  precio_total: number | null
  acreedor_id: string | null
  loteo_id: string | null
  cliente_id: string | null
  ciclo_actual: number
  marcado_prejudicial: boolean
}

interface LoteParaCobranza {
  id: string
  ciclo_actual: number
  marcado_prejudicial: boolean
}

interface CuotaDeCobranza {
  lote_id: string
  ciclo: number
  saldo_pendiente: number
  fecha_vencimiento: string
}

interface CobranzaDelLote {
  saldoPendiente: number
  estadoCobranza: string
  marcadoPrejudicial: boolean
}

// El valor del <select> "Cobranza" que le corresponde a un lote. Es la
// traduccion entre lo que calcula calcularEstadoCobranza (que no sabe nada
// de la marca manual de prejudicial ni de si el lote ya esta pagado) y las
// seis opciones que ve Nicolas en pantalla.
function etiquetaDeFiltroCobranza(cobranza: CobranzaDelLote | undefined): string | null {
  if (!cobranza) return null
  if (cobranza.saldoPendiente === 0) return 'pagado'
  if (cobranza.marcadoPrejudicial) return 'prejudicial'
  if (cobranza.estadoCobranza === 'normal') return 'al_dia'
  if (cobranza.estadoCobranza === 'atrasado') return 'atrasado'
  if (cobranza.estadoCobranza === 'moroso') return 'moroso'
  return 'posible_prejudicial'
}

// Pestañas de estado (rediseño Stitch 2026-09, MOCKUP 1): reemplazan al
// <select> "Estado" de la barra de filtros. El estado del lote es el corte
// que Nicolás hace todo el tiempo -- vale un click, no dos.
const PESTANIAS_ESTADO = [
  { valor: 'disponible', etiqueta: 'Disponibles' },
  { valor: 'reservado', etiqueta: 'Reservados' },
  { valor: 'vendido', etiqueta: 'Vendidos' },
  { valor: 'rescindido', etiqueta: 'Rescindidos' },
] as const

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
    pagina?: string
    error?: string
    ok?: string
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
    pagina: paginaParam,
    error,
    ok,
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

  // Cobrador ve TODO lo que ve admin en esta página (confirmado con Nico
  // 03/09) -- solo vendedor queda restringido a disponible/reservado con
  // columnas acotadas. Las dos únicas excepciones de cobrador (distribución
  // de cuotas y cuentas de acreedores) viven en otras pantallas, no en esta.
  const esVendedor = perfilPropio!.role === 'vendedor'

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
    : 'manzana'
  const ordenAscendente = dir !== 'desc'

  // Manzana y lote se ordenan por su parte numerica y despues por el texto
  // (migracion 0060): son columnas de texto -- una manzana puede ser "B" --
  // y ordenar texto pone "10" antes que "2". Las que no tienen numero
  // (manzana "B") van al final y entre ellas alfabeticamente.
  const columnasDeOrden =
    columnaOrden === 'manzana'
      ? ['manzana_orden', 'manzana']
      : columnaOrden === 'numero_lote'
        ? ['numero_lote_orden', 'numero_lote']
        : [columnaOrden]

  // El filtro de Cliente ya no se resuelve en memoria (10/09). Con la lista
  // paginada no da: un filtro aplicado DESPUES de cortar la pagina deja una
  // pagina con 3 filas y la siguiente con 30. Se resuelve a una lista de
  // ids con una consulta a profiles y vuelve como un `.in()`.
  let clienteIdsDelFiltro: string[] | null = null
  if (filtroCliente) {
    const nombreSeguro = filtroCliente.replace(/[,()]/g, ' ').trim()
    const { data: clientesQueCoinciden } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'cliente')
      .ilike('full_name', `%${nombreSeguro}%`)
    clienteIdsDelFiltro = (clientesQueCoinciden ?? []).map((persona) => persona.id)
  }

  // Se llena mas abajo, y a proposito despues de definir `consultaDeLotes`:
  // para saber que lotes cumplen el filtro de cobranza hay que aplicar
  // primero todos los demas filtros, asi que la primera llamada a
  // `consultaDeLotes` se hace con esto todavia en null.
  let loteIdsDeCobranza: string[] | null = null

  // Todos los filtros que SI son columnas de `lotes`, en un solo lugar: la
  // consulta se arma seis veces (el total, un contador por pestania, y la
  // pagina que se muestra) y cada copia seria una oportunidad de que un
  // filtro entre en unas y no en otras -- que es exactamente como un
  // contador termina diciendo un numero que no se corresponde con la lista.
  function consultaDeLotes(columnas: string, contar = false) {
    let query = contar
      ? supabase.from('lotes').select(columnas, { count: 'exact', head: true })
      : supabase.from('lotes').select(columnas)

    if (perfilPropio!.role === 'acreedor') query = query.eq('acreedor_id', user!.id)
    if (esVendedor) query = query.in('estado', ['disponible', 'reservado'])
    if (filtroMoneda) query = query.eq('moneda', filtroMoneda)
    if (filtroAcreedorId && perfilPropio!.role !== 'acreedor') {
      query = query.eq('acreedor_id', filtroAcreedorId)
    }
    if (filtroLoteoId) query = query.eq('loteo_id', filtroLoteoId)
    if (clienteIdsDelFiltro !== null) query = query.in('cliente_id', clienteIdsDelFiltro)
    if (loteIdsDeCobranza !== null) query = query.in('id', loteIdsDeCobranza)

    if (filtroTexto) {
      // Ahora que en pantalla se ve la manzana y el numero por separado, el
      // buscador tiene que encontrarlos por separado tambien (09/09): buscar
      // "12" tiene que traer el lote 12 de cualquier manzana.
      // La coma y los parentesis son la sintaxis del `.or()` de PostgREST,
      // asi que se sacan del texto antes de armarlo -- si no, buscar "Mza 5,
      // lote 12" se interpreta como dos condiciones y explota.
      const textoSeguro = filtroTexto.replace(/[,()]/g, ' ').trim()
      query = query.or(
        ['identificador', 'manzana', 'numero_lote', 'ubicacion']
          .map((columna) => `${columna}.ilike.%${textoSeguro}%`)
          .join(',')
      )
    }

    return query
  }

  // Las cuotas de un grupo de lotes, de a tandas. La lista de ids viaja en
  // la URL de PostgREST, asi que pedir 300 lotes de una es una direccion de
  // 12 KB -- funciona hasta el dia que no.
  async function traerCuotasDeLotes(loteIds: string[]) {
    const cuotas: CuotaDeCobranza[] = []
    for (let i = 0; i < loteIds.length; i += 150) {
      const { data } = await supabase
        .from('cuotas')
        .select('lote_id, ciclo, saldo_pendiente, fecha_vencimiento')
        .in('lote_id', loteIds.slice(i, i + 150))
        .order('fecha_vencimiento', { ascending: true })
      cuotas.push(...((data ?? []) as CuotaDeCobranza[]))
    }
    return cuotas
  }

  // El estado de cobranza de cada lote vendido: para pintar la columna, y
  // para el filtro. Acotado al ciclo de venta VIGENTE de cada lote (ver
  // migracion 0039): un lote rescindido-y-revendido puede tener cuotas
  // viejas sin cobrar de un ciclo anterior, que no tienen que contar para
  // el estado de cobranza del cliente ACTUAL.
  function cobranzaDeLotes(lotesVendidos: LoteParaCobranza[], cuotas: CuotaDeCobranza[]) {
    const cicloActualPorLoteId = new Map(lotesVendidos.map((lote) => [lote.id, lote.ciclo_actual]))

    const porLote = new Map<string, { saldo_pendiente: number; fecha_vencimiento: string }[]>()
    for (const cuota of cuotas) {
      if (cuota.ciclo !== cicloActualPorLoteId.get(cuota.lote_id)) continue
      const lista = porLote.get(cuota.lote_id) ?? []
      lista.push(cuota)
      porLote.set(cuota.lote_id, lista)
    }

    return new Map(
      lotesVendidos.map((lote) => {
        const cuotasDelLote = porLote.get(lote.id) ?? []
        return [
          lote.id,
          {
            saldoPendiente: cuotasDelLote.reduce((acum, cuota) => acum + cuota.saldo_pendiente, 0),
            estadoCobranza: calcularEstadoCobranza(
              cuotasDelLote.map((cuota) => ({
                saldoPendiente: cuota.saldo_pendiente,
                fechaVencimiento: cuota.fecha_vencimiento,
              })),
              hoy
            ),
            marcadoPrejudicial: lote.marcado_prejudicial,
          },
        ]
      })
    )
  }

  // Cobranza tampoco es una columna de `lotes`: sale de mirar las cuotas de
  // cada uno. No la empujo a SQL a proposito -- habria que reescribir
  // calcularEstadoCobranza adentro de la base, y una regla de negocio
  // escrita en dos lugares es una regla que algun dia va a decir dos cosas
  // distintas. Se resuelve en dos pasos, y solo cuando el filtro esta
  // puesto: primero que lotes cumplen, despues la pagina de esos.
  if (filtroCobranza) {
    const { data: candidatos } = await consultaDeLotes('id, ciclo_actual, marcado_prejudicial')
      .eq('estado', 'vendido')
      .not('cliente_id', 'is', null)

    const lotesCandidatos = (candidatos ?? []) as unknown as LoteParaCobranza[]
    const cobranzas = cobranzaDeLotes(
      lotesCandidatos,
      await traerCuotasDeLotes(lotesCandidatos.map((lote) => lote.id))
    )

    loteIdsDeCobranza = lotesCandidatos
      .filter((lote) => etiquetaDeFiltroCobranza(cobranzas.get(lote.id)) === filtroCobranza)
      .map((lote) => lote.id)
  }

  // Los contadores de las pestanias cuentan sobre TODO lo que pasa los
  // filtros, no sobre la pagina: si contaran la pagina, "Vendidos" diria
  // siempre 30. Van en una sola vuelta porque son consultas independientes.
  // El vendedor no ve pestanias (esta clavado a disponible/reservado), asi
  // que para el no se cuenta nada.
  const [totalDeLotes, ...conteosPorEstado] = await Promise.all([
    consultaDeLotes('id', true),
    ...(esVendedor
      ? []
      : PESTANIAS_ESTADO.map((pestania) => consultaDeLotes('id', true).eq('estado', pestania.valor))),
  ])

  const cantidadSinFiltroEstado = totalDeLotes.count ?? 0
  const conteoPorEstado = new Map<string, number>(
    esVendedor
      ? []
      : PESTANIAS_ESTADO.map((pestania, indice) => [pestania.valor, conteosPorEstado[indice].count ?? 0])
  )

  const estadoElegido = filtroEstado && !esVendedor ? filtroEstado : null
  const cantidadFiltrada = estadoElegido
    ? (conteoPorEstado.get(estadoElegido) ?? 0)
    : cantidadSinFiltroEstado

  const paginado = estadoDePaginado(leerPagina(paginaParam).numero, cantidadFiltrada)

  let queryPagina = consultaDeLotes(COLUMNAS_DEL_LISTADO)
  for (const columna of columnasDeOrden) {
    queryPagina = queryPagina.order(columna, { ascending: ordenAscendente, nullsFirst: false })
  }
  // Desempate fijo despues de la columna elegida: dos lotes de la misma
  // manzana tienen que salir siempre en el mismo orden entre si. Sin lista
  // paginada eso solo hacia que la lista "bailara" de una carga a la otra;
  // con paginado es peor, porque un lote puede caer en dos paginas o en
  // ninguna.
  queryPagina = queryPagina.order('identificador', { ascending: true })
  if (estadoElegido) queryPagina = queryPagina.eq('estado', estadoElegido)

  const { data: lotesCrudos } = await queryPagina.range(paginado.desde, paginado.hasta)
  const lotes = (lotesCrudos ?? []) as unknown as LoteDelListado[]

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
  // El botón de WhatsApp que vivía acá (por fila) se sacó (03/09, pedido de
  // Gabriel: "tener todo centralizado" en un solo lugar) -- ahora manda
  // siempre desde /admin/panel-morosos, que ya permite filtrar por tramo
  // (deben 1/2/posible prejudicial/etc.) antes de escribirle a cada uno.
  //
  // Ahora se calcula solo para los lotes de ESTA página (10/09): antes se
  // traían las cuotas de todos los vendidos en cada carga -- con 322 lotes
  // eso son unas 7.700 filas de cuotas para pintar una columna de pastillas.
  const lotesVendidos = lotes.filter((lote) => lote.estado === 'vendido' && lote.cliente_id)
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
  // Cargar/corregir la cotización del día: admin y cobrador solamente
  // (04/09, pedido de Gabriel -- el acreedor la tenía disponible por error).
  // El candado real está en cotizacion-dolar-actions.ts; esto es lo visual.
  const puedeCargarCotizacion = esAdministrador || perfilPropio!.role === 'cobrador'

  const cobranzaPorLote = cobranzaDeLotes(
    lotesVendidos,
    await traerCuotasDeLotes(lotesVendidos.map((lote) => lote.id))
  )

  let reservasPropias: { lote_id: string }[] = []

  if (esVendedor) {
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
          .select('id, identificador, manzana, numero_lote, moneda, estado, ubicacion, precio_total')
          .in('id', idsLotesReservadosPorMi)
          .order('created_at', { ascending: false })
      : { data: [] }

  // Los filtros que el paginador tiene que arrastrar de una página a la
  // otra. Sin esto, apretar "Siguiente" con un filtro puesto muestra la
  // página 2 de TODOS los lotes y parece que el filtro se hubiera aplicado
  // mal -- ver el test de paginación.
  const parametrosDelPaginador: Record<string, string | undefined> = {
    moneda: filtroMoneda,
    acreedor: filtroAcreedorId,
    loteo: filtroLoteoId,
    cliente: filtroCliente,
    cobranza: filtroCobranza,
    estado: filtroEstado,
    q: filtroTexto,
    sort,
    dir,
  }

  // Cambiar de pestaña o de orden vuelve a la página 1 a propósito: la
  // página 4 de "Vendidos" no tiene nada que ver con la página 4 de
  // "Disponibles", y quedarse en la 4 al cambiar de orden es la forma más
  // rápida de creer que se perdieron lotes.
  function parametrosBase() {
    const params = new URLSearchParams()
    if (filtroMoneda) params.set('moneda', filtroMoneda)
    if (filtroAcreedorId) params.set('acreedor', filtroAcreedorId)
    if (filtroLoteoId) params.set('loteo', filtroLoteoId)
    if (filtroCliente) params.set('cliente', filtroCliente)
    if (filtroCobranza) params.set('cobranza', filtroCobranza)
    if (filtroTexto) params.set('q', filtroTexto)
    return params
  }

  // Una cabecera ordenable, para poder ponerlas en cualquier orden en vez
  // de mapearlas todas juntas.
  function cabeceraOrdenable(columna: ColumnaOrdenable) {
    const alineacion =
      columna === 'precio_total' ? 'text-right' : columna === 'moneda' ? 'text-center' : ''
    const alineacionInterna =
      columna === 'precio_total'
        ? 'flex justify-end'
        : columna === 'moneda'
          ? 'flex justify-center'
          : 'flex'

    return (
      <th className={`${TABLA_PANEL_TH} ${TABLA_PANEL_TH_FIJO} ${alineacion}`}>
        <EnlaceBoton
          href={urlOrden(columna)}
          className={alineacionInterna}
          claseInterna={TABLA_PANEL_TH_ORDEN}
        >
          {ETIQUETAS_COLUMNA[columna]}
          <span className="text-[9px] opacity-70">
            {columnaOrden === columna ? (ordenAscendente ? '▲' : '▼') : ''}
          </span>
        </EnlaceBoton>
      </th>
    )
  }

  function urlOrden(columna: ColumnaOrdenable) {
    const params = parametrosBase()
    if (filtroEstado) params.set('estado', filtroEstado)
    params.set('sort', columna)
    params.set('dir', columnaOrden === columna && ordenAscendente ? 'desc' : 'asc')
    return `/admin/lotes?${params.toString()}`
  }

  function urlEstado(estado: string | null) {
    const params = parametrosBase()
    if (estado) params.set('estado', estado)
    if (sort) params.set('sort', sort)
    if (dir) params.set('dir', dir)
    const query = params.toString()
    return query ? `/admin/lotes?${query}` : '/admin/lotes'
  }

  function claseCobranza(cobranza: { saldoPendiente: number; marcadoPrejudicial: boolean; estadoCobranza: string }) {
    if (cobranza.saldoPendiente === 0) return PILL_COBRANZA.pagado
    if (cobranza.marcadoPrejudicial) return PILL_COBRANZA.prejudicial
    if (cobranza.estadoCobranza === 'normal') return PILL_COBRANZA.alDia
    if (cobranza.estadoCobranza === 'atrasado') return PILL_COBRANZA.atrasado
    return PILL_COBRANZA.moroso
  }

  function clasePuntoCobranza(cobranza: {
    saldoPendiente: number
    marcadoPrejudicial: boolean
    estadoCobranza: string
  }) {
    if (cobranza.marcadoPrejudicial) return PUNTO_COBRANZA.prejudicial
    if (cobranza.estadoCobranza === 'normal') return PUNTO_COBRANZA.alDia
    if (cobranza.estadoCobranza === 'atrasado') return PUNTO_COBRANZA.atrasado
    return PUNTO_COBRANZA.moroso
  }

  function etiquetaCobranza(cobranza: { saldoPendiente: number; marcadoPrejudicial: boolean; estadoCobranza: string }) {
    if (cobranza.saldoPendiente === 0) return 'Pagado'
    if (cobranza.marcadoPrejudicial) return 'Prejudicial'
    if (cobranza.estadoCobranza === 'normal') return 'Al día'
    if (cobranza.estadoCobranza === 'atrasado') return 'Atrasado'
    if (cobranza.estadoCobranza === 'moroso') return 'Moroso'
    return 'Posible prejudicial'
  }

  function formatearPrecio(precio: number | null) {
    if (!precio) return '—'
    return precio.toLocaleString('es-AR')
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6">
      {/* ENCABEZADO Y ACCIONES PRINCIPALES */}
      <div className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${PANEL}`}>
        <div className="flex flex-col gap-1">
          <nav aria-label="Ruta" className={MIGAS_PANEL}>
            <span>SIMACOR</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-blue-600">Lotes</span>
          </nav>
          <div className="flex flex-wrap items-center gap-3 pt-0.5">
            <h1 className={TITULO_PANTALLA}>Gestión de Lotes</h1>
            <span className={CONTADOR_PILL}>
              {cantidadSinFiltroEstado} {cantidadSinFiltroEstado === 1 ? 'lote' : 'lotes'}
            </span>
          </div>
        </div>
        {/* Crear/importar lotes es admin-only (04/09, pedido explícito de
            Gabriel): antes esVendedor/esCobrador dejaban pasar a acreedor,
            que igual no debería poder dar de alta ni importar lotes -- ver
            memoria del backlog. */}
        {esAdministrador && (
          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <EnlaceBoton href="/admin/lotes/importar" className={BOTON_NEUTRO}>
              <Upload className="h-[18px] w-[18px] text-slate-500" />
              Importar varios
            </EnlaceBoton>
            {/* Alta de un lote que ya se vendio antes de usar el sistema
                (07/09). No pasa por reservar->vender porque reservar
                exige el comprobante de la sena y las fotos del DNI, que
                de una venta vieja nadie tiene. */}
            <EnlaceBoton href="/admin/lotes/cargar-en-curso" className={BOTON_NEUTRO}>
              <FileSignature className="h-[18px] w-[18px] text-slate-500" />
              Cargar ya vendido
            </EnlaceBoton>
            <EnlaceBoton href="/admin/lotes/nuevo" className={BOTON_ACCION}>
              <Plus className="h-[18px] w-[18px]" />
              Nuevo lote
            </EnlaceBoton>
          </div>
        )}
      </div>

      {error && <p className={BANNER_ERROR}>{error}</p>}
      {ok && <p className={BANNER_OK}>{ok}</p>}

      {/* TARJETA DE COTIZACIÓN DEL DÓLAR */}
      {puedeCargarCotizacion && (
        <div
          className={`relative flex flex-col items-stretch justify-between gap-4 overflow-hidden lg:flex-row lg:items-center ${PANEL}`}
        >
          <span
            className={`absolute top-0 bottom-0 left-0 w-1.5 ${cotizacionHoy ? 'bg-emerald-500' : 'bg-amber-500'}`}
          />
          <div className="flex items-start gap-3.5 pl-1.5 sm:items-center">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                cotizacionHoy
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                  : 'border-amber-200 bg-amber-50 text-amber-600'
              }`}
            >
              {cotizacionHoy ? <CheckCircle2 className="h-[22px] w-[22px]" /> : <TriangleAlert className="h-[22px] w-[22px]" />}
            </div>
            <div className="flex flex-col">
              <div className="flex flex-wrap items-center gap-2">
                {cotizacionHoy ? (
                  <>
                    <span className="font-heading text-sm font-semibold text-slate-900 sm:text-base">
                      Cotización de hoy ({formatearFechaCorta(hoy)}) ya cargada: {cotizacionHoy.valor} ARS por USD
                    </span>
                    <span className="rounded-full bg-emerald-100/70 px-2 py-0.5 text-[11px] font-bold tracking-wider text-emerald-800 uppercase">
                      Vigente
                    </span>
                  </>
                ) : (
                  <span className="font-heading text-sm font-semibold text-slate-900 sm:text-base">
                    Todavía no cargaste la cotización del dólar de hoy ({formatearFechaCorta(hoy)}).
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                {cotizacionHoy
                  ? `Cargada por ${cargadorCotizacion?.full_name ?? '—'} a las ${new Date(
                      cotizacionHoy.created_at
                    ).toLocaleTimeString('es-AR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })} hs para liquidación y cálculo de cuotas dolarizadas.`
                  : 'Sin cotización del día no se pueden liquidar los pagos en pesos de las cuotas en dólares.'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3 pt-2 pl-1.5 lg:pt-0 lg:pl-0">
            <form action={guardarCotizacionDolar} className="flex items-center gap-2">
              <div className="relative">
                <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm font-semibold text-slate-400">$</span>
                <input
                  name="valor"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="Ej: 1500"
                  defaultValue={cotizacionHoy?.valor ?? ''}
                  required
                  aria-label={cotizacionHoy ? 'Corregir cotización de hoy (ARS por USD)' : 'Cotización de hoy (ARS por USD)'}
                  className="w-32 rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-7 text-sm font-semibold text-slate-900 tabular-nums transition-all focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>
              <BotonEnvio
                className={`cursor-pointer rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-1.5 text-sm font-semibold text-white shadow-xs transition-all hover:from-blue-700 hover:to-blue-800`}
              >
                {cotizacionHoy ? 'Corregir' : 'Cargar'}
              </BotonEnvio>
            </form>
            <EnlaceBoton
              href="/admin/cotizacion-dolar"
              className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-800 hover:underline"
            >
              Ver historial completo →
            </EnlaceBoton>
          </div>
        </div>
      )}

      {esVendedor && (
        <div className={PANEL_SIN_PADDING}>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <h2 className="font-heading text-[15px] font-bold text-blue-900">Lotes que reservaste</h2>
          </div>
          {(misLotesReservados ?? []).length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">Todavía no reservaste ningún lote.</p>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className={TABLA_PANEL_HEADER}>
                    <th className={TABLA_PANEL_TH}>Manzana</th>
                    <th className={TABLA_PANEL_TH}>Lote</th>
                    <th className={TABLA_PANEL_TH}>Ubicación</th>
                    <th className={`${TABLA_PANEL_TH} text-right`}>Precio total</th>
                    <th className={`${TABLA_PANEL_TH} text-center`}>Moneda</th>
                    <th className={TABLA_PANEL_TH}>Estado</th>
                    <th className={`${TABLA_PANEL_TH} text-right`}>Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {misLotesReservados!.map((lote, indice) => {
                    const cancelarReservaConId = cancelarReserva.bind(null, lote.id)
                    return (
                      <tr
                      key={lote.id}
                      className={`group ${indice % 2 === 1 ? TABLA_PANEL_TR_ALTERNA : TABLA_PANEL_TR}`}
                    >
                        <td className={`${TABLA_PANEL_TD} font-semibold text-slate-900 tabular-nums`}>
                          {lote.manzana ?? <span className="text-slate-400">—</span>}
                        </td>
                        <td
                          className={`${TABLA_PANEL_TD} max-w-[230px] truncate font-semibold text-slate-900 tabular-nums`}
                          title={lote.identificador}
                        >
                          {lote.numero_lote ?? lote.identificador}
                        </td>
                        <td className={`${TABLA_PANEL_TD} max-w-[190px] truncate text-slate-500`}>
                          {lote.ubicacion ?? '—'}
                        </td>
                        <td className={`${TABLA_PANEL_TD} text-right font-bold text-slate-900 tabular-nums`}>
                          {formatearPrecio(lote.precio_total)}
                        </td>
                        <td className={`${TABLA_PANEL_TD} text-center`}>
                          <span className={lote.moneda === 'ARS' ? PILL_MONEDA_ARS : PILL_MONEDA_USD}>
                            {lote.moneda}
                          </span>
                        </td>
                        <td className={TABLA_PANEL_TD}>
                          <span className={PILL_ESTADO[lote.estado] ?? PILL_ESTADO_NEUTRO}>
                            {lote.estado.charAt(0).toUpperCase() + lote.estado.slice(1)}
                          </span>
                        </td>
                        <td className={`${TABLA_PANEL_TD} text-right`}>
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <EnlaceBoton
                              href={`/admin/lotes/${lote.id}/info`}
                              className={BOTON_ICONO}
                              claseInterna="inline-flex items-center"
                              aria-label="Ver documentación del lote"
                              title="Ver documentación del lote"
                            >
                              <FileText className="h-[17px] w-[17px]" />
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
        </div>
      )}

      {/* BARRA DE FILTROS EN VIVO */}
      <div className={`space-y-4 ${PANEL}`}>
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            {esVendedor ? (
              <h2 className="font-heading text-[15px] font-bold text-blue-900">Lotes disponibles y reservados</h2>
            ) : (
              <>
                <EnlaceBoton href={urlEstado(null)} className={filtroEstado ? TAB_FILTRO : TAB_FILTRO_ACTIVO}>
                  Todos ({cantidadSinFiltroEstado})
                </EnlaceBoton>
                {PESTANIAS_ESTADO.filter(
                  (pestania) => pestania.valor !== 'rescindido' || (conteoPorEstado.get('rescindido') ?? 0) > 0
                ).map((pestania) => (
                  <EnlaceBoton
                    key={pestania.valor}
                    href={urlEstado(pestania.valor)}
                    className={filtroEstado === pestania.valor ? TAB_FILTRO_ACTIVO : TAB_FILTRO}
                  >
                    {pestania.etiqueta} ({conteoPorEstado.get(pestania.valor) ?? 0})
                  </EnlaceBoton>
                ))}
              </>
            )}
          </div>
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
              className="shrink-0 text-xs font-semibold text-slate-500 transition-colors hover:text-rose-600"
            >
              Limpiar filtros y orden
            </EnlaceBoton>
          )}
        </div>

        <FiltroEnVivo className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <input type="hidden" name="sort" value={columnaOrden} />
          <input type="hidden" name="dir" value={ordenAscendente ? 'asc' : 'desc'} />
          {/* El estado lo manejan las pestañas de arriba, pero tiene que
              viajar con el resto del formulario: FiltroEnVivo reconstruye la
              URL entera desde el <form>, así que sin este campo cambiar
              cualquier otro filtro apagaría la pestaña elegida. */}
          <input type="hidden" name="estado" value={filtroEstado ?? ''} />

          <div className="relative flex items-center lg:col-span-2">
            <Search className="absolute left-3 h-[18px] w-[18px] text-slate-400" />
            <input
              type="text"
              name="q"
              placeholder="Buscar por manzana, lote o ubicación"
              aria-label="Buscar por identificador"
              defaultValue={filtroTexto ?? ''}
              className={`${CAMPO_FILTRO} pl-9`}
            />
          </div>

          {!esVendedor && (
            <select name="loteo" defaultValue={filtroLoteoId ?? ''} aria-label="Loteo" className={`${CAMPO_FILTRO} truncate`}>
              <option value="">Loteo: todos</option>
              {(todosLosLoteos ?? []).map((loteo) => (
                <option key={loteo.id} value={loteo.id}>
                  {loteo.nombre}
                </option>
              ))}
            </select>
          )}

          <select name="moneda" defaultValue={filtroMoneda ?? ''} aria-label="Moneda" className={CAMPO_FILTRO}>
            <option value="">Moneda: todas</option>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>

          {!esVendedor && (
            <select
              name="cobranza"
              defaultValue={filtroCobranza ?? ''}
              aria-label="Cobranza"
              className={`${CAMPO_FILTRO} truncate`}
            >
              <option value="">Cobranza: todas</option>
              <option value="pagado">Pagado</option>
              <option value="al_dia">Al día</option>
              <option value="atrasado">Atrasado</option>
              <option value="moroso">Moroso</option>
              <option value="posible_prejudicial">Posible prejudicial</option>
              <option value="prejudicial">Prejudicial</option>
            </select>
          )}

          {/* Acreedor y Cliente quedan detrás de "Filtros avanzados" (como en
              el mockup): son los dos cortes que Nicolás usa de vez en cuando,
              y tenerlos siempre desplegados le robaba una fila entera de
              pantalla a la tabla. Siguen siendo campos del mismo formulario
              aunque el bloque esté cerrado, así que un ?cliente= en la URL
              se conserva igual al tocar cualquier otro filtro. */}
          {!esVendedor && perfilPropio!.role !== 'acreedor' && (
            <details
              open={Boolean(filtroCliente || filtroAcreedorId)}
              className="sm:col-span-2 md:col-span-3 lg:col-span-5"
            >
              <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-800">
                <SlidersHorizontal className="h-4 w-4" />
                Filtros avanzados
              </summary>
              <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2 lg:grid-cols-5">
                {perfilPropio!.role !== 'acreedor' && (
                  <select
                    name="acreedor"
                    defaultValue={filtroAcreedorId ?? ''}
                    aria-label="Acreedor"
                    className={`${CAMPO_FILTRO} truncate`}
                  >
                    <option value="">Acreedor: todos</option>
                    {(todosLosAcreedores ?? []).map((persona) => (
                      <option key={persona.id} value={persona.id}>
                        {persona.full_name}
                      </option>
                    ))}
                  </select>
                )}
                {esAdministrador && (
                  <input
                    type="text"
                    name="cliente"
                    placeholder="Nombre del cliente"
                    aria-label="Cliente"
                    defaultValue={filtroCliente ?? ''}
                    className={CAMPO_FILTRO}
                  />
                )}
              </div>
            </details>
          )}
        </FiltroEnVivo>
      </div>

      {/* TABLA MAESTRA DE LOTES */}
      {lotes.length === 0 && (filtroCliente || filtroCobranza || filtroEstado) ? (
        <p className="text-sm text-slate-600">Ningún lote coincide con los filtros.</p>
      ) : (
        <div className={PANEL_SIN_PADDING}>
          <TablaDesplazable>
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-slate-200/80">
                {/* Loteo, Manzana, Lote, Comprador -- y despues el resto
                    (09/09, Nico). Las ordenables ya no se mapean en bloque:
                    "Comprador" va entre medio, asi que cada una se pone
                    donde corresponde. */}
                <tr className={TABLA_PANEL_HEADER}>
                  {!esVendedor && <th className={`${TABLA_PANEL_TH} ${TABLA_PANEL_TH_FIJO}`}>Loteo</th>}
                  {cabeceraOrdenable('manzana')}
                  {cabeceraOrdenable('numero_lote')}
                  {esAdministrador && (
                    <th className={`${TABLA_PANEL_TH} ${TABLA_PANEL_TH_FIJO}`}>Comprador</th>
                  )}
                  {cabeceraOrdenable('ubicacion')}
                  {cabeceraOrdenable('precio_total')}
                  {cabeceraOrdenable('moneda')}
                  {cabeceraOrdenable('estado')}
                  {!esVendedor && (
                    <th className={`${TABLA_PANEL_TH} ${TABLA_PANEL_TH_FIJO}`}>Acreedor</th>
                  )}
                  {!esVendedor && (
                    <th className={`${TABLA_PANEL_TH} ${TABLA_PANEL_TH_FIJO} text-center`}>Cuotas</th>
                  )}
                  {!esVendedor && (
                    <th className={`${TABLA_PANEL_TH} ${TABLA_PANEL_TH_FIJO}`}>Cobranza</th>
                  )}
                  {/* Acciones queda CONGELADA a la derecha (10/09, pedido
                      de Gabriel: "como la opcion de excel"). Sin esto, en una
                      pantalla angosta hay que scrollear hasta el final para
                      reservar o vender, y al llegar ya no se ve de que lote se
                      trata. La celda necesita fondo propio y opaco: el de la
                      fila no se pinta debajo de una celda sticky, se
                      transparenta y se ve pasar el contenido por atras. */}
                  <th
                    className={`${TABLA_PANEL_TH} sticky top-0 right-0 z-30 min-w-[180px] bg-blue-800 text-right`}
                  >
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {lotes.map((lote, indice) => {
                  const eliminarLoteConId = eliminarLote.bind(null, lote.id)
                  const cobranza = cobranzaPorLote.get(lote.id)
                  return (
                    <tr
                      key={lote.id}
                      className={`group ${indice % 2 === 1 ? TABLA_PANEL_TR_ALTERNA : TABLA_PANEL_TR}`}
                    >
                      {!esVendedor && (
                        <td className={`${TABLA_PANEL_TD} max-w-[170px] truncate font-semibold text-slate-900`}>
                          {lote.loteo_id ? (nombreLoteoPorId.get(lote.loteo_id) ?? '—') : '— sin asignar —'}
                        </td>
                      )}
                      <td className={`${TABLA_PANEL_TD} font-semibold text-slate-900 tabular-nums`}>
                        {lote.manzana ?? <span className="text-slate-400">—</span>}
                      </td>
                      {/* El numero de lote es el link al detalle. Si el lote
                          no tiene numero cargado (los viejos, y los que se
                          importaron), cae al identificador: nunca queda una
                          fila sin nada en que hacer click. */}
                      <td className={`${TABLA_PANEL_TD} max-w-[230px] truncate font-semibold`}>
                        {esVendedor ? (
                          <span className="text-slate-900 tabular-nums">
                            {lote.numero_lote ?? lote.identificador}
                          </span>
                        ) : (
                          <EnlaceBoton
                            href={`/admin/lotes/${lote.id}`}
                            className="text-blue-600 underline-offset-4 transition-colors hover:text-blue-800 hover:underline"
                            title={lote.identificador}
                          >
                            <span className="tabular-nums">
                              {lote.numero_lote ?? lote.identificador}
                            </span>
                          </EnlaceBoton>
                        )}
                      </td>
                      {esAdministrador && (
                        <td className={`${TABLA_PANEL_TD} max-w-[190px] truncate font-medium text-slate-900`}>
                          {lote.estado === 'vendido' && lote.cliente_id ? (
                            <EnlaceBoton
                              href={`/admin/clientes/${lote.cliente_id}`}
                              className="underline-offset-4 transition-colors hover:text-blue-700 hover:underline"
                            >
                              {clientePorId.get(lote.cliente_id)?.full_name ?? '—'}
                            </EnlaceBoton>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      )}
                      <td className={`${TABLA_PANEL_TD} max-w-[190px] truncate text-slate-500`}>
                        {lote.ubicacion ?? '—'}
                      </td>
                      <td className={`${TABLA_PANEL_TD} text-right font-bold text-slate-900 tabular-nums`}>
                        {formatearPrecio(lote.precio_total)}
                      </td>
                      <td className={`${TABLA_PANEL_TD} text-center`}>
                        <span className={lote.moneda === 'ARS' ? PILL_MONEDA_ARS : PILL_MONEDA_USD}>
                          {lote.moneda}
                        </span>
                      </td>
                      <td className={TABLA_PANEL_TD}>
                        <span className={PILL_ESTADO[lote.estado] ?? PILL_ESTADO_NEUTRO}>
                          {lote.estado.charAt(0).toUpperCase() + lote.estado.slice(1)}
                        </span>
                      </td>
                      {!esVendedor && (
                        <td className={`${TABLA_PANEL_TD} max-w-[150px] truncate text-slate-600`}>
                          {lote.acreedor_id ? (
                            esAdministrador ? (
                              <EnlaceBoton
                                href={`/admin/usuarios?editar=${lote.acreedor_id}`}
                                className="text-slate-600 underline-offset-4 transition-colors hover:text-blue-700 hover:underline"
                              >
                                {nombreAcreedorPorId.get(lote.acreedor_id) ?? '—'}
                              </EnlaceBoton>
                            ) : (
                              <span>{nombreAcreedorPorId.get(lote.acreedor_id) ?? '—'}</span>
                            )
                          ) : (
                            <span className="text-slate-400">— sin asignar —</span>
                          )}
                        </td>
                      )}
                      {!esVendedor && (
                        <td className={`${TABLA_PANEL_TD} text-center font-medium tabular-nums`}>
                          {lote.cantidad_cuotas ? (
                            lote.cantidad_cuotas
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      )}
                      {!esVendedor && (
                        <td className={TABLA_PANEL_TD}>
                          {cobranza ? (
                            <span className={claseCobranza(cobranza)}>
                              {cobranza.saldoPendiente > 0 && (
                                <span className={clasePuntoCobranza(cobranza)} />
                              )}
                              {etiquetaCobranza(cobranza)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      )}
                      {/* #f7fbff es exactamente `blue-50` al 50% sobre
                          blanco, que es el hover de la fila: la celda fija
                          no puede usar un color translucido porque dejaria
                          ver el contenido que pasa por debajo.

                          El borde es una linea de 1px y no la sombra
                          difuminada que tenia antes (10/09, Gabriel: "la
                          tabla va como mas tildada"): una sombra con blur
                          sobre una celda sticky se vuelve a dibujar en cada
                          cuadro del desplazamiento, y eran 322 de esas.
                          Excel tambien marca la columna congelada con una
                          linea. */}
                      <td
                        className={`${TABLA_PANEL_TD} sticky right-0 z-10 border-l border-slate-200 bg-white text-right group-hover:bg-[#f7fbff]`}
                      >
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {lote.estado === 'disponible' && (
                            <EnlaceBoton href={`/admin/lotes/${lote.id}/reservar`} className={BOTON_FILA_VERDE}>
                              <BookmarkPlus className="h-[15px] w-[15px]" />
                              Reservar
                            </EnlaceBoton>
                          )}
                          {esAdministrador && lote.estado === 'reservado' && (
                            <EnlaceBoton
                              href={`/admin/lotes/${lote.id}/vender`}
                              className={BOTON_FILA_AZUL}
                              aria-label="Vender / asignar cliente"
                            >
                              <FileSignature className="h-[15px] w-[15px]" />
                              Vender
                            </EnlaceBoton>
                          )}
                          {!esVendedor && (
                            <EnlaceBoton
                              href={`/admin/lotes/${lote.id}`}
                              className={BOTON_ICONO}
                              claseInterna="inline-flex items-center"
                              aria-label="Ver detalle"
                              title="Ver detalle"
                            >
                              <Eye className="h-[17px] w-[17px]" />
                            </EnlaceBoton>
                          )}
                          <EnlaceBoton
                            href={`/admin/lotes/${lote.id}/info`}
                            className={BOTON_ICONO}
                            claseInterna="inline-flex items-center"
                            aria-label="Ver documentación del lote"
                            title="Ver documentación del lote"
                          >
                            <FileText className="h-[17px] w-[17px]" />
                          </EnlaceBoton>
                          {esAdministrador && (
                            <BotonEliminarLote eliminarLoteAction={eliminarLoteConId} compacto />
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TablaDesplazable>
          {/* El paginador que el mockup dibujaba acá (10/09). Hasta ahora el
              pie solo contaba: la pantalla traía TODOS los lotes de una y
              filtraba cliente/cobranza en memoria, así que unos botones de
              página hubieran sido decorado. Ahora el corte se hace de verdad
              en la consulta y los botones llevan a otra página. */}
          {paginado.totalPaginas > 1 ? (
            <Paginador
              ruta="/admin/lotes"
              searchParams={parametrosDelPaginador}
              pagina={paginado.pagina}
              total={cantidadFiltrada}
              queSonLasFilas="lotes"
            />
          ) : (
            <div className={TABLA_PANEL_PIE}>
              <div className="flex items-center gap-1.5">
                <span>Mostrando</span>
                <span className="font-bold text-slate-800 tabular-nums">{lotes.length}</span>
                <span>de</span>
                <span className="font-bold text-slate-800 tabular-nums">{cantidadSinFiltroEstado}</span>
                <span>{cantidadSinFiltroEstado === 1 ? 'lote registrado' : 'lotes registrados'}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
