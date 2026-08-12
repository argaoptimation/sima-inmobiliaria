'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { calcularMontoCuota } from '@/lib/lotes/calcular-monto-cuota'
import { generarCuotas } from '@/lib/lotes/generar-cuotas'

export async function venderLote(loteId: string, formData: FormData) {
  await requireAdministrador()

  const email = ((formData.get('email') as string) || '').trim()
  const fullName = ((formData.get('fullName') as string) || '').trim()
  const cantidadCuotas = Number(formData.get('cantidadCuotas'))
  const fechaPrimeraCuota = formData.get('fechaPrimeraCuota') as string

  if (!email || !fullName) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent('Completá nombre y email del comprador')}`
    )
  }

  if (!Number.isInteger(cantidadCuotas) || cantidadCuotas < 1) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
        'La cantidad de cuotas tiene que ser un número entero, mínimo 1'
      )}`
    )
  }

  if (!fechaPrimeraCuota) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent('Ingresá la fecha de la primera cuota')}`
    )
  }

  const admin = createAdminClient()

  const { data: loteActual, error: errorLoteActual } = await admin
    .from('lotes')
    .select('estado, precio_total')
    .eq('id', loteId)
    .single()

  if (errorLoteActual || !loteActual) {
    redirect(`/admin/lotes/${loteId}/vender?error=${encodeURIComponent('Lote no encontrado')}`)
  }

  if (loteActual!.estado !== 'reservado') {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
        `Este lote no está en estado reservado (estado actual: ${loteActual!.estado}), no se puede vender`
      )}`
    )
  }

  if (!loteActual!.precio_total) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
        'El lote no tiene precio total cargado, no se puede vender'
      )}`
    )
  }

  const { data: invited, error: errorInvite } = await admin.auth.admin.inviteUserByEmail(email)

  if (errorInvite || !invited.user) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorInvite?.message ?? 'error desconocido')}`
    )
  }

  const { error: errorProfile } = await admin.from('profiles').insert({
    id: invited.user.id,
    role: 'cliente',
    full_name: fullName,
  })

  if (errorProfile) {
    redirect(`/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorProfile.message)}`)
  }

  const precioTotal = loteActual!.precio_total as number
  const montoCuotaBase = calcularMontoCuota(precioTotal, cantidadCuotas)
  const cuotas = generarCuotas(cantidadCuotas, montoCuotaBase, fechaPrimeraCuota, precioTotal)

  // Claim atomico: solo vende si el lote SIGUE reservado en este instante
  // (mismo patron que reservarLote / cancelarReserva). Si esto no pega, ya
  // se invito y se creo el profile del cliente igual — caso raro (alguien
  // mas cancelo la reserva en el instante exacto entre el chequeo de arriba
  // y este update); se reporta como error y queda para revision manual del
  // admin, no se intenta revertir la invitacion ya enviada.
  const { data: loteActualizado, error: errorVenta } = await admin
    .from('lotes')
    .update({
      estado: 'vendido',
      cliente_id: invited.user.id,
      cantidad_cuotas: cantidadCuotas,
      monto_cuota_base: montoCuotaBase,
      fecha_primera_cuota: fechaPrimeraCuota,
    })
    .eq('id', loteId)
    .eq('estado', 'reservado')
    .select('id')
    .single()

  if (errorVenta || !loteActualizado) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
        'Este lote dejó de estar reservado justo antes de confirmar la venta. Ya se invitó al cliente — revisalo manualmente antes de reintentar.'
      )}`
    )
  }

  const { error: errorCuotas } = await admin.from('cuotas').insert(
    cuotas.map((cuota) => ({
      lote_id: loteId,
      numero: cuota.numero,
      monto_base: cuota.montoBase,
      saldo_pendiente: cuota.montoBase,
      fecha_vencimiento: cuota.fechaVencimiento,
    }))
  )

  if (errorCuotas) {
    redirect(`/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorCuotas.message)}`)
  }

  redirect('/admin/lotes')
}
