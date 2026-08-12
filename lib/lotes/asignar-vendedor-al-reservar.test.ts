import { describe, expect, it } from 'vitest'
import { vendedorIdAlReservar } from './asignar-vendedor-al-reservar'

describe('vendedorIdAlReservar', () => {
  it('asigna a quien reserva si su rol es vendedor', () => {
    expect(vendedorIdAlReservar('vendedor', 'uuid-del-vendedor')).toBe('uuid-del-vendedor')
  })

  it('no asigna a nadie si reserva un cobrador', () => {
    expect(vendedorIdAlReservar('cobrador', 'uuid-del-cobrador')).toBeNull()
  })

  it('no asigna a nadie si reserva un administrador', () => {
    expect(vendedorIdAlReservar('administrador', 'uuid-del-admin')).toBeNull()
  })

  it('no asigna a nadie si reserva un acreedor', () => {
    expect(vendedorIdAlReservar('acreedor', 'uuid-del-acreedor')).toBeNull()
  })
})
