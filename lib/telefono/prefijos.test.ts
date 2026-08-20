import { describe, it, expect } from 'vitest'
import { combinarTelefono } from './prefijos'

describe('combinarTelefono', () => {
  it('concatena prefijo y número local, ambos sin símbolos', () => {
    expect(combinarTelefono('54', '9 351 123-4567')).toBe('5493511234567')
  })

  it('sin prefijo, devuelve el número local tal cual (solo dígitos)', () => {
    expect(combinarTelefono('', '5493511234567')).toBe('5493511234567')
  })

  it('sin número local, devuelve null aunque haya prefijo', () => {
    expect(combinarTelefono('54', '')).toBeNull()
    expect(combinarTelefono('54', '   ')).toBeNull()
  })

  it('ignora espacios y guiones en el prefijo', () => {
    expect(combinarTelefono(' 54 ', '9351234567')).toBe('549351234567')
  })
})
