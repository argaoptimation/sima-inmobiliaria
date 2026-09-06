'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { validarSeleccionAcreedorPorNombre } from '@/lib/lotes/validar-seleccion-acreedor'
import { resolverAdminPorDefecto } from '@/lib/lotes/admin-por-defecto'
import { mensajeDeError } from '@/lib/errores'
import { invitarPorEmail } from '@/lib/auth/invitar-por-email'

export async function crearLote(formData: FormData) {
  // Admin-only (04/09, pedido explícito de Gabriel): requireAdmin() dejaba
  // pasar también a acreedor, que no debería poder dar de alta lotes.
  await requireAdministrador()

  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const identificador = formData.get('identificador') as string
  const moneda = formData.get('moneda') as 'USD' | 'ARS'
  const ubicacion = ((formData.get('ubicacion') as string) || '').trim() || null
  const precioTotalTexto = ((formData.get('precioTotal') as string) || '').trim()
  const precioTotal = precioTotalTexto ? Number(precioTotalTexto) : null

  // Datos legales/catastrales: se podían cargar solo desde el detalle del
  // lote, no al crearlo (incongruencia reportada por Gabriel 04/09).
  // Opcionales, igual que en el detalle -- hacen falta recién para el
  // contrato. Mismos names que app/admin/lotes/[id]/actions.ts.
  const loteoId = ((formData.get('loteoId') as string) || '').trim() || null
  const numeroLote = ((formData.get('numeroLote') as string) || '').trim() || null
  const manzana = ((formData.get('manzana') as string) || '').trim() || null
  const superficieM2Texto = ((formData.get('superficieM2') as string) || '').trim()
  const superficieM2 = superficieM2Texto ? Number(superficieM2Texto) : null
  const cuentaRentas = ((formData.get('cuentaRentas') as string) || '').trim() || null
  const nomenclaturaCatastral = ((formData.get('nomenclaturaCatastral') as string) || '').trim() || null
  const matricula = ((formData.get('matricula') as string) || '').trim() || null

  if (!ubicacion || !precioTotal || !Number.isFinite(precioTotal) || precioTotal <= 0) {
    redirect(
      `/admin/lotes/nuevo?error=${encodeURIComponent(
        'La ubicación y el precio total del lote son obligatorios'
      )}`
    )
  }

  // El formulario manda el NOMBRE elegido en el buscador, no un id (ver
  // components/BuscadorPersona.tsx) -- se resuelve acá contra la lista real
  // de acreedores.
  const acreedorNombre = ((formData.get('acreedorNombre') as string) || '').trim()
  const acreedorNombreNuevo = ((formData.get('acreedorNombreNuevo') as string) || '').trim()
  const acreedorEmailNuevo = ((formData.get('acreedorEmailNuevo') as string) || '').trim()

  const { data: acreedoresExistentes } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'acreedor')

  const seleccion = validarSeleccionAcreedorPorNombre({
    nombreElegido: acreedorNombre,
    acreedores: acreedoresExistentes ?? [],
    nombreNuevo: acreedorNombreNuevo,
    emailNuevo: acreedorEmailNuevo,
  })

  if (seleccion.tipo === 'invalido') {
    redirect(`/admin/lotes/nuevo?error=${encodeURIComponent(seleccion.error)}`)
  }

  let acreedorIdFinal: string

  if (seleccion.tipo === 'nuevo') {
    const { data: invited, error: errorInvite } = await invitarPorEmail(admin, seleccion.email)

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

  const { data: administradores } = await admin.from('profiles').select('id').eq('role', 'administrador')

  const adminPorDefecto = resolverAdminPorDefecto({
    adminIdActual: null,
    administradores: administradores ?? [],
    usuarioActualId: user?.id ?? null,
    // crearLote ya pasó por requireAdministrador(): quien está acá es
    // administrador sí o sí.
    usuarioActualEsAdministrador: true,
  })

  const { data: loteCreado, error: errorLote } = await supabase
    .from('lotes')
    .insert({
      identificador,
      moneda,
      ubicacion,
      precio_total: precioTotal,
      acreedor_id: acreedorIdFinal,
      // 05/09: el admin del lote queda prefijado (en la práctica, Nicolás)
      // en vez de nacer vacío y tener que elegirlo a mano lote por lote.
      admin_id: adminPorDefecto,
      loteo_id: loteoId,
      numero_lote: numeroLote,
      manzana,
      superficie_m2: superficieM2,
      cuenta_rentas: cuentaRentas,
      nomenclatura_catastral: nomenclaturaCatastral,
      matricula,
    })
    .select('id')
    .single()

  if (errorLote) {
    const mensaje = mensajeDeError(errorLote, {
      '23505': 'Ya existe un lote con ese identificador en este loteo (o sin loteo asignado)',
    })
    redirect(`/admin/lotes/nuevo?error=${encodeURIComponent(mensaje)}`)
  }

  // Primer evento de la "vida del lote" (26/08, pedido de Nicolás: un
  // historial que muestre también los lotes que van ingresando, no solo
  // rescindido/vuelto a disponible).
  await supabase.from('lote_historial_estados').insert({
    lote_id: loteCreado!.id,
    evento: 'creado',
    estado_nuevo: 'disponible',
    cambiado_por: user!.id,
  })

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
