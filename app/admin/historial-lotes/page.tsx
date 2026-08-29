import { createClient } from '@/lib/supabase/server'
import { requireAdminOCobrador } from '@/lib/auth/require-admin'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { EVENTO_HISTORIAL_ETIQUETA } from '@/lib/lotes/eventos-historial'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { EncabezadoPagina } from '@/components/EncabezadoPagina'
import {
  ENTRADA,
  BOTON_SECUNDARIO,
  ENLACE,
  ENLACE_TABLA,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
} from '@/lib/ui/clases'

export default async function HistorialLotesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; evento?: string; desde?: string; hasta?: string }>
}) {
  const {
    estado: filtroEstado,
    evento: filtroEvento,
    desde: filtroDesde,
    hasta: filtroHasta,
  } = await searchParams

  await requireAdminOCobrador()

  const supabase = await createClient()

  // Vista global (todos los lotes juntos) de cada movimiento -- pedido de
  // Gabriel 25/08 (cambios de estado) ampliado 26/08 a pedido de Nicolás
  // (también lotes creados, reservados, vendidos y refinanciaciones, no
  // solo rescindido/vuelto a disponible -- "como un historial de búsqueda,
  // en orden cronológico"). Dos filtros independientes: "Pasó a estado"
  // (el valor real de lotes.estado, solo aplica a los movimientos que
  // cambian el estado) y "Movimiento" (el evento en sí, cubre TODOS los
  // tipos incluidos los que no cambian estado como "creado"/"refinanció").
  let query = supabase
    .from('lote_historial_estados')
    .select(
      'id, lote_id, evento, estado_anterior, estado_nuevo, cambiado_por, detalle, created_at, lotes(identificador)'
    )
    .order('created_at', { ascending: false })

  if (filtroEstado) query = query.eq('estado_nuevo', filtroEstado)
  if (filtroEvento) query = query.eq('evento', filtroEvento)
  if (filtroDesde) query = query.gte('created_at', filtroDesde)
  if (filtroHasta) query = query.lte('created_at', `${filtroHasta}T23:59:59`)

  const { data: historialData } = await query

  const historial = (historialData ?? []) as unknown as Array<{
    id: string
    lote_id: string
    evento: string
    estado_anterior: string | null
    estado_nuevo: string | null
    cambiado_por: string
    detalle: string | null
    created_at: string
    lotes: { identificador: string } | null
  }>

  const cambiadorIds = [...new Set(historial.map((h) => h.cambiado_por))]
  const { data: cambiadores } =
    cambiadorIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', cambiadorIds)
      : { data: [] }
  const nombreCambiadorPorId = new Map((cambiadores ?? []).map((persona) => [persona.id, persona.full_name]))

  // Opciones de los filtros: todos los valores que se hayan visto alguna
  // vez, sin filtrar (para no perder opciones al filtrar).
  const { data: todoElHistorial } = await supabase
    .from('lote_historial_estados')
    .select('estado_nuevo, evento')
  const estadosDisponibles = [
    ...new Set((todoElHistorial ?? []).map((h) => h.estado_nuevo).filter((v): v is string => Boolean(v))),
  ].sort()
  const eventosDisponibles = [...new Set((todoElHistorial ?? []).map((h) => h.evento))].sort()

  const hayFiltrosActivos = Boolean(filtroEstado || filtroEvento || filtroDesde || filtroHasta)

  return (
    <main>
      <EnlaceBoton href="/admin/lotes" className={`mb-4 inline-block ${ENLACE}`}>
        ← Volver a Lotes
      </EnlaceBoton>
      <EncabezadoPagina titulo="Historial de lotes" migas={['Historial']} />
      <p className="mb-6 text-sm text-slate-600">
        Todos los movimientos de todos los lotes en un solo lugar (alta, reserva, venta,
        rescisión, refinanciación, etc.), en orden cronológico.
      </p>

      <FiltroEnVivo className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">
          Movimiento
          <select
            name="evento"
            defaultValue={filtroEvento ?? ''}
            className={ENTRADA}
          >
            <option value="">Todos</option>
            {eventosDisponibles.map((evento) => (
              <option key={evento} value={evento}>
                {EVENTO_HISTORIAL_ETIQUETA[evento] ?? evento}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-600">
          Pasó a estado
          <select
            name="estado"
            defaultValue={filtroEstado ?? ''}
            className={ENTRADA}
          >
            <option value="">Todos</option>
            {estadosDisponibles.map((estado) => (
              <option key={estado} value={estado}>
                {estado}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-600">
          Desde
          <input
            type="date"
            name="desde"
            defaultValue={filtroDesde ?? ''}
            className={ENTRADA}
          />
        </label>
        <label className="text-sm text-slate-600">
          Hasta
          <input
            type="date"
            name="hasta"
            defaultValue={filtroHasta ?? ''}
            className={ENTRADA}
          />
        </label>
        <button type="submit" className={`cursor-pointer ${BOTON_SECUNDARIO}`}>
          Filtrar
        </button>
        {hayFiltrosActivos && (
          <EnlaceBoton href="/admin/historial-lotes" className={`text-sm ${ENLACE}`}>
            Limpiar filtros
          </EnlaceBoton>
        )}
      </FiltroEnVivo>

      {historial.length === 0 ? (
        <p className="text-sm text-slate-600">
          {hayFiltrosActivos ? 'Ningún movimiento coincide con los filtros.' : 'Todavía no hubo ningún movimiento.'}
        </p>
      ) : (
        <div className={TABLA_CONTENEDOR}>
        <table className="w-full text-sm">
          <thead>
            <tr className={TABLA_HEADER_FILA}>
              <th className={TABLA_HEADER_CELDA}>Lote</th>
              <th className={TABLA_HEADER_CELDA}>Cambio</th>
              <th className={TABLA_HEADER_CELDA}>Por quién</th>
              <th className={TABLA_HEADER_CELDA}>Cuándo</th>
            </tr>
          </thead>
          <tbody>
            {historial.map((cambio) => (
              <tr key={cambio.id} className={TABLA_FILA}>
                <td className={TABLA_CELDA}>
                  <EnlaceBoton href={`/admin/lotes/${cambio.lote_id}`} className={ENLACE_TABLA}>
                    {cambio.lotes?.identificador ?? '—'}
                  </EnlaceBoton>
                </td>
                <td className={TABLA_CELDA}>
                  {cambio.estado_anterior && cambio.estado_nuevo
                    ? `${cambio.estado_anterior} → ${cambio.estado_nuevo}`
                    : (EVENTO_HISTORIAL_ETIQUETA[cambio.evento] ?? cambio.evento)}
                  {cambio.detalle && <span className="block text-xs text-slate-500">{cambio.detalle}</span>}
                </td>
                <td className={TABLA_CELDA}>{nombreCambiadorPorId.get(cambio.cambiado_por) ?? '—'}</td>
                <td className={TABLA_CELDA}>{new Date(cambio.created_at).toLocaleString('es-AR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </main>
  )
}
