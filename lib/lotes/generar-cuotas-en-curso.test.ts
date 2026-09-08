import { describe, it, expect } from 'vitest'
import { generarPlanEnCurso, vencimientosPendientes } from './generar-cuotas-en-curso'

function exito(plan: Parameters<typeof generarPlanEnCurso>[0]) {
  const resultado = generarPlanEnCurso(plan)
  if (!resultado.valido) throw new Error(`Esperaba un plan válido, dio: ${resultado.error}`)
  return resultado
}

function repetido(monto: number, veces: number) {
  return Array.from({ length: veces }, () => monto)
}

describe('generarPlanEnCurso', () => {
  const planTipico = {
    cuotasYaPagadas: 18,
    montosPendientes: repetido(500, 42),
    fechaProximaCuota: '2026-10-10',
  }

  it('numera las cuotas como el plan real, no desde la primera pendiente', () => {
    const { cuotas } = exito(planTipico)

    expect(cuotas).toHaveLength(60)
    expect(cuotas[0].numero).toBe(1)
    expect(cuotas.at(-1)!.numero).toBe(60)
  })

  it('marca como ya pagadas exactamente las primeras', () => {
    const { cuotas } = exito(planTipico)

    expect(cuotas.filter((cuota) => cuota.yaPagada)).toHaveLength(18)
    expect(cuotas[17].yaPagada).toBe(true)
    expect(cuotas[18].yaPagada).toBe(false)
  })

  it('le pone a la primera pendiente la fecha que cargó el admin', () => {
    expect(exito(planTipico).cuotas[18].fechaVencimiento).toBe('2026-10-10')
  })

  it('deduce las fechas viejas hacia atrás, un mes por cuota', () => {
    const { cuotas } = exito(planTipico)

    expect(cuotas[17].fechaVencimiento).toBe('2026-09-10')
    expect(cuotas[0].fechaVencimiento).toBe('2025-04-10')
  })

  it('sigue hacia adelante para las pendientes', () => {
    const { cuotas } = exito(planTipico)

    expect(cuotas[19].fechaVencimiento).toBe('2026-11-10')
    expect(cuotas.at(-1)!.fechaVencimiento).toBe('2030-03-10')
  })

  it('informa la fecha de la cuota 1, que es la que se guarda en el lote', () => {
    expect(exito(planTipico).fechaPrimeraCuota).toBe('2025-04-10')
  })

  it('acepta un lote sin ninguna cuota pagada todavía', () => {
    const { cuotas, fechaPrimeraCuota } = exito({
      ...planTipico,
      cuotasYaPagadas: 0,
      montosPendientes: repetido(500, 10),
    })

    expect(cuotas).toHaveLength(10)
    expect(cuotas.every((cuota) => !cuota.yaPagada)).toBe(true)
    expect(fechaPrimeraCuota).toBe('2026-10-10')
  })

  describe('cuotas de montos distintos', () => {
    const planEscalonado = {
      cuotasYaPagadas: 2,
      montosPendientes: [100, 250.5, 300],
      fechaProximaCuota: '2026-10-10',
    }

    it('respeta el monto de cada cuota pendiente en su orden', () => {
      const { cuotas } = exito(planEscalonado)

      expect(cuotas.filter((c) => !c.yaPagada).map((c) => c.montoBase)).toEqual([100, 250.5, 300])
    })

    it('a las cuotas viejas les pone el monto de la primera pendiente, como referencia', () => {
      const { cuotas } = exito(planEscalonado)

      expect(cuotas.filter((c) => c.yaPagada).map((c) => c.montoBase)).toEqual([100, 100])
    })

    it('deja el lote sin monto de cuota único cuando los montos difieren', () => {
      expect(exito(planEscalonado).montoCuotaBase).toBeNull()
    })

    it('guarda el monto único cuando todas las pendientes son iguales', () => {
      expect(exito(planTipico).montoCuotaBase).toBe(500)
    })

    it('señala cuál es la cuota mal cargada, con su número real', () => {
      const resultado = generarPlanEnCurso({
        ...planEscalonado,
        montosPendientes: [100, 0, 300],
      })

      // Dos pagadas + la segunda pendiente = cuota 4.
      expect(resultado).toEqual({ valido: false, error: expect.stringContaining('cuota 4') })
    })
  })

  it('rechaza un plan sin cuotas pendientes: eso ya no es un lote en curso', () => {
    const resultado = generarPlanEnCurso({ ...planTipico, montosPendientes: [] })

    expect(resultado).toEqual({ valido: false, error: expect.stringContaining('al menos una cuota') })
  })

  it('rechaza cantidades de pagadas que no son enteras', () => {
    expect(generarPlanEnCurso({ ...planTipico, cuotasYaPagadas: 1.5 }).valido).toBe(false)
    expect(generarPlanEnCurso({ ...planTipico, cuotasYaPagadas: -1 }).valido).toBe(false)
  })

  it('rechaza un monto vacío o negativo', () => {
    expect(generarPlanEnCurso({ ...planTipico, montosPendientes: [0] }).valido).toBe(false)
    expect(generarPlanEnCurso({ ...planTipico, montosPendientes: [-10] }).valido).toBe(false)
    expect(generarPlanEnCurso({ ...planTipico, montosPendientes: [NaN] }).valido).toBe(false)
  })

  it('rechaza una fecha mal escrita en vez de inventar cuotas', () => {
    expect(generarPlanEnCurso({ ...planTipico, fechaProximaCuota: '10/10/2026' }).valido).toBe(false)
    expect(generarPlanEnCurso({ ...planTipico, fechaProximaCuota: '' }).valido).toBe(false)
  })

  it('corta los planes absurdamente largos, igual que la venta normal', () => {
    expect(
      generarPlanEnCurso({
        ...planTipico,
        cuotasYaPagadas: 300,
        montosPendientes: repetido(500, 301),
      }).valido
    ).toBe(false)
  })
})

describe('vencimientosPendientes', () => {
  it('rotula cada casillero con el número de cuota real y su vencimiento', () => {
    expect(vencimientosPendientes(18, 3, '2026-10-10')).toEqual([
      { numero: 19, fechaVencimiento: '2026-10-10' },
      { numero: 20, fechaVencimiento: '2026-11-10' },
      { numero: 21, fechaVencimiento: '2026-12-10' },
    ])
  })

  it('no rotula nada mientras la fecha esté a medio escribir', () => {
    expect(vencimientosPendientes(18, 3, '')).toEqual([])
    expect(vencimientosPendientes(18, 3, '2026-10')).toEqual([])
  })
})
