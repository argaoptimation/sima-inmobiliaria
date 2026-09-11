import { describe, it, expect } from 'vitest'
import { formatearFechaCorta, formatearFechaConAnioCorto } from './formatear-fecha-corta'

describe('formatearFechaCorta', () => {
  it('muestra la fecha de la base en formato argentino, con el anio completo', () => {
    expect(formatearFechaCorta('2026-09-10')).toBe('10/09/2026')
  })
})

describe('formatearFechaConAnioCorto', () => {
  it('es DD/MM/AA, con ceros adelante: el formato de los Excel', () => {
    expect(formatearFechaConAnioCorto('2026-09-01')).toBe('01/09/26')
  })

  it('no corre el dia aunque le llegue un timestamp', () => {
    expect(formatearFechaConAnioCorto('2027-01-05T00:00:00')).toBe('05/01/27')
  })
})
