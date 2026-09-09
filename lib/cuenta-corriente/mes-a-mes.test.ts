import { describe, it, expect } from 'vitest'
import {
  resumirPorMes,
  pivotarPorLote,
  describirDiferencia,
  type FilaCuotaMesAMes,
} from './mes-a-mes'

// La resta que Nicolás mira antes de repartir cuotas. Lo que estos tests
// cuidan no es el formato de la tabla: es que "le asignaste" y "le
// corresponde" nunca se sumen entre sí ni se netéen entre monedas, porque
// de esa diferencia sale a quién le está dando plata de más.

function cuota(parcial: Partial<FilaCuotaMesAMes> = {}): FilaCuotaMesAMes {
  return {
    cuotaId: parcial.cuotaId ?? 'cuota-1',
    loteId: parcial.loteId ?? 'lote-1',
    loteIdentificador: parcial.loteIdentificador ?? 'Mza 1 - Lote 1',
    compradorNombre: parcial.compradorNombre ?? 'Comprador',
    numero: parcial.numero ?? 1,
    fechaVencimiento: parcial.fechaVencimiento ?? '2026-10-10',
    mes: parcial.mes ?? '2026-10',
    moneda: parcial.moneda ?? 'USD',
    montoCuota: parcial.montoCuota ?? 0,
    asignado: parcial.asignado ?? 0,
    leCorresponde: parcial.leCorresponde ?? 0,
    cobraEl: parcial.cobraEl ?? false,
    pagada: parcial.pagada ?? false,
  }
}

describe('resumirPorMes', () => {
  it('el ejemplo de Nico: le asignaste 900 y le corresponden 510, va a cobrar 390 de más', () => {
    const { porMes, totales } = resumirPorMes(
      [cuota({ montoCuota: 900, asignado: 900, leCorresponde: 510, cobraEl: true })],
      ['2026-10']
    )

    expect(porMes['2026-10'].USD).toEqual({ leCorresponde: 510, asignado: 900, diferencia: 390 })
    expect(totales.USD.diferencia).toBe(390)
    expect(describirDiferencia(totales.USD.diferencia, 'USD')).toBe('Va a cobrar 390 USD de más')
  })

  it('una cuota que cobra otro pero de la que le toca una parte da diferencia negativa', () => {
    const { totales } = resumirPorMes(
      [cuota({ montoCuota: 1000, asignado: 0, leCorresponde: 400, cobraEl: false })],
      ['2026-10']
    )

    expect(totales.USD).toEqual({ leCorresponde: 400, asignado: 0, diferencia: -400 })
    expect(describirDiferencia(-400, 'USD')).toBe('Le falta cobrar 400 USD')
  })

  it('cada moneda se resume por separado: un lote en pesos no compensa uno en dólares', () => {
    const { totales, monedas } = resumirPorMes(
      [
        cuota({ cuotaId: 'a', moneda: 'USD', montoCuota: 800, asignado: 800, leCorresponde: 800 }),
        cuota({ cuotaId: 'b', moneda: 'ARS', montoCuota: 500, asignado: 0, leCorresponde: 500 }),
      ],
      ['2026-10']
    )

    expect(monedas).toEqual(['ARS', 'USD'])
    expect(totales.USD.diferencia).toBe(0)
    expect(totales.ARS.diferencia).toBe(-500)
  })

  it('los meses del rango sin nada existen igual: son columnas de la tabla, no filas que se saltean', () => {
    const { porMes } = resumirPorMes([cuota({ mes: '2026-11', leCorresponde: 100 })], [
      '2026-10',
      '2026-11',
      '2026-12',
    ])

    expect(Object.keys(porMes)).toEqual(['2026-10', '2026-11', '2026-12'])
    expect(porMes['2026-10']).toEqual({})
    expect(porMes['2026-11'].USD.leCorresponde).toBe(100)
  })

  it('redondea sobre el acumulado y no cuota por cuota', () => {
    const tercio = 100 / 3
    const { totales } = resumirPorMes(
      [
        cuota({ cuotaId: 'a', leCorresponde: tercio }),
        cuota({ cuotaId: 'b', leCorresponde: tercio }),
        cuota({ cuotaId: 'c', leCorresponde: tercio }),
      ],
      ['2026-10']
    )

    expect(totales.USD.leCorresponde).toBe(100)
  })
})

describe('pivotarPorLote', () => {
  it('deja afuera los lotes donde solo cobra: la plata pasa por él pero no le corresponde', () => {
    const proyeccion = pivotarPorLote(
      [
        cuota({
          cuotaId: 'a',
          loteId: 'lote-propio',
          loteIdentificador: 'Mza 1 - Lote 1',
          montoCuota: 1000,
          asignado: 1000,
          leCorresponde: 250,
          cobraEl: true,
        }),
        cuota({
          cuotaId: 'b',
          loteId: 'lote-ajeno',
          loteIdentificador: 'Mza 2 - Lote 2',
          montoCuota: 1000,
          asignado: 1000,
          leCorresponde: 0,
          cobraEl: true,
        }),
      ],
      ['2026-10']
    )

    expect(proyeccion.filas.map((fila) => fila.loteId)).toEqual(['lote-propio'])
    expect(proyeccion.totalGeneral.USD).toBe(250)
  })

  it('suma las cuotas del mismo lote que caen en el mismo mes', () => {
    const proyeccion = pivotarPorLote(
      [
        cuota({ cuotaId: 'a', numero: 1, leCorresponde: 100 }),
        cuota({ cuotaId: 'b', numero: 2, leCorresponde: 50 }),
      ],
      ['2026-10']
    )

    expect(proyeccion.filas).toHaveLength(1)
    expect(proyeccion.filas[0].porMes['2026-10']).toBe(150)
    expect(proyeccion.filas[0].total).toBe(150)
  })
})

describe('describirDiferencia', () => {
  it('cero es "Justo" y no "0 de más"', () => {
    expect(describirDiferencia(0, 'USD')).toBe('Justo')
  })

  it('usa separador de miles: es un número que se tipea en el homebanking', () => {
    expect(describirDiferencia(1500000, 'ARS')).toBe('Va a cobrar 1.500.000 ARS de más')
  })
})
