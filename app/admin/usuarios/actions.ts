'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'
import { mensajeDeError } from '@/lib/errores'

const ROLES_STAFF = ['acreedor', 'vendedor', 'cobrador'] as const

export async function crearUsuarioStaff(formData: FormData) {
  await requireAdministrador()

  const email = formData.get('email') as string
  const fullName = formData.get('fullName') as string
  const role = formData.get('role') as (typeof ROLES_STAFF)[number]

  if (!ROLES_STAFF.includes(role)) {
    redirect('/admin/usuarios?error=rol+invalido')
  }

  const admin = createAdminClient()

  const { data: invited, error: errorInvite } = await admin.auth.admin.inviteUserByEmail(email)

  if (errorInvite || !invited.user) {
    redirect(`/admin/usuarios?error=${encodeURIComponent(mensajeDeError(errorInvite))}`)
  }

  const { error: errorProfile } = await admin
    .from('profiles')
    .insert({ id: invited.user.id, role, full_name: fullName, email })

  if (errorProfile) {
    redirect(`/admin/usuarios?error=${encodeURIComponent(mensajeDeError(errorProfile))}`)
  }

  redirect('/admin/usuarios')
}

export async function actualizarNombreStaff(userId: string, formData: FormData) {
  await requireAdministrador()

  const fullName = (formData.get('fullName') as string)?.trim()

  if (!fullName) {
    redirect(`/admin/usuarios?error=${encodeURIComponent('El nombre no puede estar vacío')}`)
  }

  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ full_name: fullName }).eq('id', userId)

  if (error) {
    redirect(`/admin/usuarios?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  redirect('/admin/usuarios')
}

export async function eliminarUsuarioStaff(userId: string) {
  await requireAdministrador()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user!.id === userId) {
    redirect(
      `/admin/usuarios?error=${encodeURIComponent('No podés eliminar tu propia cuenta')}`
    )
  }

  const admin = createAdminClient()
  // Borra el usuario de auth.users; profiles.id tiene "on delete cascade"
  // contra auth.users, así que la fila de profiles se borra sola. Si esta
  // cuenta todavía está referenciada por algún lote/reserva/pago (varias
  // columnas de esas tablas apuntan a profiles.id sin cascada), el borrado
  // falla por la restricción de clave foránea y devolvemos un mensaje claro
  // en vez del error crudo de Postgres.
  const { error } = await admin.auth.admin.deleteUser(userId)

  if (error) {
    redirect(
      `/admin/usuarios?error=${encodeURIComponent(
        'No se pudo eliminar: esta cuenta todavía está referenciada en lotes, reservas o pagos existentes'
      )}`
    )
  }

  redirect('/admin/usuarios')
}

export async function actualizarDatosTransferenciaStaff(userId: string, formData: FormData) {
  await requireAdministrador()

  const titular = (formData.get('titular') as string | null)?.trim()
  const alias = (formData.get('alias') as string | null)?.trim()
  const banco = (formData.get('banco') as string | null)?.trim()
  const cbuRaw = (formData.get('cbu') as string | null)?.trim()

  if (!tieneDatosTransferencia({ alias: alias ?? null, banco: banco ?? null, titular: titular ?? null })) {
    redirect(
      `/admin/usuarios?error=${encodeURIComponent('Titular, alias y banco son obligatorios')}`
    )
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ titular, alias, banco, cbu: cbuRaw ? cbuRaw : null })
    .eq('id', userId)

  if (error) {
    redirect(`/admin/usuarios?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  redirect('/admin/usuarios')
}
