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

  it('normal: usa Lote/mza/loteo cuando esos datos están cargados', () => {
    const mensaje = armarMensajeWhatsApp('normal', {
      ...DATOS,
      numeroLote: '12',
      manzana: '3',
      nombreLoteo: 'Loteo San Martín',
    })
    expect(mensaje).toContain('Lote 12, mza 3, de Loteo San Martín')
  })

  it('atrasado: avisa que la cuota ya venció', () => {
    const mensaje = armarMensajeWhatsApp('atrasado', DATOS)
    expect(mensaje).toContain('Juan Pérez')
    expect(mensaje).toContain('YA VENCIÓ')
    expect(mensaje).toContain('15 de agosto de 2026')
  })

  it('moroso: lista los meses de las cuotas vencidas', () => {
    const mensaje = armarMensajeWhatsApp('moroso', {
      ...DATOS,
      monto: 2000,
      fechasVencidas: ['2026-07-01', '2026-08-01'],
    })
    expect(mensaje).toContain('julio y agosto')
    expect(mensaje).toContain('2000 USD')
  })

  it('prejudicial: menciona el área legal y lista los meses vencidos', () => {
    const mensaje = armarMensajeWhatsApp('prejudicial', {
      ...DATOS,
      monto: 3000,
      fechasVencidas: ['2026-06-01', '2026-07-01', '2026-08-01'],
    })
    expect(mensaje).toContain('área legal')
    expect(mensaje).toContain('junio, julio y agosto')
  })

  it('normal, atrasado, moroso y prejudicial tienen textos distintos', () => {
    const datosConVencidas = { ...DATOS, fechasVencidas: [DATOS.fechaVencimiento] }
    const textos = new Set([
      armarMensajeWhatsApp('normal', DATOS),
      armarMensajeWhatsApp('atrasado', DATOS),
      armarMensajeWhatsApp('moroso', datosConVencidas),
      armarMensajeWhatsApp('prejudicial', datosConVencidas),
    ])
    expect(textos.size).toBe(4)
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
