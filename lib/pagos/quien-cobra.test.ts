import { describe, expect, it } from 'vitest'
import { resolverDestinoDeCobro } from './quien-cobra'

const SIN_CUENTA = { cuenta_cobro_id: null, cuenta_cobro_externa_id: null }

describe('resolverDestinoDeCobro', () => {
  it('la cuenta de la cuota gana sobre la del lote', () => {
    expect(
      resolverDestinoDeCobro(
        { cuenta_cobro_id: 'vendedor-1', cuenta_cobro_externa_id: null },
        { cuenta_cobro_id: 'acreedor', cuenta_cobro_externa_id: null }
      )
    ).toEqual({ perfilId: 'vendedor-1', cuentaExternaId: null })
  })

  it('una cuenta externa en la cuota también gana sobre el lote', () => {
    expect(
      resolverDestinoDeCobro(
        { cuenta_cobro_id: null, cuenta_cobro_externa_id: 'externa-1' },
        { cuenta_cobro_id: 'acreedor', cuenta_cobro_externa_id: null }
      )
    ).toEqual({ perfilId: null, cuentaExternaId: 'externa-1' })
  })

  it('sin destino propio, la cuota cae al del lote', () => {
    expect(
      resolverDestinoDeCobro(SIN_CUENTA, {
        cuenta_cobro_id: 'acreedor',
        cuenta_cobro_externa_id: null,
      })
    ).toEqual({ perfilId: 'acreedor', cuentaExternaId: null })

    expect(
      resolverDestinoDeCobro(SIN_CUENTA, {
        cuenta_cobro_id: null,
        cuenta_cobro_externa_id: 'externa-lote',
      })
    ).toEqual({ perfilId: null, cuentaExternaId: 'externa-lote' })
  })

  it('una cuota vieja (sin columnas) sigue cobrándose donde el lote', () => {
    expect(
      resolverDestinoDeCobro(null, { cuenta_cobro_id: 'acreedor', cuenta_cobro_externa_id: null })
    ).toEqual({ perfilId: 'acreedor', cuentaExternaId: null })
  })

  it('sin destino en ningún lado, no hay a quién cobrarle', () => {
    expect(resolverDestinoDeCobro(SIN_CUENTA, SIN_CUENTA)).toEqual({
      perfilId: null,
      cuentaExternaId: null,
    })
    expect(resolverDestinoDeCobro(null, null)).toEqual({ perfilId: null, cuentaExternaId: null })
  })
})
