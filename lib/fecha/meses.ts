const NOMBRE_MES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

const NOMBRE_MES_CORTO = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

// '2026-10' -> 'Octubre 2026'
export function etiquetaMes(mes: string): string {
  const [anio, numeroMes] = mes.split('-').map(Number)
  return `${NOMBRE_MES[numeroMes - 1]} ${anio}`
}

// '2026-10' -> 'oct-26'. Formato de las columnas del Excel que ya usaba
// Nico para la proyección: en una tabla con 6+ columnas de meses, el nombre
// largo no entra.
export function etiquetaMesCorta(mes: string): string {
  const [anio, numeroMes] = mes.split('-').map(Number)
  return `${NOMBRE_MES_CORTO[numeroMes - 1]}-${String(anio).slice(2)}`
}

// Cantidad de días de un mes 'YYYY-MM' (día 0 del mes siguiente).
export function ultimoDiaDelMes(mes: string): number {
  const [anio, numeroMes] = mes.split('-').map(Number)
  return new Date(anio, numeroMes, 0).getDate()
}

// Mes 'YYYY-MM' a N meses del actual (0 = este mes, 5 = dentro de 5 meses).
// Solo se usa para el valor por defecto de un filtro, no para cortes de
// fecha -- por eso alcanza con la fecha local y no hace falta pasar por
// hoyArgentina().
export function mesRelativoAHoy(offset: number): string {
  const hoy = new Date()
  const fecha = new Date(hoy.getFullYear(), hoy.getMonth() + offset, 1)
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
}
