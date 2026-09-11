import { describe, it, expect } from 'vitest'
import { posicionesDelPlan } from '@/lib/cuotas/plan-de-cuotas'
import { fechaDePlanilla } from '@/lib/planillas/fechas'
import {
  anchosDeLaPlanilla,
  armarFilasDeMovimiento,
  celdasDeFila,
  COLUMNAS_PLANILLA,
  type MovimientoCrudo,
  type DatosDeLote,
  type DatosDeCuota,
} from './filas-movimiento'

const LOTES = new Map<string, DatosDeLote>([
  [
    'lote-1',
    {
      loteo: 'Quintana',
      manzana: '4',
      numeroLote: '1',
      identificador: 'Q-M4-L1',
      clienteNombre: 'Jose Gonzalez',
    },
  ],
  [
    'lote-sin-datos',
    { loteo: null, manzana: null, numeroLote: null, identificador: 'Suelto 7', clienteNombre: null },
  ],
])

// Un lote de 24 cuotas que se refinancio: las 24 del plan original, y 20 del
// plan refinanciado que continuan la numeracion (de la 25 a la 44).
const POSICIONES = posicionesDelPlan([
  ...Array.from({ length: 24 }, (_, indice) => ({ numero: indice + 1, plan: 1 })),
  ...Array.from({ length: 20 }, (_, indice) => ({ numero: indice + 25, plan: 2 })),
])

const CUOTAS = new Map<string, DatosDeCuota>([
  ['cuota-3', { fechaVencimiento: '2026-09-08', cuotas: [POSICIONES.get(3)!] }],
  [
    'pago-fifo',
    { fechaVencimiento: '2026-09-08', cuotas: [POSICIONES.get(3)!, POSICIONES.get(4)!] },
  ],
  ['cuota-25', { fechaVencimiento: '2026-10-08', cuotas: [POSICIONES.get(25)!] }],
])

function movimiento(extra: Partial<MovimientoCrudo>): MovimientoCrudo {
  return {
    id: 'm1',
    tipo: 'debe',
    monto: 100,
    moneda: 'USD',
    cotizacion_dia: null,
    origen: 'cobro_cuota',
    fecha_evento: '2026-09-08',
    de_parte_de: null,
    detalle: null,
    lote_id: 'lote-1',
    cuota_id: 'cuota-3',
    ...extra,
  }
}

