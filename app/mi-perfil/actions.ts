'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

async function requireStaffLogueado() {
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

  return { supabase, userId: user!.id }
}

export async function actualizarNombre(formData: FormData) {
  const { supabase, userId } = await requireStaffLogueado()

  const fullName = formData.get('fullName') as string

  if (!fullName?.trim()) {
    redirect(`/mi-perfil?error=${encodeURIComponent('El nombre no puede estar vacío')}`)
  }

  const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', userId)

  if (error) {
    redirect(`/mi-perfil?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/mi-perfil?ok=1')
}

export async function actualizarDatosTransferencia(formData: FormData) {
  const { supabase, userId } = await requireStaffLogueado()

  const titular = (formData.get('titular') as string | null)?.trim()
  const alias = (formData.get('alias') as string | null)?.trim()
  const banco = (formData.get('banco') as string | null)?.trim()
  const cbuRaw = (formData.get('cbu') as string | null)?.trim()

  if (!titular || !alias || !banco) {
    redirect(`/mi-perfil?error=${encodeURIComponent('Titular, alias y banco son obligatorios')}`)
  }

  const { error } = await supabase
    .from('profiles')
    .update({ titular, alias, banco, cbu: cbuRaw ? cbuRaw : null })
    .eq('id', userId)

  if (error) {
    redirect(`/mi-perfil?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/mi-perfil?ok=1')
}
