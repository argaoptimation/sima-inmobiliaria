import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'

// Historial de auditoría de confirmaciones de pago (pedido de Gabriel 28/08):
// a diferencia de /admin/pagos (que solo muestra "Sí/No" confirmado), esto
// muestra QUIÉN confirmó cada pago y CUÁNDO -- confirmado_acreedor_at /
// confirmado_admin_at ya vivían en la tabla `pagos` desde el arranque del
// proyecto, pero nunca se habían mostrado en ninguna pantalla. Deliberadamente
// sin link en la navegación principal (Gabriel: "una pestaña que no esté
// visible pero que se pueda ver sin ningún problema") -- se accede desde un
// link chico al pie de /admin/pagos. Solo administrador: es el único rol que
// necesita ver el historial completo de auditoría de TODOS los acreedores a
// la vez.
export default async function AuditoriaPagosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; medio?: string; desde?: string; hasta?: string }>
}) {
  await requireAdministrador()

  const { q: filtroTexto, estado: filtroEstado, medio: filtroMedio, desde, hasta } = await searchParams

  const supabase = await createClient()

  let loteIdsBusqueda: string[] | null = null

  if (filtroTexto) {
    const { data: lotesPorIdentificador } = await supabase
      .from('lotes')
      .select('id')
      .ilike('identificador', `%${filtroTexto}%`)

    const { data: clientesPorNombre } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'cliente')
      .ilike('full_name', `%${filtroTexto}%`)

    const clienteIds = (clientesPorNombre ?? []).map((cliente) => cliente.id)

    const { data: lotesPorCliente } =
      clienteIds.length > 0
        ? await supabase.from('lotes').select('id').in('cliente_id', clienteIds)
        : { data: [] }

    loteIdsBusqueda = [
      ...new Set([
        ...(lotesPorIdentificador ?? []).map((lote) => lote.id),
        ...(lotesPorCliente ?? []).map((lote) => lote.id),
      ]),
    ]
  }

  let query = supabase
    .from('pagos')
    .select(
      'id, monto, moneda, motivo, estado, medio_pago, created_at, lote_id, cliente_id, confirmado_acreedor_por, confirmado_acreedor_at, confirmado_admin_por, confirmado_admin_at'
    )
    .order('created_at', { ascending: false })
    .limit(300)

  if (loteIdsBusqueda !== null) query = query.in('lote_id', loteIdsBusqueda)
  if (filtroEstado) query = query.eq('estado', filtroEstado)
  if (filtroMedio) query = query.eq('medio_pago', filtroMedio)
  if (desde) query = query.gte('created_at', `${desde}T00:00:00`)
  if (hasta) query = query.lte('created_at', `${hasta}T23:59:59`)

  const { data: pagosData } = await query
  const pagos = pagosData ?? []

  const loteIds = [...new Set(pagos.map((pago) => pago.lote_id))]
  const { data: lotes } =
    loteIds.length > 0 ? await supabase.from('lotes').select('id, identificador').in('id', loteIds) : { data: [] }
  const identificadorPorLoteId = new Map((lotes ?? []).map((lote) => [lote.id, lote.identificador]))

  const perfilIds = [
    ...new Set(
      pagos.flatMap((pago) => [pago.cliente_id, pago.confirmado_acreedor_por, pago.confirmado_admin_por])
    ),
  ].filter((id): id is string => Boolean(id))
  const { data: perfiles } =
    perfilIds.length > 0 ? await supabase.from('profiles').select('id, full_name').in('id', perfilIds) : { data: [] }
  const nombrePorId = new Map((perfiles ?? []).map((perfil) => [perfil.id, perfil.full_name]))

  function fechaHora(iso: string | null) {
    if (!iso) return null
    return new Date(iso).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const hayFiltros = Boolean(filtroTexto || filtroEstado || filtroMedio || desde || hasta)

  return (
    <main>
      <p className="mb-2 text-sm">
        <a href="/admin/pagos" className="underline">
          ← Volver a Pagos
        </a>
      </p>
      <h1 className="mb-2 text-xl font-semibold">Auditoría de confirmaciones de pago</h1>
      <p className="mb-6 text-sm text-gray-600">
        Quién confirmó cada pago y cuándo — últimos 300 registros que coincidan con el filtro.
      </p>

      <FiltroEnVivo className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Buscar
          <input
            type="text"
            name="q"
            placeholder="Cliente o lote"
            defaultValue={filtroTexto ?? ''}
            className="mt-1 block rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Estado
          <select name="estado" defaultValue={filtroEstado ?? ''} className="mt-1 block rounded border px-3 py-2">
            <option value="">Todos</option>
            <option value="confirmado">Confirmado</option>
            <option value="pendiente">Pendiente</option>
          </select>
        </label>
        <label className="text-sm">
          Medio
          <select name="medio" defaultValue={filtroMedio ?? ''} className="mt-1 block rounded border px-3 py-2">
            <option value="">Todos</option>
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
          </select>
        </label>
        <label className="text-sm">
          Desde
          <input
            type="date"
            name="desde"
            defaultValue={desde ?? ''}
            className="mt-1 block rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Hasta
          <input
            type="date"
            name="hasta"
            defaultValue={hasta ?? ''}
            className="mt-1 block rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded border px-3 py-2 text-sm">
          Filtrar
        </button>
        {hayFiltros && (
          <a href="/admin/pagos/auditoria" className="text-sm underline">
            Limpiar filtros
          </a>
        )}
      </FiltroEnVivo>

      {pagos.length === 0 ? (
        <p className="text-sm text-gray-600">Ningún pago coincide con el filtro.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Creado</th>
              <th>Lote</th>
              <th>Cliente</th>
              <th>Medio</th>
              <th>Monto</th>
              <th>Estado</th>
              <th>Confirmado por acreedor</th>
              <th>Confirmado por admin</th>
            </tr>
          </thead>
          <tbody>
            {pagos.map((pago) => (
              <tr key={pago.id} className="border-b align-top">
                <td className="py-2">{fechaHora(pago.created_at)}</td>
                <td>
                  <a href={`/admin/lotes/${pago.lote_id}`} className="underline">
                    {identificadorPorLoteId.get(pago.lote_id) ?? '—'}
                  </a>
                </td>
                <td>{nombrePorId.get(pago.cliente_id) ?? '—'}</td>
                <td>{pago.medio_pago === 'efectivo' ? 'Efectivo' : 'Transferencia'}</td>
                <td>
                  {pago.monto} {pago.moneda}
                </td>
                <td>{pago.estado === 'confirmado' ? 'Confirmado' : 'Pendiente'}</td>
                <td>
                  {pago.confirmado_acreedor_por ? (
                    <>
                      {nombrePorId.get(pago.confirmado_acreedor_por) ?? '—'}
                      <br />
                      <span className="text-gray-500">{fechaHora(pago.confirmado_acreedor_at)}</span>
                    </>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </td>
                <td>
                  {pago.confirmado_admin_por ? (
                    <>
                      {nombrePorId.get(pago.confirmado_admin_por) ?? '—'}
                      <br />
                      <span className="text-gray-500">{fechaHora(pago.confirmado_admin_at)}</span>
                    </>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
