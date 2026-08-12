import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cancelarReserva } from './actions'
import { BotonCancelarReserva } from './BotonCancelarReserva'

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
  searchParams: Promise<{ sort?: string; dir?: string; moneda?: string; acreedor?: string }>
}) {
  const { sort, dir, moneda: filtroMoneda, acreedor: filtroAcreedorId } = await searchParams

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

  const columnaOrden: ColumnaOrdenable = COLUMNAS_ORDENABLES.includes(sort as ColumnaOrdenable)
    ? (sort as ColumnaOrdenable)
    : 'identificador'
  const ordenAscendente = dir !== 'desc'

  let queryLotes = supabase
    .from('lotes')
    .select('id, identificador, moneda, estado, cantidad_cuotas, ubicacion, precio_total, acreedor_id')
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
    params.set('sort', columna)
    params.set('dir', columnaOrden === columna && ordenAscendente ? 'desc' : 'asc')
    return `/admin/lotes?${params.toString()}`
  }

  return (
    <main>
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
                        {lote.estado === 'reservado' && (
                          <BotonCancelarReserva cancelarReservaAction={cancelarReservaConId} />
                        )}
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
        {(filtroMoneda || filtroAcreedorId) && (
          <a href="/admin/lotes" className="text-sm underline">
            Limpiar filtros
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
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lotes?.map((lote) => (
            <tr key={lote.id} className="border-b">
              <td className="py-2">{lote.identificador}</td>
              <td>{lote.ubicacion ?? '—'}</td>
              <td>{lote.precio_total ? `${lote.precio_total} ${lote.moneda}` : '—'}</td>
              <td>{lote.moneda}</td>
              <td>{lote.estado}</td>
              <td>
                {lote.acreedor_id ? nombreAcreedorPorId.get(lote.acreedor_id) ?? '—' : '— sin asignar —'}
              </td>
              {!esVendedorOCobrador && <td>{lote.cantidad_cuotas}</td>}
              <td>
                {esVendedorOCobrador ? (
                  <a href={`/admin/lotes/${lote.id}/reservar`} className="text-sm underline">
                    Reservar
                  </a>
                ) : (
                  <>
                    <a href={`/admin/lotes/${lote.id}`} className="text-sm underline">
                      Ver detalle
                    </a>
                    {lote.estado === 'disponible' && (
                      <a
                        href={`/admin/lotes/${lote.id}/reservar`}
                        className="ml-3 text-sm underline"
                      >
                        Reservar
                      </a>
                    )}
                    {lote.estado !== 'vendido' && (
                      <a href={`/admin/lotes/${lote.id}/vender`} className="ml-3 text-sm underline">
                        Vender / asignar cliente
                      </a>
                    )}
                    {lote.moneda === 'ARS' && (
                      <a
                        href={`/admin/lotes/${lote.id}/indexar`}
                        className="ml-3 text-sm underline"
                      >
                        Indexar
                      </a>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
