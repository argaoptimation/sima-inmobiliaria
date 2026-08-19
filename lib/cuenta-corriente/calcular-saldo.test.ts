import { describe, expect, it } from 'vitest'
import { calcularSaldoCuentaCorrientePorMoneda } from './calcular-saldo'

describe('calcularSaldoCuentaCorrientePorMoneda', () => {
  it('sin movimientos, no hay saldo para ninguna moneda', () => {
    expect(calcularSaldoCuentaCorrientePorMoneda([])).toEqual({})
  })

  it('caso 1 de Nico: un debe de la cuota, sin haber -- saldo positivo (la empresa le debe)', () => {
    const saldo = calcularSaldoCuentaCorrientePorMoneda([{ tipo: 'debe', monto: 80, moneda: 'USD' }])
    expect(saldo).toEqual({ USD: 80 })
  })

  it('caso 2 de Nico: debe de 80 + haber de 100 (cobro directo) -- saldo -20 (el le debe a la empresa)', () => {
    const saldo = calcularSaldoCuentaCorrientePorMoneda([
      { tipo: 'debe', monto: 80, moneda: 'USD' },
      { tipo: 'haber', monto: 100, moneda: 'USD' },
    ])
    expect(saldo).toEqual({ USD: -20 })
  })

  it('una reversion (debe negativo) descuenta del debe acumulado', () => {
    const saldo = calcularSaldoCuentaCorrientePorMoneda([
      { tipo: 'debe', monto: 80, moneda: 'USD' },
      { tipo: 'debe', monto: -80, moneda: 'USD' },
    ])
    expect(saldo).toEqual({ USD: 0 })
  })

  it('mantiene monedas separadas, sin mezclar USD y ARS', () => {
    const saldo = calcularSaldoCuentaCorrientePorMoneda([
      { tipo: 'debe', monto: 80, moneda: 'USD' },
      { tipo: 'haber', monto: 5000, moneda: 'ARS' },
    ])
    expect(saldo).toEqual({ USD: 80, ARS: -5000 })
  })
})
