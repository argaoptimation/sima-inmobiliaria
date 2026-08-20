import { describe, expect, it } from 'vitest'
import { armarLinkWhatsApp, armarMensajeWhatsApp } from './plantillas-whatsapp'

const DATOS = {
  nombre: 'Juan Pérez',
  lote: 'Lote 5',
  monto: 1000,
  moneda: 'USD',
  fechaVencimiento: '2026-08-15',
}

describe('armarMensajeWhatsApp', () => {
  it('normal: incluye nombre, lote, monto, moneda y la fecha en español', () => {
    const mensaje = armarMensajeWhatsApp('normal', DATOS)
    expect(mensaje).toContain('Juan Pérez')
    expect(mensaje).toContain('Lote 5')
    expect(mensaje).toContain('1000 USD')
    expect(mensaje).toContain('15 de agosto de 2026')
  })

  it('moroso: incluye nombre, lote, monto y moneda', () => {
    const mensaje = armarMensajeWhatsApp('moroso', DATOS)
    expect(mensaje).toContain('Juan Pérez')
    expect(mensaje).toContain('Lote 5')
    expect(mensaje).toContain('1000 USD')
  })

  it('normal y moroso tienen textos distintos', () => {
    expect(armarMensajeWhatsApp('normal', DATOS)).not.toBe(armarMensajeWhatsApp('moroso', DATOS))
  })

  it('prejudicial todavía no tiene plantilla -- devuelve null', () => {
    expect(armarMensajeWhatsApp('prejudicial', DATOS)).toBeNull()
  })

  it('ultimo_aviso todavía no tiene plantilla -- devuelve null', () => {
    expect(armarMensajeWhatsApp('ultimo_aviso', DATOS)).toBeNull()
  })
})

describe('armarLinkWhatsApp', () => {
  it('arma un link wa.me con el teléfono limpio de símbolos', () => {
    const link = armarLinkWhatsApp('+54 9 351 123-4567', 'hola')
    expect(link).toBe('https://wa.me/5493511234567?text=hola')
  })

  it('codifica el mensaje para que sea válido en una URL', () => {
    const link = armarLinkWhatsApp('3511234567', 'Hola! ¿Cómo estás?\nSaludos')
    expect(link).toContain(encodeURIComponent('Hola! ¿Cómo estás?\nSaludos'))
    expect(link).not.toContain('\n')
  })
})
