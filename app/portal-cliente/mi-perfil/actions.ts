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

// Solo el teléfono es editable por el cliente (04/09, pedido de Gabriel).
// Nombre/DNI/domicilio son los datos que figuran en el contrato y en los
// recibos -- se sacaron del form en la UI, pero el guard de verdad está
// acá: aunque alguien arme un POST a mano con esos campos, esta función ya
// ni siquiera los lee, así que no hay forma de pisarlos vía este endpoint.
export async function actualizarMisDatosCliente(formData: FormData) {
  const { supabase, userId } = await requireClienteLogueado()

  const prefijo = (formData.get('prefijo') as string) || ''
  const telefonoNumero = (formData.get('telefonoNumero') as string) || ''

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
      telefono_prefijo: telefonoPrefijo,
      telefono_numero: telefonoNumeroGuardar,
    })
    .eq('id', userId)

  if (error) {
    redirect(`/portal-cliente/mi-perfil?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  redirect('/portal-cliente/mi-perfil?ok=1')
}
