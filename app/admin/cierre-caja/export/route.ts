import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { requireAdminOCobrador } from '@/lib/auth/require-admin'

const MOTIVO_ETIQUETA: Record<string, string> = {
  cuota: 'Cuota',
  sena: 'Seña',
  entrega: 'Entrega',
  ajuste: 'Corrección',
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// Descarga en .xlsx (planilla real, con columnas separadas -- no un CSV
// aplanado) del mismo resumen que muestra /admin/cierre-caja para un día
// puntual -- pedido de Gabriel (25-26/08) para poder compartirle a Nico un
// detalle completo del día sin tener que transcribirlo a mano.
export async function GET(request: NextRequest) {
  await requireAdminOCobrador()

  const { searchParams } = new URL(request.url)
  const fechaParam = searchParams.get('fecha')
  const fecha = fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam) ? fechaParam : hoyISO()

  const supabase = await createClient()

  const { data: pagosData } = await supabase
    .from('pagos')
    .select(
      'id, monto, moneda, medio_pago, motivo, cliente_id, confirmado_acreedor_at, confirmado_admin_at, lote_id, lotes(identificador)'
    )
    .eq('estado', 'confirmado')

  const pagos = (pagosData ?? []) as unknown as Array<{
    id: string
    monto: number
    moneda: string
    medio_pago: 'efectivo' | 'transferencia'
    motivo: string
    cliente_id: string
    confirmado_acreedor_at: string | null
    confirmado_admin_at: string | null
    lote_id: string
    lotes: { identificador: string } | null
  }>

  // Mismo cálculo que la pantalla (ver page.tsx): "recibido el día X" es el
  // toque de confirmación más tardío entre acreedor y admin.
  function fechaDeConfirmacion(pago: (typeof pagos)[number]): string | null {
    const candidatos = [pago.confirmado_acreedor_at, pago.confirmado_admin_at].filter(
      (valor): valor is string => valor !== null
    )
    if (candidatos.length === 0) return null
    const masTardio = candidatos.reduce((a, b) => (a > b ? a : b))
    return masTardio.slice(0, 10)
  }

  const pagosDelDia = pagos.filter((pago) => fechaDeConfirmacion(pago) === fecha)

  const clienteIds = [...new Set(pagosDelDia.map((pago) => pago.cliente_id))]
  const { data: clientes } =
    clienteIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', clienteIds)
      : { data: [] }
  const nombreClientePorId = new Map((clientes ?? []).map((persona) => [persona.id, persona.full_name]))

  const totalesPorMedioYMoneda = new Map<string, number>()
  for (const pago of pagosDelDia) {
    const clave = `${pago.medio_pago}|${pago.moneda}`
    totalesPorMedioYMoneda.set(clave, (totalesPorMedioYMoneda.get(clave) ?? 0) + pago.monto)
  }

  const workbook = new ExcelJS.Workbook()
  const hoja = workbook.addWorksheet('Cierre de caja')

  const ESTILO_TITULO = { font: { bold: true, size: 14 } } as const
  const ESTILO_SUBTITULO = { font: { bold: true, size: 12 } } as const
  const ESTILO_ENCABEZADO = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } } as const,
  }

  hoja.addRow([`Cierre de caja — ${fecha}`]).font = ESTILO_TITULO.font
  hoja.addRow([])

  hoja.addRow(['Resumen']).font = ESTILO_SUBTITULO.font
  const filaEncabezadoResumen = hoja.addRow(['Medio', 'Moneda', 'Total'])
  filaEncabezadoResumen.eachCell((celda) => {
    celda.font = ESTILO_ENCABEZADO.font
    celda.fill = ESTILO_ENCABEZADO.fill
  })
  for (const [clave, total] of totalesPorMedioYMoneda.entries()) {
    const [medio, moneda] = clave.split('|')
    hoja.addRow([medio === 'efectivo' ? 'Efectivo' : 'Transferencia', moneda, total])
  }
  if (totalesPorMedioYMoneda.size === 0) {
    hoja.addRow(['Sin movimientos este día.'])
  }

  hoja.addRow([])
  hoja.addRow(['Detalle']).font = ESTILO_SUBTITULO.font
  const filaEncabezadoDetalle = hoja.addRow(['Lote', 'Cliente', 'Medio', 'Motivo', 'Monto', 'Moneda'])
  filaEncabezadoDetalle.eachCell((celda) => {
    celda.font = ESTILO_ENCABEZADO.font
    celda.fill = ESTILO_ENCABEZADO.fill
  })
  for (const pago of pagosDelDia) {
    hoja.addRow([
      pago.lotes?.identificador ?? '—',
      nombreClientePorId.get(pago.cliente_id) ?? '—',
      pago.medio_pago === 'efectivo' ? 'Efectivo' : 'Transferencia',
      MOTIVO_ETIQUETA[pago.motivo] ?? pago.motivo,
      pago.monto,
      pago.moneda,
    ])
  }
  if (pagosDelDia.length === 0) {
    hoja.addRow(['Ningún pago confirmado este día.'])
  }

  hoja.columns = [
    { width: 26 },
    { width: 26 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 10 },
  ]

  const buffer = await workbook.xlsx.writeBuffer()

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="cierre-caja-${fecha}.xlsx"`,
    },
  })
}
