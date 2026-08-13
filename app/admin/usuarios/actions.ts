'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'

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
    redirect(
      `/admin/usuarios?error=${encodeURIComponent(errorInvite?.message ?? 'error desconocido')}`
    )
  }

  const { error: errorProfile } = await admin
    .from('profiles')
    .insert({ id: invited.user.id, role, full_name: fullName })

  if (errorProfile) {
    redirect(`/admin/usuarios?error=${encodeURIComponent(errorProfile.message)}`)
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
    redirect(`/admin/usuarios?error=${encodeURIComponent(error.message)}`)
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
    redirect(`/admin/usuarios?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/admin/usuarios')
}
