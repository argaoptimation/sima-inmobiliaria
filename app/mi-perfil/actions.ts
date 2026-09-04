'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'
import { telefonoParaGuardar, errorLongitudTelefono } from '@/lib/telefono/prefijos'
import { mensajeDeError } from '@/lib/errores'

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

// Reemplaza al viejo actualizarNombre (04/09): además del nombre ahora se
// carga el teléfono, que hasta acá solo tenían los clientes -- el staff no
// tenía dónde ponerlo (pedido de Gabriel: "los acreedores, cobradores,
// vendedores, admin, etc., sí todos tienen que tener un campo donde poner
// sus datos personales"). El email no se toca acá: es la identidad de
// login, cambiarlo es cosa de un admin.
export async function actualizarDatosPersonales(formData: FormData) {
  const { supabase, userId } = await requireStaffLogueado()

  const fullName = (formData.get('fullName') as string)?.trim()
  const prefijo = ((formData.get('prefijo') as string) || '').trim()
  const telefonoNumero = ((formData.get('telefonoNumero') as string) || '').trim()

  if (!fullName) {
    redirect(`/mi-perfil?error=${encodeURIComponent('El nombre no puede estar vacío')}`)
  }

  if (!telefonoNumero) {
    redirect(`/mi-perfil?error=${encodeURIComponent('El teléfono es obligatorio')}`)
  }

  const errorTelefono = errorLongitudTelefono(prefijo, telefonoNumero)
  if (errorTelefono) {
    redirect(`/mi-perfil?error=${encodeURIComponent(errorTelefono)}`)
  }

  const { prefijo: telefonoPrefijo, numero: telefonoNumeroGuardar } = telefonoParaGuardar(
    prefijo,
    telefonoNumero
  )

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      telefono_prefijo: telefonoPrefijo,
      telefono_numero: telefonoNumeroGuardar,
    })
    .eq('id', userId)

  if (error) {
    redirect(`/mi-perfil?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  redirect('/mi-perfil?ok=1')
}

export async function actualizarDatosTransferencia(formData: FormData) {
  const { supabase, userId } = await requireStaffLogueado()

  const titular = (formData.get('titular') as string | null)?.trim()
  const alias = (formData.get('alias') as string | null)?.trim()
  const banco = (formData.get('banco') as string | null)?.trim()
  const cbuRaw = (formData.get('cbu') as string | null)?.trim()

  if (!tieneDatosTransferencia({ alias: alias ?? null, banco: banco ?? null, titular: titular ?? null })) {
    redirect(`/mi-perfil?error=${encodeURIComponent('Titular, alias y banco son obligatorios')}`)
  }

  const { error } = await supabase
    .from('profiles')
    .update({ titular, alias, banco, cbu: cbuRaw ? cbuRaw : null })
    .eq('id', userId)

  if (error) {
    redirect(`/mi-perfil?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  redirect('/mi-perfil?ok=1')
}
