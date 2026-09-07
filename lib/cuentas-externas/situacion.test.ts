import { describe, expect, it } from 'vitest'
import { resumirCuentaExternaPorMoneda } from './situacion'

describe('resumirCuentaExternaPorMoneda', () => {
  it('el débito es "le corresponde" y el crédito es "cobró directo"', () => {
    const resumen = resumirCuentaExternaPorMoneda([
      { tipo: 'debito', monto: 800, moneda: 'USD' },
      { tipo: 'credito', monto: 1000, moneda: 'USD' },
    ])

    expect(resumen.USD).toEqual({ leCorresponde: 800, cobroDirecto: 1000, saldo: -200 })
  })

  it('el caso real: al corralón le entró una cuota entera y le correspondía menos', () => {
    // La cuota se cobró en la cuenta externa: entra el 100% (crédito
    // automático al confirmar el pago) y de eso le corresponde una parte.
    const resumen = resumirCuentaExternaPorMoneda([
      { tipo: 'credito', monto: 1000, moneda: 'USD' },
      { tipo: 'debito', monto: 300, moneda: 'USD' },
    ])

    expect(resumen.USD.saldo).toBe(-700)
  })

  it('sin movimientos no hay nada que resumir', () => {
    expect(resumirCuentaExternaPorMoneda([])).toEqual({})
  })

  it('no mezcla monedas', () => {
    const resumen = resumirCuentaExternaPorMoneda([
      { tipo: 'debito', monto: 500, moneda: 'USD' },
      { tipo: 'debito', monto: 90000, moneda: 'ARS' },
    ])

    expect(resumen.USD.saldo).toBe(500)
    expect(resumen.ARS.saldo).toBe(90000)
  })
})
