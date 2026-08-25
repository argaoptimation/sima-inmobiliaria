'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireAdminOCobrador } from '@/lib/auth/require-admin'
import { mensajeDeError } from '@/lib/errores'

// Cobrador (ej. Belén) carga un pago en efectivo que recibió en mano --
// queda "pendiente" hasta que un administrador (Nicolás) lo marque como
// recibido con confirmarPago (única confirmación, sin comprobante ni
// confirmación cruzada de acreedor -- ver Notas_Decisiones_SIMA.txt punto
// 22, y app/admin/pagos/actions.ts donde se relajó el gate de comprobante
// y se agregó la rama de confirmación única para medio_pago='efectivo').
export async function registrarPagoEfectivo(formData: FormData) {
  await requireAdminOCobrador()

  const supabase = await createClient()

  const loteId = ((formData.get('loteId') as string) || '').trim()
  const monto = Number(formData.get('monto'))
  const moneda = formData.get('moneda') as 'USD' | 'ARS'

  if (!loteId) {
    redirect(`/admin/efectivo?error=${encodeURIComponent('Elegí un lote')}`)
  }

  if (!Number.isFinite(monto) || monto <= 0) {
    redirect(`/admin/efectivo?error=${encodeURIComponent('Ingresá un monto válido')}`)
  }

  const { data: lote } = await supabase
    .from('lotes')
    .select('id, estado, cliente_id')
    .eq('id', loteId)
    .single()

  if (!lote || lote.estado !== 'vendido' || !lote.cliente_id) {
    redirect(
      `/admin/efectivo?error=${encodeURIComponent('Ese lote no está vendido, no tiene ningún cliente para cobrarle')}`
    )
  }

  const { error: errorPago } = await supabase.from('pagos').insert({
    cliente_id: lote!.cliente_id,
    lote_id: lote!.id,
    monto,
    moneda,
    motivo: 'cuota',
    medio_pago: 'efectivo',
  })

  if (errorPago) {
    redirect(`/admin/efectivo?error=${encodeURIComponent(mensajeDeError(errorPago))}`)
  }

  redirect(`/admin/efectivo?ok=${encodeURIComponent('Pago en efectivo registrado, queda pendiente de confirmación del admin')}`)
}
