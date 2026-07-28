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

  const { error: errorConfirmacion } = await supabase
    .from('pagos')
    .update({ [campoPor]: user.id, [campoAt]: new Date().toISOString() })
    .eq('id', pagoId)

  if (errorConfirmacion) {
    revalidatePath('/admin/pagos')
    return
  }

  // Claim atomico: solo un llamador puede ganar este UPDATE, ya sea contra
  // una carrera de doble click o contra un reintento tras una falla parcial.
  const { data: pagoClaimado, error: errorClaim } = await supabase
    .from('pagos')
    .update({ estado: 'confirmado' })
    .eq('id', pagoId)
    .eq('estado', 'pendiente')
    .not('confirmado_acreedor_por', 'is', null)
    .not('confirmado_admin_por', 'is', null)
    .select('id, cliente_id, monto')
    .single()

  if (errorClaim || !pagoClaimado) {
    revalidatePath('/admin/pagos')
    return
  }

  const { data: lote } = await supabase
    .from('lotes')
    .select('id')
    .eq('cliente_id', pagoClaimado.cliente_id)
    .single()

  if (!lote) {
    revalidatePath('/admin/pagos')
    return
  }

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, saldo_pendiente')
    .eq('lote_id', lote.id)
    .gt('saldo_pendiente', 0)
    .order('numero', { ascending: true })

  const resultado = imputarPagoFIFO(
    pagoClaimado.monto,
    (cuotas ?? []).map((cuota) => ({ id: cuota.id, saldoPendiente: cuota.saldo_pendiente }))
  )

  for (const imputacion of resultado.imputaciones) {
    const { error: errorImputacion } = await supabase.from('pago_imputaciones').insert({
      pago_id: pagoClaimado.id,
      cuota_id: imputacion.cuotaId,
      monto_imputado: imputacion.montoImputado,
    })

    if (errorImputacion) {
      // El pago ya quedo marcado "confirmado" (evita que un reintento vuelva
      // a correr el FIFO y duplique lo ya imputado). Si una fila puntual
      // falla aca, queda para revision manual via la tabla de imputaciones
      // -- no seguimos intentando escribir en un estado inconsistente.
      revalidatePath('/admin/pagos')
      return
    }

    const cuota = cuotas!.find((c) => c.id === imputacion.cuotaId)!
    const { error: errorSaldo } = await supabase
      .from('cuotas')
      .update({ saldo_pendiente: cuota.saldo_pendiente - imputacion.montoImputado })
      .eq('id', imputacion.cuotaId)

    if (errorSaldo) {
      revalidatePath('/admin/pagos')
      return
    }
  }

  revalidatePath('/admin/pagos')
  revalidatePath('/portal-cliente')
}
