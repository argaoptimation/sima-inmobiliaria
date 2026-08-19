export interface CuotaConMora {
  saldoPendiente: number
  fechaVencimiento: string
}

const MS_POR_DIA = 24 * 60 * 60 * 1000

function diasDeAtraso(fechaVencimiento: string, hoy: string): number {
  const dias = Math.round(
    (new Date(`${hoy}T00:00:00Z`).getTime() - new Date(`${fechaVencimiento}T00:00:00Z`).getTime()) /
      MS_POR_DIA
  )
  return dias > 0 ? dias : 0
}

// Interés moratorio simple (no compuesto): cada día de atraso suma el mismo
// porcentaje del saldo pendiente ACTUAL de la cuota (el que ya refleja
// cualquier pago parcial imputado), sin recalcular retroactivamente si el
// saldo bajó a mitad del período de atraso.
export function calcularInteresMoratorio(
  cuota: CuotaConMora,
  interesMoratorioDiarioPorcentaje: number | null,
  hoy: string
): number {
  if (!interesMoratorioDiarioPorcentaje || cuota.saldoPendiente <= 0) return 0

  const dias = diasDeAtraso(cuota.fechaVencimiento, hoy)
  if (dias === 0) return 0

  const interes = dias * (interesMoratorioDiarioPorcentaje / 100) * cuota.saldoPendiente
  return Math.round(interes * 100) / 100
}
