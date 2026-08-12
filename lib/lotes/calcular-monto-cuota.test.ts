import { describe, expect, it } from 'vitest'
import { calcularMontoCuota } from './calcular-monto-cuota'

describe('calcularMontoCuota', () => {
  it('divide exacto', () => {
    expect(calcularMontoCuota(12000, 12)).toBe(1000)
  })

  it('redondea a 2 decimales cuando no divide exacto', () => {
    expect(calcularMontoCuota(1000, 3)).toBe(333.33)
  })

  it('con una sola cuota, devuelve el precio total', () => {
    expect(calcularMontoCuota(5000, 1)).toBe(5000)
  })
})
