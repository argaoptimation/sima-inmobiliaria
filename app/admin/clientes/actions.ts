'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { esContrasenaValida, mensajeContrasenaInvalida } from '@/lib/auth/validar-contrasena'

export async function resetearContrasenaCliente(clienteId: string, formData: FormData) {
  await requireAdministrador()

  const nuevaContrasena = (formData.get('nuevaContrasena') as string)?.trim()

  if (!nuevaContrasena || !esContrasenaValida(nuevaContrasena)) {
    redirect(
      `/admin/clientes/${clienteId}?error=${encodeURIComponent(mensajeContrasenaInvalida())}`
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

export async function eliminarCliente(clienteId: string) {
  await requireAdministrador()

  const admin = createAdminClient()
  // Igual que eliminarUsuarioStaff: si el cliente todavía tiene algún lote o
  // pago asociado (lotes.cliente_id / pagos.cliente_id, ambos "references
  // profiles(id)" sin cascade), la restricción de FK real de Postgres
  // rechaza el borrado. No hay chequeo previo de "sin deuda" -- la FK ya es
  // más estricta (también bloquea a un cliente que ya pagó todo pero sigue
  // con el lote asignado), y eso es lo que se quiere.
  const { error } = await admin.auth.admin.deleteUser(clienteId)

  if (error) {
    redirect(
      `/admin/clientes/${clienteId}?error=${encodeURIComponent(
        'No se pudo eliminar: esta cuenta todavía tiene lotes o pagos asociados'
      )}`
    )
  }

  redirect('/admin/clientes')
}
