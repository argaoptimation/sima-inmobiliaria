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
import {
  obtenerMesAMesDelAcreedor,
  pivotarPorLote,
  describirDiferencia,
} from '@/lib/cuenta-corriente/mes-a-mes'
import { etiquetaMes, etiquetaMesCorta, ultimoDiaDelMes, mesRelativoAHoy } from '@/lib/fecha/meses'

// EL ÚNICO EXCEL DEL ACREEDOR (10/09, pedido de Gabriel: "cuando
// descargamos el Excel, descargar ambos: el Excel de los movimientos más
// los de la proyección").
//
// Antes eran dos descargas en dos pantallas distintas. Ahora es un archivo
// con cuatro hojas, y las cuatro salen de los mismos módulos que dibujan la
// pantalla -- el Excel no recalcula nada por su cuenta:
//
//   1. "Mes a mes"        -> lo que le corresponde contra lo que le
//                            asignaste, y la diferencia. Es lo nuevo.
//   2. "Proyección"       -> de dónde sale lo que le corresponde, por lote.
//   3. "Órdenes de pago"  -> cuota por cuota, el detalle que respalda las
//                            dos hojas anteriores.
//   4. "Cuenta corriente" -> los movimientos ya registrados y el saldo.
//
// El nombre de la hoja 4 se mantiene ("Cuenta corriente" y no
// "Movimientos") a propósito: es la que ya venía bajando el acreedor desde
// el 04/09 y la que su test verifica por nombre.
//
// Reescrito 04/09 a .xlsx real (ExcelJS) y no CSV: Excel en configuración
// regional Argentina/Español espera punto y coma como separador de listas
// (usa la coma como decimal), así que un CSV separado por comas entraba
// todo amontonado en una sola columna.

