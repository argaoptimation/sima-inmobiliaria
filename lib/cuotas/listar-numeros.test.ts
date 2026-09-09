import { describe, it, expect } from 'vitest'
import { listarNumerosDeCuota } from './listar-numeros'

describe('listarNumerosDeCuota', () => {
  it('sin cuotas devuelve un guion', () => {
    expect(listarNumerosDeCuota([])).toBe('—')
  })

  it('una sola cuota se nombra sola', () => {
    expect(listarNumerosDeCuota([7])).toBe('7')
  })

  it('un tramo corrido se comprime', () => {
    expect(listarNumerosDeCuota([21, 22, 23, 24, 25, 26, 27, 28, 29, 30])).toBe('21 a 30')
  })

  it('dos números seguidos también se comprimen', () => {
    expect(listarNumerosDeCuota([4, 5])).toBe('4 a 5')
  })

  it('los huecos separan tramos, porque un hueco es una cuota ya paga', () => {
    expect(listarNumerosDeCuota([3, 7, 8, 9, 15])).toBe('3, 7 a 9, 15')
  })

  it('no depende de que vengan ordenados ni sin repetir', () => {
    expect(listarNumerosDeCuota([9, 7, 8, 7])).toBe('7 a 9')
  })
})
