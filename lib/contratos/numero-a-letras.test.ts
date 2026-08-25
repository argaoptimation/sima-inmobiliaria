import { describe, it, expect } from 'vitest'
import { numeroALetras, montoALetras } from './numero-a-letras'

describe('numeroALetras', () => {
  it('convierte 0', () => {
    expect(numeroALetras(0)).toBe('cero')
  })

  it('convierte unidades y decenas simples', () => {
    expect(numeroALetras(1)).toBe('uno')
    expect(numeroALetras(9)).toBe('nueve')
    expect(numeroALetras(10)).toBe('diez')
    expect(numeroALetras(15)).toBe('quince')
    expect(numeroALetras(20)).toBe('veinte')
  })

  it('convierte el rango 21-29 (pegado, sin "y")', () => {
    expect(numeroALetras(21)).toBe('veintiuno')
    expect(numeroALetras(22)).toBe('veintidós')
    expect(numeroALetras(29)).toBe('veintinueve')
  })

  it('convierte decenas con "y" (30 en adelante)', () => {
    expect(numeroALetras(30)).toBe('treinta')
    expect(numeroALetras(31)).toBe('treinta y uno')
    // Valor real del modelo de contrato (BOLETO Quintana): "treinta y seis
    // (36) cuotas".
    expect(numeroALetras(36)).toBe('treinta y seis')
    expect(numeroALetras(99)).toBe('noventa y nueve')
  })

  it('convierte centenas', () => {
    expect(numeroALetras(100)).toBe('cien')
    expect(numeroALetras(101)).toBe('ciento uno')
    // Valor real del modelo de contrato: "quinientos siete metros
    // cuadrados (507 m2)".
    expect(numeroALetras(507)).toBe('quinientos siete')
    expect(numeroALetras(999)).toBe('novecientos noventa y nueve')
  })

  it('convierte miles', () => {
    // Valor real del modelo de contrato: la seña "mil dólares
    // estadounidenses (1000 usd)".
    expect(numeroALetras(1000)).toBe('mil')
    expect(numeroALetras(1001)).toBe('mil uno')
    expect(numeroALetras(2000)).toBe('dos mil')
    expect(numeroALetras(36000)).toBe('treinta y seis mil')
    expect(numeroALetras(100000)).toBe('cien mil')
    expect(numeroALetras(123456)).toBe('ciento veintitrés mil cuatrocientos cincuenta y seis')
  })

  it('convierte millones', () => {
    expect(numeroALetras(1_000_000)).toBe('un millón')
    expect(numeroALetras(2_000_000)).toBe('dos millones')
    expect(numeroALetras(21_000_000)).toBe('veintiún millones')
    expect(numeroALetras(1_500_000)).toBe('un millón quinientos mil')
  })

  it('rechaza números fuera de rango', () => {
    expect(() => numeroALetras(1_000_000_000)).toThrow()
  })
})

describe('montoALetras', () => {
  it('usa singular solo para exactamente 1, sin centavos, con apócope ("un" no "uno")', () => {
    expect(montoALetras(1, 'USD')).toBe('un dólar estadounidense')
    expect(montoALetras(1, 'ARS')).toBe('un peso argentino')
  })

  it('usa plural para el resto de los montos', () => {
    // Valor real del modelo de contrato: precio de la cuota mensual.
    expect(montoALetras(507, 'USD')).toBe('quinientos siete dólares estadounidenses')
    expect(montoALetras(1000, 'USD')).toBe('mil dólares estadounidenses')
  })

  it('agrega los centavos como "con NN/100" cuando el monto no es entero', () => {
    expect(montoALetras(1500.5, 'USD')).toBe('mil quinientos dólares estadounidenses con 50/100')
    expect(montoALetras(10.05, 'ARS')).toBe('diez pesos argentinos con 05/100')
  })
})
