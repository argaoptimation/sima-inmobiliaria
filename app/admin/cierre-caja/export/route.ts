import { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { requireAdminOCobrador } from '@/lib/auth/require-admin'
import { hoyArgentina as hoyISO } from '@/lib/fecha/hoy-argentina'
import { formatearFechaConAnioCorto } from '@/lib/fecha/formatear-fecha-corta'
import { obtenerPagosDelDia, MOTIVO_ETIQUETA } from '@/lib/caja/pagos-del-dia'
import {
  traerDatosDeLotes,
  traerDatosDeCuotasPorPago,
} from '@/lib/cuenta-corriente/traer-datos-planilla'
import {
  anchoDeNroCuota,
  celdasDeLaCuota,
  celdasDelLote,
  compararLotes,
  COLUMNAS_DE_LA_CUOTA,
  COLUMNAS_DEL_LOTE,
} from '@/lib/planillas/columnas-del-lote'
import { fechaDePlanilla } from '@/lib/planillas/fechas'
import { encabezar, respuestaExcel, ESTILO_SUBTITULO, ESTILO_TITULO } from '@/lib/planillas/excel'
import { traerTodasLasFilasPorTandas } from '@/lib/supabase/traer-todas-las-filas'

// Descarga en .xlsx (planilla real, con columnas separadas -- no un CSV
// aplanado) del mismo resumen que muestra /admin/cierre-caja para un día
// puntual -- pedido de Gabriel (25-26/08) para poder compartirle a Nico un
// detalle completo del día sin tener que transcribirlo a mano.
//
// 11/09: el detalle usa las columnas de todos los Excel (Loteo | Mza | Lote
// | Cliente | Mes de | Nro cuota) en vez de una sola columna "Lote" con el
// identificador interno, y las fechas salen DD/MM/AA.
export async function GET(request: NextRequest) {
  await requireAdminOCobrador()

  const { searchParams } = new URL(request.url)
  const fechaParam = searchParams.get('fecha')
  const fecha = fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam) ? fechaParam : hoyISO()

  const supabase = await createClient()

  // Los mismos pagos que muestra la pantalla: salen de la misma función.
  const pagosDelDia = await obtenerPagosDelDia(supabase, fecha)

  const clientes = await traerTodasLasFilasPorTandas<{ id: string; full_name: string }>(
    pagosDelDia.map((pago) => pago.cliente_id),
    (tanda, inicio, fin) =>
      supabase.from('profiles').select('id, full_name').in('id', tanda).order('id').range(inicio, fin)
  )
  const nombreClientePorId = new Map(clientes.map((persona) => [persona.id, persona.full_name]))

  const lotePorId = await traerDatosDeLotes(
    supabase,
    pagosDelDia.map((pago) => pago.lote_id)
  )
  const cuotaPorPago = await traerDatosDeCuotasPorPago(
    supabase,
    pagosDelDia.map((pago) => pago.id)
  )

  const totalesPorMedioYMoneda = new Map<string, number>()
  for (const pago of pagosDelDia) {
    const clave = `${pago.medio_pago}|${pago.moneda}`
    totalesPorMedioYMoneda.set(clave, (totalesPorMedioYMoneda.get(clave) ?? 0) + pago.monto)
  }

  const filasDelDetalle = pagosDelDia
    .map((pago) => {
      const lote = lotePorId.get(pago.lote_id)
      // El cliente es el que PAGÓ y no el dueño actual del lote: si el lote
      // se rescindió y se volvió a vender, este pago sigue siendo del
      // primero.
      const quienPago = nombreClientePorId.get(pago.cliente_id) ?? null
      return {
        pago,
        lote,
        delLote: celdasDelLote(lote && quienPago ? { ...lote, clienteNombre: quienPago } : lote, quienPago),
        deLaCuota: celdasDeLaCuota(cuotaPorPago.get(pago.id)),
      }
    })
    .sort((a, b) => compararLotes(a.lote, b.lote))

  const workbook = new ExcelJS.Workbook()
  const hoja = workbook.addWorksheet('Cierre de caja')

  hoja.addRow([`Cierre de caja — ${formatearFechaConAnioCorto(fecha)}`]).font = ESTILO_TITULO
  hoja.addRow([])

  hoja.addRow(['Resumen']).font = ESTILO_SUBTITULO
  encabezar(hoja.addRow(['Medio', 'Moneda', 'Total']))
  for (const [clave, total] of totalesPorMedioYMoneda.entries()) {
    const [medio, moneda] = clave.split('|')
    hoja.addRow([medio === 'efectivo' ? 'Efectivo' : 'Transferencia', moneda, total])
  }
  if (totalesPorMedioYMoneda.size === 0) {
    hoja.addRow(['Sin movimientos este día.'])
  }

  hoja.addRow([])
  hoja.addRow(['Detalle']).font = ESTILO_SUBTITULO
  encabezar(
    hoja.addRow([
      'Fecha',
      'Medio',
      'Motivo',
      ...COLUMNAS_DEL_LOTE,
      ...COLUMNAS_DE_LA_CUOTA,
      'Monto',
      'Moneda',
    ])
  )
  for (const fila of filasDelDetalle) {
    hoja.addRow([
      fechaDePlanilla(fecha),
      fila.pago.medio_pago === 'efectivo' ? 'Efectivo' : 'Transferencia',
      MOTIVO_ETIQUETA[fila.pago.motivo] ?? fila.pago.motivo,
      ...fila.delLote,
      ...fila.deLaCuota,
      fila.pago.monto,
      fila.pago.moneda,
    ])
  }
  if (filasDelDetalle.length === 0) {
    hoja.addRow(['Ningún pago confirmado este día.'])
  }

  hoja.columns = [
    { width: 14 }, // Fecha (y el medio, en el resumen de arriba)
    { width: 14 }, // Medio
    { width: 22 }, // Motivo
    { width: 20 }, // Loteo
    { width: 8 }, // Mza
    { width: 12 }, // Lote
    { width: 26 }, // Cliente
    { width: 10 }, // Mes de
    { width: anchoDeNroCuota(filasDelDetalle.map((fila) => fila.deLaCuota[1])) }, // Nro cuota
    { width: 14 }, // Monto
    { width: 10 }, // Moneda
  ]

  // Sin barras en el nombre del archivo, que no las admite: "cierre-caja-10-09-26.xlsx".
  return respuestaExcel(
    workbook,
    `cierre-caja-${formatearFechaConAnioCorto(fecha).replaceAll('/', '-')}.xlsx`
  )
}
