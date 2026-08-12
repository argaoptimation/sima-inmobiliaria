import { describe, expect, it } from 'vitest'
import { tieneRecibidoPorValido } from './validar-recibido-por'

describe('tieneRecibidoPorValido', () => {
  it('es false cuando los dos campos son null', () => {
    expect(tieneRecibidoPorValido({ recibidoPor: null, recibidoPorOtro: null })).toBe(false)
  })

  it('es false cuando recibidoPorOtro es solo espacios', () => {
    expect(tieneRecibidoPorValido({ recibidoPor: null, recibidoPorOtro: '   ' })).toBe(false)
  })

  it('es true cuando hay un recibidoPor (id de perfil) cargado', () => {
    expect(tieneRecibidoPorValido({ recibidoPor: 'uuid-de-perfil', recibidoPorOtro: null })).toBe(
      true
    )
  })

  it('es true cuando hay un recibidoPorOtro con contenido real', () => {
    expect(
      tieneRecibidoPorValido({ recibidoPor: null, recibidoPorOtro: 'Persona Externa' })
    ).toBe(true)
  })

  it('es true si por algún motivo llegan los dos cargados', () => {
    expect(
      tieneRecibidoPorValido({ recibidoPor: 'uuid-de-perfil', recibidoPorOtro: 'Persona Externa' })
    ).toBe(true)
  })
})
