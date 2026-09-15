import { describe, it, expect } from 'vitest'
import { controlDeSuma, porcentajeDeLaCuota, paginasDeCuotas, CUOTAS_POR_PAGINA } from './control-de-suma'

const fila = (participanteKey: string, monto: string) => ({ participanteKey, monto })

describe('controlDeSuma', () => {
  it('sin filas, la cuota esta sin repartir', () => {
    expect(controlDeSuma(1000, [])).toEqual({ estado: 'sin_repartir', repartido: 0, diferencia: 1000 })
  })

  it('lo repartido igual al monto es una cuota repartida completa', () => {
    expect(controlDeSuma(1000, [fila('profile:a', '400'), fila('profile:b', '600')])).toEqual({
      estado: 'completa',
      repartido: 1000,
      diferencia: 0,
    })
  })

  it('si falta, dice cuanto', () => {
    expect(controlDeSuma(1000, [fila('profile:a', '400'), fila('profile:b', '300')])).toEqual({
      estado: 'falta',
      repartido: 700,
      diferencia: 300,
    })
  })

  it('si sobra, la diferencia es negativa', () => {
    expect(controlDeSuma(500, [fila('profile:a', '450'), fila('profile:b', '100')])).toEqual({
      estado: 'excedida',
      repartido: 550,
      diferencia: -50,
    })
  })

  it('cuenta lo mismo que se guarda: sin participante o sin monto valido, la fila no suma', () => {
    // guardarDistribucionLote descarta esas filas sin avisar; si el control
    // las sumara, diria "completa" algo que se guarda incompleto.
    expect(
      controlDeSuma(1000, [
        fila('profile:a', '500'),
        fila('', '500'),
        fila('profile:b', ''),
        fila('profile:c', 'abc'),
        fila('profile:d', '-10'),
      ])
    ).toEqual({ estado: 'falta', repartido: 500, diferencia: 500 })
  })

  it('filas cargadas pero todas invalidas siguen siendo "sin repartir"', () => {
    expect(controlDeSuma(1000, [fila('', '')])).toEqual({
      estado: 'sin_repartir',
      repartido: 0,
      diferencia: 1000,
    })
  })

  it('redondea a centavos antes de comparar', () => {
    expect(controlDeSuma(100, [fila('profile:a', '33.33'), fila('profile:b', '33.33'), fila('profile:c', '33.34')]))
      .toEqual({ estado: 'completa', repartido: 100, diferencia: 0 })
  })
})

describe('porcentajeDeLaCuota', () => {
  it('redondea a entero', () => {
    expect(porcentajeDeLaCuota(1000, '333')).toBe(33)
  })

  it('sin monto o con cuota en cero no hay porcentaje', () => {
    expect(porcentajeDeLaCuota(1000, '')).toBeNull()
    expect(porcentajeDeLaCuota(0, '100')).toBeNull()
    expect(porcentajeDeLaCuota(1000, 'abc')).toBeNull()
  })
})

describe('paginasDeCuotas', () => {
  it('de a 15', () => {
    expect(CUOTAS_POR_PAGINA).toBe(15)
    expect(paginasDeCuotas(36)).toBe(3)
    expect(paginasDeCuotas(15)).toBe(1)
    expect(paginasDeCuotas(16)).toBe(2)
  })

  it('sin cuotas hay una pagina vacia, no cero', () => {
    expect(paginasDeCuotas(0)).toBe(1)
  })
})
