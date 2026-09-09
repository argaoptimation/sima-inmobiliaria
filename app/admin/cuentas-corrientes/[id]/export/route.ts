import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { requireAdminOTitularCuenta } from '@/lib/auth/require-admin'
import {
  armarFilasDeMovimiento,
  celdasDeFila,
  COLUMNAS_PLANILLA,
} from '@/lib/cuenta-corriente/filas-movimiento'
import {
  traerDatosDeLotes,
  traerDatosDeCuotas,
} from '@/lib/cuenta-corriente/traer-datos-planilla'

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
      'id, tipo, monto, moneda, cotizacion_dia, origen, fecha_evento, de_parte_de, detalle, lote_id, cuota_id'
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
    cuota_id: string | null
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

  // Reescrito 09/09 al formato que ya usaba Nicolás en su planilla (captura
  // que pasó Gabriel): fecha, tipo de movimiento, concepto, loteo, mza,
  // lote, cliente, mes de, nro cuota, monto. Antes salía "Debe / Haber /
  // Lote" y había que ir al sistema para saber de qué cuota y de qué
  // comprador se estaba hablando.
  const lotePorId = await traerDatosDeLotes(
    supabase,
    movimientosFiltrados
      .map((movimiento) => movimiento.lote_id)
      .filter((id): id is string => Boolean(id))
  )
  const cuotaPorId = await traerDatosDeCuotas(
    supabase,
    movimientosFiltrados
      .map((movimiento) => movimiento.cuota_id)
      .filter((id): id is string => Boolean(id))
  )

  const filas = armarFilasDeMovimiento(movimientosFiltrados, lotePorId, cuotaPorId)

  // Resumen por moneda. El saldo es la suma de la columna Monto (crédito
  // positivo, débito negativo), así que la planilla se puede verificar sola:
  // el que la recibe suma la columna y le tiene que dar lo mismo.
  const resumenPorMoneda = new Map<string, { credito: number; debito: number; saldo: number }>()
  for (const fila of filas) {
    const actual = resumenPorMoneda.get(fila.moneda) ?? { credito: 0, debito: 0, saldo: 0 }
    if (fila.monto >= 0) actual.credito += fila.monto
    else actual.debito += -fila.monto
    actual.saldo += fila.monto
    resumenPorMoneda.set(fila.moneda, actual)
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
  const filaEncabezadoResumen = hoja.addRow([
    'Moneda',
    'Le corresponde (crédito)',
    'Ya cobró (débito)',
    'Saldo',
  ])
  filaEncabezadoResumen.eachCell((celda) => {
    celda.font = ESTILO_ENCABEZADO.font
    celda.fill = ESTILO_ENCABEZADO.fill
  })
  for (const [moneda, totales] of resumenPorMoneda.entries()) {
    hoja.addRow([
      moneda,
      Math.round(totales.credito * 100) / 100,
      Math.round(totales.debito * 100) / 100,
      Math.round(totales.saldo * 100) / 100,
    ])
  }
  if (resumenPorMoneda.size === 0) {
    hoja.addRow(['Sin movimientos con estos filtros.'])
  }

  hoja.addRow([])
  hoja.addRow(['Detalle']).font = ESTILO_SUBTITULO.font
  const filaEncabezadoDetalle = hoja.addRow([...COLUMNAS_PLANILLA])
  filaEncabezadoDetalle.eachCell((celda) => {
    celda.font = ESTILO_ENCABEZADO.font
    celda.fill = ESTILO_ENCABEZADO.fill
  })
  for (const fila of filas) {
    hoja.addRow(celdasDeFila(fila))
  }
  if (filas.length === 0) {
    hoja.addRow(['Ningún movimiento con estos filtros.'])
  }

  hoja.columns = [
    { width: 12 }, // Fecha
    { width: 18 }, // Tipo de movimiento
    { width: 24 }, // Concepto
    { width: 20 }, // Loteo
    { width: 8 }, // Mza
    { width: 12 }, // Lote
    { width: 24 }, // Cliente
    { width: 10 }, // Mes de
    { width: 12 }, // Nro cuota
    { width: 14 }, // Monto
    { width: 10 }, // Moneda
    { width: 16 }, // Cotización del día
    { width: 34 }, // Detalle
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
