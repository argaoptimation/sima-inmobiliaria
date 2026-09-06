import { describe, expect, it } from 'vitest'
import { esEmailDePrueba, LIMITE_DIARIO_EMAILS_DE_PRUEBA } from './invitar-por-email'

describe('esEmailDePrueba', () => {
  it('reconoce las direcciones que usa el suite E2E', () => {
    expect(esEmailDePrueba('test-admin@sima-e2e.invalid')).toBe(true)
    expect(esEmailDePrueba('comprador.archivo.valido@sima-demo.invalid')).toBe(true)
    expect(esEmailDePrueba(`juan.perez.${Date.now()}@sima-e2e.invalid`)).toBe(true)
  })

  it('reconoce el resto de los dominios reservados', () => {
    expect(esEmailDePrueba('alguien@algo.test')).toBe(true)
    expect(esEmailDePrueba('alguien@algo.example')).toBe(true)
    expect(esEmailDePrueba('alguien@example.com')).toBe(true)
  })

  it('no toca una dirección real', () => {
    expect(esEmailDePrueba('nicolas@gmail.com')).toBe(false)
    expect(esEmailDePrueba('arga.optimation@gmail.com')).toBe(false)
    // El dominio real de la inmobiliaria, aunque el nombre arranque igual
    // que los de prueba.
    expect(esEmailDePrueba('info@simacor.com.ar')).toBe(false)
  })

  it('no se deja confundir por mayúsculas, espacios ni un texto sin arroba', () => {
    expect(esEmailDePrueba('  TEST-Admin@SIMA-E2E.Invalid ')).toBe(true)
    expect(esEmailDePrueba('sin-arroba')).toBe(false)
    expect(esEmailDePrueba('')).toBe(false)
  })

  it('el cupo diario es el que pidió Gabriel', () => {
    expect(LIMITE_DIARIO_EMAILS_DE_PRUEBA).toBe(80)
  })
})
