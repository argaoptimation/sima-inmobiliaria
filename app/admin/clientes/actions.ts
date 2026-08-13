'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'

export async function resetearContrasenaCliente(clienteId: string, formData: FormData) {
  await requireAdministrador()

  const nuevaContrasena = (formData.get('nuevaContrasena') as string)?.trim()

  if (!nuevaContrasena || nuevaContrasena.length < 6) {
    redirect(
      `/admin/clientes/${clienteId}?error=${encodeURIComponent(
        'La contraseña tiene que tener al menos 6 caracteres'
      )}`
    )
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(clienteId, {
    password: nuevaContrasena,
  })

  if (error) {
    redirect(`/admin/clientes/${clienteId}?error=${encodeURIComponent(error.message)}`)
  }

  redirect(`/admin/clientes/${clienteId}?ok=${encodeURIComponent('Contraseña actualizada')}`)
}
