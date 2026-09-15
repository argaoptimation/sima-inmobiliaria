import { describe, expect, it } from 'vitest'
import { filtrarLoteosPorNombre } from './filtrar-loteos'

const loteos = [{ nombre: 'San José' }, { nombre: 'Barrio Norte' }, { nombre: 'Norte Chico' }]

describe('filtrarLoteosPorNombre', () => {
  it('sin texto devuelve todos, en el mismo orden', () => {
    expect(filtrarLoteosPorNombre(loteos, '')).toEqual(loteos)
    expect(filtrarLoteosPorNombre(loteos, undefined)).toEqual(loteos)
    expect(filtrarLoteosPorNombre(loteos, '   ')).toEqual(loteos)
  })

  it('encuentra por parte del nombre, sin importar mayúsculas', () => {
    expect(filtrarLoteosPorNombre(loteos, 'NORTE')).toEqual([{ nombre: 'Barrio Norte' }, { nombre: 'Norte Chico' }])
  })

  it('ignora los acentos de los dos lados', () => {
    expect(filtrarLoteosPorNombre(loteos, 'san jose')).toEqual([{ nombre: 'San José' }])
    expect(filtrarLoteosPorNombre([{ nombre: 'San Jose' }], 'josé')).toEqual([{ nombre: 'San Jose' }])
  })

  it('no le importan los espacios de más', () => {
    expect(filtrarLoteosPorNombre(loteos, '  barrio   norte ')).toEqual([{ nombre: 'Barrio Norte' }])
  })

  it('sin coincidencias devuelve una lista vacía', () => {
    expect(filtrarLoteosPorNombre(loteos, 'sur')).toEqual([])
  })
})
