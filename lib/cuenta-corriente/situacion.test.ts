import { describe, expect, it } from 'vitest'
import { describirSituacion, resumirCuentaCorrientePorMoneda } from './situacion'

describe('resumirCuentaCorrientePorMoneda', () => {
  it('separa lo que le corresponde de lo que ya cobró', () => {
    const resumen = resumirCuentaCorrientePorMoneda([
      { tipo: 'debe', monto: 400, moneda: 'USD' },
      { tipo: 'debe', monto: 400, moneda: 'USD' },
      { tipo: 'haber', monto: 1000, moneda: 'USD' },
    ])

    expect(resumen.USD).toEqual({ leCorresponde: 800, cobroDirecto: 1000, saldo: -200 })
  })

  it('distingue "nunca movió nada" de "cobró justo lo que le correspondía"', () => {
    const sinMovimientos = resumirCuentaCorrientePorMoneda([])
    expect(sinMovimientos.USD).toBeUndefined()

    const parejo = resumirCuentaCorrientePorMoneda([
      { tipo: 'debe', monto: 5000, moneda: 'USD' },
      { tipo: 'haber', monto: 5000, moneda: 'USD' },
    ])
    // Las dos dan saldo 0, pero acá se ve que movió 5.000.
    expect(parejo.USD).toEqual({ leCorresponde: 5000, cobroDirecto: 5000, saldo: 0 })
  })

  it('no mezcla monedas', () => {
    const resumen = resumirCuentaCorrientePorMoneda([
      { tipo: 'debe', monto: 800, moneda: 'USD' },
      { tipo: 'debe', monto: 150000, moneda: 'ARS' },
      { tipo: 'haber', monto: 100000, moneda: 'ARS' },
    ])

    expect(resumen.USD).toEqual({ leCorresponde: 800, cobroDirecto: 0, saldo: 800 })
    expect(resumen.ARS).toEqual({ leCorresponde: 150000, cobroDirecto: 100000, saldo: 50000 })
  })

  it('redondea al final, no en cada suma', () => {
    const resumen = resumirCuentaCorrientePorMoneda([
      { tipo: 'debe', monto: 0.1, moneda: 'USD' },
      { tipo: 'debe', monto: 0.2, moneda: 'USD' },
    ])

    expect(resumen.USD.leCorresponde).toBe(0.3)
    expect(resumen.USD.saldo).toBe(0.3)
  })

  it('el ejemplo que confirmó Gabriel: la columna de saldo suma cero entre todos', () => {
    // Lote de cuotas de 1.000, repartido 10/10/40/40. Las cuotas 1 y 2 se
    // cobraron: la 1 en la cuenta de Nicolás, la 2 en la del vendedor 1.
    const nicolas = resumirCuentaCorrientePorMoneda([
      { tipo: 'debe', monto: 100, moneda: 'USD' },
      { tipo: 'debe', monto: 100, moneda: 'USD' },
      { tipo: 'haber', monto: 1000, moneda: 'USD' },
    ])
    const acreedor = resumirCuentaCorrientePorMoneda([
      { tipo: 'debe', monto: 100, moneda: 'USD' },
      { tipo: 'debe', monto: 100, moneda: 'USD' },
    ])
    const vendedor1 = resumirCuentaCorrientePorMoneda([
      { tipo: 'debe', monto: 400, moneda: 'USD' },
      { tipo: 'debe', monto: 400, moneda: 'USD' },
      { tipo: 'haber', monto: 1000, moneda: 'USD' },
    ])
    const vendedor2 = resumirCuentaCorrientePorMoneda([
      { tipo: 'debe', monto: 400, moneda: 'USD' },
      { tipo: 'debe', monto: 400, moneda: 'USD' },
    ])

    expect(nicolas.USD.saldo).toBe(-800)
    expect(acreedor.USD.saldo).toBe(200)
    expect(vendedor1.USD.saldo).toBe(-200)
    expect(vendedor2.USD.saldo).toBe(800)

    // La propiedad que hace confiable el tablero: si no da cero, hay algo
    // mal cargado.
    const total =
      nicolas.USD.saldo + acreedor.USD.saldo + vendedor1.USD.saldo + vendedor2.USD.saldo
    expect(total).toBe(0)
  })
})

describe('describirSituacion', () => {
  it('dice la acción, no el signo', () => {
    expect(describirSituacion(200, 'USD')).toBe('Hay que darle 200 USD')
    expect(describirSituacion(-800, 'USD')).toBe('Tiene 800 USD de más')
    expect(describirSituacion(0, 'USD')).toBe('Al día')
  })

  it('nunca muestra un menos delante del número', () => {
    expect(describirSituacion(-1500.5, 'ARS')).toBe('Tiene 1500.5 ARS de más')
  })
})
