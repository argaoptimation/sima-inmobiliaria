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

  it('sin precioTotal, se comporta igual que antes (todas las cuotas iguales)', () => {
    const cuotas = generarCuotas(3, 333.33, '2026-08-01')
    expect(cuotas.every((c) => c.montoBase === 333.33)).toBe(true)
  })

  it('con precioTotal, la ultima cuota absorbe el resto del redondeo para cerrar exacto', () => {
    const cuotas = generarCuotas(3, 333.33, '2026-08-01', 1000)

    expect(cuotas[0].montoBase).toBe(333.33)
    expect(cuotas[1].montoBase).toBe(333.33)
    expect(cuotas[2].montoBase).toBe(333.34)

    const suma = cuotas.reduce((acc, c) => acc + c.montoBase, 0)
    expect(Math.round(suma * 100) / 100).toBe(1000)
  })

  it('con precioTotal y una sola cuota, la cuota unica es el precio total exacto', () => {
    const cuotas = generarCuotas(1, 5000, '2026-08-01', 5000)
    expect(cuotas).toEqual([{ numero: 1, montoBase: 5000, fechaVencimiento: '2026-08-01' }])
  })
})
