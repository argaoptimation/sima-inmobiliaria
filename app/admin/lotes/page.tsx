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
    q?: string
    error?: string
  }>
}) {
  const { sort, dir, moneda: filtroMoneda, acreedor: filtroAcreedorId, q: filtroTexto, error } =
    await searchParams

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

  const hoy = new Date().toISOString().slice(0, 10)
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
      'id, identificador, moneda, estado, cantidad_cuotas, ubicacion, precio_total, acreedor_id, loteo_id, cliente_id'
    )
    .order(columnaOrden, { ascending: ordenAscendente })

  if (perfilPropio!.role === 'acreedor') {
    queryLotes = queryLotes.eq('acreedor_id', user!.id)
  }

  if (esVendedorOCobrador) {
    queryLotes = queryLotes.eq('estado', 'disponible')
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

  const { data: lotes } = await queryLotes

  const { data: todosLosAcreedores } =
    perfilPropio!.role !== 'acreedor'
      ? await supabase.from('profiles').select('id, full_name').eq('role', 'acreedor').order('full_name')
      : { data: [] }

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
      ? await supabase.from('profiles').select('id, full_name, telefono').in('id', clienteIds)
      : { data: [] }
  const clientePorId = new Map((clientes ?? []).map((cliente) => [cliente.id, cliente]))
  const esAdministrador = perfilPropio!.role === 'administrador'

  const { data: cuotasPorLote } =
    loteVendidoIds.length > 0
      ? await supabase
          .from('cuotas')
          .select('lote_id, saldo_pendiente, fecha_vencimiento')
          .in('lote_id', loteVendidoIds)
          .order('fecha_vencimiento', { ascending: true })
      : { data: [] }

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
        { saldoPendiente, estadoCobranza, mensajeWhatsApp, telefono: telefonoParaWhatsApp(cliente?.telefono ?? null) },
      ]
    })
  )

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
    if (filtroTexto) params.set('q', filtroTexto)
    params.set('sort', columna)
    params.set('dir', columnaOrden === columna && ordenAscendente ? 'desc' : 'asc')
    return `/admin/lotes?${params.toString()}`
  }

  return (
    <main>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}

      <div className="mb-6 rounded border border-gray-200 bg-gray-50 p-3 text-sm">
        {cotizacionHoy ? (
          <p className="mb-2 text-green-700">
            ✓ Cotización de hoy ({hoy}) ya cargada: <span className="font-medium">{cotizacionHoy.valor}</span>{' '}
            ARS por USD — cargada por {cargadorCotizacion?.full_name ?? '—'} a las{' '}
            {new Date(cotizacionHoy.created_at).toLocaleTimeString('es-AR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            hs.
          </p>
        ) : (
          <p className="mb-2 font-semibold text-amber-700">
            ⚠ Todavía no cargaste la cotización del dólar de hoy ({hoy}).
          </p>
        )}
        <form action={guardarCotizacionDolar} className="flex items-end gap-2">
          <label className="text-sm">
            {cotizacionHoy ? 'Corregir cotización de hoy' : 'Cotización de hoy'} (ARS por USD)
            <input
              name="valor"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Ej: 1500"
              defaultValue={cotizacionHoy?.valor ?? ''}
              required
              className="mt-1 block rounded border px-3 py-2"
            />
          </label>
          <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">
            {cotizacionHoy ? 'Corregir' : 'Cargar'}
          </button>
        </form>
        <a href="/admin/cotizacion-dolar" className="mt-2 inline-block text-sm underline">
          Ver historial completo →
        </a>
        <br />
        <a
          href="https://www.infodolar.com/cotizacion-dolar-provincia-cordoba.aspx"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-sm underline"
        >
          Ver cotización del día en Infodólar Córdoba (para copiar el valor) →
        </a>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Lotes</h1>
        {!esVendedorOCobrador && (
          <div className="flex gap-3">
            <a href="/admin/lotes/importar" className="rounded border px-3 py-2 text-sm">
              Importar varios
            </a>
            <a href="/admin/lotes/nuevo" className="rounded bg-black px-3 py-2 text-sm text-white">
              + Nuevo lote
            </a>
          </div>
        )}
      </div>

      {esVendedorOCobrador && (
        <>
          <h2 className="mb-2 text-lg font-semibold">Lotes que reservaste</h2>
          {(misLotesReservados ?? []).length === 0 ? (
            <p className="mb-8 text-sm text-gray-600">Todavía no reservaste ningún lote.</p>
          ) : (
            <table className="mb-8 w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Identificador</th>
                  <th>Ubicación</th>
                  <th>Precio total</th>
                  <th>Moneda</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {misLotesReservados!.map((lote) => {
                  const cancelarReservaConId = cancelarReserva.bind(null, lote.id)
                  return (
                    <tr key={lote.id} className="border-b">
                      <td className="py-2">{lote.identificador}</td>
                      <td>{lote.ubicacion ?? '—'}</td>
                      <td>
                        {lote.precio_total ? `${lote.precio_total} ${lote.moneda}` : '—'}
                      </td>
                      <td>{lote.moneda}</td>
                      <td>{lote.estado}</td>
                      <td>
                        <div className="flex flex-wrap items-center gap-3">
                          <a href={`/admin/lotes/${lote.id}/info`} className="text-sm underline">
                            Ver información del lote →
                          </a>
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
          )}
          <h2 className="mb-2 text-lg font-semibold">Lotes disponibles</h2>
        </>
      )}

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="sort" value={columnaOrden} />
        <input type="hidden" name="dir" value={ordenAscendente ? 'asc' : 'desc'} />
        <label className="text-sm">
          Buscar
          <input
            type="text"
            name="q"
            placeholder="Buscar identificador"
            defaultValue={filtroTexto ?? ''}
            className="mt-1 block rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Moneda
          <select
            name="moneda"
            defaultValue={filtroMoneda ?? ''}
            className="mt-1 block rounded border px-3 py-2"
          >
            <option value="">Todas</option>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </label>
        {perfilPropio!.role !== 'acreedor' && (
          <label className="text-sm">
            Acreedor
            <select
              name="acreedor"
              defaultValue={filtroAcreedorId ?? ''}
              className="mt-1 block rounded border px-3 py-2"
            >
              <option value="">Todos</option>
              {(todosLosAcreedores ?? []).map((persona) => (
                <option key={persona.id} value={persona.id}>
                  {persona.full_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className="rounded border px-3 py-2 text-sm">
          Filtrar
        </button>
        {(filtroMoneda || filtroAcreedorId || filtroTexto || sort || dir) && (
          <a href="/admin/lotes" className="text-sm underline">
            Limpiar filtros y orden
          </a>
        )}
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            {COLUMNAS_ORDENABLES.map((columna) => (
              <th key={columna} className="py-2">
                <a href={urlOrden(columna)} className="underline">
                  {ETIQUETAS_COLUMNA[columna]}
                  {columnaOrden === columna ? (ordenAscendente ? ' ▲' : ' ▼') : ''}
                </a>
              </th>
            ))}
            <th>Acreedor</th>
            {!esVendedorOCobrador && <th>Cuotas</th>}
            {!esVendedorOCobrador && <th>Loteo</th>}
            {esAdministrador && <th>Cliente</th>}
            {!esVendedorOCobrador && <th>Cobranza</th>}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lotes?.map((lote) => {
            const eliminarLoteConId = eliminarLote.bind(null, lote.id)
            const cobranza = cobranzaPorLote.get(lote.id)
            return (
              <tr key={lote.id} className="border-b">
                <td className="py-2">{lote.identificador}</td>
                <td>{lote.ubicacion ?? '—'}</td>
                <td>{lote.precio_total ? `${lote.precio_total} ${lote.moneda}` : '—'}</td>
                <td>{lote.moneda}</td>
                <td>{lote.estado}</td>
                <td>
                  {lote.acreedor_id ? (
                    esAdministrador ? (
                      <a href={`/admin/usuarios?editar=${lote.acreedor_id}`} className="underline">
                        {nombreAcreedorPorId.get(lote.acreedor_id) ?? '—'}
                      </a>
                    ) : (
                      nombreAcreedorPorId.get(lote.acreedor_id) ?? '—'
                    )
                  ) : (
                    '— sin asignar —'
                  )}
                </td>
                {!esVendedorOCobrador && <td>{lote.cantidad_cuotas}</td>}
                {!esVendedorOCobrador && (
                  <td>{lote.loteo_id ? nombreLoteoPorId.get(lote.loteo_id) ?? '—' : '— sin asignar —'}</td>
                )}
                {esAdministrador && (
                  <td>
                    {lote.estado === 'vendido' && lote.cliente_id ? (
                      <a href={`/admin/clientes/${lote.cliente_id}`} className="underline">
                        {clientePorId.get(lote.cliente_id)?.full_name ?? '—'}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                )}
                {!esVendedorOCobrador && (
                  <td>
                    {cobranza ? (
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            cobranza.saldoPendiente === 0
                              ? 'text-gray-600'
                              : cobranza.estadoCobranza === 'normal'
                                ? 'text-gray-700'
                                : cobranza.estadoCobranza === 'moroso'
                                  ? 'font-semibold text-red-600'
                                  : 'font-bold text-red-800'
                          }
                        >
                          {cobranza.saldoPendiente === 0
                            ? 'Pagado'
                            : cobranza.estadoCobranza === 'normal'
                              ? 'Al día'
                              : cobranza.estadoCobranza === 'moroso'
                                ? 'Moroso'
                                : 'Prejudicial'}
                        </span>
                        {cobranza.mensajeWhatsApp && cobranza.telefono && (
                          <a
                            href={armarLinkWhatsApp(cobranza.telefono, cobranza.mensajeWhatsApp)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm underline"
                          >
                            WhatsApp
                          </a>
                        )}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                )}
                <td>
                  {esVendedorOCobrador ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <a href={`/admin/lotes/${lote.id}/info`} className="text-sm underline">
                        Ver información del lote →
                      </a>
                      <a href={`/admin/lotes/${lote.id}/reservar`} className="text-sm underline">
                        Reservar
                      </a>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <a href={`/admin/lotes/${lote.id}/info`} className="text-sm underline">
                        Ver información del lote →
                      </a>
                      <a href={`/admin/lotes/${lote.id}`} className="text-sm underline">
                        Ver detalle
                      </a>
                      {lote.estado === 'disponible' && (
                        <a href={`/admin/lotes/${lote.id}/reservar`} className="text-sm underline">
                          Reservar
                        </a>
                      )}
                      {perfilPropio!.role === 'administrador' && lote.estado === 'reservado' && (
                        <a href={`/admin/lotes/${lote.id}/vender`} className="text-sm underline">
                          Vender / asignar cliente
                        </a>
                      )}
                      {lote.moneda === 'ARS' && (
                        <a href={`/admin/lotes/${lote.id}/indexar`} className="text-sm underline">
                          Indexar
                        </a>
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
    </main>
  )
}
