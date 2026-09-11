import { describe, it, expect } from 'vitest'
import { fechaDeConfirmacion, MOTIVO_ETIQUETA } from './pagos-del-dia'

describe('fechaDeConfirmacion', () => {
  it('un pago confirmado a las 21:30 de Argentina es de ese dia, aunque en UTC ya sea el siguiente', () => {
    expect(
      fechaDeConfirmacion({
        confirmado_admin_at: '2026-09-11T00:30:00+00:00',
        confirmado_acreedor_at: null,
      })
    ).toBe('2026-09-10')
  })

  it('una transferencia es del dia del segundo toque, el mas tardio', () => {
    expect(
      fechaDeConfirmacion({
        confirmado_acreedor_at: '2026-09-09T15:00:00+00:00',
        confirmado_admin_at: '2026-09-10T13:00:00+00:00',
      })
    ).toBe('2026-09-10')
  })

  it('sin ningun toque no es de ningun dia', () => {
    expect(fechaDeConfirmacion({ confirmado_acreedor_at: null, confirmado_admin_at: null })).toBeNull()
  })
})

describe('MOTIVO_ETIQUETA', () => {
  // La copia que tenia el Excel del cierre de caja se habia quedado sin
  // esta: el pago salia como "saldar" en la planilla y como "Pago total
  // anticipado" en la pantalla.
  it('incluye el pago total anticipado', () => {
    expect(MOTIVO_ETIQUETA.saldar).toBe('Pago total anticipado')
  })
})
