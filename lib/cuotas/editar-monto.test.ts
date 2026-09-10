import { describe, it, expect } from 'vitest'
import {
  porQueNoSePuedeEditarElMonto,
  sePuedeEditarElMonto,
  leerMontosNuevos,
  type CuotaEditable,
} from './editar-monto'

const HOY = '2026-09-10'

// Una cuota futura, sin nada pasado: el caso que Gabriel quiere habilitar.
function cuotaLimpia(cambios: Partial<CuotaEditable> = {}): CuotaEditable {
  return {
    numero: 5,
    montoBase: 1000,
    montoAjustado: 1000,
    saldoPendiente: 1000,
    fechaVencimiento: '2026-12-10',
    refinanciada: false,
    migrada: false,
    tieneAjustePorIndice: false,
    tienePlataImputada: false,
    tieneComprobantePendiente: false,
    ...cambios,
  }
}

describe('cuándo se puede cambiar el monto', () => {
  it('una cuota futura sin nada pasado sí', () => {
    expect(sePuedeEditarElMonto(cuotaLimpia(), HOY)).toBe(true)
  })

  it('una cuota que vence HOY todavía sí: vencer es del día siguiente en adelante', () => {
    expect(sePuedeEditarElMonto(cuotaLimpia({ fechaVencimiento: HOY }), HOY)).toBe(true)
  })

  it('una vencida no', () => {
    expect(porQueNoSePuedeEditarElMonto(cuotaLimpia({ fechaVencimiento: '2026-09-09' }), HOY)).toBe(
      'vencida'
    )
  })

  it('una con plata imputada no, aunque el saldo entero siga ahí', () => {
    // Pasa: un pago de 0 imputado, o un pago revertido que dejó la
    // imputación. Si hay imputación, hay historia colgando de esta cuota.
    expect(porQueNoSePuedeEditarElMonto(cuotaLimpia({ tienePlataImputada: true }), HOY)).toBe(
      'cobrada'
    )
  })

  it('una con el saldo distinto del monto no, aunque no se vean imputaciones', () => {
    // "Saldar lote" pone saldos en cero con UN pago, sin imputar cuota por
    // cuota: sin esta comprobación, una cuota saldada quedaría editable.
    expect(porQueNoSePuedeEditarElMonto(cuotaLimpia({ saldoPendiente: 0 }), HOY)).toBe('cobrada')
  })

  it('una con un comprobante esperando confirmación no', () => {
    expect(
      porQueNoSePuedeEditarElMonto(cuotaLimpia({ tieneComprobantePendiente: true }), HOY)
    ).toBe('comprobante')
  })

  it('una indexada no: los ajustes se encadenan y romperían las que siguen', () => {
    expect(porQueNoSePuedeEditarElMonto(cuotaLimpia({ tieneAjustePorIndice: true }), HOY)).toBe(
      'indexada'
    )
  })

  it('una cuyo monto ajustado ya no es el base tampoco, aunque no figure el ajuste', () => {
    expect(
      porQueNoSePuedeEditarElMonto(
        cuotaLimpia({ montoAjustado: 1100, saldoPendiente: 1100 }),
        HOY
      )
    ).toBe('indexada')
  })

  it('una refinanciada no', () => {
    expect(porQueNoSePuedeEditarElMonto(cuotaLimpia({ refinanciada: true }), HOY)).toBe(
      'refinanciada'
    )
  })

  it('una cobrada antes del sistema no', () => {
    expect(porQueNoSePuedeEditarElMonto(cuotaLimpia({ migrada: true }), HOY)).toBe('migrada')
  })

  it('cuando falla por varias razones dice la de fondo, no la primera que se cruza', () => {
    // Contestarle "está vencida" a una cuota refinanciada manda a la persona
    // a mirar el lugar equivocado.
    const cuota = cuotaLimpia({
      refinanciada: true,
      saldoPendiente: 0,
      fechaVencimiento: '2020-01-01',
    })
    expect(porQueNoSePuedeEditarElMonto(cuota, HOY)).toBe('refinanciada')
  })
})

describe('leer los montos nuevos del formulario', () => {
  const editables = new Map<number, CuotaEditable>([
    [5, cuotaLimpia({ numero: 5, montoAjustado: 1000, saldoPendiente: 1000 })],
    [6, cuotaLimpia({ numero: 6, montoAjustado: 1000, saldoPendiente: 1000 })],
  ])

  it('un campo vacío es "esta no la toco"', () => {
    const { cambios, errores } = leerMontosNuevos(
      [
        { numero: 5, montoTexto: '' },
        { numero: 6, montoTexto: '1200' },
      ],
      editables
    )
    expect(cambios).toEqual([{ numero: 6, montoNuevo: 1200 }])
    expect(errores).toEqual([])
  })

  it('poner el mismo monto que ya tenía no es un cambio', () => {
    const { cambios } = leerMontosNuevos([{ numero: 5, montoTexto: '1000' }], editables)
    expect(cambios).toEqual([])
  })

  it('cero y negativos se rechazan', () => {
    const { errores } = leerMontosNuevos(
      [
        { numero: 5, montoTexto: '0' },
        { numero: 6, montoTexto: '-100' },
      ],
      editables
    )
    expect(errores.map((e) => e.numero)).toEqual([5, 6])
  })

  it('texto que no es un número se rechaza', () => {
    const { errores } = leerMontosNuevos([{ numero: 5, montoTexto: 'mil' }], editables)
    expect(errores[0]).toMatchObject({ numero: 5, motivo: 'no es un número' })
  })

  it('más de dos decimales se rechaza en vez de redondearse en silencio', () => {
    const { cambios, errores } = leerMontosNuevos([{ numero: 5, montoTexto: '1000.555' }], editables)
    expect(cambios).toEqual([])
    expect(errores[0].motivo).toBe('como mucho dos decimales')
  })

  it('dos decimales exactos pasan', () => {
    const { cambios } = leerMontosNuevos([{ numero: 5, montoTexto: '1234.56' }], editables)
    expect(cambios).toEqual([{ numero: 5, montoNuevo: 1234.56 }])
  })

  it('una cuota que ya no está en la lista de editables se rechaza en vez de aplicarse', () => {
    // Pasa de verdad: la pantalla se abrió hace diez minutos y mientras
    // tanto entró un pago de esa cuota.
    const { cambios, errores } = leerMontosNuevos([{ numero: 99, montoTexto: '500' }], editables)
    expect(cambios).toEqual([])
    expect(errores[0]).toMatchObject({ numero: 99, motivo: 'ya no se puede editar' })
  })
})
