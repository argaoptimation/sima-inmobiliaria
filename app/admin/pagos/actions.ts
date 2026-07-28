'use server'

import { createClient } from '@/lib/supabase/server'
import { imputarPagoFIFO } from '@/lib/pagos/imputar-fifo'
import { revalidatePath } from 'next/cache'

export async function confirmarPago(pagoId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!perfil || (perfil.role !== 'acreedor' && perfil.role !== 'administrador')) {
    return
  }

  const campoPor = perfil.role === 'acreedor' ? 'confirmado_acreedor_por' : 'confirmado_admin_por'
  const campoAt = perfil.role === 'acreedor' ? 'confirmado_acreedor_at' : 'confirmado_admin_at'

  await supabase
    .from('pagos')
    .update({ [campoPor]: user.id, [campoAt]: new Date().toISOString() })
    .eq('id', pagoId)

  const { data: pago } = await supabase
    .from('pagos')
    .select('id, cliente_id, monto, confirmado_acreedor_por, confirmado_admin_por, estado')
    .eq('id', pagoId)
    .single()

  if (!pago || pago.estado === 'confirmado' || !pago.confirmado_acreedor_por || !pago.confirmado_admin_por) {
    revalidatePath('/admin/pagos')
    return
  }

  const { data: lote } = await supabase
    .from('lotes')
    .select('id')
    .eq('cliente_id', pago.cliente_id)
    .single()

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, saldo_pendiente')
    .eq('lote_id', lote!.id)
    .gt('saldo_pendiente', 0)
    .order('numero', { ascending: true })

  const resultado = imputarPagoFIFO(
    pago.monto,
    (cuotas ?? []).map((cuota) => ({ id: cuota.id, saldoPendiente: cuota.saldo_pendiente }))
  )

  for (const imputacion of resultado.imputaciones) {
    await supabase.from('pago_imputaciones').insert({
      pago_id: pago.id,
      cuota_id: imputacion.cuotaId,
      monto_imputado: imputacion.montoImputado,
    })

    const cuota = cuotas!.find((c) => c.id === imputacion.cuotaId)!
    await supabase
      .from('cuotas')
      .update({ saldo_pendiente: cuota.saldo_pendiente - imputacion.montoImputado })
      .eq('id', imputacion.cuotaId)
  }

  await supabase.from('pagos').update({ estado: 'confirmado' }).eq('id', pago.id)

  revalidatePath('/admin/pagos')
  revalidatePath('/portal-cliente')
}
