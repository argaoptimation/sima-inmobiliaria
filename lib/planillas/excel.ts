import ExcelJS from 'exceljs'
import { NextResponse } from 'next/server'
import { FORMATO_FECHA_PLANILLA } from './fechas'

// Lo que comparten los cuatro Excel de la plataforma: el del acreedor, el
// resumen de transferencias, el de una cuenta externa y el cierre de caja.
//
// Hasta el 11/09 cada export tenia su propia copia de los estilos y del
// armado de la respuesta. Ahora pasan todos por respuestaExcel, que es donde
// se les pone el formato a las fechas: una sola puerta, asi ningun Excel
// puede quedar con las fechas en el formato de la base.

export const ESTILO_TITULO: Partial<ExcelJS.Font> = { bold: true, size: 14 }
export const ESTILO_SUBTITULO: Partial<ExcelJS.Font> = { bold: true, size: 12 }

const FUENTE_ENCABEZADO: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } }
const RELLENO_ENCABEZADO: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F2937' },
}

export function encabezar(fila: ExcelJS.Row) {
  fila.eachCell((celda) => {
    celda.font = FUENTE_ENCABEZADO
    celda.fill = RELLENO_ENCABEZADO
  })
}

// Toda celda que tenga una fecha sale DD/MM/AA (ver fechas.ts). Se recorre
// el libro entero justo antes de escribirlo, y no se aplica al armar cada
// fila: asi una hoja o una columna de fecha que se agregue manana no puede
// olvidarse de hacerlo.
export function formatearLasFechas(libro: ExcelJS.Workbook) {
  libro.eachSheet((hoja) => {
    hoja.eachRow((fila) => {
      fila.eachCell((celda) => {
        if (celda.value instanceof Date) celda.numFmt = FORMATO_FECHA_PLANILLA
      })
    })
  })
}

export async function respuestaExcel(libro: ExcelJS.Workbook, nombreArchivo: string) {
  formatearLasFechas(libro)
  const buffer = await libro.xlsx.writeBuffer()

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
    },
  })
}
