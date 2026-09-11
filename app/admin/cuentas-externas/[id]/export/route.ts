import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import {
  anchosDeLaPlanilla,
  armarFilasDeMovimiento,
  celdasDeFila,
  COLUMNAS_PLANILLA,
} from '@/lib/cuenta-corriente/filas-movimiento'
import {
  traerDatosDeLotes,
  traerDatosDeCuotasPorPago,
} from '@/lib/cuenta-corriente/traer-datos-planilla'
import { encabezar, respuestaExcel, ESTILO_SUBTITULO, ESTILO_TITULO } from '@/lib/planillas/excel'
import { traerTodasLasFilas } from '@/lib/supabase/traer-todas-las-filas'

interface MovimientoDeCuentaExterna {
  id: string
  tipo: 'debito' | 'credito'
  monto: number
  moneda: string
  concepto: string | null
  fecha_evento: string
  de_parte_de: string | null
  origen: string | null
  lote_id: string | null
  pago_id: string | null
}

// Una cuenta externa guarda 'debito'/'credito' con el sentido invertido
// respecto de la planilla de Nicolas: aca 'debito' es lo que TODAVIA le
// debemos (suma al saldo) y 'credito' es lo que ya le transferimos (resta).
// En la planilla es al reves: el credito es lo que le queda a favor.
//
// Se traduce en vez de renombrar la base: son dos vocabularios distintos
// (el contable de la tabla y el que Nicolas usa en su Excel) y la pantalla
// tiene que hablar el segundo. 'debito' -> 'debe' (credito, positivo) y
// 'credito' -> 'haber' (debito, negativo) deja las dos cuentas corrientes
// leyendose igual.
function comoMovimientoDeCuentaCorriente(movimiento: MovimientoDeCuentaExterna) {
  return {
    id: movimiento.id,
    tipo: (movimiento.tipo === 'debito' ? 'debe' : 'haber') as 'debe' | 'haber',
    monto: movimiento.monto,
    moneda: movimiento.moneda,
    cotizacion_dia: null,
    origen: movimiento.origen ?? 'transferencia_empresa',
    fecha_evento: movimiento.fecha_evento,
    de_parte_de: movimiento.de_parte_de,
    detalle: movimiento.concepto,
    lote_id: movimiento.lote_id,
    // El movimiento de una cuenta externa no apunta a la cuota sino al pago.
    // Se le pasa el pago como si fuera la cuota, y el mapa que se arma abajo
    // esta indexado por pago_id -- ver traerDatosDeCuotasPorPago.
    cuota_id: movimiento.pago_id,
  }
}

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

  const movimientos = await traerTodasLasFilas<MovimientoDeCuentaExterna>((inicio, fin) =>
    supabase
      .from('cuentas_externas_movimientos')
      .select('id, tipo, monto, moneda, concepto, fecha_evento, de_parte_de, origen, lote_id, pago_id')
      .eq('cuenta_externa_id', id)
      .order('fecha_evento', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')
      .range(inicio, fin)
  )

  // Mismo filtro que la pantalla: la descarga respeta lo que el admin está
  // viendo en ese momento, no vuelca siempre el historial completo.
  const movimientosFiltrados = movimientos.filter((movimiento) => {
    if (filtroDesde && movimiento.fecha_evento < filtroDesde) return false
    if (filtroHasta && movimiento.fecha_evento > filtroHasta) return false
    return true
  })

  // Mismo formato de planilla que la cuenta corriente de una persona
  // (09/09, pedido de Gabriel: "replicarlo en cuentas externas incluyendo
  // los movimientos que no tienen lote").
  const adaptados = movimientosFiltrados.map(comoMovimientoDeCuentaCorriente)

  const filas = armarFilasDeMovimiento(
    adaptados,
    await traerDatosDeLotes(
      supabase,
      adaptados.map((m) => m.lote_id).filter((id): id is string => Boolean(id))
    ),
    await traerDatosDeCuotasPorPago(
      supabase,
      adaptados.map((m) => m.cuota_id).filter((id): id is string => Boolean(id))
    )
  )

  const resumenPorMoneda = new Map<string, { credito: number; debito: number; saldo: number }>()
  for (const fila of filas) {
    const actual = resumenPorMoneda.get(fila.moneda) ?? { credito: 0, debito: 0, saldo: 0 }
    if (fila.monto >= 0) actual.credito += fila.monto
    else actual.debito += -fila.monto
    actual.saldo += fila.monto
    resumenPorMoneda.set(fila.moneda, actual)
  }

  const workbook = new ExcelJS.Workbook()
  const hoja = workbook.addWorksheet('Cuenta externa')

  hoja.addRow([`Cuenta externa — ${cuentaExterna.nombre}`]).font = ESTILO_TITULO
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

  hoja.columns = anchosDeLaPlanilla(filas)

  return respuestaExcel(
    workbook,
    `cuenta-externa-${cuentaExterna.nombre.replace(/[^a-zA-Z0-9]+/g, '-')}.xlsx`
  )
}
