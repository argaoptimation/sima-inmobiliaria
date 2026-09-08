import { describe, it, expect } from 'vitest'
import { generarContrasenaInicial } from './contrasena-inicial'
import { esContrasenaValida } from './validar-contrasena'

describe('generarContrasenaInicial', () => {
  it('cumple la misma regla que se le exige a cualquier contraseña de la plataforma', () => {
    for (let i = 0; i < 50; i++) {
      expect(esContrasenaValida(generarContrasenaInicial())).toBe(true)
    }
  })

  it('no repite: cada comprador tiene la suya, no hay llave maestra', () => {
    const generadas = new Set(Array.from({ length: 200 }, () => generarContrasenaInicial()))

    expect(generadas.size).toBe(200)
  })

  it('evita los caracteres que se confunden al dictarla (O/0, I/l/1)', () => {
    for (let i = 0; i < 50; i++) {
      expect(generarContrasenaInicial()).not.toMatch(/[O0Il1]/)
    }
  })

  it('mantiene el formato dictable letras-números!', () => {
    expect(generarContrasenaInicial()).toMatch(/^[A-Z]{4}-[2-9]{4}!$/)
  })
})
