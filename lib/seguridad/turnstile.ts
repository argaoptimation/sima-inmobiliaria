// Captcha de Cloudflare Turnstile en los dos formularios públicos de la
// plataforma: el login y "recuperar contraseña" (06/09, pedido de Gabriel).
//
// Deliberadamente NO se usa el captcha que trae Supabase Auth
// ("Attack Protection" en el dashboard). Ese es un interruptor global del
// proyecto, y el proyecto de Supabase es uno solo para producción, local y
// el suite E2E: prenderlo ahí obligaría a resolver un widget real hasta
// para correr los tests. Verificándolo acá, el captcha se prende o se apaga
// por entorno con dos variables, y todo lo demás sigue igual.
//
// Está activo únicamente si las DOS variables están seteadas:
//   NEXT_PUBLIC_TURNSTILE_SITE_KEY  (site key, es pública, va en el HTML)
//   TURNSTILE_SECRET_KEY            (secret key, solo en el servidor)
// Sin ellas el formulario ni siquiera dibuja el widget y el server action no
// exige token -- que es como corre en local y en los tests.

const URL_VERIFICACION = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export function captchaHabilitado(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY)
}

// Site key para dibujar el widget, o null si el captcha está apagado.
//
// Mira las DOS variables a propósito: con solo la site key seteada el
// formulario mostraría un captcha que el servidor no valida -- teatro de
// seguridad, y peor, un widget que el usuario tiene que resolver para nada.
export function obtenerSiteKeyTurnstile(): string | null {
  if (!captchaHabilitado()) return null

  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null
}

// `true` si el formulario puede seguir. Con el captcha apagado siempre da
// `true`. Con el captcha prendido, un token vacío, vencido o ya usado da
// `false`.
//
// Si Cloudflare no contesta (caída, timeout) también da `false`: preferimos
// que el login rebote con "verificación fallida, probá de nuevo" antes que
// dejar pasar todo justo cuando el captcha no está funcionando.
export async function verificarCaptcha(token: string | null): Promise<boolean> {
  if (!captchaHabilitado()) return true

  if (!token) return false

  try {
    const respuesta = await fetch(URL_VERIFICACION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
      }),
      signal: AbortSignal.timeout(10_000),
    })

    const resultado = (await respuesta.json()) as { success?: boolean; 'error-codes'?: string[] }

    if (!resultado.success) {
      console.error('Turnstile rechazó el token:', resultado['error-codes'])
    }

    return resultado.success === true
  } catch (error) {
    console.error('No se pudo verificar el captcha con Cloudflare:', error)
    return false
  }
}

export const MENSAJE_CAPTCHA_FALLIDO =
  'No pudimos verificar que no seas un robot. Recargá la página y probá de nuevo.'
