import { describe, expect, it } from 'vitest'
import { formatearDetalleCuota } from './formatear-detalle-cuota'

describe('formatearDetalleCuota', () => {
  it('arma el detalle con el mes en español y el identificador del lote', () => {
    expect(
      formatearDetalleCuota({ numero: 3, fechaVencimiento: '2026-08-15', loteIdentificador: '1 mza 1' })
    ).toBe('Cuota 3 (agosto 2026) — Lote 1 mza 1')
  })

  it('diciembre no se corre al año siguiente por husos horarios', () => {
    expect(
      formatearDetalleCuota({ numero: 12, fechaVencimiento: '2026-12-01', loteIdentificador: 'X' })
    ).toBe('Cuota 12 (diciembre 2026) — Lote X')
  })
})
