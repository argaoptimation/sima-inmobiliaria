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

export function formatearDetalleCuota({
  numero,
  fechaVencimiento,
  loteIdentificador,
}: {
  numero: number
  fechaVencimiento: string
  loteIdentificador: string
}): string {
  const [anio, mes] = fechaVencimiento.split('-').map(Number)
  return `Cuota ${numero} (${MESES[mes - 1]} ${anio}) — Lote ${loteIdentificador}`
}
