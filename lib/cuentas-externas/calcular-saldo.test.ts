import { describe, expect, it } from 'vitest'
import { calcularSaldoPorMoneda } from './calcular-saldo'

describe('calcularSaldoPorMoneda', () => {
  it('un débito solo deja saldo positivo (le debemos)', () => {
    expect(
      calcularSaldoPorMoneda([{ tipo: 'debito', monto: 2000, moneda: 'ARS' }])
    ).toEqual({ ARS: 2000 })
  })

  it('un crédito solo deja saldo negativo (le pagamos sin deberle)', () => {
    expect(
      calcularSaldoPorMoneda([{ tipo: 'credito', monto: 500, moneda: 'USD' }])
    ).toEqual({ USD: -500 })
  })

  it('débito y crédito de la misma moneda se compensan', () => {
    expect(
      calcularSaldoPorMoneda([
        { tipo: 'debito', monto: 2000, moneda: 'ARS' },
        { tipo: 'credito', monto: 1500, moneda: 'ARS' },
      ])
    ).toEqual({ ARS: 500 })
  })

  it('monedas distintas se acumulan por separado', () => {
    expect(
      calcularSaldoPorMoneda([
        { tipo: 'debito', monto: 2000, moneda: 'ARS' },
        { tipo: 'debito', monto: 100, moneda: 'USD' },
      ])
    ).toEqual({ ARS: 2000, USD: 100 })
  })

  it('sin movimientos, saldo vacío', () => {
    expect(calcularSaldoPorMoneda([])).toEqual({})
  })
})
