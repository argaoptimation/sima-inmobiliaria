'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { esContrasenaValida, mensajeContrasenaInvalida } from '@/lib/auth/validar-contrasena'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'
import { telefonoParaGuardar, errorLongitudTelefono } from '@/lib/telefono/prefijos'
import { mensajeDeError } from '@/lib/errores'

export async function setPassword(formData: FormData) {
  const password = formData.get('password') as string

  if (!esContrasenaValida(password)) {
    redirect(`/set-password?error=${encodeURIComponent(mensajeContrasenaInvalida())}`)
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: perfil } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null }

  const esStaff = Boolean(perfil) && perfil!.role !== 'cliente'

  // Los datos mínimos del staff se validan ANTES de tocar la contraseña:
  // si algo falta, el formulario vuelve con el error y la contraseña queda
  // sin cambiar, así el link de invitación sigue sirviendo para reintentar
  // (04/09, pedido de Gabriel de pedir estos datos al crear la cuenta).
  let datosStaff: {
    titular: string
    alias: string
    banco: string
    cbu: string | null
    telefono_prefijo: string | null
    telefono_numero: string | null
  } | null = null

  if (esStaff) {
    const titular = ((formData.get('titular') as string) || '').trim()
    const alias = ((formData.get('alias') as string) || '').trim()
    const banco = ((formData.get('banco') as string) || '').trim()
    const cbu = ((formData.get('cbu') as string) || '').trim()
    const prefijo = ((formData.get('prefijo') as string) || '').trim()
    const telefonoNumero = ((formData.get('telefonoNumero') as string) || '').trim()

    if (!tieneDatosTransferencia({ titular, alias, banco })) {
      redirect(
        `/set-password?error=${encodeURIComponent('Titular, alias y banco son obligatorios')}`
      )
    }

    if (!telefonoNumero) {
      redirect(`/set-password?error=${encodeURIComponent('El teléfono es obligatorio')}`)
    }

    const errorTelefono = errorLongitudTelefono(prefijo, telefonoNumero)
    if (errorTelefono) {
      redirect(`/set-password?error=${encodeURIComponent(errorTelefono)}`)
    }

    const telefono = telefonoParaGuardar(prefijo, telefonoNumero)

    datosStaff = {
      titular,
      alias,
      banco,
      cbu: cbu || null,
      telefono_prefijo: telefono.prefijo,
      telefono_numero: telefono.numero,
    }
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    const mensaje = mensajeDeError(error, {
      same_password: 'La nueva contraseña tiene que ser distinta a la anterior',
      session_expired: 'El link expiró. Pedí que te reenvíen la invitación.',
      session_not_found: 'El link expiró. Pedí que te reenvíen la invitación.',
    })
    redirect(`/set-password?error=${encodeURIComponent(mensaje)}`)
  }

  if (datosStaff && user) {
    const { error: errorPerfil } = await supabase
      .from('profiles')
      .update(datosStaff)
      .eq('id', user.id)

    // La contraseña ya quedó cambiada: si falla solo el guardado del
    // perfil no se puede "volver atrás", así que se avisa y se deja al
    // usuario adentro para que lo complete desde Mi perfil.
    if (errorPerfil) {
      redirect(
        `/mi-perfil?error=${encodeURIComponent(
          'Tu contraseña quedó guardada, pero no se pudieron guardar tus datos. Completalos acá.'
        )}`
      )
    }
  }

  redirect('/')
}
