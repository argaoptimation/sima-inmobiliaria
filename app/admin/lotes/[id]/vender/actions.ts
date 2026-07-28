'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function venderLote(loteId: string, formData: FormData) {
  const email = formData.get('email') as string
  const fullName = formData.get('fullName') as string

  const admin = createAdminClient()

  const { data: invited, error: errorInvite } = await admin.auth.admin.inviteUserByEmail(email)

  if (errorInvite || !invited.user) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorInvite?.message ?? 'error desconocido')}`
    )
  }

  const { error: errorProfile } = await admin.from('profiles').insert({
    id: invited.user.id,
    role: 'cliente',
    full_name: fullName,
  })

  if (errorProfile) {
    redirect(`/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorProfile.message)}`)
  }

  const supabase = await createClient()
  const { error: errorLote } = await supabase
    .from('lotes')
    .update({ estado: 'vendido', cliente_id: invited.user.id })
    .eq('id', loteId)

  if (errorLote) {
    redirect(`/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorLote.message)}`)
  }

  redirect('/admin/lotes')
}
