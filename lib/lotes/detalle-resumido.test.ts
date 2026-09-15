import { describe, it, expect } from 'vitest'
import {
  estadoDeCuota,
  contarCuotas,
  cuotasDelResumen,
  pagosDelResumen,
  ultimosDelResumen,
  avanceDelPlan,
  type CuotaDelDetalle,
} from './detalle-resumido'

const HOY = '2026-09-14'

function cuota(numero: number, datos: Partial<CuotaDelDetalle> = {}): CuotaDelDetalle {
  return {
    numero,
    montoBase: 1000,
    montoAjustado: 1000,
    saldoPendiente: 1000,
    fechaVencimiento: '2027-01-10',
    refinanciada: false,
    ...datos,
  }
}

// Un plan de 60 cuotas mensuales: las primeras `pagadas` sin saldo, las
// `vencidas` siguientes impagas y ya vencidas, el resto por vencer.
function plan(cantidad: number, pagadas: number, vencidas: number): CuotaDelDetalle[] {
  return Array.from({ length: cantidad }, (_, i) => {
    const numero = i + 1
    if (numero <= pagadas) return cuota(numero, { saldoPendiente: 0, fechaVencimiento: '2025-01-10' })
    if (numero <= pagadas + vencidas) return cuota(numero, { fechaVencimiento: '2026-08-10' })
    return cuota(numero, { fechaVencimiento: '2026-10-10' })
  })
}

function numeros(conjunto: Set<number>): number[] {
  return [...conjunto].sort((a, b) => a - b)
}

describe('estadoDeCuota', () => {
  it('sin saldo está pagada, aunque haya vencido', () => {
    expect(estadoDeCuota(cuota(1, { saldoPendiente: 0, fechaVencimiento: '2020-01-01' }), true, HOY)).toBe(
      'pagada'
    )
  })

  it('con saldo y el vencimiento ya pasado está vencida', () => {
    expect(estadoDeCuota(cuota(1, { fechaVencimiento: '2026-09-13' }), true, HOY)).toBe('vencida')
  })

  it('la que vence hoy todavía no está vencida', () => {
    expect(estadoDeCuota(cuota(1, { fechaVencimiento: HOY }), true, HOY)).toBe('por_vencer')
  })

  it('un pago parcial no la da por pagada', () => {
    expect(estadoDeCuota(cuota(1, { saldoPendiente: 1, fechaVencimiento: '2026-09-01' }), true, HOY)).toBe(
      'vencida'
    )
  })

  it('la refinanciada es refinanciada, no pagada: su saldo en cero es la deuda que se mudó', () => {
    expect(estadoDeCuota(cuota(1, { saldoPendiente: 0, refinanciada: true }), true, HOY)).toBe('refinanciada')
  })

  it('en un lote sin vender ninguna cuota se debe todavía: es el plan', () => {
    expect(estadoDeCuota(cuota(1, { fechaVencimiento: '2020-01-01' }), false, HOY)).toBe('planificada')
  })
})

describe('contarCuotas', () => {
  it('cuenta cada estado y las vivas sin las refinanciadas', () => {
    const cuotas = [
      ...plan(12, 10, 1),
      cuota(13, { saldoPendiente: 0, refinanciada: true }),
      cuota(14, { saldoPendiente: 0, refinanciada: true }),
    ]
    expect(contarCuotas(cuotas, true, HOY)).toEqual({
      pagadas: 10,
      vencidas: 1,
      porVencer: 1,
      refinanciadas: 2,
      planificadas: 0,
      vivas: 12,
    })
  })

  it('sin cuotas, todo en cero', () => {
    expect(contarCuotas([], true, HOY)).toEqual({
      pagadas: 0,
      vencidas: 0,
      porVencer: 0,
      refinanciadas: 0,
      planificadas: 0,
      vivas: 0,
    })
  })
})

