import { describe, expect, it } from 'vitest'
import {
  avisoDeSalida,
  cambiaAlgoAlQuitarlo,
  listarCuotas,
  vinculosDeIntegrante,
  type CuotaParaVinculos,
} from './vinculos-integrante'

const pedro = 'profile:pedro'
const otro = 'profile:otro'

function cuota(numero: number, datos: Partial<CuotaParaVinculos> = {}): CuotaParaVinculos {
  return { numero, cobrada: false, conPagoPendiente: false, destino: '', repartidaEntre: [], ...datos }
}

describe('listarCuotas', () => {
  it('una sola', () => {
    expect(listarCuotas([7])).toBe('la cuota 7')
  })

  it('abrevia los tramos de tres o más seguidas', () => {
    expect(listarCuotas([9, 1, 2, 3, 5, 6])).toBe('las cuotas 1 a 3, 5, 6 y 9')
    expect(listarCuotas(Array.from({ length: 60 }, (_, i) => i + 1))).toBe('las cuotas 1 a 60')
  })

  it('dos sueltas y sin repetidos', () => {
    expect(listarCuotas([4, 2, 4])).toBe('las cuotas 2 y 4')
  })
})

describe('vinculosDeIntegrante', () => {
  const cuotas = [
    cuota(1, { cobrada: true, destino: pedro, repartidaEntre: [pedro, otro] }),
    cuota(2, { destino: pedro, repartidaEntre: [pedro], conPagoPendiente: true }),
    cuota(3, { destino: otro, repartidaEntre: [pedro, otro] }),
    cuota(4, { destino: otro, repartidaEntre: [otro], conPagoPendiente: true }),
  ]

  it('separa lo que se toca (sin cobrar) de lo que queda (cobradas)', () => {
    expect(vinculosDeIntegrante(pedro, cuotas, { [pedro]: 5 })).toEqual({
      repartoSinCobrar: [2, 3],
      destinoSinCobrar: [2],
      cobradas: [1],
      pagoPendiente: [2],
      porcentaje: 5,
    })
  })

  it('un pago pendiente solo bloquea si la cuota se le transfiere a esa persona', () => {
    expect(vinculosDeIntegrante(pedro, cuotas, {}).pagoPendiente).toEqual([2])
    expect(vinculosDeIntegrante(otro, cuotas, {}).pagoPendiente).toEqual([4])
  })

  it('sin nada atado no cambia nada al quitarlo; con solo cobradas tampoco', () => {
    expect(cambiaAlgoAlQuitarlo(vinculosDeIntegrante('profile:nadie', cuotas, {}))).toBe(false)
    const soloCobradas = vinculosDeIntegrante(pedro, [cuota(1, { cobrada: true, destino: pedro })], {})
    expect(cambiaAlgoAlQuitarlo(soloCobradas)).toBe(false)
    expect(cambiaAlgoAlQuitarlo(vinculosDeIntegrante(pedro, [], { [pedro]: 10 }))).toBe(true)
  })
})

describe('avisoDeSalida', () => {
  it('explica cada cosa que se toca y lo que no', () => {
    const { lineas, bloqueo } = avisoDeSalida('Pedro', {
      repartoSinCobrar: [3, 4, 5],
      destinoSinCobrar: [3],
      cobradas: [1, 2],
      pagoPendiente: [],
      porcentaje: 5,
    })
    expect(lineas).toEqual([
      'Tiene parte del reparto en las cuotas 3 a 5, que todavía no se cobraron: se le saca. Esas cuotas van a quedar con plata sin repartir hasta que la reasignes.',
      'La cuota 3 se le transfiere a Pedro: queda sin destino hasta que elijas a otro, y mientras tanto el cliente no ve a dónde pagarla.',
      'Se borra su 5% del lote.',
      'En las cuotas 1 y 2, que ya se cobraron, no se toca nada: lo que le correspondía ya quedó registrado.',
    ])
    expect(bloqueo).toBeNull()
  })

  it('sin nada atado lo dice', () => {
    expect(
      avisoDeSalida('Pedro', { repartoSinCobrar: [], destinoSinCobrar: [], cobradas: [], pagoPendiente: [], porcentaje: null })
        .lineas
    ).toEqual(['No tiene cuotas asignadas en este lote: no se toca nada más.'])
  })

  it('con un pago sin confirmar, bloquea', () => {
    const { bloqueo } = avisoDeSalida('Pedro', {
      repartoSinCobrar: [],
      destinoSinCobrar: [2],
      cobradas: [],
      pagoPendiente: [2],
      porcentaje: null,
    })
    expect(bloqueo).toBe(
      'Todavía no se puede quitar: el cliente ya informó un pago de la cuota 2, que se le transfiere a Pedro, y falta confirmarlo. Confirmalo en Pagos y después volvé.'
    )
  })
})
