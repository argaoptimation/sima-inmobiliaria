import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { ETIQUETA_ORIGEN } from '@/lib/cuenta-corriente/etiquetas'

// El mismo Excel que ya existía para la cuenta corriente de una persona,
// ahora para una cuenta externa (06/09, pedido de Gabriel: las dos pantallas
// se manejan igual). Formato "Resumen" + "Detalle" en .xlsx de verdad, no
// CSV: Excel en configuración regional argentina espera punto y coma como
// separador de listas y un CSV separado por comas le entra todo en una sola
// columna (ver el comentario largo en cuentas-corrientes/[id]/export).
//
// A diferencia del de una persona, acá no hay columna de cotización del día:
// una cuenta externa no participa de distribuciones, así que sus movimientos
// no se convierten a ninguna moneda de referencia.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireAdministrador()

  const { searchParams } = new URL(request.url)
  const filtroDesde = searchParams.get('desde')
  const filtroHasta = searchParams.get('hasta')

  const supabase = await createClient()

  const { data: cuentaExterna } = await supabase
    .from('cuentas_externas')
    .select('nombre')
    .eq('id', id)
    .maybeSingle()

  if (!cuentaExterna) {
    return NextResponse.json({ error: 'No se encontró la cuenta externa' }, { status: 404 })
  }

  const { data: movimientosData } = await supabase
    .from('cuentas_externas_movimientos')
    .select(
      'tipo, monto, moneda, concepto, fecha_evento, de_parte_de, origen, lote_id, lotes(identificador)'
    )
    .eq('cuenta_externa_id', id)
    .order('fecha_evento', { ascending: false })
    .order('created_at', { ascending: false })

  const movimientos = (movimientosData ?? []) as unknown as Array<{
    tipo: 'debito' | 'credito'
    monto: number
    moneda: string
    concepto: string | null
    fecha_evento: string
    de_parte_de: string | null
    origen: string | null
    lote_id: string | null
    lotes: { identificador: string } | null
  }>

  // Mismo filtro que la pantalla: la descarga respeta lo que el admin está
  // viendo en ese momento, no vuelca siempre el historial completo.
  const movimientosFiltrados = movimientos.filter((movimiento) => {
    if (filtroDesde && movimiento.fecha_evento < filtroDesde) return false
    if (filtroHasta && movimiento.fecha_evento > filtroHasta) return false
    return true
  })

  const totalesPorTipoYMoneda = new Map<string, number>()
  for (const movimiento of movimientosFiltrados) {
    const clave = `${movimiento.tipo}|${movimiento.moneda}`
    totalesPorTipoYMoneda.set(clave, (totalesPorTipoYMoneda.get(clave) ?? 0) + movimiento.monto)
  }

  const workbook = new ExcelJS.Workbook()
  const hoja = workbook.addWorksheet('Cuenta externa')

  const ESTILO_TITULO = { font: { bold: true, size: 14 } } as const
  const ESTILO_SUBTITULO = { font: { bold: true, size: 12 } } as const
  const ESTILO_ENCABEZADO = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } } as const,
  }

  hoja.addRow([`Cuenta externa — ${cuentaExterna.nombre}`]).font = ESTILO_TITULO.font
  hoja.addRow([])

  hoja.addRow(['Resumen']).font = ESTILO_SUBTITULO.font
  const filaEncabezadoResumen = hoja.addRow(['Tipo', 'Moneda', 'Total'])
  filaEncabezadoResumen.eachCell((celda) => {
    celda.font = ESTILO_ENCABEZADO.font
    celda.fill = ESTILO_ENCABEZADO.fill
  })
  for (const [clave, total] of totalesPorTipoYMoneda.entries()) {
    const [tipo, moneda] = clave.split('|')
    hoja.addRow([tipo === 'debito' ? 'Débito' : 'Crédito', moneda, total])
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
  ])
  filaEncabezadoDetalle.eachCell((celda) => {
    celda.font = ESTILO_ENCABEZADO.font
    celda.fill = ESTILO_ENCABEZADO.fill
  })
  for (const movimiento of movimientosFiltrados) {
    hoja.addRow([
      movimiento.fecha_evento,
      movimiento.tipo === 'debito' ? 'Débito' : 'Crédito',
      movimiento.origen ? (ETIQUETA_ORIGEN[movimiento.origen] ?? movimiento.origen) : '',
      [movimiento.concepto, movimiento.de_parte_de ? `de: ${movimiento.de_parte_de}` : null]
        .filter(Boolean)
        .join(' — '),
      movimiento.lotes?.identificador ?? '',
      movimiento.monto,
      movimiento.moneda,
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
  ]

  const buffer = await workbook.xlsx.writeBuffer()

  const nombreArchivo = `cuenta-externa-${cuentaExterna.nombre.replace(/[^a-zA-Z0-9]+/g, '-')}.xlsx`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
    },
  })
}
