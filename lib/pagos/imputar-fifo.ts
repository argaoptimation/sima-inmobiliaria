export interface CuotaPendiente {
  id: string
  saldoPendiente: number
}

export interface Imputacion {
  cuotaId: string
  montoImputado: number
}

export interface ResultadoImputacion {
  imputaciones: Imputacion[]
  saldoNoImputado: number
}

export function imputarPagoFIFO(
  montoPago: number,
  cuotasOrdenadas: CuotaPendiente[]
): ResultadoImputacion {
  let restante = montoPago
  const imputaciones: Imputacion[] = []

  for (const cuota of cuotasOrdenadas) {
    if (restante <= 0) break
    if (cuota.saldoPendiente <= 0) continue

    const montoImputado = Math.min(restante, cuota.saldoPendiente)
    imputaciones.push({ cuotaId: cuota.id, montoImputado })
    restante -= montoImputado
  }

  return { imputaciones, saldoNoImputado: restante }
}
