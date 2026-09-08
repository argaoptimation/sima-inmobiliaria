import { describe, it, expect } from 'vitest'
import { generarPlanEnCurso } from './generar-cuotas-en-curso'

function exito(plan: Parameters<typeof generarPlanEnCurso>[0]) {
  const resultado = generarPlanEnCurso(plan)
  if (!resultado.valido) throw new Error(`Esperaba un plan válido, dio: ${resultado.error}`)
  return resultado
}

describe('generarPlanEnCurso', () => {
  const planTipico = {
    cuotasYaPagadas: 18,
    cuotasPendientes: 42,
    montoCuota: 500,
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
    const { cuotas } = exito(planTipico)

    // Cuota 19 (índice 18): la primera que todavía se debe.
    expect(cuotas[18].fechaVencimiento).toBe('2026-10-10')
  })

  it('deduce las fechas viejas hacia atrás, un mes por cuota', () => {
    const { cuotas } = exito(planTipico)

    // La 18 venció un mes antes de la 19; la 1, dieciocho meses antes.
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
    const { cuotas, fechaPrimeraCuota } = exito({ ...planTipico, cuotasYaPagadas: 0, cuotasPendientes: 10 })

    expect(cuotas).toHaveLength(10)
    expect(cuotas.every((cuota) => !cuota.yaPagada)).toBe(true)
    expect(fechaPrimeraCuota).toBe('2026-10-10')
  })

  it('rechaza un plan sin cuotas pendientes: eso ya no es un lote en curso', () => {
    const resultado = generarPlanEnCurso({ ...planTipico, cuotasPendientes: 0 })

    expect(resultado).toEqual({ valido: false, error: expect.stringContaining('al menos una cuota') })
  })

  it('rechaza cantidades que no son enteras', () => {
    expect(generarPlanEnCurso({ ...planTipico, cuotasYaPagadas: 1.5 }).valido).toBe(false)
    expect(generarPlanEnCurso({ ...planTipico, cuotasYaPagadas: -1 }).valido).toBe(false)
  })

  it('rechaza un monto de cuota vacío o negativo', () => {
    expect(generarPlanEnCurso({ ...planTipico, montoCuota: 0 }).valido).toBe(false)
    expect(generarPlanEnCurso({ ...planTipico, montoCuota: -10 }).valido).toBe(false)
  })

  it('rechaza una fecha mal escrita en vez de inventar cuotas', () => {
    expect(generarPlanEnCurso({ ...planTipico, fechaProximaCuota: '10/10/2026' }).valido).toBe(false)
    expect(generarPlanEnCurso({ ...planTipico, fechaProximaCuota: '' }).valido).toBe(false)
  })

  it('corta los planes absurdamente largos, igual que la venta normal', () => {
    expect(
      generarPlanEnCurso({ ...planTipico, cuotasYaPagadas: 300, cuotasPendientes: 301 }).valido
    ).toBe(false)
  })
})
