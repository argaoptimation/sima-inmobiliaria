'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/require-admin'
import { validarSeleccionAcreedor } from '@/lib/lotes/validar-seleccion-acreedor'
import { mensajeDeError } from '@/lib/errores'

export async function crearLote(formData: FormData) {
  await requireAdmin()

  const supabase = await createClient()
  const admin = createAdminClient()

  const identificador = formData.get('identificador') as string
  const moneda = formData.get('moneda') as 'USD' | 'ARS'
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

  const acreedorId = ((formData.get('acreedorId') as string) || '').trim()
  const acreedorNombreNuevo = ((formData.get('acreedorNombreNuevo') as string) || '').trim()
  const acreedorEmailNuevo = ((formData.get('acreedorEmailNuevo') as string) || '').trim()

  const seleccion = validarSeleccionAcreedor({
    acreedorId,
    nombreNuevo: acreedorNombreNuevo,
    emailNuevo: acreedorEmailNuevo,
  })

  if (seleccion.tipo === 'invalido') {
    redirect(`/admin/lotes/nuevo?error=${encodeURIComponent(seleccion.error)}`)
  }

  let acreedorIdFinal: string

  if (seleccion.tipo === 'nuevo') {
    const { data: invited, error: errorInvite } = await admin.auth.admin.inviteUserByEmail(
      seleccion.email
    )

    if (errorInvite || !invited.user) {
      redirect(
        `/admin/lotes/nuevo?error=${encodeURIComponent(mensajeDeError(errorInvite))}`
      )
    }

    const { error: errorProfile } = await admin.from('profiles').insert({
      id: invited.user.id,
      role: 'acreedor',
      full_name: seleccion.nombre,
      email: seleccion.email,
    })

    if (errorProfile) {
      redirect(`/admin/lotes/nuevo?error=${encodeURIComponent(mensajeDeError(errorProfile))}`)
    }

    acreedorIdFinal = invited.user.id
  } else {
    const { data: acreedorExistente } = await admin
      .from('profiles')
      .select('id')
      .eq('id', seleccion.id)
      .eq('role', 'acreedor')
      .maybeSingle()

    if (!acreedorExistente) {
      redirect(`/admin/lotes/nuevo?error=${encodeURIComponent('El acreedor elegido no es válido')}`)
    }

    acreedorIdFinal = acreedorExistente!.id
  }

  const { error: errorLote } = await supabase.from('lotes').insert({
    identificador,
    moneda,
    ubicacion,
    precio_total: precioTotal,
    acreedor_id: acreedorIdFinal,
  })

  if (errorLote) {
    const mensaje = mensajeDeError(errorLote, {
      '23505': 'Ya existe un lote con ese identificador en este loteo (o sin loteo asignado)',
    })
    redirect(`/admin/lotes/nuevo?error=${encodeURIComponent(mensaje)}`)
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
