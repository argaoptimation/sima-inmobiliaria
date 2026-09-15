// El detalle del lote resumido (14/09, pedido de Gabriel). Con un plan de
// 60 cuotas la pantalla mostraba las 60 filas, al lado 60 tarjetas de pago y
// abajo 60 ajustes por índice, y "Datos del lote" quedaba a varios metros de
// scroll. Cada lista muestra ahora 5 y un botón despliega el resto.
//
// Las tres listas crecen con el plan, y la de pagos va en la columna de al
// lado: resumir solo las cuotas no acortaba nada, porque la grilla toma el
// alto de la columna más larga.

export const ELEMENTOS_EN_EL_RESUMEN = 5

export interface CuotaDelDetalle {
  numero: number
  montoBase: number
  montoAjustado: number
  saldoPendiente: number
  fechaVencimiento: string
  refinanciada: boolean
}

export type EstadoDeCuota = 'pagada' | 'vencida' | 'por_vencer' | 'refinanciada' | 'planificada'

// Refinanciar deja la cuota vieja con saldo 0, así que por saldo solo se
// leía como pagada. No lo está: su deuda pasó a las cuotas del plan nuevo.
export function estadoDeCuota(
  cuota: Pick<CuotaDelDetalle, 'saldoPendiente' | 'fechaVencimiento' | 'refinanciada'>,
  loteVendido: boolean,
  hoy: string
): EstadoDeCuota {
  if (cuota.refinanciada) return 'refinanciada'
  if (cuota.saldoPendiente <= 0) return 'pagada'
  // Un lote sin vender no le debe nada a nadie: las cuotas son el plan.
  if (!loteVendido) return 'planificada'
  return cuota.fechaVencimiento < hoy ? 'vencida' : 'por_vencer'
}

export interface ConteoDeCuotas {
  pagadas: number
  vencidas: number
  porVencer: number
  refinanciadas: number
  planificadas: number
  // Las que forman el plan que se cobra hoy: todas menos las refinanciadas.
  vivas: number
}

export function contarCuotas(
  cuotas: Pick<CuotaDelDetalle, 'saldoPendiente' | 'fechaVencimiento' | 'refinanciada'>[],
  loteVendido: boolean,
  hoy: string
): ConteoDeCuotas {
  const conteo: ConteoDeCuotas = {
    pagadas: 0,
    vencidas: 0,
    porVencer: 0,
    refinanciadas: 0,
    planificadas: 0,
    vivas: 0,
  }

  for (const cuota of cuotas) {
    const estado = estadoDeCuota(cuota, loteVendido, hoy)
    if (estado === 'pagada') conteo.pagadas++
    else if (estado === 'vencida') conteo.vencidas++
    else if (estado === 'por_vencer') conteo.porVencer++
    else if (estado === 'refinanciada') conteo.refinanciadas++
    else conteo.planificadas++
  }

  conteo.vivas = cuotas.length - conteo.refinanciadas
  return conteo
}

// Qué cuotas se ven sin desplegar: las 2 últimas pagadas, la próxima a
// cobrar y las 2 que siguen, como lo pidió Gabriel.
//
// "La próxima a cobrar" es la primera con saldo, aunque esté vencida hace
// meses y no la del mes: los pagos se imputan en ese orden, así que es la
// que cancela el próximo pago que entre.
//
// Las refinanciadas se ven solo desplegando. Son historial, y en un lote
// refinanciado ocupaban justo los lugares de "las 2 anteriores".
export function cuotasDelResumen(
  cuotas: Pick<CuotaDelDetalle, 'numero' | 'saldoPendiente' | 'refinanciada'>[],
  cantidad = ELEMENTOS_EN_EL_RESUMEN
): Set<number> {
  if (cuotas.length <= cantidad) return new Set(cuotas.map((cuota) => cuota.numero))

  const vivas = cuotas
    .filter((cuota) => !cuota.refinanciada)
    .sort((a, b) => a.numero - b.numero)

  if (vivas.length <= cantidad) return new Set(vivas.map((cuota) => cuota.numero))

  const primeraConSaldo = vivas.findIndex((cuota) => cuota.saldoPendiente > 0)
  // Con todo pagado, la "próxima" cae después de la última.
  const proxima = primeraConSaldo === -1 ? vivas.length : primeraConSaldo
  const anteriores = Math.floor((cantidad - 1) / 2)

  // En los bordes del plan la ventana se corre en vez de achicarse: al
  // principio no hay pagadas que mostrar y al final no hay cuotas por delante.
  const desde = Math.max(0, Math.min(proxima - anteriores, vivas.length - cantidad))

  return new Set(vivas.slice(desde, desde + cantidad).map((cuota) => cuota.numero))
}

// Qué pagos se ven sin desplegar. Vienen del más nuevo al más viejo. Los que
// esperan confirmación entran siempre, aunque sean viejos: el botón de
// confirmar está en su tarjeta, y esconderlo es esconder un pendiente.
export function pagosDelResumen(
  pagos: { id: string; estado: string }[],
  cantidad = ELEMENTOS_EN_EL_RESUMEN
): Set<string> {
  const sinConfirmar = pagos.filter((pago) => pago.estado !== 'confirmado').length
  let lugaresParaConfirmados = Math.max(0, cantidad - sinConfirmar)

  const ids = new Set<string>()
  for (const pago of pagos) {
    if (pago.estado !== 'confirmado') {
      ids.add(pago.id)
    } else if (lugaresParaConfirmados > 0) {
      ids.add(pago.id)
      lugaresParaConfirmados--
    }
  }
  return ids
}

// Las posiciones de los últimos elementos de una lista cronológica (el
// historial de índice va del ajuste más viejo al más nuevo).
export function ultimosDelResumen(largo: number, cantidad = ELEMENTOS_EN_EL_RESUMEN): Set<number> {
  const desde = Math.max(0, largo - cantidad)
  return new Set(Array.from({ length: largo - desde }, (_, i) => desde + i))
}

export interface AvanceDelPlan {
  total: number
  cobrado: number
  porcentaje: number | null
}

// Cuánto del plan ya entró, para la barra de la tarjeta de precio.
//
// Las refinanciadas no suman su monto: su saldo en cero no es plata cobrada,
// es deuda que pasó a las cuotas nuevas, y esas ya están en el total. Contar
// las dos cosas inflaba el pactado y el cobrado a la vez. De una refinanciada
// solo cuenta lo que se le llegó a pagar antes de refinanciar, que es lo que
// dicen sus imputaciones.
export function avanceDelPlan(
  cuotas: Pick<CuotaDelDetalle, 'montoBase' | 'montoAjustado' | 'saldoPendiente' | 'refinanciada'>[],
  cobradoDeLasRefinanciadas: number
): AvanceDelPlan {
  const vivas = cuotas.filter((cuota) => !cuota.refinanciada)
  const pactado = vivas.reduce((acum, cuota) => acum + (cuota.montoAjustado || cuota.montoBase), 0)
  const saldo = vivas.reduce((acum, cuota) => acum + cuota.saldoPendiente, 0)

  const total = redondear(pactado + cobradoDeLasRefinanciadas)
  const cobrado = redondear(total - saldo)
  const porcentaje =
    total > 0 ? Math.min(100, Math.max(0, Math.round((cobrado / total) * 100))) : null

  return { total, cobrado, porcentaje }
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100
}
