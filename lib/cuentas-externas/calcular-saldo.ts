export interface MovimientoParaSaldo {
  tipo: 'debito' | 'credito'
  monto: number
  moneda: string
}

// Saldo positivo: lo que todavia le debemos a esta cuenta externa.
// Saldo negativo: le transferimos de mas / esta a favor nuestro.
export function calcularSaldoPorMoneda(movimientos: MovimientoParaSaldo[]): Record<string, number> {
  const saldos: Record<string, number> = {}

  for (const movimiento of movimientos) {
    const signo = movimiento.tipo === 'debito' ? 1 : -1
    saldos[movimiento.moneda] = (saldos[movimiento.moneda] ?? 0) + signo * movimiento.monto
  }

  return saldos
}
