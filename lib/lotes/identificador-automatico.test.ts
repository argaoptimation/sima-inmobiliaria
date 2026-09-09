import { describe, it, expect } from 'vitest'
import { identificadorAutomatico } from './identificador-automatico'

describe('identificadorAutomatico', () => {
  it('arma el nombre con la manzana y el número, que es como los nombra Nico', () => {
    expect(identificadorAutomatico('5', '12')).toBe('Mza 5 - Lote 12')
  })

  it('acepta manzanas con letra', () => {
    expect(identificadorAutomatico('B', '14')).toBe('Mza B - Lote 14')
  })

  it('con una sola de las dos, no inventa la otra', () => {
    expect(identificadorAutomatico('5', '')).toBe('Mza 5')
    expect(identificadorAutomatico('', '12')).toBe('Lote 12')
  })

  it('sin ninguna devuelve null: el que llama tiene que pedir los datos, no guardar un lote sin nombre', () => {
    expect(identificadorAutomatico('', '')).toBeNull()
    expect(identificadorAutomatico(null, null)).toBeNull()
    expect(identificadorAutomatico(undefined, undefined)).toBeNull()
  })

  it('ignora los espacios de más', () => {
    expect(identificadorAutomatico('  5  ', '  12 ')).toBe('Mza 5 - Lote 12')
    expect(identificadorAutomatico('   ', '   ')).toBeNull()
  })

  it('no repite el loteo: eso ya es una columna aparte y la unicidad es por loteo', () => {
    expect(identificadorAutomatico('5', '12')).not.toContain('Loteo')
  })
})