const ESTILO_TITULO = { bold: true, size: 14 } as const
const ESTILO_SUBTITULO = { bold: true, size: 12 } as const
const ESTILO_ENCABEZADO = {
  font: { bold: true, color: { argb: 'FFFFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } } as const,
}

function encabezar(fila: ExcelJS.Row) {
  fila.eachCell((celda) => {
    celda.font = ESTILO_ENCABEZADO.font
    celda.fill = ESTILO_ENCABEZADO.fill
  })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireAdminOTitularCuenta(id)

  const { searchParams } = new URL(request.url)
  const filtroLoteId = searchParams.get('lote')
  const filtroOrigen = searchParams.get('origen')
  // Los movimientos tienen su propio rango de fechas, distinto del rango de
  // MESES que manda sobre la proyección: uno mira para atrás y el otro para
  // adelante (ver el comentario largo en la página).
  const filtroDesde = searchParams.get('movDesde')
  const filtroHasta = searchParams.get('movHasta')
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

  const mesAMes = await obtenerMesAMesDelAcreedor(supabase, id, desde, hasta)
  const proyeccion = pivotarPorLote(mesAMes.filas, mesAMes.meses)

  const workbook = new ExcelJS.Workbook()

  // ------------------------------------------------------ hoja 1: mes a mes
  const hojaMeses = workbook.addWorksheet('Mes a mes')
  hojaMeses.addRow([`Mes a mes — ${persona.full_name}`]).font = ESTILO_TITULO
  hojaMeses.addRow([`${etiquetaMesCorta(mesDesde)} a ${etiquetaMesCorta(mesHasta)}`])
  hojaMeses.addRow([
    '"Le corresponde" es su parte de cada cuota según la distribución. "Le asignaste" es el total de las cuotas que cobra él. La diferencia es la plata que pasa por sus manos sin ser suya.',
  ])
  hojaMeses.addRow([])

  encabezar(
    hojaMeses.addRow(['Mes', 'Moneda', 'Le corresponde', 'Le asignaste', 'Diferencia', 'Cómo queda'])
  )

  if (mesAMes.monedas.length === 0) {
    hojaMeses.addRow(['Sin cuotas de esta persona en el rango elegido.'])
  }
  for (const moneda of mesAMes.monedas) {
    for (const mes of mesAMes.meses) {
      const celda = mesAMes.porMes[mes]?.[moneda]
      if (!celda) continue
      hojaMeses.addRow([
        etiquetaMes(mes),
        moneda,
        celda.leCorresponde,
        celda.asignado,
        celda.diferencia,
        describirDiferencia(celda.diferencia, moneda),
      ])
    }
    const total = mesAMes.totales[moneda]
    const filaTotal = hojaMeses.addRow([
      'TOTAL',
      moneda,
      total.leCorresponde,
      total.asignado,
      total.diferencia,
      describirDiferencia(total.diferencia, moneda),
    ])
    filaTotal.font = { bold: true }
  }

  hojaMeses.columns = [
    { width: 18 }, // Mes
    { width: 10 }, // Moneda
    { width: 16 }, // Le corresponde
    { width: 16 }, // Le asignaste
    { width: 14 }, // Diferencia
    { width: 34 }, // Cómo queda
  ]

  // ---------------------------------------------------- hoja 2: proyección
  const hojaProyeccion = workbook.addWorksheet('Proyección')
  hojaProyeccion.addRow([`Proyección de cobranza — ${persona.full_name}`]).font = ESTILO_TITULO
  hojaProyeccion.addRow([`${etiquetaMesCorta(mesDesde)} a ${etiquetaMesCorta(mesHasta)}`])
  hojaProyeccion.addRow([
    'Lo que le toca cobrar según los vencimientos ya cargados. No es plata cobrada: es lo que va a entrar si todos pagan en fecha.',
  ])
  hojaProyeccion.addRow([])

  encabezar(
    hojaProyeccion.addRow([
      'Lote',
      'Comprador',
      'Moneda',
      ...proyeccion.meses.map(etiquetaMesCorta),
      'Total',
    ])
  )

  for (const fila of proyeccion.filas) {
    hojaProyeccion.addRow([
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
    hojaProyeccion.addRow(['Sin cuotas asignadas a esta persona en el rango elegido.'])
  } else {
    const filaTotal = hojaProyeccion.addRow([
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

  hojaProyeccion.columns = [
    { width: 30 },
    { width: 26 },
    { width: 10 },
    ...proyeccion.meses.map(() => ({ width: 14 })),
    { width: 16 },
  ]

  // ----------------------------------------------- hoja 3: órdenes de pago
  const hojaOrdenes = workbook.addWorksheet('Órdenes de pago')
  hojaOrdenes.addRow([`Cuota por cuota — ${persona.full_name}`]).font = ESTILO_TITULO
  hojaOrdenes.addRow([`${etiquetaMesCorta(mesDesde)} a ${etiquetaMesCorta(mesHasta)}`])
  hojaOrdenes.addRow([
    'Cada cuota del rango en la que esta persona está involucrada: porque la cobra ella, porque le toca una parte, o por las dos cosas.',
  ])
  hojaOrdenes.addRow([])

  encabezar(
    hojaOrdenes.addRow([
      'Vence',
      'Lote',
      'Comprador',
      'Cuota',
      'Monto de la cuota',
      'Moneda',
      'La cobra',
      'Le asignaste',
      'Le corresponde',
      'Diferencia',
      'Estado',
    ])
  )

  for (const fila of mesAMes.filas) {
    hojaOrdenes.addRow([
      fila.fechaVencimiento,
      fila.loteIdentificador,
      fila.compradorNombre ?? '',
      fila.numero,
      fila.montoCuota,
      fila.moneda,
      fila.cobraEl ? 'Él' : 'Otro',
      fila.asignado,
      fila.leCorresponde,
      Math.round((fila.asignado - fila.leCorresponde) * 100) / 100,
      fila.pagada ? 'Pagada' : 'Pendiente',
    ])
  }

  if (mesAMes.filas.length === 0) {
    hojaOrdenes.addRow(['Sin cuotas de esta persona en el rango elegido.'])
  }

  hojaOrdenes.columns = [
    { width: 12 }, // Vence
    { width: 30 }, // Lote
    { width: 26 }, // Comprador
    { width: 8 }, // Cuota
    { width: 18 }, // Monto de la cuota
    { width: 10 }, // Moneda
    { width: 10 }, // La cobra
    { width: 16 }, // Le asignaste
    { width: 16 }, // Le corresponde
    { width: 14 }, // Diferencia
    { width: 12 }, // Estado
  ]

  // --------------------------------------------- hoja 4: cuenta corriente
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

  // Formato de la planilla que ya usaba Nicolás (captura que pasó Gabriel):
  // fecha, tipo de movimiento, concepto, loteo, mza, lote, cliente, mes de,
  // nro cuota, monto. Antes salía "Debe / Haber / Lote" y había que ir al
  // sistema para saber de qué cuota y de qué comprador se hablaba.
  const lotePorId = await traerDatosDeLotes(
    supabase,
    movimientosFiltrados
      .map((movimiento) => movimiento.lote_id)
      .filter((loteId): loteId is string => Boolean(loteId))
  )
  const cuotaPorId = await traerDatosDeCuotas(
    supabase,
    movimientosFiltrados
      .map((movimiento) => movimiento.cuota_id)
      .filter((cuotaId): cuotaId is string => Boolean(cuotaId))
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

  const hoja = workbook.addWorksheet('Cuenta corriente')

  hoja.addRow([`Cuenta corriente — ${persona.full_name}`]).font = ESTILO_TITULO
  hoja.addRow([])

  hoja.addRow(['Resumen']).font = ESTILO_SUBTITULO
  encabezar(hoja.addRow(['Moneda', 'Le corresponde (crédito)', 'Ya cobró (débito)', 'Saldo']))
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
  hoja.addRow(['Detalle']).font = ESTILO_SUBTITULO
  encabezar(hoja.addRow([...COLUMNAS_PLANILLA]))
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
