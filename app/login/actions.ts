'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { mensajeDeError } from '@/lib/errores'
import { verificarLimiteIntentos } from '@/lib/seguridad/rate-limit'

export async function login(formData: FormData) {
  const email = ((formData.get('email') as string) || '').trim().toLowerCase()
  const password = (formData.get('password') as string) || ''
  const admin = createAdminClient()

  // Rate limit propio (04/09, pedido de Gabriel) -- además del que ya trae
  // Supabase Auth (over_request_rate_limit más abajo, por IP a nivel de todo
  // el proyecto), esto limita intentos repetidos contra un email puntual.
  const permitido = await verificarLimiteIntentos(email || 'sin-email', 'login', 10, 15)
  if (!permitido) {
    await admin.from('historial_ingresos').insert({
      email,
      exitoso: false,
      motivo_error: 'Bloqueado por rate limit (demasiados intentos)',
    })
    redirect(
      `/login?error=${encodeURIComponent('Demasiados intentos con este email. Esperá unos minutos y volvé a intentar.')}`
    )
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  // Log de ingresos (04/09, pedido de Gabriel: "quién entró y cuándo") --
  // se registra tanto el éxito como el fracaso, para que también sirva
  // como señal de intentos de acceso indebido.
  await admin.from('historial_ingresos').insert({
    email,
    user_id: data?.user?.id ?? null,
    exitoso: !error,
    motivo_error: error ? (error.code ?? error.message) : null,
  })

  if (error) {
    const mensaje = mensajeDeError(error, {
      invalid_credentials: 'Email o contraseña incorrectos',
      email_not_confirmed: 'Confirmá tu email antes de iniciar sesión',
      user_banned: 'Esta cuenta fue deshabilitada',
      over_request_rate_limit: 'Demasiados intentos. Esperá un momento y volvé a intentar',
    })
    redirect(`/login?error=${encodeURIComponent(mensaje)}`)
  }

  redirect('/')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
