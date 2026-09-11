// Las fechas de los Excel: DD/MM/AA (11/09, pedido de Gabriel: "siempre que
// diga fechas hay que usar el formato DD/MM/AA y no el formato ingles").
//
// Hasta aca las celdas llevaban el texto crudo de la base: "2026-09-10".
//
// Ahora van como FECHAS de Excel con el formato escrito, y no como el texto
// "10/09/26", por dos motivos:
//
//   - Como texto no se ordenan ni se filtran por mes: Excel pondria el
//     "01/10/26" antes que el "10/09/26", porque compara letra por letra.
//   - El formato va explicito porque el que Excel le pone a una fecha por
//     defecto depende del idioma de la PC que abre el archivo. Probado el
//     11/09: sin formato, ExcelJS la guarda con el formato 14 de Excel, que
//     en una PC en ingles muestra el mes primero.
//
// Vive separado de excel.ts a proposito: esto lo importan tambien las
// pantallas (a traves de filas-movimiento.ts), y excel.ts arrastra la
// libreria de Excel entera.

export const FORMATO_FECHA_PLANILLA = 'dd/mm/yy'

// 'YYYY-MM-DD' -> esa fecha a medianoche UTC. UTC y no la hora local porque
// ExcelJS la convierte a numero de serie contando desde UTC: a cualquier
// otra hora el Excel mostraria el dia anterior.
export function fechaDePlanilla(fechaISO: string): Date {
  const [anio, mes, dia] = fechaISO.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(anio, mes - 1, dia))
}
