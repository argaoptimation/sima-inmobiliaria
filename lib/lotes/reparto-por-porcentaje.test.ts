import { describe, expect, it } from 'vitest'
import {
  estadoDeLaSuma,
  leerPorcentaje,
  leToca,
  repartirCuota,
  repartoCoincide,
  sumaDePorcentajes,
} from './reparto-por-porcentaje'

const acreedor = 'profile:acreedor'
const admin = 'profile:admin'
const vendedor = 'profile:vendedor'

describe('leerPorcentaje', () => {
  it('acepta de 0 a 100, con coma o punto', () => {
    expect(leerPorcentaje('85')).toBe(85)
    expect(leerPorcentaje(' 2,5 ')).toBe(2.5)
    expect(leerPorcentaje('0')).toBe(0)
    expect(leerPorcentaje('100')).toBe(100)
  })

  it('vacío, negativo, más de 100 o texto es "sin porcentaje"', () => {
    expect(leerPorcentaje('')).toBeNull()
    expect(leerPorcentaje('-1')).toBeNull()
    expect(leerPorcentaje('100.5')).toBeNull()
    expect(leerPorcentaje('abc')).toBeNull()
  })
})

describe('suma y estado', () => {
  it('suma sin errores de coma flotante', () => {
    expect(sumaDePorcentajes([
      { participanteKey: acreedor, porcentaje: 33.33 },
      { participanteKey: admin, porcentaje: 33.33 },
      { participanteKey: vendedor, porcentaje: 33.34 },
    ])).toBe(100)
  })

  it('dice si falta, sobra o está completa', () => {
    expect(estadoDeLaSuma(0)).toBe('sin_porcentajes')
    expect(estadoDeLaSuma(100)).toBe('completa')
    expect(estadoDeLaSuma(95)).toBe('falta')
    expect(estadoDeLaSuma(110)).toBe('sobra')
  })

  it('leToca redondea al centavo', () => {
    expect(leToca(30000, 85)).toBe(25500)
    expect(leToca(1234.57, 10)).toBe(123.46)
  })
})

describe('repartirCuota', () => {
  it('85 / 10 / 5 de una cuota de 1000', () => {
    expect(
      repartirCuota(1000, [
        { participanteKey: acreedor, porcentaje: 85 },
        { participanteKey: admin, porcentaje: 10 },
        { participanteKey: vendedor, porcentaje: 5 },
      ])
    ).toEqual([
      { participanteKey: acreedor, monto: '850' },
      { participanteKey: admin, monto: '100' },
      { participanteKey: vendedor, monto: '50' },
    ])
  })

  it('con decimales, la suma da exacto el monto de la cuota', () => {
    const partes = repartirCuota(1234.57, [
      { participanteKey: acreedor, porcentaje: 85 },
      { participanteKey: admin, porcentaje: 10 },
      { participanteKey: vendedor, porcentaje: 5 },
    ])
    const suma = partes.reduce((acumulado, parte) => acumulado + Math.round(Number(parte.monto) * 100), 0)
    expect(suma).toBe(123457)
  })

  it('tres tercios de 100 no pierden el centavo', () => {
    const partes = repartirCuota(100, [
      { participanteKey: acreedor, porcentaje: 33.33 },
      { participanteKey: admin, porcentaje: 33.33 },
      { participanteKey: vendedor, porcentaje: 33.34 },
    ])
    expect(partes.map((parte) => parte.monto)).toEqual(['33.33', '33.33', '33.34'])
  })

  it('si los porcentajes no llegan a 100, reparte solo esa parte', () => {
    expect(
      repartirCuota(1000, [
        { participanteKey: acreedor, porcentaje: 85 },
        { participanteKey: admin, porcentaje: 10 },
      ])
    ).toEqual([
      { participanteKey: acreedor, monto: '850' },
      { participanteKey: admin, monto: '100' },
    ])
  })

  it('deja afuera a quien tiene 0% y sin porcentajes no reparte nada', () => {
    expect(
      repartirCuota(1000, [
        { participanteKey: acreedor, porcentaje: 100 },
        { participanteKey: vendedor, porcentaje: 0 },
      ])
    ).toEqual([{ participanteKey: acreedor, monto: '1000' }])
    expect(repartirCuota(1000, [])).toEqual([])
  })
})

describe('repartoCoincide', () => {
  const esperado = [
    { participanteKey: acreedor, monto: '850' },
    { participanteKey: admin, monto: '100' },
  ]

  it('mismo reparto en otro orden o escrito distinto: coincide', () => {
    expect(repartoCoincide([{ participanteKey: admin, monto: '100.00' }, { participanteKey: acreedor, monto: '850' }], esperado)).toBe(true)
  })

  it('filas en blanco o en cero no cuentan', () => {
    expect(
      repartoCoincide(
        [...esperado, { participanteKey: '', monto: '30' }, { participanteKey: vendedor, monto: '0' }],
        esperado
      )
    ).toBe(true)
  })

  it('otro monto o alguien de más: no coincide', () => {
    expect(repartoCoincide([{ participanteKey: acreedor, monto: '800' }, { participanteKey: admin, monto: '100' }], esperado)).toBe(false)
    expect(repartoCoincide([...esperado, { participanteKey: vendedor, monto: '50' }], esperado)).toBe(false)
    expect(repartoCoincide([], esperado)).toBe(false)
  })
})
