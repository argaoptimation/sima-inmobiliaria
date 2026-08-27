// Recibe una fecha en formato ISO (YYYY-MM-DD, tal como la devuelve Postgres
// para columnas `date`) y la muestra en formato argentino DD/MM/AAAA.
// Se parsea el string a mano en vez de usar `new Date(...)` para evitar el
// corrimiento de un día que introduce interpretar "YYYY-MM-DD" como UTC
// medianoche y después formatear en la zona horaria local.
export function formatearFechaCorta(fechaISO: string): string {
  const [anio, mes, dia] = fechaISO.split('-')
  return `${dia}/${mes}/${anio}`
}
