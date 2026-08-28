import { describe, expect, it } from 'vitest'
import { imputarPagoFIFO, imputarPagoConMora } from './imputar-fifo'

describe('imputarPagoFIFO', () => {
  it('imputa el pago exacto a una sola cuota', () => {
    const resultado = imputarPagoFIFO(60000, [{ id: 'c1', saldoPendiente: 60000 }])

    expect(resultado.imputaciones).toEqual([{ cuotaId: 'c1', montoImputado: 60000 }])
    expect(resultado.saldoNoImputado).toBe(0)
  })

  it('derrama el sobrante a las cuotas siguientes en orden', () => {
    const resultado = imputarPagoFIFO(150000, [
      { id: 'c1', saldoPendiente: 60000 },
      { id: 'c2', saldoPendiente: 60000 },
    ])

    expect(resultado.imputaciones).toEqual([
      { cuotaId: 'c1', montoImputado: 60000 },
      { cuotaId: 'c2', montoImputado: 60000 },
    ])
    expect(resultado.saldoNoImputado).toBe(30000)
  })

  it('deja la cuota con saldo parcial cuando el pago no la cubre', () => {
    const resultado = imputarPagoFIFO(40000, [{ id: 'c1', saldoPendiente: 60000 }])

    expect(resultado.imputaciones).toEqual([{ cuotaId: 'c1', montoImputado: 40000 }])
    expect(resultado.saldoNoImputado).toBe(0)
  })

  it('saltea cuotas ya saldadas', () => {
    const resultado = imputarPagoFIFO(60000, [
      { id: 'c1', saldoPendiente: 0 },
      { id: 'c2', saldoPendiente: 60000 },
    ])

    expect(resultado.imputaciones).toEqual([{ cuotaId: 'c2', montoImputado: 60000 }])
  })

  it('no imputa nada si el pago es 0', () => {
    const resultado = imputarPagoFIFO(0, [{ id: 'c1', saldoPendiente: 60000 }])

    expect(resultado.imputaciones).toEqual([])
    expect(resultado.saldoNoImputado).toBe(0)
  })

  it('deja todo el monto como no imputado si no hay cuotas', () => {
    const resultado = imputarPagoFIFO(50000, [])

    expect(resultado.imputaciones).toEqual([])
    expect(resultado.saldoNoImputado).toBe(50000)
  })
})

describe('imputarPagoConMora', () => {
  it('sin mora devengada, se comporta igual que imputarPagoFIFO (todo a capital)', () => {
    const resultado = imputarPagoConMora(
      60000,
      [{ id: 'c1', saldoPendiente: 60000, fechaVencimiento: '2026-09-01', moraPagada: 0 }],
      1,
      '2026-08-15' // no vencida todavia
    )

    expect(resultado.imputaciones).toEqual([{ cuotaId: 'c1', montoCapital: 60000, montoMora: 0 }])
    expect(resultado.saldoNoImputado).toBe(0)
  })

  it('cobra primero la mora devengada de la cuota vencida, despues su capital', () => {
    // Cuota de 1000, vencida hace 10 dias, 1% diario => 100 de mora.
    const resultado = imputarPagoConMora(
      1050,
      [{ id: 'c1', saldoPendiente: 1000, fechaVencimiento: '2026-08-01', moraPagada: 0 }],
      1,
      '2026-08-11'
    )

    expect(resultado.imputaciones).toEqual([{ cuotaId: 'c1', montoCapital: 950, montoMora: 100 }])
    expect(resultado.saldoNoImputado).toBe(0)
  })

  it('un pago que no alcanza ni para la mora, se imputa todo a mora y nada a capital', () => {
    const resultado = imputarPagoConMora(
      40,
      [{ id: 'c1', saldoPendiente: 1000, fechaVencimiento: '2026-08-01', moraPagada: 0 }],
      1,
      '2026-08-11' // mora devengada: 100
    )

    expect(resultado.imputaciones).toEqual([{ cuotaId: 'c1', montoCapital: 0, montoMora: 40 }])
    expect(resultado.saldoNoImputado).toBe(0)
  })

  it('no vuelve a cobrar mora ya pagada -- descuenta moraPagada de la mora devengada', () => {
    // Mora devengada total a hoy: 100. Ya se pagaron 60 en un pago anterior
    // (moraPagada=60) -- solo quedan 40 de mora pendiente.
    const resultado = imputarPagoConMora(
      1000,
      [{ id: 'c1', saldoPendiente: 1000, fechaVencimiento: '2026-08-01', moraPagada: 60 }],
      1,
      '2026-08-11'
    )

    expect(resultado.imputaciones).toEqual([{ cuotaId: 'c1', montoCapital: 960, montoMora: 40 }])
    expect(resultado.saldoNoImputado).toBe(0)
  })

  it('completa mora + capital de la cuota mas vieja antes de tocar la siguiente (FIFO)', () => {
    const resultado = imputarPagoConMora(
      1200,
      [
        { id: 'c1', saldoPendiente: 1000, fechaVencimiento: '2026-08-01', moraPagada: 0 }, // mora: 100 (10 dias)
        { id: 'c2', saldoPendiente: 1000, fechaVencimiento: '2026-08-05', moraPagada: 0 }, // mora: 60 (6 dias)
      ],
      1,
      '2026-08-11'
    )

    expect(resultado.imputaciones).toEqual([
      { cuotaId: 'c1', montoCapital: 1000, montoMora: 100 },
      { cuotaId: 'c2', montoCapital: 40, montoMora: 60 },
    ])
    expect(resultado.saldoNoImputado).toBe(0)
  })

  it('sin tasa de interes configurada (null), nunca cobra mora', () => {
    const resultado = imputarPagoConMora(
      500,
      [{ id: 'c1', saldoPendiente: 1000, fechaVencimiento: '2026-08-01', moraPagada: 0 }],
      null,
      '2026-08-11'
    )

    expect(resultado.imputaciones).toEqual([{ cuotaId: 'c1', montoCapital: 500, montoMora: 0 }])
  })

  it('saltea cuotas con saldoPendiente 0 (ya saldadas), sin cobrarles mora', () => {
    const resultado = imputarPagoConMora(
      500,
      [
        { id: 'c1', saldoPendiente: 0, fechaVencimiento: '2026-08-01', moraPagada: 0 },
        { id: 'c2', saldoPendiente: 1000, fechaVencimiento: '2026-09-05', moraPagada: 0 }, // no vencida
      ],
      1,
      '2026-08-11'
    )

    expect(resultado.imputaciones).toEqual([{ cuotaId: 'c2', montoCapital: 500, montoMora: 0 }])
  })

  it('no genera ninguna imputacion si el pago es 0', () => {
    const resultado = imputarPagoConMora(
      0,
      [{ id: 'c1', saldoPendiente: 1000, fechaVencimiento: '2026-08-01', moraPagada: 0 }],
      1,
      '2026-08-11'
    )

    expect(resultado.imputaciones).toEqual([])
    expect(resultado.saldoNoImputado).toBe(0)
  })
})
