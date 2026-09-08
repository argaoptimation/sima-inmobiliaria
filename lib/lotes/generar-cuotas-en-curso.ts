import { sumarMeses, type CuotaGenerada } from './generar-cuotas'

export interface CuotaEnCurso extends CuotaGenerada {
  // Ya estaba cobrada antes de usar la plataforma: se carga saldada, sin
  // pago ni distribución (ver migración 0058).
  yaPagada: boolean
}

export interface PlanEnCurso {
  cuotasYaPagadas: number
  cuotasPendientes: number
  montoCuota: number
  // Vencimiento de la primera cuota que TODAVÍA se debe. Es el dato que
  // Nicolás sí tiene a mano; las fechas viejas se deducen hacia atrás.
  fechaProximaCuota: string
}

export type ResultadoPlanEnCurso =
  | { valido: true; cuotas: CuotaEnCurso[]; fechaPrimeraCuota: string }
  | { valido: false; error: string }

// Arma el plan de cuotas de un lote que ya estaba vendido y a mitad de
// camino cuando se lo carga al sistema.
//
// La numeración sigue siendo la real (si pagó 18 y le quedan 42, las cuotas
// van de la 1 a la 60), porque el cliente y Nicolás hablan de "la cuota 19",
// no de "la primera del sistema". Las viejas se numeran y fechan hacia atrás
// a partir de la próxima a vencer, un mes por cuota.
//
// Todas llevan el mismo monto: el de hoy. Los montos históricos reales
// cambiaron con la indexación y nadie los tiene lote por lote -- por eso las
// viejas quedan marcadas `migrada`, para que la pantalla pueda aclarar que
// ese número es informativo y no una cobranza que pasó por el sistema.
export function generarPlanEnCurso(plan: PlanEnCurso): ResultadoPlanEnCurso {
  const { cuotasYaPagadas, cuotasPendientes, montoCuota, fechaProximaCuota } = plan

  if (!Number.isInteger(cuotasYaPagadas) || cuotasYaPagadas < 0) {
    return { valido: false, error: 'Las cuotas ya pagadas tienen que ser un número entero de 0 o más' }
  }

  if (!Number.isInteger(cuotasPendientes) || cuotasPendientes < 1) {
    return { valido: false, error: 'Tiene que quedar al menos una cuota pendiente' }
  }

  if (cuotasYaPagadas + cuotasPendientes > 600) {
    return { valido: false, error: 'Entre pagadas y pendientes no puede haber más de 600 cuotas' }
  }

  if (!Number.isFinite(montoCuota) || montoCuota <= 0) {
    return { valido: false, error: 'El monto de la cuota tiene que ser mayor a cero' }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaProximaCuota)) {
    return { valido: false, error: 'Ingresá la fecha de vencimiento de la próxima cuota' }
  }

  const total = cuotasYaPagadas + cuotasPendientes

  const cuotas = Array.from({ length: total }, (_, indice): CuotaEnCurso => {
    const numero = indice + 1
    return {
      numero,
      montoBase: montoCuota,
      // Para la primera pendiente (numero = cuotasYaPagadas + 1) el
      // desplazamiento es 0, o sea la fecha que cargó Nicolás; hacia atrás
      // da negativo y hacia adelante positivo. Una sola fórmula para las
      // dos mitades.
      fechaVencimiento: sumarMeses(fechaProximaCuota, numero - cuotasYaPagadas - 1),
      yaPagada: numero <= cuotasYaPagadas,
    }
  })

  return { valido: true, cuotas, fechaPrimeraCuota: cuotas[0].fechaVencimiento }
}
