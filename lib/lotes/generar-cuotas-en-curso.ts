import { sumarMeses, type CuotaGenerada } from './generar-cuotas'

export interface CuotaEnCurso extends CuotaGenerada {
  // Ya estaba cobrada antes de usar la plataforma: se carga saldada, sin
  // pago ni distribución (ver migración 0058).
  yaPagada: boolean
}

export interface PlanEnCurso {
  cuotasYaPagadas: number
  // Un monto por cada cuota que QUEDA. Van una por una y no un monto único
  // porque en la cartera real de Nicolás las cuotas no son todas iguales
  // (08/09): hay planes con cuotas escalonadas, refinanciaciones a mitad de
  // camino y ajustes que no se aplicaron parejo. Cuando sí son todas
  // iguales, la pantalla repite el mismo número y esto no se nota.
  montosPendientes: number[]
  // Vencimiento de la primera cuota que TODAVÍA se debe. Es el dato que
  // Nicolás sí tiene a mano; las fechas viejas se deducen hacia atrás.
  fechaProximaCuota: string
}

export type ResultadoPlanEnCurso =
  | {
      valido: true
      cuotas: CuotaEnCurso[]
      fechaPrimeraCuota: string
      // Null cuando las cuotas que quedan no son todas iguales: el lote no
      // tiene un "monto de cuota" único que guardar, igual que en una venta
      // cargada en modo manual.
      montoCuotaBase: number | null
    }
  | { valido: false; error: string }

const MAX_CUOTAS = 600

// Arma el plan de cuotas de un lote que ya estaba vendido y a mitad de
// camino cuando se lo carga al sistema.
//
// La numeración sigue siendo la real (si pagó 18 y le quedan 42, las cuotas
// van de la 1 a la 60), porque el cliente y Nicolás hablan de "la cuota 19",
// no de "la primera del sistema". Las viejas se numeran y fechan hacia atrás
// a partir de la próxima a vencer, un mes por cuota.
//
// A las cuotas viejas se les pone el monto de la primera pendiente. Los
// montos históricos reales cambiaron con la indexación y nadie los tiene
// lote por lote -- por eso quedan marcadas `migrada`, para que la pantalla
// pueda aclarar que ese número es de referencia y no una cobranza que pasó
// por el sistema.
export function generarPlanEnCurso(plan: PlanEnCurso): ResultadoPlanEnCurso {
  const { cuotasYaPagadas, montosPendientes, fechaProximaCuota } = plan

  if (!Number.isInteger(cuotasYaPagadas) || cuotasYaPagadas < 0) {
    return { valido: false, error: 'Las cuotas ya pagadas tienen que ser un número entero de 0 o más' }
  }

  if (montosPendientes.length < 1) {
    return { valido: false, error: 'Tiene que quedar al menos una cuota pendiente' }
  }

  if (cuotasYaPagadas + montosPendientes.length > MAX_CUOTAS) {
    return { valido: false, error: `Entre pagadas y pendientes no puede haber más de ${MAX_CUOTAS} cuotas` }
  }

  const posicionInvalida = montosPendientes.findIndex(
    (monto) => !Number.isFinite(monto) || monto <= 0
  )

  if (posicionInvalida !== -1) {
    return {
      valido: false,
      error: `El monto de la cuota ${cuotasYaPagadas + posicionInvalida + 1} tiene que ser mayor a cero`,
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaProximaCuota)) {
    return { valido: false, error: 'Ingresá la fecha de vencimiento de la próxima cuota' }
  }

  const montoDeReferencia = montosPendientes[0]
  const total = cuotasYaPagadas + montosPendientes.length

  const cuotas = Array.from({ length: total }, (_, indice): CuotaEnCurso => {
    const numero = indice + 1
    const yaPagada = numero <= cuotasYaPagadas

    return {
      numero,
      montoBase: yaPagada ? montoDeReferencia : montosPendientes[indice - cuotasYaPagadas],
      // Para la primera pendiente (numero = cuotasYaPagadas + 1) el
      // desplazamiento es 0, o sea la fecha que cargó Nicolás; hacia atrás
      // da negativo y hacia adelante positivo. Una sola fórmula para las
      // dos mitades.
      fechaVencimiento: sumarMeses(fechaProximaCuota, numero - cuotasYaPagadas - 1),
      yaPagada,
    }
  })

  const todasIguales = montosPendientes.every((monto) => monto === montoDeReferencia)

  return {
    valido: true,
    cuotas,
    fechaPrimeraCuota: cuotas[0].fechaVencimiento,
    montoCuotaBase: todasIguales ? montoDeReferencia : null,
  }
}

// Las fechas de las cuotas que quedan, para poder rotularlas en el
// formulario ("Cuota 19 — vence 10/10/2026") mientras se cargan los montos
// uno por uno. Sin esto, el admin ve veinte casilleros iguales y tiene que
// contar con el dedo cuál es cuál.
export function vencimientosPendientes(
  cuotasYaPagadas: number,
  cantidadPendientes: number,
  fechaProximaCuota: string
): { numero: number; fechaVencimiento: string }[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaProximaCuota)) return []

  return Array.from({ length: cantidadPendientes }, (_, indice) => ({
    numero: cuotasYaPagadas + indice + 1,
    fechaVencimiento: sumarMeses(fechaProximaCuota, indice),
  }))
}
