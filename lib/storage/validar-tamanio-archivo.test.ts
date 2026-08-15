import { describe, expect, it } from 'vitest'
import { MAX_ARCHIVO_BYTES, excedeTamanioMaximo } from './validar-tamanio-archivo'

function archivoDeTamanio(bytes: number): File {
  return new File([new Uint8Array(bytes)], 'archivo-test.pdf', { type: 'application/pdf' })
}

describe('excedeTamanioMaximo', () => {
  it('un archivo de exactamente el límite no excede', () => {
    expect(excedeTamanioMaximo(archivoDeTamanio(MAX_ARCHIVO_BYTES))).toBe(false)
  })

  it('un archivo de un byte más que el límite excede', () => {
    expect(excedeTamanioMaximo(archivoDeTamanio(MAX_ARCHIVO_BYTES + 1))).toBe(true)
  })

  it('un archivo chico no excede', () => {
    expect(excedeTamanioMaximo(archivoDeTamanio(1024))).toBe(false)
  })
})
