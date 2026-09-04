import { describe, it, expect } from 'vitest'
import {
  validarSeleccionAcreedorPorNombre,
  OPCION_ACREEDOR_NUEVO,
} from './validar-seleccion-acreedor'

const ACREEDORES = [
  { id: 'id-ana', full_name: 'Ana Gómez' },
  { id: 'id-juan', full_name: 'Juan Pérez' },
]

describe('validarSeleccionAcreedorPorNombre', () => {
  it('rechaza cuando no se eligió nada', () => {
    const resultado = validarSeleccionAcreedorPorNombre({
      nombreElegido: '',
      acreedores: ACREEDORES,
      nombreNuevo: '',
      emailNuevo: '',
    })
    expect(resultado.tipo).toBe('invalido')
  })

  it('resuelve el id del acreedor cuyo nombre se eligió', () => {
    const resultado = validarSeleccionAcreedorPorNombre({
      nombreElegido: 'Juan Pérez',
      acreedores: ACREEDORES,
      nombreNuevo: '',
      emailNuevo: '',
    })
    expect(resultado).toEqual({ tipo: 'existente', id: 'id-juan' })
  })

  // El nombre lo tipea una persona: que sobre un espacio o cambie una
  // mayúscula no puede hacer fallar la carga del lote.
  it('ignora mayúsculas y espacios de sobra', () => {
    const resultado = validarSeleccionAcreedorPorNombre({
      nombreElegido: '  juan pérez ',
      acreedores: ACREEDORES,
      nombreNuevo: '',
      emailNuevo: '',
    })
    expect(resultado).toEqual({ tipo: 'existente', id: 'id-juan' })
  })

  it('rechaza un nombre que no está en la lista', () => {
    const resultado = validarSeleccionAcreedorPorNombre({
      nombreElegido: 'Carlos Que No Existe',
      acreedores: ACREEDORES,
      nombreNuevo: '',
      emailNuevo: '',
    })
    expect(resultado.tipo).toBe('invalido')
  })

  // Elegir el primero en silencio sería asignarle el lote a la persona
  // equivocada, así que se pide desambiguar.
  it('rechaza cuando hay dos acreedores con el mismo nombre', () => {
    const resultado = validarSeleccionAcreedorPorNombre({
      nombreElegido: 'Juan Pérez',
      acreedores: [...ACREEDORES, { id: 'id-juan-2', full_name: 'Juan Pérez' }],
      nombreNuevo: '',
      emailNuevo: '',
    })
    expect(resultado.tipo).toBe('invalido')
  })

  it('pide nombre y email cuando se elige crear uno nuevo', () => {
    expect(
      validarSeleccionAcreedorPorNombre({
        nombreElegido: OPCION_ACREEDOR_NUEVO,
        acreedores: ACREEDORES,
        nombreNuevo: '',
        emailNuevo: 'x@x.com',
      }).tipo
    ).toBe('invalido')

    expect(
      validarSeleccionAcreedorPorNombre({
        nombreElegido: OPCION_ACREEDOR_NUEVO,
        acreedores: ACREEDORES,
        nombreNuevo: 'Carlos',
        emailNuevo: '',
      }).tipo
    ).toBe('invalido')
  })

  it('acepta crear uno nuevo con nombre y email', () => {
    const resultado = validarSeleccionAcreedorPorNombre({
      nombreElegido: OPCION_ACREEDOR_NUEVO,
      acreedores: ACREEDORES,
      nombreNuevo: 'Carlos',
      emailNuevo: 'carlos@ejemplo.com',
    })
    expect(resultado).toEqual({ tipo: 'nuevo', nombre: 'Carlos', email: 'carlos@ejemplo.com' })
  })
})
