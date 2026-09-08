'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { esContrasenaValida, mensajeContrasenaInvalida } from '@/lib/auth/validar-contrasena'
import { mensajeDeError } from '@/lib/errores'

// El cliente se cambia su propia contraseña.
//
// Hacía falta desde que los compradores de lotes ya vendidos se cargan a
// mano con una contraseña que les dicta Nicolás (08/09): sin esta pantalla,
// esa contraseña de arranque les quedaba para siempre, porque el portal no
// tenía dónde cambiarla -- "Mi perfil" se sacó a propósito el 06/09 y no
// vuelve: el cliente sigue sin poder editar su nombre, DNI ni domicilio,
// que los mantiene la inmobiliaria. Esto es solo la contraseña.
export async function cambiarMiContrasena(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .maybeSingle()

  // Esta pantalla es del portal del cliente; el staff tiene la suya en
  // /mi-perfil.
  if (perfil?.role !== 'cliente') redirect('/')

  const nueva = ((formData.get('nuevaContrasena') as string) || '').trim()
  const repetida = ((formData.get('repetirContrasena') as string) || '').trim()

  if (!esContrasenaValida(nueva)) {
    redirect(`/portal-cliente/contrasena?error=${encodeURIComponent(mensajeContrasenaInvalida())}`)
  }

  if (nueva !== repetida) {
    redirect(
      `/portal-cliente/contrasena?error=${encodeURIComponent('Las dos contraseñas no coinciden')}`
    )
  }

  // updateUser sobre la sesión del propio cliente: no hace falta (ni
  // conviene) el cliente admin acá.
  const { error } = await supabase.auth.updateUser({ password: nueva })

  if (error) {
    redirect(`/portal-cliente/contrasena?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  // Vuelve a esta misma pantalla y no al inicio: la raíz del portal no
  // muestra avisos, así que el "listo" se perdería.
  redirect(
    `/portal-cliente/contrasena?ok=${encodeURIComponent('Listo, tu contraseña quedó cambiada.')}`
  )
}
