'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function actualizarMiPerfil(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user!.id).single()

  if (!perfil || perfil.role === 'cliente') {
    redirect('/portal-cliente')
  }

  const fullName = formData.get('fullName') as string

  if (!fullName?.trim()) {
    redirect('/mi-perfil?error=' + encodeURIComponent('El nombre no puede estar vacío'))
  }

  const datosTransferenciaRaw = formData.get('datosTransferencia') as string | null
  const datosTransferencia = datosTransferenciaRaw?.trim() ? datosTransferenciaRaw.trim() : null

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName, datos_transferencia: datosTransferencia })
    .eq('id', user!.id)

  if (error) {
    redirect(`/mi-perfil?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/mi-perfil?ok=1')
}
