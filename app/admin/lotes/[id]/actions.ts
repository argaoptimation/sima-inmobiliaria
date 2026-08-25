'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdminSobreLote, requireAdministrador } from '@/lib/auth/require-admin'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'
import { excedeTamanioMaximo, MAX_ARCHIVO_MB } from '@/lib/storage/validar-tamanio-archivo'
import { mensajeDeError } from '@/lib/errores'

function idOVacio(valor: FormDataEntryValue | null): string | null {
  const texto = valor as string | null
  return texto && texto.trim() ? texto : null
}

export async function actualizarDatosGenerales(loteId: string, formData: FormData) {
  await requireAdminSobreLote(loteId)

  const identificador = formData.get('identificador') as string
  const ubicacion = ((formData.get('ubicacion') as string) || '').trim() || null
  const precioTotalTexto = ((formData.get('precioTotal') as string) || '').trim()
  const precioTotal = precioTotalTexto ? Number(precioTotalTexto) : null
  const indiceTipo = ((formData.get('indiceTipo') as string) || '').trim() || null

  const supabase = await createClient()
  const { error } = await supabase
    .from('lotes')
    .update({ identificador, ubicacion, precio_total: precioTotal, indice_tipo: indiceTipo })
    .eq('id', loteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  redirect(`/admin/lotes/${loteId}`)
}

export async function eliminarLote(loteId: string) {
  await requireAdministrador()

  const supabase = await createClient()

  const { data: lote } = await supabase.from('lotes').select('cliente_id').eq('id', loteId).single()

  if (lote?.cliente_id) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent(
        'No se puede eliminar: este lote ya tiene un cliente asignado'
      )}`
    )
  }

  // reservas.lote_id referencia lotes con "on delete cascade" -- sin este
  // chequeo, borrar un lote "reservado" se lleva puesta la reserva entera
  // (seña, datos del comprador, fotos de DNI) en silencio, porque un lote
  // reservado todavía no tiene cliente_id ni cuotas y ninguno de los otros
  // chequeos de esta función lo detecta.
  const { count: reservasActivas } = await supabase
    .from('reservas')
    .select('id', { count: 'exact', head: true })
    .eq('lote_id', loteId)
    .is('cancelada_at', null)

  if (reservasActivas && reservasActivas > 0) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent(
        'No se puede eliminar: este lote tiene una reserva activa'
      )}`
    )
  }

  const { data: cuotas } = await supabase.from('cuotas').select('id').eq('lote_id', loteId)
  const cuotaIds = (cuotas ?? []).map((cuota) => cuota.id)

  if (cuotaIds.length > 0) {
    const { count } = await supabase
      .from('pago_imputaciones')
      .select('id', { count: 'exact', head: true })
      .in('cuota_id', cuotaIds)

    if (count && count > 0) {
      redirect(
        `/admin/lotes/${loteId}?error=${encodeURIComponent(
          'No se puede eliminar: este lote ya tiene pagos imputados'
        )}`
      )
    }
  }

  const { error } = await supabase.from('lotes').delete().eq('id', loteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  redirect('/admin/lotes')
}

// vendido -> rescindido: el lote deja de estar en cobranza activa, pero
// conserva cliente_id y las cuotas/pagos tal cual quedaron (es el registro
// histórico de ese ciclo -- ver historialDelLote / totalCobradoDelLote).
export async function rescindirLote(loteId: string) {
  await requireAdministrador()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: lote } = await supabase.from('lotes').select('estado').eq('id', loteId).single()

  if (!lote || lote.estado !== 'vendido') {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent('Solo se puede rescindir un lote que está vendido')}`
    )
  }

  const { error } = await supabase.from('lotes').update({ estado: 'rescindido' }).eq('id', loteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  await supabase.from('lote_historial_estados').insert({
    lote_id: loteId,
    estado_anterior: 'vendido',
    estado_nuevo: 'rescindido',
    cambiado_por: user!.id,
  })

  redirect(`/admin/lotes/${loteId}`)
}

// rescindido -> disponible: deja el lote listo para venderse de nuevo.
// Saca el cliente asignado (un lote "disponible" en el resto de la app
// siempre asume que no tiene cliente) -- pero NO toca las cuotas/pagos
// viejos, que quedan como historial de ese ciclo anterior.
export async function volverADisponible(loteId: string) {
  await requireAdministrador()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: lote } = await supabase.from('lotes').select('estado, ciclo_actual').eq('id', loteId).single()

  if (!lote || lote.estado !== 'rescindido') {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent('Solo se puede volver a disponible un lote rescindido')}`
    )
  }

  // Suma 1 al ciclo de venta: la próxima vez que este lote se venda, sus
  // cuotas nuevas quedan marcadas con el ciclo nuevo -- así nunca chocan
  // con las cuotas del ciclo anterior (unique es lote_id+ciclo+numero,
  // no solo lote_id+numero) y el motor de índices tampoco las mezcla.
  const { error } = await supabase
    .from('lotes')
    .update({ estado: 'disponible', cliente_id: null, ciclo_actual: lote!.ciclo_actual + 1 })
    .eq('id', loteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  await supabase.from('lote_historial_estados').insert({
    lote_id: loteId,
    estado_anterior: 'rescindido',
    estado_nuevo: 'disponible',
    cambiado_por: user!.id,
  })

  redirect(`/admin/lotes/${loteId}`)
}

