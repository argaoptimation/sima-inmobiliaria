import { describe, expect, it } from 'vitest'
import { validarSeleccionAcreedor } from './validar-seleccion-acreedor'

describe('validarSeleccionAcreedor', () => {
  it('rechaza si no se eligió nada', () => {
    const resultado = validarSeleccionAcreedor({ acreedorId: '', nombreNuevo: '', emailNuevo: '' })
    expect(resultado).toEqual({ tipo: 'invalido', error: 'Elegí un acreedor o creá uno nuevo' })
  })

  it('devuelve "nuevo" cuando se eligió crear uno y los datos están completos', () => {
    const resultado = validarSeleccionAcreedor({
      acreedorId: '__nuevo__',
      nombreNuevo: 'Carlos Martínez',
      emailNuevo: 'carlos@ejemplo.com',
    })
    expect(resultado).toEqual({
      tipo: 'nuevo',
      nombre: 'Carlos Martínez',
      email: 'carlos@ejemplo.com',
    })
  })

  it('rechaza "crear nuevo" si falta el nombre o el email', () => {
    expect(
      validarSeleccionAcreedor({ acreedorId: '__nuevo__', nombreNuevo: '', emailNuevo: 'x@x.com' })
    ).toEqual({ tipo: 'invalido', error: 'Completá el nombre y el email del acreedor nuevo' })
    expect(
      validarSeleccionAcreedor({ acreedorId: '__nuevo__', nombreNuevo: 'Carlos', emailNuevo: '' })
    ).toEqual({ tipo: 'invalido', error: 'Completá el nombre y el email del acreedor nuevo' })
  })

  it('devuelve "existente" con cualquier otro id no vacío', () => {
    const resultado = validarSeleccionAcreedor({
      acreedorId: 'abc-123',
      nombreNuevo: '',
      emailNuevo: '',
    })
    expect(resultado).toEqual({ tipo: 'existente', id: 'abc-123' })
  })
})
