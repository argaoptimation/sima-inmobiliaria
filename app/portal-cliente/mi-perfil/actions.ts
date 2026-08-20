'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { mensajeDeError } from '@/lib/errores'
import { telefonoParaGuardar, errorLongitudTelefono } from '@/lib/telefono/prefijos'

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

export async function actualizarMisDatosCliente(formData: FormData) {
  const { supabase, userId } = await requireClienteLogueado()

  const fullName = (formData.get('fullName') as string)?.trim()
  const dni = ((formData.get('dni') as string) || '').trim() || null
  const domicilio = ((formData.get('domicilio') as string) || '').trim() || null
  const prefijo = (formData.get('prefijo') as string) || ''
  const telefonoNumero = (formData.get('telefonoNumero') as string) || ''

  if (!fullName) {
    redirect(`/portal-cliente/mi-perfil?error=${encodeURIComponent('El nombre no puede estar vacío')}`)
  }

  const errorTelefono = errorLongitudTelefono(prefijo, telefonoNumero)
  if (errorTelefono) {
    redirect(`/portal-cliente/mi-perfil?error=${encodeURIComponent(errorTelefono)}`)
  }

  const { prefijo: telefonoPrefijo, numero: telefonoNumeroGuardar } = telefonoParaGuardar(
    prefijo,
    telefonoNumero
  )

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      dni,
      domicilio,
      telefono_prefijo: telefonoPrefijo,
      telefono_numero: telefonoNumeroGuardar,
    })
    .eq('id', userId)

  if (error) {
    const mensaje = mensajeDeError(error, { '23505': 'Ese DNI ya pertenece a otro cliente' })
    redirect(`/portal-cliente/mi-perfil?error=${encodeURIComponent(mensaje)}`)
  }

  redirect('/portal-cliente/mi-perfil?ok=1')
}
