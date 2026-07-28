'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export async function subirComprobante(pagoId: string, formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: pago } = await supabase
    .from('pagos')
    .select('id')
    .eq('id', pagoId)
    .eq('cliente_id', user!.id)
    .single()

  if (!pago) {
    redirect('/portal-cliente')
  }

  const comprobante = formData.get('comprobante') as File

  if (!comprobante || comprobante.size === 0) {
    redirect(
      `/portal-cliente/pagos/${pagoId}/comprobante?error=${encodeURIComponent('Seleccioná un archivo')}`
    )
  }

  const comprobantePath = `${user!.id}/${Date.now()}-${comprobante.name}`

  const admin = createAdminClient()

  const { error: errorUpload } = await admin.storage
    .from('comprobantes')
    .upload(comprobantePath, comprobante)

  if (errorUpload) {
    redirect(
      `/portal-cliente/pagos/${pagoId}/comprobante?error=${encodeURIComponent(errorUpload.message)}`
    )
  }

  const { error: errorUpdate } = await admin
    .from('pagos')
    .update({ comprobante_path: comprobantePath })
    .eq('id', pagoId)
    .eq('cliente_id', user!.id)

  if (errorUpdate) {
    redirect(
      `/portal-cliente/pagos/${pagoId}/comprobante?error=${encodeURIComponent(errorUpdate.message)}`
    )
  }

  redirect('/portal-cliente')
}
