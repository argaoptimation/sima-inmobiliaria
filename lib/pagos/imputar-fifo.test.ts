import { describe, expect, it } from 'vitest'
import { imputarPagoFIFO } from './imputar-fifo'

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
