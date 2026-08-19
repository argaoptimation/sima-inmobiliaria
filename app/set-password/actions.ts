'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { esContrasenaValida, mensajeContrasenaInvalida } from '@/lib/auth/validar-contrasena'
import { mensajeDeError } from '@/lib/errores'

export async function setPassword(formData: FormData) {
  const password = formData.get('password') as string

  if (!esContrasenaValida(password)) {
    redirect(`/set-password?error=${encodeURIComponent(mensajeContrasenaInvalida())}`)
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    const mensaje = mensajeDeError(error, {
      same_password: 'La nueva contraseña tiene que ser distinta a la anterior',
      session_expired: 'El link expiró. Pedí que te reenvíen la invitación.',
      session_not_found: 'El link expiró. Pedí que te reenvíen la invitación.',
    })
    redirect(`/set-password?error=${encodeURIComponent(mensaje)}`)
  }

  redirect('/')
}
