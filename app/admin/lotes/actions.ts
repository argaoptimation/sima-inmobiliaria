'use server'

import { createClient } from '@/lib/supabase/server'
import { generarCuotas } from '@/lib/lotes/generar-cuotas'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function crearLote(formData: FormData) {
  await requireAdmin()

  const supabase = await createClient()

  const identificador = formData.get('identificador') as string
  const moneda = formData.get('moneda') as 'USD' | 'ARS'
  const cantidadCuotas = Number(formData.get('cantidadCuotas'))
  const montoCuotaBase = Number(formData.get('montoCuotaBase'))
  const fechaPrimeraCuota = formData.get('fechaPrimeraCuota') as string

  const { data: lote, error: errorLote } = await supabase
    .from('lotes')
    .insert({
      identificador,
      moneda,
      cantidad_cuotas: cantidadCuotas,
      monto_cuota_base: montoCuotaBase,
      fecha_primera_cuota: fechaPrimeraCuota,
    })
    .select()
    .single()

  if (errorLote || !lote) {
    redirect(`/admin/lotes/nuevo?error=${encodeURIComponent(errorLote?.message ?? 'error desconocido')}`)
  }

  const cuotas = generarCuotas(cantidadCuotas, montoCuotaBase, fechaPrimeraCuota)

  const { error: errorCuotas } = await supabase.from('cuotas').insert(
    cuotas.map((cuota) => ({
      lote_id: lote.id,
      numero: cuota.numero,
      monto_base: cuota.montoBase,
      saldo_pendiente: cuota.montoBase,
      fecha_vencimiento: cuota.fechaVencimiento,
    }))
  )

  if (errorCuotas) {
    redirect(`/admin/lotes/nuevo?error=${encodeURIComponent(errorCuotas.message)}`)
  }

  redirect('/admin/lotes')
}
