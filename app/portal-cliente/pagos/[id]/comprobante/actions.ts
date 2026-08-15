'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { excedeTamanioMaximo, MAX_ARCHIVO_MB } from '@/lib/storage/validar-tamanio-archivo'

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
    .select('id, confirmado_acreedor_por, confirmado_admin_por')
    .eq('id', pagoId)
    .eq('cliente_id', user!.id)
    .single()

  if (!pago) {
    redirect('/portal-cliente')
  }

  if (pago.confirmado_acreedor_por || pago.confirmado_admin_por) {
    // Ya hay una confirmacion cargada sobre el comprobante actual: no dejamos
    // que el cliente lo reemplace y rompa el rastro de auditoria.
    redirect(`/portal-cliente/pagos/${pagoId}/comprobante`)
  }

  const comprobante = formData.get('comprobante') as File

  if (!comprobante || comprobante.size === 0) {
    redirect(
      `/portal-cliente/pagos/${pagoId}/comprobante?error=${encodeURIComponent('Seleccioná un archivo')}`
    )
  }

  if (excedeTamanioMaximo(comprobante)) {
    redirect(
      `/portal-cliente/pagos/${pagoId}/comprobante?error=${encodeURIComponent(
        `El comprobante pesa más de ${MAX_ARCHIVO_MB} MB — subí uno más liviano.`
      )}`
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

  // Claim atomico: si durante el upload alguien confirmo el pago, este update
  // ya no matchea ninguna fila y no pisamos comprobante_path de un pago
  // que ya esta en revision (mismo patron que usa confirmarPago).
  const { data: actualizado, error: errorUpdate } = await admin
    .from('pagos')
    .update({ comprobante_path: comprobantePath })
    .eq('id', pagoId)
    .eq('cliente_id', user!.id)
    .is('confirmado_acreedor_por', null)
    .is('confirmado_admin_por', null)
    .select('id')
    .single()

  if (errorUpdate || !actualizado) {
    redirect(`/portal-cliente/pagos/${pagoId}/comprobante`)
  }

  redirect('/portal-cliente')
}
