'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

const ROLES_STAFF = ['acreedor', 'vendedor', 'cobrador'] as const

export async function crearUsuarioStaff(formData: FormData) {
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
