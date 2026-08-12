import { describe, expect, it } from 'vitest'
import { parsearLoteImportado, parsearTextoImportacion } from './parsear-importacion'

describe('parsearLoteImportado', () => {
  const filaValida = ['Loteo San Martín - Lote 1', 'Ruta 9 km 12', '15000', 'USD', '24', '625', '2026-09-01']

  it('parsea una fila completa y bien formada', () => {
    const resultado = parsearLoteImportado(filaValida, 1)
    expect(resultado).toEqual({
      identificador: 'Loteo San Martín - Lote 1',
      ubicacion: 'Ruta 9 km 12',
      precioTotal: 15000,
      moneda: 'USD',
      cantidadCuotas: 24,
      montoCuotaBase: 625,
      fechaPrimeraCuota: '2026-09-01',
    })
  })

  it('recorta espacios de cada celda', () => {
    const fila = ['  Lote 1  ', ' Ruta 9 ', ' 15000 ', ' USD ', ' 24 ', ' 625 ', ' 2026-09-01 ']
    const resultado = parsearLoteImportado(fila, 1)
    expect(resultado).toEqual({
      identificador: 'Lote 1',
      ubicacion: 'Ruta 9',
      precioTotal: 15000,
      moneda: 'USD',
      cantidadCuotas: 24,
      montoCuotaBase: 625,
      fechaPrimeraCuota: '2026-09-01',
    })
  })

  it('rechaza si falta el identificador', () => {
    const fila = ['', 'Ruta 9 km 12', '15000', 'USD', '24', '625', '2026-09-01']
    expect(parsearLoteImportado(fila, 3)).toBe('Fila 3: falta el identificador')
  })

  it('rechaza si falta la ubicación', () => {
    const fila = ['Lote 1', '', '15000', 'USD', '24', '625', '2026-09-01']
    expect(parsearLoteImportado(fila, 2)).toBe('Fila 2: falta la ubicación')
  })

  it('rechaza un precio total no numérico o negativo', () => {
    expect(
      parsearLoteImportado(['Lote 1', 'Ruta 9', 'abc', 'USD', '24', '625', '2026-09-01'], 1)
    ).toMatch(/precio total inválido/)
    expect(
      parsearLoteImportado(['Lote 1', 'Ruta 9', '-100', 'USD', '24', '625', '2026-09-01'], 1)
    ).toMatch(/precio total inválido/)
  })

  it('rechaza una moneda que no sea USD ni ARS', () => {
    expect(
      parsearLoteImportado(['Lote 1', 'Ruta 9', '15000', 'EUR', '24', '625', '2026-09-01'], 1)
    ).toMatch(/la moneda tiene que ser USD o ARS/)
  })

  it('rechaza cantidad de cuotas no entera o cero', () => {
    expect(
      parsearLoteImportado(['Lote 1', 'Ruta 9', '15000', 'USD', '0', '625', '2026-09-01'], 1)
    ).toMatch(/cantidad de cuotas inválida/)
    expect(
      parsearLoteImportado(['Lote 1', 'Ruta 9', '15000', 'USD', '2.5', '625', '2026-09-01'], 1)
    ).toMatch(/cantidad de cuotas inválida/)
  })

  it('rechaza monto de cuota no numérico', () => {
    expect(
      parsearLoteImportado(['Lote 1', 'Ruta 9', '15000', 'USD', '24', 'x', '2026-09-01'], 1)
    ).toMatch(/monto de cuota inválido/)
  })

  it('rechaza una fecha que no tenga formato AAAA-MM-DD', () => {
    expect(
      parsearLoteImportado(['Lote 1', 'Ruta 9', '15000', 'USD', '24', '625', '01/09/2026'], 1)
    ).toMatch(/fecha inválida/)
  })
})

describe('parsearTextoImportacion', () => {
  it('parsea varias filas separadas por salto de línea', () => {
    const texto = [
      'Lote 1\tRuta 9 km 12\t15000\tUSD\t24\t625\t2026-09-01',
      'Lote 2\tRuta 9 km 12\t16000\tUSD\t24\t666.67\t2026-09-01',
    ].join('\n')

    const resultado = parsearTextoImportacion(texto)
    expect('lotes' in resultado).toBe(true)
    if ('lotes' in resultado) {
      expect(resultado.lotes).toHaveLength(2)
      expect(resultado.lotes[0].identificador).toBe('Lote 1')
      expect(resultado.lotes[1].identificador).toBe('Lote 2')
    }
  })

  it('ignora líneas en blanco', () => {
    const texto = '\nLote 1\tRuta 9 km 12\t15000\tUSD\t24\t625\t2026-09-01\n\n'
    const resultado = parsearTextoImportacion(texto)
    expect('lotes' in resultado).toBe(true)
    if ('lotes' in resultado) {
      expect(resultado.lotes).toHaveLength(1)
    }
  })

  it('si el texto está vacío, devuelve un error', () => {
    const resultado = parsearTextoImportacion('   \n  ')
    expect('errores' in resultado).toBe(true)
  })

  it('si UNA fila tiene un error, no devuelve ningún lote (todo o nada)', () => {
    const texto = [
      'Lote 1\tRuta 9 km 12\t15000\tUSD\t24\t625\t2026-09-01',
      'Lote 2\tRuta 9 km 12\tno-es-un-precio\tUSD\t24\t625\t2026-09-01',
    ].join('\n')

    const resultado = parsearTextoImportacion(texto)
    expect('errores' in resultado).toBe(true)
    if ('errores' in resultado) {
      expect(resultado.errores).toHaveLength(1)
      expect(resultado.errores[0]).toMatch(/Fila 2/)
    }
  })
})
