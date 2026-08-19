import { describe, expect, it } from 'vitest'
import {
  calcularAjusteIndexacion,
  calcularRangoMesSiguiente,
  corregirAjusteIndexacion,
} from './aplicar-indexacion'

describe('calcularAjusteIndexacion', () => {
  it('ajusta el saldo pendiente de las cuotas desde la fecha indicada', () => {
    const resultado = calcularAjusteIndexacion(10, '2026-08-01', [
      { id: 'c1', saldoPendiente: 100000, fechaVencimiento: '2026-08-01' },
    ])

    expect(resultado).toEqual([{ cuotaId: 'c1', saldoPendienteNuevo: 110000 }])
  })

  it('no toca cuotas con vencimiento anterior a la fecha del ajuste', () => {
    const resultado = calcularAjusteIndexacion(10, '2026-08-01', [
      { id: 'c1', saldoPendiente: 100000, fechaVencimiento: '2026-07-01' },
    ])

    expect(resultado).toEqual([])
  })

  it('no toca cuotas ya saldadas aunque la fecha califique', () => {
    const resultado = calcularAjusteIndexacion(10, '2026-08-01', [
      { id: 'c1', saldoPendiente: 0, fechaVencimiento: '2026-08-01' },
    ])

    expect(resultado).toEqual([])
  })

  it('redondea a 2 decimales', () => {
    const resultado = calcularAjusteIndexacion(8.5, '2026-08-01', [
      { id: 'c1', saldoPendiente: 33333, fechaVencimiento: '2026-08-01' },
    ])

    expect(resultado).toEqual([{ cuotaId: 'c1', saldoPendienteNuevo: 36166.31 }])
  })
})

describe('corregirAjusteIndexacion', () => {
  it('revierte el porcentaje viejo y aplica el nuevo (caso de Nicolás/Gabriel: 5% corregido a 3%)', () => {
    // 100 con 5% ya aplicado -> 105. Corregir a 3% tiene que dar 103, no
    // "105 con un -2% encima" (108 - 2% == 105.88, resultado distinto).
    const resultado = corregirAjusteIndexacion(5, 3, [
      { id: 'c1', saldoPendiente: 105, fechaVencimiento: '2026-08-01' },
    ])

    expect(resultado).toEqual([{ cuotaId: 'c1', saldoPendienteNuevo: 103 }])
  })

  it('no toca cuotas ya saldadas', () => {
    const resultado = corregirAjusteIndexacion(5, 3, [
      { id: 'c1', saldoPendiente: 0, fechaVencimiento: '2026-08-01' },
    ])

    expect(resultado).toEqual([])
  })

  it('un pago parcial ya hecho no rompe la corrección -- se ajusta lo que queda pendiente', () => {
    // 100 con 5% aplicado -> 105 pendiente. El cliente paga 50, quedan 55
    // pendientes. Corregir a 3%: saldo antes del 5% era 105/1.05=100,
    // pero lo que quedaba pendiente era 55 -- se revierte proporcional
    // sobre el saldo ACTUAL (55), no sobre el original (100).
    const resultado = corregirAjusteIndexacion(5, 3, [
      { id: 'c1', saldoPendiente: 55, fechaVencimiento: '2026-08-01' },
    ])

    // 55 / 1.05 = 52.380952... * 1.03 = 53.95238... -> redondeado 53.95
    expect(resultado).toEqual([{ cuotaId: 'c1', saldoPendienteNuevo: 53.95 }])
  })
})

describe('calcularRangoMesSiguiente', () => {
  it('un mes cualquiera pasa al siguiente dentro del mismo año', () => {
    expect(calcularRangoMesSiguiente('2026-07-01')).toEqual({
      desde: '2026-08-01',
      hastaExclusive: '2026-09-01',
    })
  })

  it('diciembre pasa a enero del año siguiente', () => {
    expect(calcularRangoMesSiguiente('2026-12-01')).toEqual({
      desde: '2027-01-01',
      hastaExclusive: '2027-02-01',
    })
  })

  it('noviembre pasa a diciembre del mismo año (el hasta cruza a enero)', () => {
    expect(calcularRangoMesSiguiente('2026-11-01')).toEqual({
      desde: '2026-12-01',
      hastaExclusive: '2027-01-01',
    })
  })
})
