const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

// Recibe una fecha ISO (YYYY-MM-DD, tal como la devuelve Postgres para
// columnas `date`) y devuelve el mes en letras + el año, en español --
// parseado a mano por el mismo motivo que formatearFechaCorta: `new
// Date("YYYY-MM-DD")` interpreta la fecha en UTC medianoche y al formatear
// en una zona horaria más atrasada (como Argentina) puede mostrar el mes
// anterior.
export function mesYAnioEnLetras(fechaISO: string): { mes: string; anio: string } {
  const [anio, mesNumero] = fechaISO.split('-')
  const nombreMes = MESES[Number(mesNumero) - 1] ?? mesNumero
  return { mes: nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1), anio }
}
