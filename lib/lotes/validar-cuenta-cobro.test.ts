import { describe, expect, it } from 'vitest'
import { tieneDatosTransferencia } from './validar-cuenta-cobro'

describe('tieneDatosTransferencia', () => {
  it('es false cuando los tres campos son null', () => {
    expect(tieneDatosTransferencia({ alias: null, banco: null, titular: null })).toBe(false)
  })

  it('es false si falta alguno de los tres, aunque los otros dos estén completos', () => {
    expect(
      tieneDatosTransferencia({ alias: 'juan.perez', banco: 'Banco Test', titular: null })
    ).toBe(false)
    expect(
      tieneDatosTransferencia({ alias: 'juan.perez', banco: '', titular: 'Juan Pérez' })
    ).toBe(false)
    expect(
      tieneDatosTransferencia({ alias: '   ', banco: 'Banco Test', titular: 'Juan Pérez' })
    ).toBe(false)
  })

  it('es true cuando los tres campos tienen contenido real', () => {
    expect(
      tieneDatosTransferencia({ alias: 'juan.perez', banco: 'Banco Test', titular: 'Juan Pérez' })
    ).toBe(true)
  })
})
