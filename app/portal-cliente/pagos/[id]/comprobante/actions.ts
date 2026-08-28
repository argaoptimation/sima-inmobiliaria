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

  // El archivo ya se subió directo del navegador a Supabase Storage
  // (CampoArchivoDirecto) -- acá solo llega el path resultante, nunca el
  // archivo en sí. Evita el tope duro de 4.5 MB por request de Vercel.
  const comprobantePath = ((formData.get('comprobante') as string) || '').trim()

  if (!comprobantePath) {
    redirect(
      `/portal-cliente/pagos/${pagoId}/comprobante?error=${encodeURIComponent('Seleccioná un archivo')}`
    )
  }

  // Sanity check server-side: el path tiene que caer dentro de la propia
  // carpeta del usuario -- lo mismo que ya exige la policy RLS de Storage,
  // pero repetido acá para no confiar ciegamente en un string que llega
  // del cliente (podría no coincidir si alguien lo edita a mano).
  if (!comprobantePath.startsWith(`${user!.id}/`)) {
    redirect(
      `/portal-cliente/pagos/${pagoId}/comprobante?error=${encodeURIComponent('Archivo inválido, probá subirlo de nuevo')}`
    )
  }

  const admin = createAdminClient()

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
