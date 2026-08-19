'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { mensajeDeError } from '@/lib/errores'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
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
