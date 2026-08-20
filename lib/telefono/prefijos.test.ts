import { describe, it, expect } from 'vitest'
import {
  codificarTelefono,
  decodificarTelefono,
  telefonoParaWhatsApp,
  errorLongitudTelefono,
} from './prefijos'

describe('codificarTelefono', () => {
  it('guarda prefijo y número separados por "|"', () => {
    expect(codificarTelefono('54', '9 351 123-4567')).toBe('54|93511234567')
  })

  it('"otro" también lleva separador, para poder distinguirlo de un valor viejo al releer', () => {
    expect(codificarTelefono('otro', '5493511234567')).toBe('otro|5493511234567')
  })

  it('sin número local, devuelve null aunque haya prefijo', () => {
    expect(codificarTelefono('54', '')).toBeNull()
    expect(codificarTelefono('54', '   ')).toBeNull()
  })

  it('"1-do" (República Dominicana) codifica con el prefijo real "1"', () => {
    expect(codificarTelefono('1-do', '8091234567')).toBe('1|8091234567')
  })
})

describe('decodificarTelefono', () => {
  it('separa prefijo y número de un valor codificado', () => {
    expect(decodificarTelefono('54|93511234567')).toEqual({
      codigoSelect: '54',
      numeroLocal: '93511234567',
    })
  })

  it('valor viejo sin separador: todo queda como numeroLocal, sin prefijo', () => {
    expect(decodificarTelefono('5493511234567')).toEqual({
      codigoSelect: '',
      numeroLocal: '5493511234567',
    })
  })

  it('null o vacío decodifica a ambos campos vacíos', () => {
    expect(decodificarTelefono(null)).toEqual({ codigoSelect: '', numeroLocal: '' })
  })

  it('"otro" hace round-trip correcto: se guarda y se relee como "otro", no como Argentina', () => {
    const guardado = codificarTelefono('otro', '5493511234567')
    expect(decodificarTelefono(guardado)).toEqual({ codigoSelect: 'otro', numeroLocal: '5493511234567' })
  })
})

describe('telefonoParaWhatsApp', () => {
  it('arma el número completo pegado, para wa.me', () => {
    expect(telefonoParaWhatsApp('54|93511234567')).toBe('5493511234567')
  })

  it('valor viejo sin separador: lo devuelve tal cual (mismo comportamiento que antes)', () => {
    expect(telefonoParaWhatsApp('5493511234567')).toBe('5493511234567')
  })

  it('null devuelve null', () => {
    expect(telefonoParaWhatsApp(null)).toBeNull()
  })

  it('"otro" no antepone la palabra "otro" al número -- el número ya viene completo', () => {
    const guardado = codificarTelefono('otro', '5493511234567')
    expect(telefonoParaWhatsApp(guardado)).toBe('5493511234567')
  })
})

describe('errorLongitudTelefono', () => {
  it('número dentro de un rango razonable: sin error', () => {
    expect(errorLongitudTelefono('54', '93511234567')).toBeNull()
  })

  it('sin número: sin error (el campo puede quedar vacío)', () => {
    expect(errorLongitudTelefono('54', '')).toBeNull()
  })

  it('número demasiado corto', () => {
    expect(errorLongitudTelefono('54', '123')).toMatch(/corto/)
  })

  it('número demasiado largo', () => {
    expect(errorLongitudTelefono('54', '1234567890123')).toMatch(/largo/)
  })
})
