'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { obtenerSiteUrl } from '@/lib/config/site-url'

export async function solicitarRecuperacion(formData: FormData) {
  const supabase = await createClient()

  const email = ((formData.get('email') as string) || '').trim()

  if (!email) {
    redirect(`/login/recuperar-contrasena?error=${encodeURIComponent('Ingresá tu email')}`)
  }

  // No revisamos el resultado ni distinguimos "el email no existe" del caso
  // exitoso: mostrar siempre el mismo mensaje evita que alguien de afuera
  // pueda usar este formulario para averiguar qué emails tienen cuenta.
  // redirectTo explícito -- mismo motivo/bug que las invitaciones (ver
  // lib/config/site-url.ts): sin esto, dependía en silencio del Site URL
  // del dashboard de Supabase (localhost).
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${obtenerSiteUrl()}/auth/confirm`,
  })

  redirect('/login/recuperar-contrasena?ok=1')
}
