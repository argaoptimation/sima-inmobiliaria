import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { notFound } from 'next/navigation'
import { calcularSaldoCuentaCorrientePorMoneda } from '@/lib/cuenta-corriente/calcular-saldo'
import { agregarMovimientoManual } from '../actions'
import { FormularioMovimientoManual } from './FormularioMovimientoManual'

const ETIQUETA_ORIGEN: Record<string, string> = {
  cobro_cuota: 'Cobro de cuota (automático)',
  transferencia_empresa: 'Transferencia de la empresa',
  pago_directo_cliente: 'Pago directo del cliente',
  reversion_cobro_cuota: 'Reversión (corrección de pago)',
  ajuste_distribucion: 'Ajuste de distribución',
  debe_manual: 'Debe manual (gasto/adelanto/descuento)',
}

export default async function CuentaCorrienteDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; ok?: string; lote?: string; origen?: string; desde?: string; hasta?: string }>
}) {
  await requireAdministrador()

  const { id } = await params
  const { error, ok, lote: filtroLoteId, origen: filtroOrigen, desde: filtroDesde, hasta: filtroHasta } =
    await searchParams

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
      'id, tipo, monto, moneda, cotizacion_dia, origen, fecha_evento, de_parte_de, detalle, lote_id, lotes(identificador)'
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
    lotes: { identificador: string } | null
  }>

  const { data: lotes } = await supabase.from('lotes').select('id, identificador').order('identificador')

  // Sugerencias de "de quién vino la plata" -- puede ser un cliente (el
  // caso más común de "pago directo") o cualquier otra persona del
  // sistema. El campo sigue siendo texto libre (no hay ninguna FK que
  // resolver), el datalist es solo para no tipear de cero.
  const { data: personasParaSugerir } = await supabase
    .from('profiles')
    .select('full_name')
    .order('full_name')

  // Dos personas distintas pueden compartir nombre (ej. dos clientes
  // llamados "Juan Pérez") -- el datalist solo necesita el texto una vez,
  // no una entrada por persona.
  const nombresUnicosParaSugerir = [...new Set((personasParaSugerir ?? []).map((p) => p.full_name))]

  const saldos = calcularSaldoCuentaCorrientePorMoneda(
    movimientos.map((m) => ({ tipo: m.tipo, monto: m.monto, moneda: m.moneda }))
  )
  const entradasSaldo = Object.entries(saldos).filter(([, monto]) => monto !== 0)

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

  // La descarga respeta los mismos filtros que se están viendo en pantalla.
  const paramsExport = new URLSearchParams()
  if (filtroLoteId) paramsExport.set('lote', filtroLoteId)
  if (filtroOrigen) paramsExport.set('origen', filtroOrigen)
  if (filtroDesde) paramsExport.set('desde', filtroDesde)
  if (filtroHasta) paramsExport.set('hasta', filtroHasta)
  const queryStringExport = paramsExport.toString()

  return (
    <main className="max-w-3xl">
      <a href="/admin/cuentas-corrientes" className="mb-4 inline-block text-sm underline">
        ← Volver a Cuentas corrientes
      </a>
      <h1 className="mb-1 text-xl font-semibold">{persona!.full_name}</h1>
      <p className="mb-6 text-sm text-gray-600">{persona!.role}</p>

      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      {ok && <p className="mb-4 rounded bg-green-100 p-2 text-sm text-green-700">Guardado.</p>}

      <h2 className="mb-2 text-lg font-semibold">Saldo</h2>
      <p className="mb-2 text-sm">
        {entradasSaldo.length === 0
          ? 'Sin movimientos todavía.'
          : entradasSaldo.map(([moneda, monto]) => `${monto} ${moneda}`).join(' / ')}
      </p>
      <p className="mb-6 text-xs text-gray-600">
        Positivo: la empresa todavía le debe. Negativo: cobró de más y le debe a la empresa.
      </p>

      <h2 className="mb-2 text-lg font-semibold">Registrar movimiento manual</h2>
      <FormularioMovimientoManual
        agregarMovimientoManualAction={agregarMovimientoManualConId}
        nombresUnicosParaSugerir={nombresUnicosParaSugerir}
        lotes={lotes ?? []}
      />

      <h2 className="mb-2 text-lg font-semibold">Movimientos</h2>
      <a
        href={`/admin/cuentas-corrientes/${id}/export?${queryStringExport}`}
        className="mb-3 inline-block text-sm underline"
      >
        Descargar CSV →
      </a>
      {movimientos.length === 0 ? (
        <p className="text-sm text-gray-600">Sin movimientos todavía.</p>
      ) : (
        <>
          <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
            {lotesConMovimientos.length > 0 && (
              <label className="text-sm">
                Lote
                <select
                  name="lote"
                  defaultValue={filtroLoteId ?? ''}
                  className="mt-1 block rounded border px-3 py-2"
                >
                  <option value="">Todos</option>
                  {lotesConMovimientos.map((lote) => (
                    <option key={lote.id} value={lote.id}>
                      {lote.identificador}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-sm">
              Origen
              <select
                name="origen"
                defaultValue={filtroOrigen ?? ''}
                className="mt-1 block rounded border px-3 py-2"
              >
                <option value="">Todos</option>
                {origenesConMovimientos.map((origen) => (
                  <option key={origen} value={origen}>
                    {ETIQUETA_ORIGEN[origen] ?? origen}
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
              <a href={`/admin/cuentas-corrientes/${id}`} className="text-sm underline">
                Limpiar filtros
              </a>
            )}
          </form>
          {movimientosFiltrados.length === 0 ? (
            <p className="text-sm text-gray-600">Ningún movimiento coincide con los filtros.</p>
          ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Fecha</th>
              <th>Tipo</th>
              <th>Origen</th>
              <th>Detalle</th>
              <th>Lote</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            {movimientosFiltrados.map((movimiento) => (
              <tr key={movimiento.id} className="border-b">
                <td className="py-2">{new Date(movimiento.fecha_evento).toLocaleDateString('es-AR')}</td>
                <td>{movimiento.tipo === 'debe' ? 'Debe' : 'Haber'}</td>
                <td>{ETIQUETA_ORIGEN[movimiento.origen] ?? movimiento.origen}</td>
                <td>
                  {movimiento.detalle ?? '—'}
                  {movimiento.de_parte_de ? ` (de: ${movimiento.de_parte_de})` : ''}
                </td>
                <td>
                  {movimiento.lote_id && movimiento.lotes ? (
                    <a href={`/admin/lotes/${movimiento.lote_id}`} className="underline">
                      {movimiento.lotes.identificador}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {movimiento.monto} {movimiento.moneda}
                  {movimiento.cotizacion_dia ? ` (cotización: ${movimiento.cotizacion_dia})` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
          )}
        </>
      )}
    </main>
  )
}
