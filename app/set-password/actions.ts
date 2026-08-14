'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { esContrasenaValida, mensajeContrasenaInvalida } from '@/lib/auth/validar-contrasena'

export async function setPassword(formData: FormData) {
  const password = formData.get('password') as string

  if (!esContrasenaValida(password)) {
    redirect(`/set-password?error=${encodeURIComponent(mensajeContrasenaInvalida())}`)
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    redirect(`/set-password?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/')
}
