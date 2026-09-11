import { describe, it, expect } from 'vitest'
import { nroDeCuota } from '@/lib/planillas/columnas-del-lote'
import {
  agruparPosicionesPorLoteYCiclo,
  posicionDeLaCuota,
  type CuotaDeUnPlan,
} from './traer-datos-planilla'

// La parte de la resolucion de cuotas que no necesita base: con que otras
// cuotas se cuenta cada una para escribir "3/24". Es donde estaban los dos
// errores del conteo anterior (mezclaba ciclos y mezclaba planes).

function cuotasDe(loteId: string, ciclo: number, cantidad: number, plan = 1, desde = 1): CuotaDeUnPlan[] {
  return Array.from({ length: cantidad }, (_, indice) => ({
    lote_id: loteId,
    ciclo,
    numero: desde + indice,
    plan,
  }))
}

function nro(
  posiciones: ReturnType<typeof agruparPosicionesPorLoteYCiclo>,
  cuota: CuotaDeUnPlan
) {
  return nroDeCuota([posicionDeLaCuota(posiciones, cuota)])
}

describe('agruparPosicionesPorLoteYCiclo', () => {
  it('cada lote cuenta sus propias cuotas', () => {
    const posiciones = agruparPosicionesPorLoteYCiclo([...cuotasDe('a', 1, 24), ...cuotasDe('b', 1, 6)])

    expect(nro(posiciones, { lote_id: 'a', ciclo: 1, numero: 3, plan: 1 })).toBe('3/24')
    expect(nro(posiciones, { lote_id: 'b', ciclo: 1, numero: 3, plan: 1 })).toBe('3/6')
  })

  it('una cuota de la venta anterior se cuenta contra su plan, no contra el de la venta nueva', () => {
    // Se rescindio con 12 cuotas y se volvio a vender en 36: las dos ventas
    // tienen una "cuota 3".
    const posiciones = agruparPosicionesPorLoteYCiclo([
      ...cuotasDe('lote', 1, 12),
      ...cuotasDe('lote', 2, 36),
    ])

    expect(nro(posiciones, { lote_id: 'lote', ciclo: 1, numero: 3, plan: 1 })).toBe('3/12')
    expect(nro(posiciones, { lote_id: 'lote', ciclo: 2, numero: 3, plan: 1 })).toBe('3/36')
  })

  it('despues de refinanciar, la primera cuota nueva es la 1 de 20 y no la "25 de 44"', () => {
    const posiciones = agruparPosicionesPorLoteYCiclo([
      ...cuotasDe('lote', 1, 24),
      ...cuotasDe('lote', 1, 20, 2, 25),
    ])

    expect(nro(posiciones, { lote_id: 'lote', ciclo: 1, numero: 25, plan: 2 })).toBe(
      '25 (1/20 del plan refinanciado)'
    )
    // Y un cobro viejo, de antes de refinanciar, sigue siendo "de 24".
    expect(nro(posiciones, { lote_id: 'lote', ciclo: 1, numero: 4, plan: 1 })).toBe('4/24')
  })

  it('una cuota que no esta en lo agrupado sale sin "de cuantas", en vez de con uno inventado', () => {
    expect(nro(new Map(), { lote_id: 'x', ciclo: 1, numero: 7, plan: 1 })).toBe('7')
  })
})
