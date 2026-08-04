import { describe, expect, it } from 'vitest'
import { tieneDatosTransferencia } from './validar-cuenta-cobro'

describe('tieneDatosTransferencia', () => {
  it('es false cuando es null', () => {
    expect(tieneDatosTransferencia(null)).toBe(false)
  })

  it('es false cuando es string vacío o solo espacios', () => {
    expect(tieneDatosTransferencia('')).toBe(false)
    expect(tieneDatosTransferencia('   ')).toBe(false)
  })

  it('es true cuando hay contenido real', () => {
    expect(tieneDatosTransferencia('Alias: juan.perez')).toBe(true)
  })
})
