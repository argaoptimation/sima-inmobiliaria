import { describe, expect, it } from 'vitest'
import { esContrasenaValida, mensajeContrasenaInvalida } from './validar-contrasena'

describe('esContrasenaValida', () => {
  it('acepta una contraseña de 8 caracteres con un signo', () => {
    expect(esContrasenaValida('abcdefg!')).toBe(true)
  })

  it('rechaza menos de 8 caracteres aunque tenga un signo', () => {
    expect(esContrasenaValida('abcdef!')).toBe(false)
  })

  it('rechaza 8 caracteres o más sin ningún signo', () => {
    expect(esContrasenaValida('abcdefgh')).toBe(false)
  })

  it('acepta un espacio como "signo" (no es letra ni número)', () => {
    expect(esContrasenaValida('abcdefg ')).toBe(true)
  })

  it('acepta una tilde/ñ como "signo" (no es A-Za-z0-9)', () => {
    expect(esContrasenaValida('abcdefñg')).toBe(true)
  })

  it('rechaza la cadena vacía', () => {
    expect(esContrasenaValida('')).toBe(false)
  })
})

describe('mensajeContrasenaInvalida', () => {
  it('devuelve un mensaje no vacío', () => {
    expect(mensajeContrasenaInvalida().length).toBeGreaterThan(0)
  })
})
