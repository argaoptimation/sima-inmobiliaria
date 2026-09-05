import { describe, it, expect } from 'vitest'
import { calcularMontoAFinanciar } from './monto-a-financiar'
import { calcularMontoCuota } from './calcular-monto-cuota'
import { generarCuotas } from './generar-cuotas'

describe('calcularMontoAFinanciar', () => {
  it('descuenta la seña y la entrega del precio de lista', () => {
    expect(calcularMontoAFinanciar({ precioTotal: 10000, montoSena: 500, entrega: 5000 })).toBe(4500)
  })

  it('sin seña ni entrega devuelve el precio de lista', () => {
    expect(calcularMontoAFinanciar({ precioTotal: 10000, montoSena: 0, entrega: 0 })).toBe(10000)
  })

  it('descuenta solo la seña cuando no hay entrega', () => {
    expect(calcularMontoAFinanciar({ precioTotal: 10000, montoSena: 500, entrega: 0 })).toBe(9500)
  })

  it('devuelve 0 cuando la seña y la entrega cubren todo el precio', () => {
    expect(calcularMontoAFinanciar({ precioTotal: 10000, montoSena: 500, entrega: 9500 })).toBe(0)
  })

  it('devuelve negativo si se entregó de más (el llamador tiene que rechazarlo)', () => {
    expect(calcularMontoAFinanciar({ precioTotal: 10000, montoSena: 500, entrega: 9600 })).toBe(-100)
  })

  it('no arrastra error de punto flotante', () => {
    expect(calcularMontoAFinanciar({ precioTotal: 100.3, montoSena: 0.1, entrega: 0.2 })).toBe(100)
  })
})

describe('caso reportado: 10.000 con seña 500 y entrega 5.000 en 10 cuotas', () => {
  it('genera 10 cuotas de 450 que suman exactamente lo que falta financiar', () => {
    const aFinanciar = calcularMontoAFinanciar({ precioTotal: 10000, montoSena: 500, entrega: 5000 })
    const base = calcularMontoCuota(aFinanciar, 10)
    const cuotas = generarCuotas(10, base, '2026-10-01', aFinanciar)

    expect(cuotas).toHaveLength(10)
    expect(cuotas.every((cuota) => cuota.montoBase === 450)).toBe(true)

    const suma = Math.round(cuotas.reduce((acc, cuota) => acc + cuota.montoBase, 0) * 100) / 100
    expect(suma).toBe(4500)
    // El comprador termina pagando exactamente el precio de lista.
    expect(suma + 500 + 5000).toBe(10000)
  })

  it('la última cuota absorbe el redondeo cuando el resto no es divisible', () => {
    const aFinanciar = calcularMontoAFinanciar({ precioTotal: 10000, montoSena: 0, entrega: 1 })
    const base = calcularMontoCuota(aFinanciar, 3)
    const cuotas = generarCuotas(3, base, '2026-10-01', aFinanciar)

    const suma = Math.round(cuotas.reduce((acc, cuota) => acc + cuota.montoBase, 0) * 100) / 100
    expect(suma).toBe(9999)
  })
})
