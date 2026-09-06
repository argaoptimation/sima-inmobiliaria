'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { obtenerSiteUrl } from '@/lib/config/site-url'
import { verificarLimiteIntentos } from '@/lib/seguridad/rate-limit'
import { hayCupoDeEmailDePrueba } from '@/lib/auth/invitar-por-email'
import { MENSAJE_CAPTCHA_FALLIDO, verificarCaptcha } from '@/lib/seguridad/turnstile'

export async function solicitarRecuperacion(formData: FormData) {
  const supabase = await createClient()

  const email = ((formData.get('email') as string) || '').trim()

  if (!email) {
    redirect(`/login/recuperar-contrasena?error=${encodeURIComponent('Ingresá tu email')}`)
  }

  // Captcha (06/09): este formulario es el más barato de automatizar desde
  // afuera -- no necesita saber ninguna contraseña y cada request gasta un
  // envío real de Supabase.
  const captchaOk = await verificarCaptcha(
    (formData.get('cf-turnstile-response') as string) || null
  )

  if (!captchaOk) {
    redirect(`/login/recuperar-contrasena?error=${encodeURIComponent(MENSAJE_CAPTCHA_FALLIDO)}`)
  }

  // Rate limit (04/09, pedido de Gabriel) -- este endpoint dispara un email
  // real de Supabase por cada request, y ya nos quedamos sin cupo una vez
  // por pegarle muchas veces seguidas en pruebas (ver memoria
  // feedback_supabase_email_rate_limit). Límite más estricto que el login
  // (3 cada 15 min) porque el costo de cada intento es mayor. Si se supera,
  // seguimos mostrando el MISMO ?ok=1 de siempre en vez de un error
  // distinto -- solo dejamos de mandar el email de nuevo, sin agregar una
  // señal nueva de "este email existe/no existe" ni de "está bloqueado".
  const permitido = await verificarLimiteIntentos(email.toLowerCase(), 'recuperar-contrasena', 3, 15)

  // Mismo cupo diario que las invitaciones (06/09): el suite E2E también
  // pasa por acá y cada request gasta un envío real del proyecto de
  // Supabase. Una dirección real nunca toca este contador.
  const conCupo = permitido && (await hayCupoDeEmailDePrueba(email))

  if (conCupo) {
    // No revisamos el resultado ni distinguimos "el email no existe" del
    // caso exitoso: mostrar siempre el mismo mensaje evita que alguien de
    // afuera pueda usar este formulario para averiguar qué emails tienen
    // cuenta. redirectTo explícito -- mismo motivo/bug que las
    // invitaciones (ver lib/config/site-url.ts): sin esto, dependía en
    // silencio del Site URL del dashboard de Supabase (localhost).
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${obtenerSiteUrl()}/auth/confirm`,
    })
  }

  redirect('/login/recuperar-contrasena?ok=1')
}
