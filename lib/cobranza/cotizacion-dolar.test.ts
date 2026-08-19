import { describe, expect, it } from 'vitest'
import { convertirUsdAPesos } from './cotizacion-dolar'

describe('convertirUsdAPesos', () => {
  it('multiplica el monto en USD por la cotización', () => {
    expect(convertirUsdAPesos(100, 1500)).toBe(150000)
  })

  it('redondea a centavos', () => {
    expect(convertirUsdAPesos(33.33, 1500.5)).toBe(50011.67)
  })

  it('monto cero da cero', () => {
    expect(convertirUsdAPesos(0, 1500)).toBe(0)
  })
})
