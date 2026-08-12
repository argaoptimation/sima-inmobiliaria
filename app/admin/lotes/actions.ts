'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
  const ubicacion = ((formData.get('ubicacion') as string) || '').trim() || null
  const precioTotalTexto = ((formData.get('precioTotal') as string) || '').trim()
  const precioTotal = precioTotalTexto ? Number(precioTotalTexto) : null

  if (!ubicacion || !precioTotal || !Number.isFinite(precioTotal) || precioTotal <= 0) {
    redirect(
      `/admin/lotes/nuevo?error=${encodeURIComponent(
        'La ubicación y el precio total del lote son obligatorios'
      )}`
    )
  }

  const { data: lote, error: errorLote } = await supabase
    .from('lotes')
    .insert({
      identificador,
      moneda,
      cantidad_cuotas: cantidadCuotas,
      monto_cuota_base: montoCuotaBase,
      fecha_primera_cuota: fechaPrimeraCuota,
      ubicacion,
      precio_total: precioTotal,
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

export async function cancelarReserva(loteId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: perfilPropio } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const rolesConAcceso = ['administrador', 'vendedor', 'cobrador']

  if (!perfilPropio || !rolesConAcceso.includes(perfilPropio.role)) {
    redirect('/login')
  }

  const { data: reserva } = await supabase
    .from('reservas')
    .select('id, created_by')
    .eq('lote_id', loteId)
    .is('cancelada_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!reserva) {
    redirect(
      `/admin/lotes?error=${encodeURIComponent('Este lote no tiene una reserva activa para cancelar')}`
    )
  }

  if (perfilPropio!.role !== 'administrador' && reserva!.created_by !== user!.id) {
    redirect(
      `/admin/lotes?error=${encodeURIComponent(
        'Solo podés cancelar una reserva que vos mismo hayas cargado'
      )}`
    )
  }

  const admin = createAdminClient()

  // Claim atomico: solo se cancela si el lote SIGUE reservado en este
  // instante (mismo patron de reservarLote).
  const { data: loteActualizado, error: errorLote } = await admin
    .from('lotes')
    .update({ estado: 'disponible', vendedor_id: null })
    .eq('id', loteId)
    .eq('estado', 'reservado')
    .select('id')
    .single()

  if (errorLote || !loteActualizado) {
    redirect(
      `/admin/lotes?error=${encodeURIComponent('No se pudo cancelar: el lote ya no está reservado')}`
    )
  }

  const { error: errorReserva } = await admin
    .from('reservas')
    .update({ cancelada_por: user!.id, cancelada_at: new Date().toISOString() })
    .eq('id', reserva!.id)

  if (errorReserva) {
    console.error('No se pudo marcar la reserva como cancelada:', errorReserva)
  }

  redirect('/admin/lotes')
}
