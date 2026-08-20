import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mensajeDeError } from './errores'

describe('mensajeDeError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('usa el mensaje del mapa propio del llamador si el código matchea', () => {
    const mensaje = mensajeDeError({ code: '23505' }, { '23505': 'Ese DNI ya pertenece a otro cliente' })
    expect(mensaje).toBe('Ese DNI ya pertenece a otro cliente')
  })

  it('el mapa propio pisa el mapeo genérico incluso para el mismo código', () => {
    const mensaje = mensajeDeError({ code: '23505' }, { '23505': 'Mensaje específico del caller' })
    expect(mensaje).toBe('Mensaje específico del caller')
  })

  it('sin mapa propio, usa el mapeo genérico conocido', () => {
    expect(mensajeDeError({ code: '23505' })).toBe('Ya existe un registro con esos datos.')
    expect(mensajeDeError({ code: '23503' })).toContain('datos relacionados')
    expect(mensajeDeError({ code: '23502' })).toContain('obligatorio')
    expect(mensajeDeError({ code: '42501' })).toContain('permisos')
  })

  it('código desconocido cae al mensaje genérico', () => {
    expect(mensajeDeError({ code: 'algo_no_mapeado' })).toBe(
      'No se pudo completar la operación. Volvé a intentarlo en unos minutos.'
    )
  })

  it('sin código (o sin error) cae al mensaje genérico', () => {
    expect(mensajeDeError({ message: 'algo raro' })).toBe(
      'No se pudo completar la operación. Volvé a intentarlo en unos minutos.'
    )
    expect(mensajeDeError(null)).toBe('No se pudo completar la operación. Volvé a intentarlo en unos minutos.')
    expect(mensajeDeError(undefined)).toBe(
      'No se pudo completar la operación. Volvé a intentarlo en unos minutos.'
    )
  })

  it('nunca devuelve error.message crudo, ni siquiera si coincide con el código', () => {
    const mensaje = mensajeDeError({ code: '23505', message: 'duplicate key value violates constraint' })
    expect(mensaje).not.toContain('duplicate key')
  })

  it('loguea el error crudo en consola cuando hay un error', () => {
    const spy = vi.spyOn(console, 'error')
    mensajeDeError({ code: '23505', message: 'detalle interno' })
    expect(spy).toHaveBeenCalledWith('mensajeDeError:', { code: '23505', message: 'detalle interno' })
  })

  it('no loguea nada si no hay error', () => {
    const spy = vi.spyOn(console, 'error')
    mensajeDeError(null)
    expect(spy).not.toHaveBeenCalled()
  })
})
