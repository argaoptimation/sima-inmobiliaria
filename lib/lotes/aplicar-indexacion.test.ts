import { describe, expect, it } from 'vitest'
import {
  buscarValorIndiceAplicable,
  calcularAjusteEncadenado,
  calcularPeriodoIndiceNecesario,
  calcularRangoMesSiguiente,
  corregirAjusteEncadenado,
  mesDeFecha,
} from './aplicar-indexacion'

describe('calcularAjusteEncadenado', () => {
  it('ajusta sobre la base pasada, no sobre el monto_ajustado propio de la cuota', () => {
    // Caso de Nicolás: cuota 1 en $100.000, IPC dic 5% -> $105.000. Cuota 2
    // (todavía en $100.000, nunca tocada) tiene que arrancar de los
    // $105.000 de la cuota 1, no de su propio monto_base.
    const resultado = calcularAjusteEncadenado(10, 105000, {
      id: 'c2',
      montoAjustado: 100000,
      saldoPendiente: 100000,
      fechaVencimiento: '2027-02-01',
    })

    expect(resultado).toEqual({ cuotaId: 'c2', montoAjustadoNuevo: 115500, saldoPendienteNuevo: 115500 })
  })

  it('encadena tres meses seguidos igual que el ejemplo completo de Nicolás', () => {
    const cuota1 = calcularAjusteEncadenado(5, 100000, {
      id: 'c1',
      montoAjustado: 100000,
      saldoPendiente: 100000,
      fechaVencimiento: '2027-01-01',
    })
    expect(cuota1.montoAjustadoNuevo).toBe(105000)

    const cuota2 = calcularAjusteEncadenado(10, cuota1.montoAjustadoNuevo, {
      id: 'c2',
      montoAjustado: 100000,
      saldoPendiente: 100000,
      fechaVencimiento: '2027-02-01',
    })
    expect(cuota2.montoAjustadoNuevo).toBe(115500)

    const cuota3 = calcularAjusteEncadenado(5, cuota2.montoAjustadoNuevo, {
      id: 'c3',
      montoAjustado: 100000,
      saldoPendiente: 100000,
      fechaVencimiento: '2027-03-01',
    })
    expect(cuota3.montoAjustadoNuevo).toBe(121275)
  })

  it('respeta un pago parcial ya hecho sobre esta cuota puntual', () => {
    // Cuota con monto_ajustado 100.000, ya se pagaron 30.000 (saldo 70.000).
    // Al encadenar un ajuste que la lleva a 110.000 de nominal, el saldo
    // pendiente tiene que reflejar los 30.000 ya pagados, no perderlos.
    const resultado = calcularAjusteEncadenado(10, 100000, {
      id: 'c1',
      montoAjustado: 100000,
      saldoPendiente: 70000,
      fechaVencimiento: '2027-01-01',
    })

    expect(resultado).toEqual({ cuotaId: 'c1', montoAjustadoNuevo: 110000, saldoPendienteNuevo: 80000 })
  })

  it('el saldo pendiente nunca baja de 0 aunque lo pagado supere el nuevo monto', () => {
    const resultado = calcularAjusteEncadenado(-5, 100000, {
      id: 'c1',
      montoAjustado: 100000,
      saldoPendiente: 3000,
      fechaVencimiento: '2027-01-01',
    })

    // montoAjustadoNuevo = 95000, pagado = 97000 -> saldo negativo se clampea a 0
    expect(resultado.saldoPendienteNuevo).toBe(0)
  })
})

describe('corregirAjusteEncadenado', () => {
  it('revierte el % viejo sobre la base encadenada y aplica el nuevo', () => {
    // 100.000 de base, 5% aplicado -> 105.000. Corregir a 3% tiene que dar
    // 103.000, no "105.000 con un -2% encima".
    const resultado = corregirAjusteEncadenado(5, 3, {
      id: 'c1',
      montoAjustado: 105000,
      saldoPendiente: 105000,
      fechaVencimiento: '2027-01-01',
    })

    expect(resultado).toEqual({ cuotaId: 'c1', montoAjustadoNuevo: 103000, saldoPendienteNuevo: 103000 })
  })

  it('un pago parcial ya hecho no se pierde al corregir', () => {
    // 105.000 de nominal (5% ya aplicado), se pagaron 50.000 -> saldo 55.000.
    // Corregir a 3%: base = 105000/1.05 = 100000, nuevo nominal = 103000,
    // pagado sigue siendo 105000-55000=50000 -> saldo nuevo 53000.
    const resultado = corregirAjusteEncadenado(5, 3, {
      id: 'c1',
      montoAjustado: 105000,
      saldoPendiente: 55000,
      fechaVencimiento: '2027-01-01',
    })

    expect(resultado).toEqual({ cuotaId: 'c1', montoAjustadoNuevo: 103000, saldoPendienteNuevo: 53000 })
  })
})

describe('buscarValorIndiceAplicable', () => {
  it('devuelve el valor del período exacto si está cargado', () => {
    const resultado = buscarValorIndiceAplicable('2027-02-01', [
      { periodo: '2027-01-01', valor: 5 },
      { periodo: '2027-02-01', valor: 8 },
    ])

    expect(resultado).toEqual({ periodo: '2027-02-01', valor: 8 })
  })

  it('si el período exacto no está cargado, usa el más reciente anterior (fallback confirmado por Gabriel)', () => {
    const resultado = buscarValorIndiceAplicable('2027-03-01', [
      { periodo: '2027-01-01', valor: 5 },
    ])

    expect(resultado).toEqual({ periodo: '2027-01-01', valor: 5 })
  })

  it('elige el más reciente entre varios anteriores disponibles, no el primero cargado', () => {
    const resultado = buscarValorIndiceAplicable('2027-04-01', [
      { periodo: '2027-01-01', valor: 5 },
      { periodo: '2027-02-01', valor: 10 },
    ])

    expect(resultado).toEqual({ periodo: '2027-02-01', valor: 10 })
  })

  it('devuelve null si no hay ningún valor cargado en o antes del período necesario', () => {
    const resultado = buscarValorIndiceAplicable('2027-01-01', [{ periodo: '2027-02-01', valor: 5 }])

    expect(resultado).toBeNull()
  })
})

describe('mesDeFecha', () => {
  it('trunca una fecha al primer día de su mes', () => {
    expect(mesDeFecha('2027-03-15')).toBe('2027-03-01')
  })
})

describe('calcularPeriodoIndiceNecesario', () => {
  it('ejemplo de Gabriel: una cuota de enero necesita el índice de diciembre del año anterior', () => {
    expect(calcularPeriodoIndiceNecesario('2026-01-15')).toBe('2025-12-01')
  })

  it('un mes cualquiera pide el mes anterior dentro del mismo año', () => {
    expect(calcularPeriodoIndiceNecesario('2026-08-01')).toBe('2026-07-01')
  })

  it('es la inversa exacta de calcularRangoMesSiguiente', () => {
    const periodo = '2026-05-01'
    const { desde } = calcularRangoMesSiguiente(periodo)
    expect(calcularPeriodoIndiceNecesario(desde)).toBe(periodo)
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
