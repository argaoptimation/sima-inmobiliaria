import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { requireAdminOTitularCuenta } from '@/lib/auth/require-admin'
import { obtenerProyeccionCobranza } from '@/lib/cuenta-corriente/proyeccion'
import { etiquetaMesCorta, ultimoDiaDelMes, mesRelativoAHoy } from '@/lib/fecha/meses'

// Descarga de la proyección en .xlsx (04/09, pedido de Gabriel: "haría
// falta poder exportarlo a Excel para que, por ejemplo, Nico agarre esto
// mismo"). Mismo formato que la tabla de pantalla -- una fila por lote,
// una columna por mes, fila TOTAL al pie -- y mismo criterio que el resto
// de los exports del sistema: planilla real con ExcelJS, no CSV (Excel en
// configuración regional Argentina mete un CSV separado por comas entero
// en una sola columna; ver el export de cuenta corriente).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireAdminOTitularCuenta(id)

  const { searchParams } = new URL(request.url)
  const mesDesde = searchParams.get('desde') || mesRelativoAHoy(0)
  const mesHasta = searchParams.get('hasta') || mesRelativoAHoy(5)

  if (mesDesde > mesHasta) {
    return NextResponse.json({ error: 'El rango de meses es inválido' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: persona } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', id)
    .maybeSingle()

  if (!persona) {
    return NextResponse.json({ error: 'No se encontró la persona' }, { status: 404 })
  }

  const desde = `${mesDesde}-01`
  const hasta = `${mesHasta}-${String(ultimoDiaDelMes(mesHasta)).padStart(2, '0')}`

  const proyeccion = await obtenerProyeccionCobranza(supabase, id, desde, hasta)

  const workbook = new ExcelJS.Workbook()
  const hoja = workbook.addWorksheet('Proyección')

  const ESTILO_TITULO = { bold: true, size: 14 } as const
  const ESTILO_ENCABEZADO = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } } as const,
  }

  hoja.addRow([`Proyección de cobranza — ${persona.full_name}`]).font = ESTILO_TITULO
  hoja.addRow([`${etiquetaMesCorta(mesDesde)} a ${etiquetaMesCorta(mesHasta)}`])
  hoja.addRow([])

  const filaEncabezado = hoja.addRow([
    'Lote',
    'Comprador',
    'Moneda',
    ...proyeccion.meses.map(etiquetaMesCorta),
    'Total',
  ])
  filaEncabezado.eachCell((celda) => {
    celda.font = ESTILO_ENCABEZADO.font
    celda.fill = ESTILO_ENCABEZADO.fill
  })

  for (const fila of proyeccion.filas) {
    hoja.addRow([
      fila.loteIdentificador,
      fila.compradorNombre ?? '',
      fila.moneda,
      // Números "pelados" a propósito (sin la moneda pegada al valor): en
      // una planilla tienen que poder sumarse. La moneda va en su columna.
      ...proyeccion.meses.map((mes) => fila.porMes[mes] ?? 0),
      fila.total,
    ])
  }

  if (proyeccion.filas.length === 0) {
    hoja.addRow(['Sin cuotas asignadas a esta persona en el rango elegido.'])
  } else {
    const filaTotal = hoja.addRow([
      'TOTAL',
      '',
      '',
      ...proyeccion.meses.map((mes) =>
        Object.entries(proyeccion.totalesPorMes[mes] ?? {})
          .map(([moneda, monto]) => `${monto} ${moneda}`)
          .join(' / ')
      ),
      Object.entries(proyeccion.totalGeneral)
        .map(([moneda, monto]) => `${monto} ${moneda}`)
        .join(' / '),
    ])
    filaTotal.font = { bold: true }
  }

  hoja.columns = [
    { width: 30 },
    { width: 26 },
    { width: 10 },
    ...proyeccion.meses.map(() => ({ width: 14 })),
    { width: 16 },
  ]

  const buffer = await workbook.xlsx.writeBuffer()

  const nombreArchivo = `proyeccion-${persona.full_name.replace(/[^a-zA-Z0-9]+/g, '-')}-${mesDesde}-a-${mesHasta}.xlsx`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
    },
  })
}
