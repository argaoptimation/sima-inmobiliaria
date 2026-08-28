import { calcularInteresMoratorio } from '../cobranza/interes-moratorio'

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

export interface CuotaConMoraPendiente {
  id: string
  saldoPendiente: number
  fechaVencimiento: string
  // Suma de mora ya cobrada en pagos anteriores de esta cuota
  // (cuotas.mora_pagada) -- calcularInteresMoratorio recalcula la mora
  // devengada TOTAL a hoy desde fecha_vencimiento cada vez, así que hay que
  // restar lo ya cobrado para no volver a cobrarlo.
  moraPagada: number
}

export interface ImputacionConMora {
  cuotaId: string
  montoCapital: number
  montoMora: number
}

export interface ResultadoImputacionConMora {
  imputaciones: ImputacionConMora[]
  saldoNoImputado: number
}

// Misma lógica FIFO que imputarPagoFIFO, pero cada cuota primero cobra su
// mora pendiente (devengada a `hoy` menos lo ya cobrado) y recién después su
// capital -- no pasa a la cuota siguiente hasta saldar ambas cosas de la
// actual. Antes de esto, calcularInteresMoratorio era puramente informativo
// (se mostraba en pantalla pero nunca se cobraba de verdad, ver
// Notas_Decisiones_SIMA.txt); ahora el resultado se usa para descontar mora
// real del pago, ver confirmarPago en app/admin/pagos/actions.ts.
export function imputarPagoConMora(
  montoPago: number,
  cuotasOrdenadas: CuotaConMoraPendiente[],
  interesMoratorioDiarioPorcentaje: number | null,
  hoy: string
): ResultadoImputacionConMora {
  let restante = montoPago
  const imputaciones: ImputacionConMora[] = []

  for (const cuota of cuotasOrdenadas) {
    if (restante <= 0) break
    if (cuota.saldoPendiente <= 0) continue

    const moraDevengada = calcularInteresMoratorio(
      { saldoPendiente: cuota.saldoPendiente, fechaVencimiento: cuota.fechaVencimiento },
      interesMoratorioDiarioPorcentaje,
      hoy
    )
    const moraPendiente = Math.max(0, Math.round((moraDevengada - cuota.moraPagada) * 100) / 100)

    const montoMora = Math.min(restante, moraPendiente)
    restante -= montoMora

    const montoCapital = Math.min(restante, cuota.saldoPendiente)
    restante -= montoCapital

    if (montoMora > 0 || montoCapital > 0) {
      imputaciones.push({ cuotaId: cuota.id, montoCapital, montoMora })
    }
  }

  return { imputaciones, saldoNoImputado: restante }
}
