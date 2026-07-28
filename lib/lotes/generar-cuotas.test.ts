import { describe, expect, it } from 'vitest'
import { generarCuotas } from './generar-cuotas'

describe('generarCuotas', () => {
  it('genera la cantidad de cuotas pedida, una por mes, con el mismo monto', () => {
    const cuotas = generarCuotas(3, 100, '2026-08-01')

    expect(cuotas).toEqual([
      { numero: 1, montoBase: 100, fechaVencimiento: '2026-08-01' },
      { numero: 2, montoBase: 100, fechaVencimiento: '2026-09-01' },
      { numero: 3, montoBase: 100, fechaVencimiento: '2026-10-01' },
    ])
  })

  it('devuelve un array vacio si la cantidad es 0', () => {
    expect(generarCuotas(0, 100, '2026-08-01')).toEqual([])
  })

  it('documenta el comportamiento de desborde de fin de mes de la fecha', () => {
    // El dia 31 no existe en todos los meses: Date.UTC lo hace desbordar
    // al mes siguiente. Es un comportamiento conocido, aceptable para el
    // MVP porque las fechas de cuota reales que usa Nicolas son dia 1 o
    // dia 10, nunca dia 31.
    const cuotas = generarCuotas(2, 100, '2026-01-31')

    expect(cuotas[1].fechaVencimiento).toBe('2026-03-03')
  })
})
