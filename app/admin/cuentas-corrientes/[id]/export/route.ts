import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { requireAdminOTitularCuenta } from '@/lib/auth/require-admin'

const ETIQUETA_ORIGEN: Record<string, string> = {
  cobro_cuota: 'Cobro de cuota (automático)',
  transferencia_empresa: 'Transferencia de la empresa',
  pago_directo_cliente: 'Pago directo del cliente',
  reversion_cobro_cuota: 'Reversión (corrección de pago)',
  ajuste_distribucion: 'Ajuste de distribución',
  debe_manual: 'Debe manual (gasto/adelanto/descuento)',
}

// Reescrito 04/09 (Gabriel, corrigiendo mi propio error): esto era un .csv
// plano -- en la práctica, Excel en configuración regional Argentina/
// Español espera PUNTO Y COMA como separador de listas (usa la coma como
// separador decimal), así que un CSV separado por comas le entraba TODO
// amontonado en una sola columna en vez de una columna por campo. Un CSV
// bien escapado no alcanza -- la solución real es la misma que ya se usa en
// /admin/cierre-caja/export: una planilla .xlsx de verdad (ExcelJS), con
// columnas reales que no dependen de ningún separador regional, mismo
// formato "Resumen" + "Detalle" que ese export.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireAdminOTitularCuenta(id)

  const { searchParams } = new URL(request.url)
  const filtroLoteId = searchParams.get('lote')
  const filtroOrigen = searchParams.get('origen')
  const filtroDesde = searchParams.get('desde')
  const filtroHasta = searchParams.get('hasta')

  const supabase = await createClient()

  const { data: persona } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', id)
    .maybeSingle()

  if (!persona) {
    return NextResponse.json({ error: 'No se encontró la persona' }, { status: 404 })
  }

  const { data: movimientosData } = await supabase
    .from('movimientos_cuenta_corriente')
    .select(
      'tipo, monto, moneda, cotizacion_dia, origen, fecha_evento, de_parte_de, detalle, lote_id, lotes(identificador)'
    )
    .eq('profile_id', id)
    .order('fecha_evento', { ascending: false })
    .order('created_at', { ascending: false })

  const movimientos = (movimientosData ?? []) as unknown as Array<{
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

  // Mismo filtro que la pantalla (ver page.tsx) -- la descarga tiene que
  // respetar lo que el admin está viendo en ese momento, no volcar siempre
  // el historial completo.
  const movimientosFiltrados = movimientos.filter((movimiento) => {
    if (filtroLoteId && movimiento.lote_id !== filtroLoteId) return false
    if (filtroOrigen && movimiento.origen !== filtroOrigen) return false
    if (filtroDesde && movimiento.fecha_evento < filtroDesde) return false
    if (filtroHasta && movimiento.fecha_evento > filtroHasta) return false
    return true
  })

  // Resumen: total Debe/Haber por moneda, solo de lo que quedó filtrado --
  // mismo criterio que el resumen de /admin/cierre-caja (totales agrupados,
  // no un solo número global que mezcle monedas).
  const totalesPorTipoYMoneda = new Map<string, number>()
  for (const movimiento of movimientosFiltrados) {
    const clave = `${movimiento.tipo}|${movimiento.moneda}`
    totalesPorTipoYMoneda.set(clave, (totalesPorTipoYMoneda.get(clave) ?? 0) + movimiento.monto)
  }

  const workbook = new ExcelJS.Workbook()
  const hoja = workbook.addWorksheet('Cuenta corriente')

  const ESTILO_TITULO = { font: { bold: true, size: 14 } } as const
  const ESTILO_SUBTITULO = { font: { bold: true, size: 12 } } as const
  const ESTILO_ENCABEZADO = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } } as const,
  }

  hoja.addRow([`Cuenta corriente — ${persona.full_name}`]).font = ESTILO_TITULO.font
  hoja.addRow([])

  hoja.addRow(['Resumen']).font = ESTILO_SUBTITULO.font
  const filaEncabezadoResumen = hoja.addRow(['Tipo', 'Moneda', 'Total'])
  filaEncabezadoResumen.eachCell((celda) => {
    celda.font = ESTILO_ENCABEZADO.font
    celda.fill = ESTILO_ENCABEZADO.fill
  })
  for (const [clave, total] of totalesPorTipoYMoneda.entries()) {
    const [tipo, moneda] = clave.split('|')
    hoja.addRow([tipo === 'debe' ? 'Debe' : 'Haber', moneda, total])
  }
  if (totalesPorTipoYMoneda.size === 0) {
    hoja.addRow(['Sin movimientos con estos filtros.'])
  }

  hoja.addRow([])
  hoja.addRow(['Detalle']).font = ESTILO_SUBTITULO.font
  const filaEncabezadoDetalle = hoja.addRow([
    'Fecha',
    'Tipo',
    'Origen',
    'Detalle',
    'Lote',
    'Monto',
    'Moneda',
    'Cotización del día',
  ])
  filaEncabezadoDetalle.eachCell((celda) => {
    celda.font = ESTILO_ENCABEZADO.font
    celda.fill = ESTILO_ENCABEZADO.fill
  })
  for (const movimiento of movimientosFiltrados) {
    hoja.addRow([
      movimiento.fecha_evento,
      movimiento.tipo === 'debe' ? 'Debe' : 'Haber',
      ETIQUETA_ORIGEN[movimiento.origen] ?? movimiento.origen,
      [movimiento.detalle, movimiento.de_parte_de ? `de: ${movimiento.de_parte_de}` : null]
        .filter(Boolean)
        .join(' — '),
      movimiento.lotes?.identificador ?? '',
      movimiento.monto,
      movimiento.moneda,
      movimiento.cotizacion_dia ?? '',
    ])
  }
  if (movimientosFiltrados.length === 0) {
    hoja.addRow(['Ningún movimiento con estos filtros.'])
  }

  hoja.columns = [
    { width: 14 },
    { width: 12 },
    { width: 30 },
    { width: 34 },
    { width: 16 },
    { width: 14 },
    { width: 10 },
    { width: 16 },
  ]

  const buffer = await workbook.xlsx.writeBuffer()

  const nombreArchivo = `cuenta-corriente-${persona.full_name.replace(/[^a-zA-Z0-9]+/g, '-')}.xlsx`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
    },
  })
}
