import { describe, expect, it } from 'vitest'
import { calcularEstadoCobranza } from './estado-cliente'

describe('calcularEstadoCobranza', () => {
  it('normal cuando no hay cuotas vencidas', () => {
    const estado = calcularEstadoCobranza(
      [{ saldoPendiente: 60000, fechaVencimiento: '2026-09-01' }],
      '2026-08-01'
    )
    expect(estado).toBe('normal')
  })

  it('moroso con 1 o 2 cuotas vencidas', () => {
    const estado = calcularEstadoCobranza(
      [
        { saldoPendiente: 60000, fechaVencimiento: '2026-06-01' },
        { saldoPendiente: 60000, fechaVencimiento: '2026-07-01' },
      ],
      '2026-08-01'
    )
    expect(estado).toBe('moroso')
  })

  it('prejudicial con mas de 2 cuotas vencidas', () => {
    const estado = calcularEstadoCobranza(
      [
        { saldoPendiente: 60000, fechaVencimiento: '2026-05-01' },
        { saldoPendiente: 60000, fechaVencimiento: '2026-06-01' },
        { saldoPendiente: 60000, fechaVencimiento: '2026-07-01' },
      ],
      '2026-08-01'
    )
    expect(estado).toBe('prejudicial')
  })

  it('una cuota que vence hoy todavia no cuenta como vencida', () => {
    const estado = calcularEstadoCobranza(
      [{ saldoPendiente: 60000, fechaVencimiento: '2026-08-01' }],
      '2026-08-01'
    )
    expect(estado).toBe('normal')
  })

  it('una cuota que vencio ayer ya cuenta como vencida (sin dia de gracia)', () => {
    const estado = calcularEstadoCobranza(
      [{ saldoPendiente: 60000, fechaVencimiento: '2026-07-31' }],
      '2026-08-01'
    )
    expect(estado).toBe('moroso')
  })

  it('una cuota pagada no cuenta como vencida aunque la fecha haya pasado', () => {
    const estado = calcularEstadoCobranza(
      [{ saldoPendiente: 0, fechaVencimiento: '2026-06-01' }],
      '2026-08-01'
    )
    expect(estado).toBe('normal')
  })

  it('una cuota con pago parcial sigue contando como vencida', () => {
    const estado = calcularEstadoCobranza(
      [
        { saldoPendiente: 20000, fechaVencimiento: '2026-05-01' },
        { saldoPendiente: 60000, fechaVencimiento: '2026-06-01' },
        { saldoPendiente: 60000, fechaVencimiento: '2026-07-01' },
      ],
      '2026-08-01'
    )
    expect(estado).toBe('prejudicial')
  })
})
