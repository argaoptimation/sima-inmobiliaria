import { describe, it, expect } from 'vitest'
import { resolverAdminPorDefecto } from './admin-por-defecto'

const NICO = { id: 'nico' }
const OTRO_ADMIN = { id: 'otro' }

describe('resolverAdminPorDefecto', () => {
  it('respeta el admin ya asignado al lote', () => {
    expect(
      resolverAdminPorDefecto({
        adminIdActual: 'ya-asignado',
        administradores: [NICO],
        usuarioActualId: 'nico',
        usuarioActualEsAdministrador: true,
      })
    ).toBe('ya-asignado')
  })

  it('con un solo administrador, lo preselecciona', () => {
    expect(
      resolverAdminPorDefecto({
        adminIdActual: null,
        administradores: [NICO],
        usuarioActualId: 'cobrador',
        usuarioActualEsAdministrador: false,
      })
    ).toBe('nico')
  })

  it('con varios administradores cae al que está operando, si es admin', () => {
    expect(
      resolverAdminPorDefecto({
        adminIdActual: null,
        administradores: [NICO, OTRO_ADMIN],
        usuarioActualId: 'otro',
        usuarioActualEsAdministrador: true,
      })
    ).toBe('otro')
  })

  it('con varios administradores y un usuario que no es admin, no preselecciona nada', () => {
    expect(
      resolverAdminPorDefecto({
        adminIdActual: null,
        administradores: [NICO, OTRO_ADMIN],
        usuarioActualId: 'cobrador',
        usuarioActualEsAdministrador: false,
      })
    ).toBeNull()
  })

  it('sin ningún administrador cargado, no preselecciona nada', () => {
    expect(
      resolverAdminPorDefecto({
        adminIdActual: null,
        administradores: [],
        usuarioActualId: null,
        usuarioActualEsAdministrador: false,
      })
    ).toBeNull()
  })
})
