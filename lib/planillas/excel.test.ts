import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { formatearLasFechas } from './excel'
import { fechaDePlanilla, FORMATO_FECHA_PLANILLA } from './fechas'

// Se escribe el archivo y se vuelve a leer, en vez de mirar el objeto en
// memoria: lo que importa es lo que queda guardado en el .xlsx que abre Nico.
async function escribirYReleer(libro: ExcelJS.Workbook) {
  const buffer = await libro.xlsx.writeBuffer()
  const releido = new ExcelJS.Workbook()
  await releido.xlsx.load(buffer)
  return releido
}

describe('fechaDePlanilla', () => {
  it('es ese mismo dia a medianoche UTC, que es como ExcelJS la cuenta', () => {
    expect(fechaDePlanilla('2026-09-10').toISOString()).toBe('2026-09-10T00:00:00.000Z')
  })
})

describe('formatearLasFechas', () => {
  it('toda fecha del libro queda guardada como DD/MM/AA, en cualquier hoja', async () => {
    expect(FORMATO_FECHA_PLANILLA).toBe('dd/mm/yy')

    const libro = new ExcelJS.Workbook()
    libro.addWorksheet('Una').addRow(['Fecha', fechaDePlanilla('2026-09-10')])
    libro.addWorksheet('Otra').addRow([fechaDePlanilla('2027-01-05'), 'texto', 100])

    formatearLasFechas(libro)
    const releido = await escribirYReleer(libro)

    const fecha = releido.getWorksheet('Una')!.getRow(1).getCell(2)
    expect(fecha.numFmt).toBe('dd/mm/yy')
    // Sigue siendo una fecha y no un texto: se puede ordenar y filtrar.
    expect(fecha.value).toBeInstanceOf(Date)
    expect((fecha.value as Date).toISOString()).toBe('2026-09-10T00:00:00.000Z')

    const otra = releido.getWorksheet('Otra')!.getRow(1)
    expect(otra.getCell(1).numFmt).toBe('dd/mm/yy')
    // Lo que no es fecha no se toca: un monto con formato de fecha se
    // veria como un dia de 1900.
    expect(otra.getCell(3).numFmt).toBeUndefined()
  })

  it('sin pasar por aca, la fecha queda con el formato que depende del idioma de la PC', async () => {
    // Por que existe la funcion: es lo que salia antes, y lo que va a salir
    // si algun Excel nuevo se arma sin respuestaExcel.
    const libro = new ExcelJS.Workbook()
    libro.addWorksheet('Sin formato').addRow([fechaDePlanilla('2026-09-10')])

    const releido = await escribirYReleer(libro)

    expect(releido.getWorksheet('Sin formato')!.getRow(1).getCell(1).numFmt).not.toBe('dd/mm/yy')
  })
})
