import { createClient } from '@/lib/supabase/server'
import { requireAdminOCobrador } from '@/lib/auth/require-admin'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'

export default async function HistorialLotesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; desde?: string; hasta?: string }>
}) {
  const { estado: filtroEstado, desde: filtroDesde, hasta: filtroHasta } = await searchParams

  await requireAdminOCobrador()

  const supabase = await createClient()

  // Vista global (todos los lotes juntos) de cada cambio de estado --
  // pedido de Gabriel 25/08 para no tener que abrir lote por lote a ver
  // si/cuándo se rescindió alguno. Los filtros van por el estado AL QUE
  // pasó (ej. "rescindido") y por rango de fecha del cambio.
  let query = supabase
    .from('lote_historial_estados')
    .select('id, lote_id, estado_anterior, estado_nuevo, cambiado_por, created_at, lotes(identificador)')
    .order('created_at', { ascending: false })

  if (filtroEstado) query = query.eq('estado_nuevo', filtroEstado)
  if (filtroDesde) query = query.gte('created_at', filtroDesde)
  if (filtroHasta) query = query.lte('created_at', `${filtroHasta}T23:59:59`)

  const { data: historialData } = await query

  const historial = (historialData ?? []) as unknown as Array<{
    id: string
    lote_id: string
    estado_anterior: string
    estado_nuevo: string
    cambiado_por: string
    created_at: string
    lotes: { identificador: string } | null
  }>

  const cambiadorIds = [...new Set(historial.map((h) => h.cambiado_por))]
  const { data: cambiadores } =
    cambiadorIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', cambiadorIds)
      : { data: [] }
  const nombreCambiadorPorId = new Map((cambiadores ?? []).map((persona) => [persona.id, persona.full_name]))

  // Opciones del filtro "Estado": todos los estados a los que se haya
  // pasado alguna vez, sin filtrar (para no perder opciones al filtrar).
  const { data: todoElHistorial } = await supabase.from('lote_historial_estados').select('estado_nuevo')
  const estadosDisponibles = [...new Set((todoElHistorial ?? []).map((h) => h.estado_nuevo))].sort()

  const hayFiltrosActivos = Boolean(filtroEstado || filtroDesde || filtroHasta)

  return (
    <main>
      <a href="/admin/lotes" className="mb-4 inline-block text-sm underline">
        ← Volver a Lotes
      </a>
      <h1 className="mb-2 text-xl font-semibold">Historial de lotes</h1>
      <p className="mb-6 text-sm text-gray-600">
        Todos los cambios de estado (rescindido, vuelto a disponible, etc.) de todos los lotes,
        en un solo lugar.
      </p>

      <FiltroEnVivo className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Pasó a estado
          <select
            name="estado"
            defaultValue={filtroEstado ?? ''}
            className="mt-1 block rounded border px-3 py-2"
          >
            <option value="">Todos</option>
            {estadosDisponibles.map((estado) => (
              <option key={estado} value={estado}>
                {estado}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Desde
          <input
            type="date"
            name="desde"
            defaultValue={filtroDesde ?? ''}
            className="mt-1 block rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Hasta
          <input
            type="date"
            name="hasta"
            defaultValue={filtroHasta ?? ''}
            className="mt-1 block rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded border px-3 py-2 text-sm">
          Filtrar
        </button>
        {hayFiltrosActivos && (
          <a href="/admin/historial-lotes" className="text-sm underline">
            Limpiar filtros
          </a>
        )}
      </FiltroEnVivo>

      {historial.length === 0 ? (
        <p className="text-sm text-gray-600">
          {hayFiltrosActivos ? 'Ningún cambio coincide con los filtros.' : 'Todavía no hubo ningún cambio de estado.'}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Lote</th>
              <th>Cambio</th>
              <th>Por quién</th>
              <th>Cuándo</th>
            </tr>
          </thead>
          <tbody>
            {historial.map((cambio) => (
              <tr key={cambio.id} className="border-b">
                <td className="py-2">
                  <a href={`/admin/lotes/${cambio.lote_id}`} className="underline">
                    {cambio.lotes?.identificador ?? '—'}
                  </a>
                </td>
                <td>
                  {cambio.estado_anterior} → {cambio.estado_nuevo}
                </td>
                <td>{nombreCambiadorPorId.get(cambio.cambiado_por) ?? '—'}</td>
                <td>{new Date(cambio.created_at).toLocaleString('es-AR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
