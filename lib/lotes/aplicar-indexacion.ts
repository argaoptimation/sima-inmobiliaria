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

// Inversa de calcularRangoMesSiguiente: dado el vencimiento de una cuota,
// qué período de índice hace falta para poder ajustarla ("a mes vencido" —
// una cuota de enero necesita el índice de diciembre).
export function calcularPeriodoIndiceNecesario(fechaVencimiento: string): string {
  const [anio, mes] = fechaVencimiento.split('-').map(Number)
  const mesAnterior = mes === 1 ? 12 : mes - 1
  const anioMesAnterior = mes === 1 ? anio - 1 : anio
  return `${anioMesAnterior}-${String(mesAnterior).padStart(2, '0')}-01`
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

// Corrige un índice ya aplicado: revierte el porcentaje viejo (recupera el
// saldo de ANTES de ese ajuste) y aplica el porcentaje nuevo sobre esa base
// -- no resta/suma los porcentajes directamente, porque no son lineales
// (aplicar 5% y después "restar 2%" no da lo mismo que haber aplicado 3%
// directo). Solo toca cuotas que TODAVÍA tienen saldo pendiente -- una
// cuota ya saldada desde entonces nunca se revisita, mismo criterio "nunca
// retroactivo" que la aplicación original.
export function corregirAjusteIndexacion(
  porcentajeViejo: number,
  porcentajeNuevo: number,
  cuotas: CuotaIndexable[]
): AjusteResultado[] {
  return cuotas
    .filter((cuota) => cuota.saldoPendiente > 0)
    .map((cuota) => {
      const saldoAntesDelAjusteViejo = cuota.saldoPendiente / (1 + porcentajeViejo / 100)
      const saldoPendienteNuevo =
        Math.round(saldoAntesDelAjusteViejo * (1 + porcentajeNuevo / 100) * 100) / 100
      return { cuotaId: cuota.id, saldoPendienteNuevo }
    })
}
