// Recibe una fecha en formato ISO (YYYY-MM-DD, tal como la devuelve Postgres
// para columnas `date`) y la muestra en formato argentino DD/MM/AAAA.
// Se parsea el string a mano en vez de usar `new Date(...)` para evitar el
// corrimiento de un día que introduce interpretar "YYYY-MM-DD" como UTC
// medianoche y después formatear en la zona horaria local.
export function formatearFechaCorta(fechaISO: string): string {
  const [anio, mes, dia] = fechaISO.split('-')
  return `${dia}/${mes}/${anio}`
}

// "2026-09-10" -> "10/09/26". Para el texto suelto de los Excel (el titulo
// del cierre de caja, "Generado el ..."), que tiene que leerse igual que las
// celdas de fecha de esas mismas planillas (ver lib/planillas/fechas.ts).
// Las pantallas siguen con el anio completo.
export function formatearFechaConAnioCorto(fechaISO: string): string {
  const [anio, mes, dia] = fechaISO.slice(0, 10).split('-')
  return `${dia}/${mes}/${anio.slice(2)}`
}
