import { describe, expect, it } from 'vitest'
import { convertirSenaAMonedaDelLote } from './convertir-sena'

describe('convertirSenaAMonedaDelLote', () => {
  it('misma moneda: no toca nada ni necesita cotización', () => {
    expect(
      convertirSenaAMonedaDelLote({
        montoSena: 500,
        monedaSena: 'USD',
        monedaLote: 'USD',
        cotizacion: null,
      })
    ).toBe(500)
  })

  it('seña en USD sobre un lote en ARS: multiplica por la cotización del día', () => {
    // El caso que reportó Gabriel: lote de 10.000.000 ARS, seña de 100 USD.
    expect(
      convertirSenaAMonedaDelLote({
        montoSena: 100,
        monedaSena: 'USD',
        monedaLote: 'ARS',
        cotizacion: 1450,
      })
    ).toBe(145000)
  })

  it('seña en ARS sobre un lote en USD: divide por la cotización del día', () => {
    expect(
      convertirSenaAMonedaDelLote({
        montoSena: 145000,
        monedaSena: 'ARS',
        monedaLote: 'USD',
        cotizacion: 1450,
      })
    ).toBe(100)
  })

  it('redondea a dos decimales', () => {
    expect(
      convertirSenaAMonedaDelLote({
        montoSena: 1000,
        monedaSena: 'ARS',
        monedaLote: 'USD',
        cotizacion: 1450,
      })
    ).toBe(0.69)
  })

  it('sin cotización devuelve null: no se inventa un tipo de cambio', () => {
    expect(
      convertirSenaAMonedaDelLote({
        montoSena: 100,
        monedaSena: 'USD',
        monedaLote: 'ARS',
        cotizacion: null,
      })
    ).toBeNull()

    expect(
      convertirSenaAMonedaDelLote({
        montoSena: 100,
        monedaSena: 'USD',
        monedaLote: 'ARS',
        cotizacion: 0,
      })
    ).toBeNull()
  })

  it('sin seña no hay nada que convertir, ni siquiera si falta la cotización', () => {
    expect(
      convertirSenaAMonedaDelLote({
        montoSena: 0,
        monedaSena: 'USD',
        monedaLote: 'ARS',
        cotizacion: null,
      })
    ).toBe(0)
  })
})
