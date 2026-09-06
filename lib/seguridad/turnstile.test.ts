import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { captchaHabilitado, obtenerSiteKeyTurnstile, verificarCaptcha } from './turnstile'

const ENV_ORIGINAL = { ...process.env }

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  delete process.env.TURNSTILE_SECRET_KEY
})

afterEach(() => {
  process.env = { ...ENV_ORIGINAL }
})

describe('captcha de Turnstile', () => {
  it('está apagado si no hay ninguna variable seteada (local y tests)', async () => {
    expect(captchaHabilitado()).toBe(false)
    expect(obtenerSiteKeyTurnstile()).toBeNull()
    // Apagado, un formulario sin token pasa igual.
    await expect(verificarCaptcha(null)).resolves.toBe(true)
  })

  it('sigue apagado con solo la site key: un widget que el servidor no valida no sirve', () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = '0x4AAAAAAEp59JO_9CuK23m_'

    expect(captchaHabilitado()).toBe(false)
    expect(obtenerSiteKeyTurnstile()).toBeNull()
  })

  it('sigue apagado con solo el secret: sin site key no hay widget que resolver', () => {
    process.env.TURNSTILE_SECRET_KEY = 'secreto'

    expect(captchaHabilitado()).toBe(false)
    expect(obtenerSiteKeyTurnstile()).toBeNull()
  })

  it('se prende con las dos, y ahí un formulario sin token se rechaza', async () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = '0x4AAAAAAEp59JO_9CuK23m_'
    process.env.TURNSTILE_SECRET_KEY = 'secreto'

    expect(captchaHabilitado()).toBe(true)
    expect(obtenerSiteKeyTurnstile()).toBe('0x4AAAAAAEp59JO_9CuK23m_')
    // Sin token ni siquiera se le pregunta a Cloudflare.
    await expect(verificarCaptcha(null)).resolves.toBe(false)
    await expect(verificarCaptcha('')).resolves.toBe(false)
  })
})