export async function actualizarCobro(loteId: string, formData: FormData) {
  await requireAdministrador()

  const adminId = idOVacio(formData.get('adminId'))
  const acreedorId = idOVacio(formData.get('acreedorId'))
  const vendedorId = idOVacio(formData.get('vendedorId'))
  const cuentaCobroRaw = idOVacio(formData.get('cuentaCobroId'))
  const esExterna = cuentaCobroRaw?.startsWith('externa:') ?? false
  const cuentaCobroId = esExterna ? null : cuentaCobroRaw
  const cuentaCobroExternaId = esExterna ? cuentaCobroRaw!.slice('externa:'.length) : null

  const idsAValidar = [adminId, acreedorId, vendedorId].filter(
    (valorId): valorId is string => valorId !== null
  )

  if (idsAValidar.length > 0) {
    const adminValidacion = createAdminClient()
    const { data: personas } = await adminValidacion
      .from('profiles')
      .select('id, role')
      .in('id', idsAValidar)

    const rolEsperado = (personaId: string | null) => {
      if (personaId === adminId) return 'administrador'
      if (personaId === acreedorId) return 'acreedor'
      return 'vendedor'
    }

    const rolInvalido = idsAValidar.some((idPersona) => {
      const persona = personas?.find((p) => p.id === idPersona)
      return !persona || persona.role !== rolEsperado(idPersona)
    })

    if (rolInvalido) {
      redirect(
        `/admin/lotes/${loteId}?error=${encodeURIComponent('Uno de los roles asignados no coincide')}`
      )
    }
  }

  if (cuentaCobroId) {
    const idsAsociados = [adminId, acreedorId, vendedorId]
    const admin = createAdminClient()

    if (!idsAsociados.includes(cuentaCobroId)) {
      const { data: participanteCoincide } = await admin
        .from('lote_participantes')
        .select('id')
        .eq('lote_id', loteId)
        .eq('profile_id', cuentaCobroId)
        .maybeSingle()

      if (!participanteCoincide) {
        redirect(
          `/admin/lotes/${loteId}?error=${encodeURIComponent(
            'La cuenta de cobro tiene que ser el admin, el acreedor, el vendedor o un participante adicional de este lote'
          )}`
        )
      }
    }

    const { data: persona } = await admin
      .from('profiles')
      .select('id, alias, banco, titular')
      .eq('id', cuentaCobroId)
      .single()

    if (
      !persona ||
      !tieneDatosTransferencia({ alias: persona.alias, banco: persona.banco, titular: persona.titular })
    ) {
      redirect(
        `/admin/lotes/${loteId}?error=${encodeURIComponent(
          'Esa persona todavía no tiene datos de transferencia cargados'
        )}&editarUsuario=${cuentaCobroId}`
      )
    }
  }

  if (cuentaCobroExternaId) {
    const admin = createAdminClient()
    const { data: cuentaExterna } = await admin
      .from('cuentas_externas')
      .select('id, titular, alias, banco')
      .eq('id', cuentaCobroExternaId)
      .maybeSingle()

    if (
      !cuentaExterna ||
      !tieneDatosTransferencia({
        titular: cuentaExterna.titular,
        alias: cuentaExterna.alias,
        banco: cuentaExterna.banco,
      })
    ) {
      redirect(
        `/admin/lotes/${loteId}?error=${encodeURIComponent(
          'Esa cuenta externa todavía no tiene datos de transferencia completos'
        )}`
      )
    }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('lotes')
    .update({
      admin_id: adminId,
      acreedor_id: acreedorId,
      vendedor_id: vendedorId,
      cuenta_cobro_id: cuentaCobroId,
      cuenta_cobro_externa_id: cuentaCobroExternaId,
    })
    .eq('id', loteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  redirect(`/admin/lotes/${loteId}`)
}

export async function subirDocumentoLote(loteId: string, formData: FormData) {
  await requireAdminSobreLote(loteId)

  const descripcion = ((formData.get('descripcion') as string) || '').trim()
  const archivo = formData.get('archivo') as File

  if (!descripcion) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent('Ingresá una descripción para el documento')}`
    )
  }

  if (!archivo || archivo.size === 0) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent('Elegí un archivo para subir')}`)
  }

  if (excedeTamanioMaximo(archivo)) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent(
        `El archivo pesa más de ${MAX_ARCHIVO_MB} MB — subí uno más liviano.`
      )}`
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const nombreSeguro = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `lotes/${loteId}/documento-${Date.now()}-${nombreSeguro}`

  const { error: errorSubida } = await admin.storage.from('comprobantes').upload(path, archivo)

  if (errorSubida) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent('No se pudo subir el archivo. Probá de nuevo.')}`
    )
  }

  const { error: errorInsert } = await supabase.from('lote_documentos').insert({
    lote_id: loteId,
    path,
    descripcion,
    subido_por: user!.id,
  })

  if (errorInsert) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensajeDeError(errorInsert))}`)
  }

  redirect(`/admin/lotes/${loteId}`)
}

export async function eliminarDocumentoLote(documentoId: string, loteId: string) {
  await requireAdminSobreLote(loteId)

  const supabase = await createClient()

  // El .eq('lote_id', loteId) es una segunda barrera además de
  // requireAdminSobreLote: sin esto, alguien con permiso sobre SU lote
  // podría borrar la fila de un documento de OTRO lote si adivinara su id,
  // ya que requireAdminSobreLote solo valida el loteId recibido, no que
  // documentoId realmente pertenezca a ese lote.
  const { error } = await supabase
    .from('lote_documentos')
    .delete()
    .eq('id', documentoId)
    .eq('lote_id', loteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  redirect(`/admin/lotes/${loteId}`)
}
