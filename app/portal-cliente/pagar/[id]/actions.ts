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

  const admin = createAdminClient()

  const { data: pago, error: errorPago } = await admin
    .from('pagos')
    .insert({
      cliente_id: user!.id,
      monto,
      moneda,
    })
    .select('id')
    .single()

  if (errorPago || !pago) {
    redirect(
      `/portal-cliente/pagar/${cuotaId}?error=${encodeURIComponent(errorPago?.message ?? 'error desconocido')}`
    )
  }

  redirect(`/portal-cliente/pagos/${pago.id}/comprobante`)
}
