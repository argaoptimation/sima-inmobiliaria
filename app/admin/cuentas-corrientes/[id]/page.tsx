import { createClient } from '@/lib/supabase/server'
import { requireAdminOTitularCuenta } from '@/lib/auth/require-admin'
import { notFound } from 'next/navigation'
import { calcularSaldoCuentaCorrientePorMoneda } from '@/lib/cuenta-corriente/calcular-saldo'
import { agregarMovimientoManual } from '../actions'
import { FormularioMovimientoManual } from './FormularioMovimientoManual'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import {
  ENTRADA,
  BOTON_SECUNDARIO,
  ENLACE,
  ENLACE_TABLA,
  TITULO_H1,
  TITULO_H2,
  BANNER_ERROR,
  BANNER_OK,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
  TABLA_CELDA_PRINCIPAL,
} from '@/lib/ui/clases'

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
  const { id } = await params
  const { esAdmin } = await requireAdminOTitularCuenta(id)
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
  // resolver), el datalist es solo para no tipear de cero. Solo hace falta
  // para el alta manual de movimientos, que es admin-only.
  const { data: personasParaSugerir } = esAdmin
    ? await supabase.from('profiles').select('full_name').order('full_name')
    : { data: [] }

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
      <EnlaceBoton href={esAdmin ? '/admin/cuentas-corrientes' : '/admin/lotes'} className={`mb-4 inline-block ${ENLACE}`}>
        {esAdmin ? '← Volver a Cuentas corrientes' : '← Volver'}
      </EnlaceBoton>
      <h1 className={`mb-1 ${TITULO_H1}`}>{esAdmin ? persona!.full_name : 'Mi cuenta corriente'}</h1>
      <p className="mb-6 text-sm text-slate-600">{persona!.role}</p>

      {error && <p className={BANNER_ERROR}>{error}</p>}
      {ok && <p className={BANNER_OK}>Guardado.</p>}

      <h2 className={`mb-2 ${TITULO_H2}`}>Saldo</h2>
      <p className="mb-2 text-sm">
        {entradasSaldo.length === 0
          ? 'Sin movimientos todavía.'
          : entradasSaldo.map(([moneda, monto]) => `${monto} ${moneda}`).join(' / ')}
      </p>
      <p className="mb-6 text-xs text-slate-600">
        Positivo: la empresa todavía le debe. Negativo: cobró de más y le debe a la empresa.
      </p>

      {esAdmin && (
        <>
          <h2 className={`mb-2 ${TITULO_H2}`}>Registrar movimiento manual</h2>
          <FormularioMovimientoManual
            agregarMovimientoManualAction={agregarMovimientoManualConId}
            nombresUnicosParaSugerir={nombresUnicosParaSugerir}
            lotes={lotes ?? []}
          />
        </>
      )}

      <h2 className={`mb-2 ${TITULO_H2}`}>Movimientos</h2>
      <a href={`/admin/cuentas-corrientes/${id}/export?${queryStringExport}`} className={`mb-3 inline-block ${ENLACE}`}>
        Descargar Excel →
      </a>
      {movimientos.length === 0 ? (
        <p className="text-sm text-slate-600">Sin movimientos todavía.</p>
      ) : (
        <>
          <FiltroEnVivo className="mb-4 flex flex-wrap items-end gap-3">
            {lotesConMovimientos.length > 0 && (
              <label className="text-sm text-slate-600">
                Lote
                <select name="lote" defaultValue={filtroLoteId ?? ''} className={ENTRADA}>
                  <option value="">Todos</option>
                  {lotesConMovimientos.map((lote) => (
                    <option key={lote.id} value={lote.id}>
                      {lote.identificador}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-sm text-slate-600">
              Origen
              <select name="origen" defaultValue={filtroOrigen ?? ''} className={ENTRADA}>
                <option value="">Todos</option>
                {origenesConMovimientos.map((origen) => (
                  <option key={origen} value={origen}>
                    {ETIQUETA_ORIGEN[origen] ?? origen}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Desde
              <input type="date" name="desde" defaultValue={filtroDesde ?? ''} className={ENTRADA} />
            </label>
            <label className="text-sm text-slate-600">
              Hasta
              <input type="date" name="hasta" defaultValue={filtroHasta ?? ''} className={ENTRADA} />
            </label>
            <button type="submit" className={`cursor-pointer ${BOTON_SECUNDARIO}`}>
              Filtrar
            </button>
            {hayFiltrosActivos && (
              <EnlaceBoton href={`/admin/cuentas-corrientes/${id}`} className={ENLACE}>
                Limpiar filtros
              </EnlaceBoton>
            )}
          </FiltroEnVivo>
          {movimientosFiltrados.length === 0 ? (
            <p className="text-sm text-slate-600">Ningún movimiento coincide con los filtros.</p>
          ) : (
            <div className={TABLA_CONTENEDOR}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={TABLA_HEADER_FILA}>
                    <th className={TABLA_HEADER_CELDA}>Fecha</th>
                    <th className={TABLA_HEADER_CELDA}>Tipo</th>
                    <th className={TABLA_HEADER_CELDA}>Origen</th>
                    <th className={TABLA_HEADER_CELDA}>Detalle</th>
                    <th className={TABLA_HEADER_CELDA}>Lote</th>
                    <th className={TABLA_HEADER_CELDA}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientosFiltrados.map((movimiento) => (
                    <tr key={movimiento.id} className={TABLA_FILA}>
                      <td className={TABLA_CELDA_PRINCIPAL}>
                        {new Date(movimiento.fecha_evento).toLocaleDateString('es-AR')}
                      </td>
                      <td className={TABLA_CELDA}>{movimiento.tipo === 'debe' ? 'Debe' : 'Haber'}</td>
                      <td className={TABLA_CELDA}>{ETIQUETA_ORIGEN[movimiento.origen] ?? movimiento.origen}</td>
                      <td className={TABLA_CELDA}>
                        {movimiento.detalle ?? '—'}
                        {movimiento.de_parte_de ? ` (de: ${movimiento.de_parte_de})` : ''}
                      </td>
                      <td className={TABLA_CELDA}>
                        {movimiento.lote_id && movimiento.lotes ? (
                          <EnlaceBoton href={`/admin/lotes/${movimiento.lote_id}`} className={ENLACE_TABLA}>
                            {movimiento.lotes.identificador}
                          </EnlaceBoton>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={TABLA_CELDA}>
                        {movimiento.monto} {movimiento.moneda}
                        {movimiento.cotizacion_dia ? ` (cotización: ${movimiento.cotizacion_dia})` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  )
}