describe('armarFilasDeMovimiento', () => {
  it('reproduce la fila de cobro de cuota de la planilla de Nicolás', () => {
    const [fila] = armarFilasDeMovimiento([movimiento({})], LOTES, CUOTAS)

    expect(fila.fecha).toBe('2026-09-08')
    expect(fila.tipoMovimiento).toBe('crédito')
    expect(fila.concepto).toBe('cobro de cuota')
    expect(fila.loteo).toBe('Quintana')
    expect(fila.manzana).toBe('4')
    expect(fila.lote).toBe('1')
    expect(fila.cliente).toBe('Jose Gonzalez')
    expect(fila.mesDe).toBe('sep-26')
    expect(fila.nroCuota).toBe('3/24')
    expect(fila.monto).toBe(100)
  })

  it('una transferencia es débito y va con el monto en negativo', () => {
    const [fila] = armarFilasDeMovimiento(
      [movimiento({ tipo: 'haber', origen: 'transferencia_empresa', monto: 80 })],
      LOTES,
      CUOTAS
    )

    expect(fila.tipoMovimiento).toBe('débito')
    expect(fila.concepto).toBe('transferencia')
    expect(fila.monto).toBe(-80)
  })

  it('un movimiento sin lote ni cuota deja esas columnas VACÍAS, no con guiones', () => {
    // En una planilla un "—" rompe cualquier fórmula que le apliquen encima.
    const [fila] = armarFilasDeMovimiento(
      [
        movimiento({
          tipo: 'haber',
          origen: 'transferencia_empresa',
          monto: 80,
          lote_id: null,
          cuota_id: null,
          de_parte_de: 'pepe',
        }),
      ],
      LOTES,
      CUOTAS
    )

    expect(fila.loteo).toBe('')
    expect(fila.manzana).toBe('')
    expect(fila.lote).toBe('')
    expect(fila.mesDe).toBe('')
    expect(fila.nroCuota).toBe('')
    // Sin lote, "de parte de" es lo más parecido a un cliente que hay.
    expect(fila.cliente).toBe('pepe')
    expect(fila.monto).toBe(-80)
  })

  it('un lote sin loteo/mza/número cae al identificador en la columna Lote', () => {
    const [fila] = armarFilasDeMovimiento(
      [movimiento({ lote_id: 'lote-sin-datos', cuota_id: null })],
      LOTES,
      CUOTAS
    )

    expect(fila.loteo).toBe('')
    expect(fila.manzana).toBe('')
    expect(fila.lote).toBe('Suelto 7')
  })

  it('la suma de la columna monto es el saldo', () => {
    const filas = armarFilasDeMovimiento(
      [
        movimiento({ id: 'a', tipo: 'debe', monto: 100 }),
        movimiento({ id: 'b', tipo: 'haber', monto: 80, origen: 'transferencia_empresa' }),
      ],
      LOTES,
      CUOTAS
    )

    expect(filas.reduce((acum, fila) => acum + fila.monto, 0)).toBe(20)
  })

  it('una reversión ya viene en negativo y sigue siendo crédito, para que reste', () => {
    const [fila] = armarFilasDeMovimiento(
      [movimiento({ tipo: 'debe', monto: -100, origen: 'reversion_cobro_cuota' })],
      LOTES,
      CUOTAS
    )

    expect(fila.tipoMovimiento).toBe('crédito')
    expect(fila.monto).toBe(-100)
  })

  it('un pago que el FIFO repartio entre dos cuotas se escribe como un rango', () => {
    const [fila] = armarFilasDeMovimiento([movimiento({ cuota_id: 'pago-fifo' })], LOTES, CUOTAS)
    expect(fila.nroCuota).toBe('3-4/24')
  })

  it('una cuota del plan refinanciado dice su número y su lugar en el plan nuevo, no "25/44"', () => {
    const [fila] = armarFilasDeMovimiento([movimiento({ cuota_id: 'cuota-25' })], LOTES, CUOTAS)
    expect(fila.nroCuota).toBe('25 (1/20 del plan refinanciado)')
    expect(fila.mesDe).toBe('oct-26')
  })

  // Los encabezados y las celdas se arman en dos funciones distintas (una la
  // usa la pantalla, la otra la hoja de calculo). Si alguien agrega una
  // columna en una sola de las dos, el Excel sale corrido sin que nada falle.
  it('los encabezados, las celdas y los anchos tienen la misma cantidad de columnas', () => {
    const [fila] = armarFilasDeMovimiento([movimiento({})], LOTES, CUOTAS)
    expect(celdasDeFila(fila)).toHaveLength(COLUMNAS_PLANILLA.length)
    expect(anchosDeLaPlanilla([fila])).toHaveLength(COLUMNAS_PLANILLA.length)
  })

  it('los encabezados son los de la planilla de Nicolas, con el bloque del lote de todos los Excel', () => {
    expect([...COLUMNAS_PLANILLA]).toEqual([
      'Fecha',
      'Tipo de movimiento',
      'Concepto',
      'Loteo',
      'Mza',
      'Lote',
      'Cliente',
      'Mes de',
      'Nro cuota',
      'Monto',
      'Moneda',
      'Cotización del día',
      'Detalle',
    ])
  })

  it('las celdas salen en el orden de la planilla, con la fecha como fecha y no como texto', () => {
    const [fila] = armarFilasDeMovimiento(
      [movimiento({ detalle: 'Cuota 3 de Q-M4-L1', de_parte_de: 'Cliente 1' })],
      LOTES,
      CUOTAS
    )
    expect(celdasDeFila(fila)).toEqual([
      fechaDePlanilla('2026-09-08'),
      'crédito',
      'cobro de cuota',
      'Quintana',
      '4',
      '1',
      'Jose Gonzalez',
      'sep-26',
      '3/24',
      100,
      'USD',
      '',
      // El detalle cierra la fila: es lo que escribio una persona, y sin el
      // no queda ninguna explicacion en castellano de por que existe.
      'Cuota 3 de Q-M4-L1 — de: Cliente 1',
    ])
  })
})
