import { describe, expect, it } from 'vitest'
import { calcularInteresMoratorio } from './interes-moratorio'

describe('calcularInteresMoratorio', () => {
  it('reproduce el ejemplo de Nicolás: cuota de 100, paga 80, 1% diario sobre el saldo de 20', () => {
    const cuota = { saldoPendiente: 20, fechaVencimiento: '2026-08-10' }

    expect(calcularInteresMoratorio(cuota, 1, '2026-08-11')).toBe(0.2)
    expect(calcularInteresMoratorio(cuota, 1, '2026-08-12')).toBe(0.4)
    expect(calcularInteresMoratorio(cuota, 1, '2026-08-13')).toBe(0.6)
    expect(calcularInteresMoratorio(cuota, 1, '2026-08-14')).toBe(0.8)
  })

  it('el dia del vencimiento todavia no genera interes (sin dia de gracia extra, pero tampoco retroactivo)', () => {
    const cuota = { saldoPendiente: 100, fechaVencimiento: '2026-08-10' }
    expect(calcularInteresMoratorio(cuota, 1, '2026-08-10')).toBe(0)
  })

  it('sin lote con interes configurado (null), no genera nada aunque este vencida', () => {
    const cuota = { saldoPendiente: 100, fechaVencimiento: '2026-08-10' }
    expect(calcularInteresMoratorio(cuota, null, '2026-08-20')).toBe(0)
  })

  it('una cuota ya saldada (saldoPendiente 0) no genera interes aunque la fecha haya pasado', () => {
    const cuota = { saldoPendiente: 0, fechaVencimiento: '2026-08-10' }
    expect(calcularInteresMoratorio(cuota, 1, '2026-08-20')).toBe(0)
  })

  it('es interes simple, no compuesto: crece lineal, no exponencial', () => {
    const cuota = { saldoPendiente: 1000, fechaVencimiento: '2026-08-01' }
    const dia1 = calcularInteresMoratorio(cuota, 2, '2026-08-02')
    const dia10 = calcularInteresMoratorio(cuota, 2, '2026-08-11')
    expect(dia1).toBe(20)
    expect(dia10).toBe(200)
    expect(dia10).toBe(dia1 * 10)
  })

  it('una cuota no vencida (fecha futura) no genera interes', () => {
    const cuota = { saldoPendiente: 100, fechaVencimiento: '2026-09-01' }
    expect(calcularInteresMoratorio(cuota, 1, '2026-08-15')).toBe(0)
  })

  it('redondea a centavos', () => {
    const cuota = { saldoPendiente: 33.33, fechaVencimiento: '2026-08-01' }
    expect(calcularInteresMoratorio(cuota, 1.5, '2026-08-04')).toBe(1.5)
  })
})
