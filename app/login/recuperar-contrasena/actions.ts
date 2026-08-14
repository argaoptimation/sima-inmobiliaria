'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function solicitarRecuperacion(formData: FormData) {
  const supabase = await createClient()

  const email = ((formData.get('email') as string) || '').trim()

  if (!email) {
    redirect(`/login/recuperar-contrasena?error=${encodeURIComponent('Ingresá tu email')}`)
  }

  // No revisamos el resultado ni distinguimos "el email no existe" del caso
  // exitoso: mostrar siempre el mismo mensaje evita que alguien de afuera
  // pueda usar este formulario para averiguar qué emails tienen cuenta.
  await supabase.auth.resetPasswordForEmail(email)

  redirect('/login/recuperar-contrasena?ok=1')
}
