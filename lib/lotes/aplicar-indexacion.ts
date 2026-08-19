export interface CuotaIndexable {
  id: string
  saldoPendiente: number
  fechaVencimiento: string
}

export interface AjusteResultado {
  cuotaId: string
  saldoPendienteNuevo: number
}

// Dado un período "YYYY-MM-01" (el mes cuyo índice se acaba de cargar),
// devuelve el rango del mes SIGUIENTE -- "a mes vencido": el índice de
// mayo se aplica a las cuotas que vencen en junio.
export function calcularRangoMesSiguiente(periodo: string): { desde: string; hastaExclusive: string } {
  const [anio, mes] = periodo.split('-').map(Number)
  const mesSiguiente = mes === 12 ? 1 : mes + 1
  const anioMesSiguiente = mes === 12 ? anio + 1 : anio
  const mesDespues = mesSiguiente === 12 ? 1 : mesSiguiente + 1
  const anioMesDespues = mesSiguiente === 12 ? anioMesSiguiente + 1 : anioMesSiguiente

  const dosDigitos = (n: number) => String(n).padStart(2, '0')

  return {
    desde: `${anioMesSiguiente}-${dosDigitos(mesSiguiente)}-01`,
    hastaExclusive: `${anioMesDespues}-${dosDigitos(mesDespues)}-01`,
  }
}

export function calcularAjusteIndexacion(
  porcentaje: number,
  fechaDesde: string,
  cuotas: CuotaIndexable[]
): AjusteResultado[] {
  return cuotas
    .filter((cuota) => cuota.saldoPendiente > 0 && cuota.fechaVencimiento >= fechaDesde)
    .map((cuota) => ({
      cuotaId: cuota.id,
      saldoPendienteNuevo: Math.round(cuota.saldoPendiente * (1 + porcentaje / 100) * 100) / 100,
    }))
}
