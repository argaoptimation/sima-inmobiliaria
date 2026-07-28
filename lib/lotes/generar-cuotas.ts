export interface CuotaGenerada {
  numero: number
  montoBase: number
  fechaVencimiento: string
}

function sumarMeses(fechaISO: string, meses: number): string {
  const [anio, mes, dia] = fechaISO.split('-').map(Number)
  const fecha = new Date(Date.UTC(anio, mes - 1 + meses, dia))
  return fecha.toISOString().slice(0, 10)
}

export function generarCuotas(
  cantidadCuotas: number,
  montoCuotaBase: number,
  fechaPrimeraCuota: string
): CuotaGenerada[] {
  return Array.from({ length: cantidadCuotas }, (_, i) => ({
    numero: i + 1,
    montoBase: montoCuotaBase,
    fechaVencimiento: sumarMeses(fechaPrimeraCuota, i),
  }))
}
