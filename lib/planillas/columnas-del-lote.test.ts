import { describe, it, expect } from 'vitest'
import { posicionesDelPlan } from '@/lib/cuotas/plan-de-cuotas'
import {
  anchoDeNroCuota,
  celdasDelLote,
  celdasDeLaCuota,
  nroDeCuota,
  compararLotes,
  COLUMNAS_DEL_LOTE,
  COLUMNAS_DE_LA_CUOTA,
  type DatosDeLote,
} from './columnas-del-lote'

function lote(parcial: Partial<DatosDeLote> = {}): DatosDeLote {
  return {
    loteo: 'Quintana',
    manzana: '4',
    numeroLote: '12',
    identificador: 'Q-M4-L12',
    clienteNombre: 'Jose Gonzalez',
    ...parcial,
  }
}

// Un lote de 24 cuotas donde el cliente pago hasta la 4 y refinancio el
// resto en 20: las nuevas son de la 25 a la 44.
const PLAN_ORIGINAL = Array.from({ length: 24 }, (_, indice) => ({ numero: indice + 1, plan: 1 }))
const PLAN_REFINANCIADO = Array.from({ length: 20 }, (_, indice) => ({ numero: indice + 25, plan: 2 }))
const POSICIONES = posicionesDelPlan([...PLAN_ORIGINAL, ...PLAN_REFINANCIADO])
const cuotaNumero = (numero: number) => POSICIONES.get(numero)!

describe('las columnas', () => {
  // Es el pedido entero: que los nombres y el orden sean siempre estos.
  it('son las de la planilla de Nicolas, en su orden', () => {
    expect([...COLUMNAS_DEL_LOTE, ...COLUMNAS_DE_LA_CUOTA]).toEqual([
      'Loteo',
      'Mza',
      'Lote',
      'Cliente',
      'Mes de',
      'Nro cuota',
    ])
  })
})

describe('celdasDelLote', () => {
  it('escribe loteo, manzana, numero de lote y cliente', () => {
    expect(celdasDelLote(lote())).toEqual(['Quintana', '4', '12', 'Jose Gonzalez'])
  })

  it('un lote sin numero cargado cae al identificador en la columna Lote', () => {
    expect(celdasDelLote(lote({ loteo: null, manzana: null, numeroLote: null }))).toEqual([
      '',
      '',
      'Q-M4-L12',
      'Jose Gonzalez',
    ])
  })

  it('sin lote deja las columnas vacias, y el cliente puede venir de otro lado', () => {
    expect(celdasDelLote(undefined, 'pepe')).toEqual(['', '', '', 'pepe'])
    expect(celdasDelLote(undefined)).toEqual(['', '', '', ''])
  })
})

describe('nroDeCuota', () => {
  it('en el plan original es "3/24", como la planilla de Nicolas', () => {
    expect(nroDeCuota([cuotaNumero(3)])).toBe('3/24')
  })

  it('un pago que cubrio dos cuotas se escribe como un rango', () => {
    expect(nroDeCuota([cuotaNumero(4), cuotaNumero(3)])).toBe('3-4/24')
  })

  it('despues de refinanciar dice el numero de la plataforma y su lugar en el plan nuevo', () => {
    expect(nroDeCuota([cuotaNumero(25)])).toBe('25 (1/20 del plan refinanciado)')
    expect(nroDeCuota([cuotaNumero(25), cuotaNumero(26)])).toBe(
      '25-26 (1-2/20 del plan refinanciado)'
    )
  })

  it('una cuota vieja, de antes de refinanciar, sigue siendo "de 24" y no "de 44"', () => {
    expect(nroDeCuota([cuotaNumero(4)])).toBe('4/24')
  })

  it('de la segunda refinanciacion en adelante los planes se numeran', () => {
    const posiciones = posicionesDelPlan([
      { numero: 1, plan: 1 },
      { numero: 2, plan: 2 },
      { numero: 3, plan: 3 },
      { numero: 4, plan: 3 },
    ])
    expect(nroDeCuota([posiciones.get(3)!])).toBe('3 (1/2 del plan refinanciado N° 2)')
  })

  it('si mezcla dos planes, o el plan no tiene total, va el numero solo en vez de uno que no cierra', () => {
    expect(nroDeCuota([cuotaNumero(24), cuotaNumero(25)])).toBe('24-25')
    expect(nroDeCuota([{ ...cuotaNumero(3), totalDelPlan: 0 }])).toBe('3')
  })

  it('sin cuotas no escribe nada', () => {
    expect(nroDeCuota([])).toBe('')
  })
})

describe('celdasDeLaCuota', () => {
  it('escribe el mes de vencimiento y el numero', () => {
    expect(
      celdasDeLaCuota({ fechaVencimiento: '2026-09-08', cuotas: [cuotaNumero(3)] })
    ).toEqual(['sep-26', '3/24'])
  })

  it('sin cuota deja las dos columnas vacias', () => {
    expect(celdasDeLaCuota(undefined)).toEqual(['', ''])
  })
})

describe('compararLotes', () => {
  it('ordena por loteo, manzana y lote, con los numeros como numeros', () => {
    const lotes = [
      lote({ manzana: '10', numeroLote: '1' }),
      lote({ manzana: '2', numeroLote: '10' }),
      lote({ manzana: '2', numeroLote: '9' }),
      lote({ loteo: 'Altos', manzana: '99', numeroLote: '1' }),
    ]

    expect(
      [...lotes].sort(compararLotes).map((l) => `${l.loteo} ${l.manzana}-${l.numeroLote}`)
    ).toEqual(['Altos 99-1', 'Quintana 2-9', 'Quintana 2-10', 'Quintana 10-1'])
  })
})

describe('anchoDeNroCuota', () => {
  it('se abre para el texto de un plan refinanciado, sin pasarse de 40', () => {
    expect(anchoDeNroCuota(['3/24'])).toBe(12)
    expect(anchoDeNroCuota(['3/24', '25 (1/20 del plan refinanciado)'])).toBe(33)
    expect(anchoDeNroCuota(['x'.repeat(80)])).toBe(40)
  })
})
