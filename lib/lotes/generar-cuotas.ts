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
  fechaPrimeraCuota: string,
  precioTotal?: number
): CuotaGenerada[] {
  const totalACerrar = precioTotal !== undefined ? Math.round(precioTotal * 100) / 100 : null

  return Array.from({ length: cantidadCuotas }, (_, i) => {
    const esUltima = i === cantidadCuotas - 1
    const monto =
      esUltima && totalACerrar !== null
        ? Math.round((totalACerrar - montoCuotaBase * (cantidadCuotas - 1)) * 100) / 100
        : montoCuotaBase

    return {
      numero: i + 1,
      montoBase: monto,
      fechaVencimiento: sumarMeses(fechaPrimeraCuota, i),
    }
  })
}

export function generarCuotasManual(montos: number[], fechaPrimeraCuota: string): CuotaGenerada[] {
  return montos.map((monto, indice) => ({
    numero: indice + 1,
    montoBase: monto,
    fechaVencimiento: sumarMeses(fechaPrimeraCuota, indice),
  }))
}
