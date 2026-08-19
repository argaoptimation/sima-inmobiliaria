import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { actualizarLoteo, crearLoteo, reasignarLotesEnBloque } from './actions'

export default async function LoteosPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string
    ok?: string
    q?: string
    ubicacion?: string
    moneda?: string
    loteoActual?: string
  }>
}) {
  const { error, ok, q: filtroTexto, ubicacion: filtroUbicacion, moneda: filtroMoneda, loteoActual } =
    await searchParams

  await requireAdministrador()

  const supabase = await createClient()

  const { data: loteos } = await supabase
    .from('loteos')
    .select('id, nombre')
    .order('nombre', { ascending: true })

  const { data: cantidadesPorLoteo } = await supabase.from('lotes').select('loteo_id')
  const cantidadPorLoteoId = new Map<string, number>()
  let sinLoteo = 0
  for (const lote of cantidadesPorLoteo ?? []) {
    if (!lote.loteo_id) {
      sinLoteo += 1
      continue
    }
    cantidadPorLoteoId.set(lote.loteo_id, (cantidadPorLoteoId.get(lote.loteo_id) ?? 0) + 1)
  }

  let queryLotes = supabase
    .from('lotes')
    .select('id, identificador, ubicacion, moneda, estado, loteo_id')
    .order('identificador', { ascending: true })

  if (filtroTexto) {
    queryLotes = queryLotes.ilike('identificador', `%${filtroTexto}%`)
  }
  if (filtroUbicacion) {
    queryLotes = queryLotes.ilike('ubicacion', `%${filtroUbicacion}%`)
  }
  if (filtroMoneda) {
    queryLotes = queryLotes.eq('moneda', filtroMoneda)
  }
  if (loteoActual === '__sin_asignar__') {
    queryLotes = queryLotes.is('loteo_id', null)
  } else if (loteoActual) {
    queryLotes = queryLotes.eq('loteo_id', loteoActual)
  }

  const { data: lotesFiltrados } = await queryLotes

  const nombreLoteoPorId = new Map((loteos ?? []).map((loteo) => [loteo.id, loteo.nombre]))

  return (
    <main>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      {ok && <p className="mb-4 rounded bg-green-100 p-2 text-sm text-green-800">{ok}</p>}

      <h1 className="mb-2 text-xl font-semibold">Loteos</h1>
      <p className="mb-6 text-sm text-gray-600">
        Un loteo agrupa varios lotes (ej. un desarrollo o conjunto). Por ahora solo tiene nombre —
        no cambia ubicación, acreedor ni moneda de ningún lote.
      </p>

      <form action={crearLoteo} className="mb-6 flex items-end gap-2">
        <label className="text-sm">
          Nombre del loteo nuevo
          <input
            name="nombre"
            type="text"
            placeholder="Ej: Loteo San Martín"
            required
            className="mt-1 block rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">
          Crear loteo
        </button>
      </form>

      <table className="mb-10 w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Loteo</th>
            <th>Cantidad de lotes</th>
            <th>Renombrar</th>
          </tr>
        </thead>
        <tbody>
          {(loteos ?? []).map((loteo) => (
            <tr key={loteo.id} className="border-b">
              <td className="py-2">
                <a href={`/admin/loteos?loteoActual=${loteo.id}#lotes-filtrados`} className="underline">
                  {loteo.nombre}
                </a>
              </td>
              <td>{cantidadPorLoteoId.get(loteo.id) ?? 0}</td>
              <td>
                <form action={actualizarLoteo.bind(null, loteo.id)} className="flex gap-2">
                  <input
                    name="nombre"
                    type="text"
                    defaultValue={loteo.nombre}
                    required
                    className="rounded border px-2 py-1"
                  />
                  <button type="submit" className="rounded border px-2 py-1">
                    Guardar
                  </button>
                </form>
              </td>
            </tr>
          ))}
          <tr className="border-b text-gray-600">
            <td className="py-2">
              <a href="/admin/loteos?loteoActual=__sin_asignar__#lotes-filtrados" className="underline">
                — sin loteo asignado —
              </a>
            </td>
            <td>{sinLoteo}</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <h2 className="mb-2 text-lg font-semibold">Reasignar lotes en bloque</h2>
      <p className="mb-4 text-sm text-gray-600">
        Filtrá para encontrar los lotes que querés mover, marcá los que correspondan y elegí el
        loteo de destino.
      </p>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Identificador
          <input
            type="text"
            name="q"
            placeholder="Buscar identificador"
            defaultValue={filtroTexto ?? ''}
            className="mt-1 block rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Ubicación
          <input
            type="text"
            name="ubicacion"
            placeholder="Buscar ubicación"
            defaultValue={filtroUbicacion ?? ''}
            className="mt-1 block rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Moneda
          <select name="moneda" defaultValue={filtroMoneda ?? ''} className="mt-1 block rounded border px-3 py-2">
            <option value="">Todas</option>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </label>
        <label className="text-sm">
          Loteo actual
          <select
            name="loteoActual"
            defaultValue={loteoActual ?? ''}
            className="mt-1 block rounded border px-3 py-2"
          >
            <option value="">Todos</option>
            <option value="__sin_asignar__">— sin loteo asignado —</option>
            {(loteos ?? []).map((loteo) => (
              <option key={loteo.id} value={loteo.id}>
                {loteo.nombre}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded border px-3 py-2 text-sm">
          Filtrar
        </button>
        {(filtroTexto || filtroUbicacion || filtroMoneda || loteoActual) && (
          <a href="/admin/loteos" className="text-sm underline">
            Limpiar filtros
          </a>
        )}
      </form>

      <form action={reasignarLotesEnBloque}>
        <div className="mb-3 flex items-end gap-2">
          <label className="text-sm">
            Mover los seleccionados a
            <select name="loteoDestino" required className="mt-1 block rounded border px-3 py-2">
              <option value="">— elegir loteo —</option>
              {(loteos ?? []).map((loteo) => (
                <option key={loteo.id} value={loteo.id}>
                  {loteo.nombre}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">
            Mover seleccionados
          </button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2"></th>
              <th>Identificador</th>
              <th>Ubicación</th>
              <th>Moneda</th>
              <th>Estado</th>
              <th>Loteo actual</th>
            </tr>
          </thead>
          <tbody>
            {(lotesFiltrados ?? []).map((lote) => (
              <tr key={lote.id} className="border-b">
                <td className="py-2">
                  <input type="checkbox" name="loteIds" value={lote.id} />
                </td>
                <td>{lote.identificador}</td>
                <td>{lote.ubicacion ?? '—'}</td>
                <td>{lote.moneda}</td>
                <td>{lote.estado}</td>
                <td>
                  {lote.loteo_id ? nombreLoteoPorId.get(lote.loteo_id) ?? '—' : '— sin asignar —'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(lotesFiltrados ?? []).length === 0 && (
          <p className="mt-4 text-sm text-gray-600">Ningún lote coincide con este filtro.</p>
        )}
      </form>
    </main>
  )
}
