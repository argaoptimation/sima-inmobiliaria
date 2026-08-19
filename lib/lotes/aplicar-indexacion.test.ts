import { describe, expect, it } from 'vitest'
import { calcularAjusteIndexacion, calcularRangoMesSiguiente } from './aplicar-indexacion'

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
