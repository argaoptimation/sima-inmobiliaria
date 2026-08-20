import { describe, it, expect } from 'vitest'
import {
  telefonoParaGuardar,
  codigoSelectDesdeGuardado,
  telefonoParaWhatsApp,
  errorLongitudTelefono,
} from './prefijos'

describe('telefonoParaGuardar', () => {
  it('separa el prefijo real y el número, ambos sin símbolos', () => {
    expect(telefonoParaGuardar('54', '9 351 123-4567')).toEqual({ prefijo: '54', numero: '93511234567' })
  })

  it('"otro" guarda prefijo null -- el número ya viene completo', () => {
    expect(telefonoParaGuardar('otro', '5493511234567')).toEqual({ prefijo: null, numero: '5493511234567' })
  })

  it('"1-do" (República Dominicana) guarda el prefijo real "1"', () => {
    expect(telefonoParaGuardar('1-do', '8091234567')).toEqual({ prefijo: '1', numero: '8091234567' })
  })

  it('sin número local, ambos quedan en null aunque haya prefijo', () => {
    expect(telefonoParaGuardar('54', '')).toEqual({ prefijo: null, numero: null })
    expect(telefonoParaGuardar('54', '   ')).toEqual({ prefijo: null, numero: null })
  })
})

describe('codigoSelectDesdeGuardado', () => {
  it('devuelve el prefijo guardado tal cual', () => {
    expect(codigoSelectDesdeGuardado('598')).toBe('598')
  })

  it('sin prefijo guardado (null), cae en Argentina por default', () => {
    expect(codigoSelectDesdeGuardado(null)).toBe('54')
  })
})

describe('telefonoParaWhatsApp', () => {
  it('arma el número completo pegado, para wa.me', () => {
    expect(telefonoParaWhatsApp('54', '93511234567')).toBe('5493511234567')
  })

  it('sin prefijo (valor "otro" o legado), devuelve el número tal cual', () => {
    expect(telefonoParaWhatsApp(null, '5493511234567')).toBe('5493511234567')
  })

  it('sin número, devuelve null', () => {
    expect(telefonoParaWhatsApp('54', null)).toBeNull()
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
