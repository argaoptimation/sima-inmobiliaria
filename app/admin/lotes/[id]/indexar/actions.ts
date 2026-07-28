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

  // Claim atomico: la constraint unique (lote_id, fecha_desde, porcentaje)
  // bloquea un reenvio identico (doble submit o retry) antes de tocar
  // ningun saldo. Un admin puede aplicar un porcentaje o fecha distintos
  // para el mismo lote mas adelante sin problema.
  const { error: errorAjuste } = await supabase.from('ajustes_indexacion').insert({
    lote_id: loteId,
    porcentaje,
    fecha_desde: fechaDesde,
    aplicado_por: user!.id,
  })

  if (errorAjuste) {
    const mensaje =
      errorAjuste.code === '23505'
        ? 'Este ajuste ya fue aplicado (mismo lote, fecha y porcentaje)'
        : errorAjuste.message
    redirect(`/admin/lotes/${loteId}/indexar?error=${encodeURIComponent(mensaje)}`)
  }

  const { data: cuotas, error: errorCuotas } = await supabase
    .from('cuotas')
    .select('id, saldo_pendiente, fecha_vencimiento')
    .eq('lote_id', loteId)

  if (errorCuotas) {
    // El ajuste ya quedo registrado (es la fuente de verdad de que "deberia"
    // haberse aplicado); si esto falla queda para reconciliar manualmente
    // contra esa fila en vez de reintentar a ciegas.
    redirect(`/admin/lotes/${loteId}/indexar?error=${encodeURIComponent(errorCuotas.message)}`)
  }

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
    const { error: errorSaldo } = await supabase
      .from('cuotas')
      .update({ saldo_pendiente: ajuste.saldoPendienteNuevo })
      .eq('id', ajuste.cuotaId)

    if (errorSaldo) {
      // Idem: el ajuste ya esta registrado, asi que una falla parcial aca
      // no debe reintentarse sola -- requiere revision manual de que cuotas
      // quedaron actualizadas contra la fila de ajustes_indexacion.
      redirect(`/admin/lotes/${loteId}/indexar?error=${encodeURIComponent(errorSaldo.message)}`)
    }
  }

  redirect('/admin/lotes')
}
