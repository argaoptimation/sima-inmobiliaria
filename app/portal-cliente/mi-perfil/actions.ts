'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

async function requireClienteLogueado() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user!.id).single()

  if (!perfil || perfil.role !== 'cliente') {
    redirect('/mi-perfil')
  }

  return { supabase, userId: user!.id }
}

export async function actualizarNombreCliente(formData: FormData) {
  const { supabase, userId } = await requireClienteLogueado()

  const fullName = (formData.get('fullName') as string)?.trim()

  if (!fullName) {
    redirect(`/portal-cliente/mi-perfil?error=${encodeURIComponent('El nombre no puede estar vacío')}`)
  }

  const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', userId)

  if (error) {
    redirect(`/portal-cliente/mi-perfil?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/portal-cliente/mi-perfil?ok=1')
}
