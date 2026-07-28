'use server'

import { createClient } from '@/lib/supabase/server'
import { calcularAjusteIndexacion } from '@/lib/lotes/aplicar-indexacion'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function aplicarIndexacion(loteId: string, formData: FormData) {
  await requireAdmin()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const porcentaje = Number(formData.get('porcentaje'))
  const fechaDesde = formData.get('fechaDesde') as string

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, saldo_pendiente, fecha_vencimiento')
    .eq('lote_id', loteId)

  const ajustes = calcularAjusteIndexacion(
    porcentaje,
    fechaDesde,
    (cuotas ?? []).map((cuota) => ({
      id: cuota.id,
      saldoPendiente: cuota.saldo_pendiente,
      fechaVencimiento: cuota.fecha_vencimiento,
    }))
  )

  for (const ajuste of ajustes) {
    await supabase
      .from('cuotas')
      .update({ saldo_pendiente: ajuste.saldoPendienteNuevo })
      .eq('id', ajuste.cuotaId)
  }

  await supabase.from('ajustes_indexacion').insert({
    lote_id: loteId,
    porcentaje,
    fecha_desde: fechaDesde,
    aplicado_por: user!.id,
  })

  redirect('/admin/lotes')
}
