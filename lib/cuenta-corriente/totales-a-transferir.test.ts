import { describe, it, expect } from 'vitest'
import { totalesATransferirPorMoneda, monedasOrdenadas } from './totales-a-transferir'

const situacion = (leCorresponde: number, cobroDirecto: number) => ({
  leCorresponde,
  cobroDirecto,
  saldo: Math.round((leCorresponde - cobroDirecto) * 100) / 100,
})

describe('totalesATransferirPorMoneda', () => {
  it('suma lo que hay que girar', () => {
    const totales = totalesATransferirPorMoneda([
      { porMoneda: { USD: situacion(1000, 200) } },
      { porMoneda: { USD: situacion(500, 0) } },
    ])

    expect(totales.USD.aGirar).toBe(1300)
    expect(totales.USD.cuantosEsperan).toBe(2)
    expect(totales.USD.deMas).toBe(0)
  })

  it('NO netea entre personas: la plata de mas de uno no paga a otro', () => {
    const totales = totalesATransferirPorMoneda([
      { porMoneda: { USD: situacion(800, 0) } }, // hay que darle 800
      { porMoneda: { USD: situacion(0, 300) } }, // tiene 300 de mas
    ])

    // Netear daria 500 y haria creer que con eso alcanza. No alcanza: los
    // 800 hay que girarlos igual.
    expect(totales.USD.aGirar).toBe(800)
    expect(totales.USD.deMas).toBe(300)
    expect(totales.USD.cuantosEsperan).toBe(1)
    expect(totales.USD.cuantosTienenDeMas).toBe(1)
  })

  it('separa las monedas: sumar dolares con pesos seria mentir', () => {
    const totales = totalesATransferirPorMoneda([
      { porMoneda: { USD: situacion(1000, 0), ARS: situacion(500000, 0) } },
    ])

    expect(totales.USD.aGirar).toBe(1000)
    expect(totales.ARS.aGirar).toBe(500000)
  })

  it('una persona con la misma persona en dos monedas cuenta en las dos', () => {
    const totales = totalesATransferirPorMoneda([
      { porMoneda: { USD: situacion(100, 0), ARS: situacion(200, 0) } },
      { porMoneda: { USD: situacion(50, 0) } },
    ])

    expect(totales.USD.cuantosEsperan).toBe(2)
    expect(totales.ARS.cuantosEsperan).toBe(1)
  })

  it('al dia no suma a ningun lado, pero la moneda igual figura', () => {
    const totales = totalesATransferirPorMoneda([{ porMoneda: { USD: situacion(300, 300) } }])

    expect(totales.USD).toEqual({
      aGirar: 0,
      deMas: 0,
      cuantosEsperan: 0,
      cuantosTienenDeMas: 0,
    })
  })

  it('sin nadie, no inventa monedas', () => {
    expect(totalesATransferirPorMoneda([])).toEqual({})
  })

  it('redondea al final: acumular centavos redondeados arrastra error', () => {
    const totales = totalesATransferirPorMoneda(
      Array.from({ length: 3 }, () => ({ porMoneda: { USD: situacion(0.1, 0) } }))
    )

    expect(totales.USD.aGirar).toBe(0.3)
  })
})

describe('monedasOrdenadas', () => {
  it('USD y ARS primero, en ese orden, y el resto alfabetico', () => {
    expect(monedasOrdenadas({ EUR: 1, ARS: 1, USD: 1, BRL: 1 })).toEqual([
      'USD',
      'ARS',
      'BRL',
      'EUR',
    ])
  })

  it('no falla si falta alguna de las dos principales', () => {
    expect(monedasOrdenadas({ ARS: 1 })).toEqual(['ARS'])
    expect(monedasOrdenadas({})).toEqual([])
  })
})