describe('cuotasDelResumen', () => {
  it('muestra las 2 últimas pagadas, la próxima a cobrar y las 2 que siguen', () => {
    expect(numeros(cuotasDelResumen(plan(60, 10, 0)))).toEqual([9, 10, 11, 12, 13])
  })

  it('con cuotas vencidas, arranca igual desde la primera impaga: es la que se cobra primero', () => {
    expect(numeros(cuotasDelResumen(plan(60, 10, 3)))).toEqual([9, 10, 11, 12, 13])
  })

  it('sin nada pagado, las 5 primeras', () => {
    expect(numeros(cuotasDelResumen(plan(60, 0, 0)))).toEqual([1, 2, 3, 4, 5])
  })

  it('con una sola pagada, igual son 5: la pagada y 4 por delante', () => {
    expect(numeros(cuotasDelResumen(plan(60, 1, 0)))).toEqual([1, 2, 3, 4, 5])
  })

  it('cerca del final no se achica: las 5 últimas', () => {
    expect(numeros(cuotasDelResumen(plan(60, 59, 0)))).toEqual([56, 57, 58, 59, 60])
  })

  it('con todo pagado, las 5 últimas', () => {
    expect(numeros(cuotasDelResumen(plan(60, 60, 0)))).toEqual([56, 57, 58, 59, 60])
  })

  it('con 5 cuotas o menos no hay nada que resumir', () => {
    expect(numeros(cuotasDelResumen(plan(5, 2, 0)))).toEqual([1, 2, 3, 4, 5])
    expect(numeros(cuotasDelResumen(plan(3, 0, 0)))).toEqual([1, 2, 3])
  })

  it('las refinanciadas quedan para "ver todas": el resumen es de lo que se cobra', () => {
    // 24 cuotas: 10 pagadas, 11 a 24 refinanciadas, plan nuevo 25 a 44.
    const cuotas = [
      ...plan(10, 10, 0),
      ...Array.from({ length: 14 }, (_, i) => cuota(11 + i, { saldoPendiente: 0, refinanciada: true })),
      ...Array.from({ length: 20 }, (_, i) => cuota(25 + i, { fechaVencimiento: '2026-10-10' })),
    ]
    expect(numeros(cuotasDelResumen(cuotas))).toEqual([9, 10, 25, 26, 27])
  })

  it('no depende del orden en que vengan', () => {
    expect(numeros(cuotasDelResumen(plan(60, 10, 0).reverse()))).toEqual([9, 10, 11, 12, 13])
  })
})

describe('pagosDelResumen', () => {
  const pago = (id: string, estado: string) => ({ id, estado })

  it('los 5 más recientes (vienen del más nuevo al más viejo)', () => {
    const pagos = Array.from({ length: 12 }, (_, i) => pago(`p${i}`, 'confirmado'))
    expect([...pagosDelResumen(pagos)]).toEqual(['p0', 'p1', 'p2', 'p3', 'p4'])
  })

  it('un pago sin confirmar entra siempre, aunque sea viejo: hay que confirmarlo', () => {
    const pagos = [
      ...Array.from({ length: 10 }, (_, i) => pago(`p${i}`, 'confirmado')),
      pago('viejo-pendiente', 'pendiente'),
    ]
    expect([...pagosDelResumen(pagos)]).toEqual(['p0', 'p1', 'p2', 'p3', 'viejo-pendiente'])
  })

  it('si hay más de 5 sin confirmar, entran todos', () => {
    const pagos = [
      pago('c0', 'confirmado'),
      ...Array.from({ length: 6 }, (_, i) => pago(`s${i}`, 'pendiente')),
    ]
    expect([...pagosDelResumen(pagos)]).toEqual(['s0', 's1', 's2', 's3', 's4', 's5'])
  })
})

describe('ultimosDelResumen', () => {
  it('los últimos 5 de una lista en orden cronológico', () => {
    expect([...ultimosDelResumen(12)]).toEqual([7, 8, 9, 10, 11])
  })

  it('con 5 o menos, todos', () => {
    expect([...ultimosDelResumen(3)]).toEqual([0, 1, 2])
  })
})

describe('avanceDelPlan', () => {
  it('lo cobrado es lo pactado menos lo que se sigue debiendo', () => {
    const cuotas = [cuota(1, { saldoPendiente: 0 }), cuota(2, { saldoPendiente: 400 }), cuota(3)]
    expect(avanceDelPlan(cuotas, 0)).toEqual({ total: 3000, cobrado: 1600, porcentaje: 53 })
  })

  it('toma el monto ajustado por índice cuando lo hay', () => {
    const cuotas = [cuota(1, { montoAjustado: 1500, saldoPendiente: 0 }), cuota(2)]
    expect(avanceDelPlan(cuotas, 0)).toEqual({ total: 2500, cobrado: 1500, porcentaje: 60 })
  })

  it('una refinanciada no cuenta como cobrada: solo lo que se le llegó a pagar antes', () => {
    // 3 cuotas de 1000: la 1 pagada, la 2 con 300 pagados, la 3 sin nada.
    // Se refinancian los 1700 que faltaban en 2 cuotas de 850.
    const cuotas = [
      cuota(1, { saldoPendiente: 0 }),
      cuota(2, { saldoPendiente: 0, refinanciada: true }),
      cuota(3, { saldoPendiente: 0, refinanciada: true }),
      cuota(4, { montoBase: 850, montoAjustado: 850, saldoPendiente: 850 }),
      cuota(5, { montoBase: 850, montoAjustado: 850, saldoPendiente: 850 }),
    ]
    // Antes: pactado 3000 + 1700 = 4700 y "cobrado" 3000, un 64%.
    expect(avanceDelPlan(cuotas, 300)).toEqual({ total: 3000, cobrado: 1300, porcentaje: 43 })
  })

  it('sin cuotas no hay porcentaje', () => {
    expect(avanceDelPlan([], 0)).toEqual({ total: 0, cobrado: 0, porcentaje: null })
  })
})
