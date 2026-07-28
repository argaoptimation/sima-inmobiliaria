'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export async function registrarPago(cuotaId: string, formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const monto = Number(formData.get('monto'))
  const moneda = formData.get('moneda') as 'USD' | 'ARS'
  const comprobante = formData.get('comprobante') as File

  const comprobantePath = `${user!.id}/${Date.now()}-${comprobante.name}`

  const admin = createAdminClient()

  const { error: errorUpload } = await admin.storage
    .from('comprobantes')
    .upload(comprobantePath, comprobante)

  if (errorUpload) {
    redirect(`/portal-cliente/pagar/${cuotaId}?error=${encodeURIComponent(errorUpload.message)}`)
  }

  const { error: errorPago } = await admin.from('pagos').insert({
    cliente_id: user!.id,
    monto,
    moneda,
    comprobante_path: comprobantePath,
  })

  if (errorPago) {
    redirect(`/portal-cliente/pagar/${cuotaId}?error=${encodeURIComponent(errorPago.message)}`)
  }

  redirect('/portal-cliente')
}
