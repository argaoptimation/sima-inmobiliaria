'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { mensajeDeError } from '@/lib/errores'

// El cliente puede borrar un pago que él mismo registró por error (ej. tocó
// "Ya transferí" dos veces, o se confundió de cuota) -- pedido de Gabriel
// 27/08 tras ver que un pago duplicado quedaba visible para el acreedor/
// admin sin forma de sacarlo. Solo mientras nadie lo confirmó todavía: una
// vez que el acreedor o el admin confirmaron la recepción, ya no se puede
// tocar (mismo guard que ya usa subirComprobante).
export async function eliminarPago(pagoId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: pago } = await supabase
    .from('pagos')
    .select('id, lote_id, cliente_id, comprobante_path, confirmado_acreedor_por, confirmado_admin_por')
    .eq('id', pagoId)
    .eq('cliente_id', user!.id)
    .single()

  if (!pago) {
    redirect('/portal-cliente')
  }

  const volverA = `/portal-cliente/lotes/${pago!.lote_id}`

  if (pago!.confirmado_acreedor_por || pago!.confirmado_admin_por) {
    redirect(
      `${volverA}?error=${encodeURIComponent('Este pago ya está confirmado, no se puede eliminar')}`
    )
  }

  const admin = createAdminClient()

  if (pago!.comprobante_path) {
    await admin.storage.from('comprobantes').remove([pago!.comprobante_path])
  }

  // Claim atomico con los mismos .is(...) que subirComprobante -- si justo en
  // este momento alguien confirmó el pago, este delete deja de matchear
  // ninguna fila y no se borra un pago que ya está en revisión.
  const { error, count } = await supabase
    .from('pagos')
    .delete({ count: 'exact' })
    .eq('id', pagoId)
    .eq('cliente_id', user!.id)
    .is('confirmado_acreedor_por', null)
    .is('confirmado_admin_por', null)

  if (error) {
    redirect(`${volverA}?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  if (!count) {
    redirect(
      `${volverA}?error=${encodeURIComponent('Este pago ya está confirmado, no se puede eliminar')}`
    )
  }

  redirect(`${volverA}?ok=${encodeURIComponent('Pago eliminado')}`)
}
