export interface MovimientoParaSaldo {
  tipo: 'debe' | 'haber'
  monto: number
  moneda: string
}

// Saldo positivo: la empresa todavia le debe a este usuario.
// Saldo negativo: el usuario cobro de mas y le debe a la empresa.
export function calcularSaldoCuentaCorrientePorMoneda(
  movimientos: MovimientoParaSaldo[]
): Record<string, number> {
  const saldos: Record<string, number> = {}

  for (const movimiento of movimientos) {
    const signo = movimiento.tipo === 'debe' ? 1 : -1
    saldos[movimiento.moneda] = (saldos[movimiento.moneda] ?? 0) + signo * movimiento.monto
  }

  return saldos
}
