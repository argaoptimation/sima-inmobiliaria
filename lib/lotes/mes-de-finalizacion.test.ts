import { describe, it, expect } from 'vitest'
import { mesDeFinalizacion } from './mes-de-finalizacion'

describe('mesDeFinalizacion', () => {
  it('cuenta desde la primera cuota, no despues: 36 desde octubre 2024 terminan en septiembre 2027', () => {
    expect(mesDeFinalizacion('2024-10-10', 36)).toBe('Septiembre 2027')
  })

  it('una sola cuota termina el mismo mes en que empieza', () => {
    expect(mesDeFinalizacion('2026-09-10', 1)).toBe('Septiembre 2026')
  })

  it('cruza el cambio de anio', () => {
    expect(mesDeFinalizacion('2026-11-05', 3)).toBe('Enero 2027')
  })

  it('doce cuotas desde enero terminan en diciembre del mismo anio', () => {
    expect(mesDeFinalizacion('2026-01-15', 12)).toBe('Diciembre 2026')
  })

  it('trece cuotas desde enero ya se van al anio siguiente', () => {
    expect(mesDeFinalizacion('2026-01-15', 13)).toBe('Enero 2027')
  })

  it('el dia del mes no mueve el resultado (31 de enero no salta a marzo)', () => {
    expect(mesDeFinalizacion('2026-01-31', 2)).toBe('Febrero 2026')
  })

  it('sin fecha o sin cuotas no inventa nada', () => {
    expect(mesDeFinalizacion('', 12)).toBeNull()
    expect(mesDeFinalizacion('2026-01-15', 0)).toBeNull()
    expect(mesDeFinalizacion('2026-01-15', Number.NaN)).toBeNull()
  })

  it('una fecha con mes invalido no devuelve una etiqueta rota', () => {
    expect(mesDeFinalizacion('2026-13-01', 3)).toBeNull()
  })
})
