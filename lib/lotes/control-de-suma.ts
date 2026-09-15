// El "control de suma" de cada cuota en la distribucion (15/09, mockup 6):
// cuanto se lleva repartido de la cuota contra lo que la cuota vale.
//
// Es un aviso y no un bloqueo. Repartir menos que el monto de la cuota se
// puede guardar desde siempre (lo cubre un e2e: 400 + 300 de una cuota de
// 1000), asi que esto solo dice como quedo; no impide nada.

export type EstadoDeSuma = 'sin_repartir' | 'completa' | 'falta' | 'excedida'

export interface ControlDeSuma {
  estado: EstadoDeSuma
  repartido: number
  // Positiva: lo que falta repartir. Negativa: lo repartido de mas.
  diferencia: number
}

// Mismo criterio que guardarDistribucionLote para descartar una fila: sin
// participante, o con un monto vacio, no numerico o negativo. Si el control
// contara filas que al guardar se tiran, diria "completa" una cuota que se
// guarda incompleta.
function montoValido(fila: { participanteKey: string; monto: string }): number | null {
  if (!fila.participanteKey) return null
  const texto = fila.monto.trim()
  if (texto === '') return null
  const monto = Number(texto)
  if (!Number.isFinite(monto) || monto < 0) return null
  return monto
}

export function controlDeSuma(
  montoCuota: number,
  filas: { participanteKey: string; monto: string }[]
): ControlDeSuma {
  const montos = filas.map(montoValido).filter((monto): monto is number => monto !== null)
  const repartido = redondear(montos.reduce((acum, monto) => acum + monto, 0))
  const diferencia = redondear(montoCuota - repartido)

  if (montos.length === 0) return { estado: 'sin_repartir', repartido, diferencia }
  if (diferencia === 0) return { estado: 'completa', repartido, diferencia }
  return { estado: diferencia > 0 ? 'falta' : 'excedida', repartido, diferencia }
}

// El porcentaje que se muestra al lado del monto de cada integrante. Solo se
// muestra: la carga sigue siendo en plata, que es lo que se guarda.
export function porcentajeDeLaCuota(montoCuota: number, monto: string): number | null {
  const texto = monto.trim()
  if (montoCuota <= 0 || texto === '') return null
  const valor = Number(texto)
  if (!Number.isFinite(valor)) return null
  return Math.round((valor / montoCuota) * 100)
}

// La matriz va de a 15 cuotas por pagina, como el mockup.
export const CUOTAS_POR_PAGINA = 15

export function paginasDeCuotas(cantidad: number): number {
  return Math.max(1, Math.ceil(cantidad / CUOTAS_POR_PAGINA))
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100
}
