'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAccesoParaReservar, requireAdministrador } from '@/lib/auth/require-admin'
import { tieneRecibidoPorValido } from '@/lib/reservas/validar-recibido-por'
import { vendedorIdAlReservar } from '@/lib/lotes/asignar-vendedor-al-reservar'
import { excedeTamanioMaximo, MAX_ARCHIVO_MB } from '@/lib/storage/validar-tamanio-archivo'
import { telefonoParaGuardar, errorLongitudTelefono } from '@/lib/telefono/prefijos'

const ESTADOS_CIVILES_VALIDOS = ['soltero', 'casado', 'divorciado', 'viudo']
const MONEDAS_VALIDAS = ['USD', 'ARS']
const INSTRUMENTACIONES_VALIDAS = ['boleto', 'escritura']

const CAMPOS_PRESERVABLES: Array<[string, string]> = [
  ['nombreCompleto', 'nombreCompleto'],
  ['dniPreservado', 'dni'],
  ['domicilio', 'domicilio'],
  ['email', 'email'],
  ['prefijo', 'prefijo'],
  ['telefonoNumero', 'telefonoNumero'],
  ['telefonoAlternativo', 'telefonoAlternativo'],
  ['estadoCivil', 'estadoCivil'],
  ['instrumentacion', 'instrumentacion'],
  ['montoSena', 'montoSena'],
  ['monedaSena', 'monedaSena'],
  ['recibidoPor', 'recibidoPor'],
  ['recibidoPorOtro', 'recibidoPorOtro'],
]

function construirParamsPreservados(formData: FormData): URLSearchParams {
  const params = new URLSearchParams()

  for (const [nombreParam, nombreCampo] of CAMPOS_PRESERVABLES) {
    if (formData.has(nombreCampo)) {
      params.set(nombreParam, (formData.get(nombreCampo) as string) || '')
    }
  }

  return params
}

function redirectConError(loteId: string, formData: FormData, mensaje: string): never {
  const params = construirParamsPreservados(formData)
  params.set('error', mensaje)
  redirect(`/admin/lotes/${loteId}/reservar?${params.toString()}`)
}

function redirectEditarConError(
  loteId: string,
  formData: FormData,
  mensaje: string
): never {
  const params = construirParamsPreservados(formData)
  params.set('error', mensaje)
  redirect(`/admin/lotes/${loteId}/reservar/editar?${params.toString()}`)
}

export async function reservarLote(loteId: string, formData: FormData) {
  await requireAccesoParaReservar(loteId)

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: perfilPropio } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const nombreCompleto = ((formData.get('nombreCompleto') as string) || '').trim()
  const dni = ((formData.get('dni') as string) || '').trim()
  const domicilio = ((formData.get('domicilio') as string) || '').trim()
  const email = ((formData.get('email') as string) || '').trim()
  const prefijo = ((formData.get('prefijo') as string) || '').trim()
  const telefonoNumero = ((formData.get('telefonoNumero') as string) || '').trim()
  const telefonoAlternativo = ((formData.get('telefonoAlternativo') as string) || '').trim() || null
  const estadoCivil = ((formData.get('estadoCivil') as string) || '').trim()
  const instrumentacion = ((formData.get('instrumentacion') as string) || '').trim() || null
  const montoSena = Number(formData.get('montoSena'))
  const monedaSena = ((formData.get('monedaSena') as string) || '').trim()
  const recibidoPor = ((formData.get('recibidoPor') as string) || '').trim() || null
  const recibidoPorOtro = ((formData.get('recibidoPorOtro') as string) || '').trim() || null
  const comprobante = formData.get('comprobante') as File
  const dniFrente = formData.get('dniFrente') as File
  const dniDorso = formData.get('dniDorso') as File
  const dniConyuge = formData.get('dniConyuge') as File | null
  const sentenciaDivorcio = formData.get('sentenciaDivorcio') as File | null

  if (!tieneRecibidoPorValido({ recibidoPor, recibidoPorOtro })) {
    redirectConError(loteId, formData, 'Indicá quién recibió la seña, de la lista o escribiendo el nombre')
  }

  const errorTelefono = errorLongitudTelefono(prefijo, telefonoNumero)
  if (errorTelefono) {
    redirectConError(loteId, formData, errorTelefono)
  }

  if (!comprobante || comprobante.size === 0) {
    redirectConError(loteId, formData, 'Subí el comprobante de la seña')
  }

  if (excedeTamanioMaximo(comprobante)) {
    redirectConError(
      loteId,
      formData,
      `El comprobante de la seña pesa más de ${MAX_ARCHIVO_MB} MB — subí uno más liviano.`
    )
  }

  if (!dniFrente || dniFrente.size === 0 || !dniDorso || dniDorso.size === 0) {
    redirectConError(loteId, formData, 'Subí las fotos del DNI (frente y dorso)')
  }

  if (excedeTamanioMaximo(dniFrente)) {
    redirectConError(
      loteId,
      formData,
      `La foto del DNI (frente) pesa más de ${MAX_ARCHIVO_MB} MB — subí una más liviana.`
    )
  }

  if (excedeTamanioMaximo(dniDorso)) {
    redirectConError(
      loteId,
      formData,
      `La foto del DNI (dorso) pesa más de ${MAX_ARCHIVO_MB} MB — subí una más liviana.`
    )
  }

  const camposObligatoriosCompletos =
    nombreCompleto.trim() &&
    dni.trim() &&
    domicilio.trim() &&
    email.trim() &&
    telefonoNumero.trim() &&
    estadoCivil.trim() &&
    monedaSena.trim()

  if (!camposObligatoriosCompletos) {
    redirectConError(loteId, formData, 'Completá todos los campos obligatorios')
  }

  if (!Number.isFinite(montoSena) || montoSena < 0 || montoSena > 999999999999.99) {
    redirectConError(loteId, formData, 'El monto de la seña no puede ser negativo')
  }

  if (!ESTADOS_CIVILES_VALIDOS.includes(estadoCivil)) {
    redirectConError(loteId, formData, 'Estado civil inválido')
  }

  if (estadoCivil === 'casado' && (!dniConyuge || dniConyuge.size === 0)) {
    redirectConError(loteId, formData, 'Subí el DNI del cónyuge (elegiste "Casado/a")')
  }

  if (dniConyuge && dniConyuge.size > 0 && excedeTamanioMaximo(dniConyuge)) {
    redirectConError(
      loteId,
      formData,
      `La foto del DNI del cónyuge pesa más de ${MAX_ARCHIVO_MB} MB — subí una más liviana.`
    )
  }

  if (estadoCivil === 'divorciado' && (!sentenciaDivorcio || sentenciaDivorcio.size === 0)) {
    redirectConError(loteId, formData, 'Subí la sentencia de divorcio (elegiste "Divorciado/a")')
  }

  if (sentenciaDivorcio && sentenciaDivorcio.size > 0 && excedeTamanioMaximo(sentenciaDivorcio)) {
    redirectConError(
      loteId,
      formData,
      `La sentencia de divorcio pesa más de ${MAX_ARCHIVO_MB} MB — subí una más liviana.`
    )
  }

  if (!MONEDAS_VALIDAS.includes(monedaSena)) {
    redirectConError(loteId, formData, 'Moneda de la seña inválida')
  }

  if (instrumentacion && !INSTRUMENTACIONES_VALIDAS.includes(instrumentacion)) {
    redirectConError(loteId, formData, 'Instrumentación inválida')
  }

  const admin = createAdminClient()

  const nuevoVendedorId = vendedorIdAlReservar(perfilPropio!.role, user!.id)

  // Claim atomico: el update solo pega si el lote SIGUE disponible en este
  // instante (mismo patron que el claim de pagos en confirmarPago /
  // subirComprobante). Si alguien lo reservo un segundo antes, esto no
  // afecta ninguna fila y lo tratamos como "ya no disponible".
  const { data: loteReservado, error: errorLote } = await admin
    .from('lotes')
    .update({
      estado: 'reservado',
      ...(nuevoVendedorId ? { vendedor_id: nuevoVendedorId } : {}),
    })
    .eq('id', loteId)
    .eq('estado', 'disponible')
    .select('id, admin_id, acreedor_id, cuenta_cobro_id')
    .single()

  if (errorLote || !loteReservado) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent(
        'Este lote ya no está disponible para reservar'
      )}`
    )
  }

  await admin.from('lote_historial_estados').insert({
    lote_id: loteId,
    evento: 'reservado',
    estado_anterior: 'disponible',
    estado_nuevo: 'reservado',
    cambiado_por: user!.id,
  })

  // Si se reasignó vendedor_id y la cuenta de cobro apuntaba al vendedor que
  // acabamos de reemplazar (no al admin ni al acreedor), queda apuntando a
  // alguien ya no asociado al lote. La limpiamos best-effort: la reserva ya
  // quedó tomada, esto no debe hacer fallar el flujo principal.
  if (
    nuevoVendedorId &&
    loteReservado.cuenta_cobro_id &&
    loteReservado.cuenta_cobro_id !== loteReservado.admin_id &&
    loteReservado.cuenta_cobro_id !== loteReservado.acreedor_id
  ) {
    const { error: errorLimpiarCuentaCobro } = await admin
      .from('lotes')
      .update({ cuenta_cobro_id: null })
      .eq('id', loteId)

    if (errorLimpiarCuentaCobro) {
      console.error(
        'No se pudo limpiar cuenta_cobro_id tras reasignar vendedor:',
        errorLimpiarCuentaCobro
      )
    }
  }

  const nombreArchivoSeguro = comprobante.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const comprobantePath = `reservas/${loteId}/${Date.now()}-${nombreArchivoSeguro}`

  const { error: errorUpload } = await admin.storage
    .from('comprobantes')
    .upload(comprobantePath, comprobante)

  if (errorUpload) {
    console.error('Error al subir el comprobante de la seña:', errorUpload)
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('No se pudo subir el comprobante. Probá de nuevo.')}`
    )
  }

  async function subirArchivoReserva(archivo: File, tipo: string) {
    const nombreSeguro = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `reservas/${loteId}/${tipo}-${Date.now()}-${nombreSeguro}`
    const { error } = await admin.storage.from('comprobantes').upload(filePath, archivo)
    return { filePath, error }
  }

  const { filePath: dniFrentePath, error: errorDniFrente } = await subirArchivoReserva(
    dniFrente,
    'dni-frente'
  )
  if (errorDniFrente) {
    console.error('Error al subir el DNI frente:', errorDniFrente)
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('No se pudo subir el DNI (frente). Probá de nuevo.')}`
    )
  }

  const { filePath: dniDorsoPath, error: errorDniDorso } = await subirArchivoReserva(
    dniDorso,
    'dni-dorso'
  )
  if (errorDniDorso) {
    console.error('Error al subir el DNI dorso:', errorDniDorso)
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('No se pudo subir el DNI (dorso). Probá de nuevo.')}`
    )
  }

  let dniConyugePath: string | null = null
  if (dniConyuge && dniConyuge.size > 0) {
    const { filePath, error: errorDniConyuge } = await subirArchivoReserva(dniConyuge, 'dni-conyuge')
    if (errorDniConyuge) {
      console.error('Error al subir el DNI del cónyuge:', errorDniConyuge)
      redirect(
        `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('No se pudo subir el DNI del cónyuge. Probá de nuevo.')}`
      )
    }
    dniConyugePath = filePath
  }

  let sentenciaDivorcioPath: string | null = null
  if (sentenciaDivorcio && sentenciaDivorcio.size > 0) {
    const { filePath, error: errorSentencia } = await subirArchivoReserva(
      sentenciaDivorcio,
      'sentencia-divorcio'
    )
    if (errorSentencia) {
      console.error('Error al subir la sentencia de divorcio:', errorSentencia)
      redirect(
        `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('No se pudo subir la sentencia de divorcio. Probá de nuevo.')}`
      )
    }
    sentenciaDivorcioPath = filePath
  }

  const { prefijo: telefonoPrefijo, numero: telefonoNumeroGuardar } = telefonoParaGuardar(
    prefijo,
    telefonoNumero
  )

  const { error: errorReserva } = await admin.from('reservas').insert({
    lote_id: loteId,
    nombre_completo: nombreCompleto,
    dni,
    domicilio,
    email,
    telefono_prefijo: telefonoPrefijo,
    telefono_numero: telefonoNumeroGuardar,
    telefono_alternativo: telefonoAlternativo,
    estado_civil: estadoCivil,
    instrumentacion,
    monto_sena: montoSena,
    moneda_sena: monedaSena,
    recibido_por: recibidoPor,
    recibido_por_otro: recibidoPorOtro,
    comprobante_sena_path: comprobantePath,
    dni_frente_path: dniFrentePath,
    dni_dorso_path: dniDorsoPath,
    dni_conyuge_path: dniConyugePath,
    sentencia_divorcio_path: sentenciaDivorcioPath,
    created_by: user!.id,
  })

  if (errorReserva) {
    console.error('Error al guardar la reserva:', errorReserva)
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('No se pudo guardar la reserva. Probá de nuevo.')}`
    )
  }

  redirect('/admin/lotes')
}

export async function actualizarReserva(loteId: string, formData: FormData) {
  await requireAdministrador()

  const admin = createAdminClient()

  const { data: loteActual } = await admin
    .from('lotes')
    .select('estado')
    .eq('id', loteId)
    .single()

  if (!loteActual || loteActual.estado !== 'reservado') {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent(
        'Este lote no está reservado, no se puede editar la reserva'
      )}`
    )
  }

  const { data: reservaActual } = await admin
    .from('reservas')
    .select(
      'id, comprobante_sena_path, dni_frente_path, dni_dorso_path, dni_conyuge_path, sentencia_divorcio_path'
    )
    .eq('lote_id', loteId)
    .is('cancelada_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!reservaActual) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent('No se encontró la reserva de este lote')}`
    )
  }

  const nombreCompleto = ((formData.get('nombreCompleto') as string) || '').trim()
  const dni = ((formData.get('dni') as string) || '').trim()
  const domicilio = ((formData.get('domicilio') as string) || '').trim()
  const email = ((formData.get('email') as string) || '').trim()
  const prefijo = ((formData.get('prefijo') as string) || '').trim()
  const telefonoNumero = ((formData.get('telefonoNumero') as string) || '').trim()
  const telefonoAlternativo = ((formData.get('telefonoAlternativo') as string) || '').trim() || null
  const estadoCivil = ((formData.get('estadoCivil') as string) || '').trim()
  const instrumentacion = ((formData.get('instrumentacion') as string) || '').trim() || null
  const montoSena = Number(formData.get('montoSena'))
  const monedaSena = ((formData.get('monedaSena') as string) || '').trim()
  const recibidoPor = ((formData.get('recibidoPor') as string) || '').trim() || null
  const recibidoPorOtro = ((formData.get('recibidoPorOtro') as string) || '').trim() || null

  if (!tieneRecibidoPorValido({ recibidoPor, recibidoPorOtro })) {
    redirectEditarConError(loteId, formData, 'Indicá quién recibió la seña, de la lista o escribiendo el nombre')
  }

  const errorTelefono = errorLongitudTelefono(prefijo, telefonoNumero)
  if (errorTelefono) {
    redirectEditarConError(loteId, formData, errorTelefono)
  }

  const camposObligatoriosCompletos =
    nombreCompleto.trim() &&
    dni.trim() &&
    domicilio.trim() &&
    email.trim() &&
    telefonoNumero.trim() &&
    estadoCivil.trim() &&
    monedaSena.trim()

  if (!camposObligatoriosCompletos) {
    redirectEditarConError(loteId, formData, 'Completá todos los campos obligatorios')
  }

  if (!Number.isFinite(montoSena) || montoSena < 0 || montoSena > 999999999999.99) {
    redirectEditarConError(loteId, formData, 'El monto de la seña no puede ser negativo')
  }

  if (!ESTADOS_CIVILES_VALIDOS.includes(estadoCivil)) {
    redirectEditarConError(loteId, formData, 'Estado civil inválido')
  }

  if (!MONEDAS_VALIDAS.includes(monedaSena)) {
    redirectEditarConError(loteId, formData, 'Moneda de la seña inválida')
  }

  if (instrumentacion && !INSTRUMENTACIONES_VALIDAS.includes(instrumentacion)) {
    redirectEditarConError(loteId, formData, 'Instrumentación inválida')
  }

  async function subirArchivoSiCorresponde(
    campo: string,
    tipo: string,
    pathActual: string | null
  ): Promise<string | null> {
    const archivo = formData.get(campo) as File | null

    if (!archivo || archivo.size === 0) {
      return pathActual
    }

    if (excedeTamanioMaximo(archivo)) {
      redirectEditarConError(
        loteId,
        formData,
        `El archivo de "${tipo}" pesa más de ${MAX_ARCHIVO_MB} MB — subí uno más liviano.`
      )
    }

    const nombreSeguro = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `reservas/${loteId}/${tipo}-${Date.now()}-${nombreSeguro}`
    const { error } = await admin.storage.from('comprobantes').upload(filePath, archivo)

    if (error) {
      console.error(`Error al subir "${tipo}" al editar la reserva:`, error)
      redirectEditarConError(loteId, formData, `No se pudo subir el archivo de "${tipo}". Probá de nuevo.`)
    }

    return filePath
  }

  const comprobantePath = await subirArchivoSiCorresponde(
    'comprobante',
    'comprobante',
    reservaActual!.comprobante_sena_path
  )
  const dniFrentePath = await subirArchivoSiCorresponde(
    'dniFrente',
    'dni-frente',
    reservaActual!.dni_frente_path
  )
  const dniDorsoPath = await subirArchivoSiCorresponde('dniDorso', 'dni-dorso', reservaActual!.dni_dorso_path)
  const dniConyugePath = await subirArchivoSiCorresponde(
    'dniConyuge',
    'dni-conyuge',
    reservaActual!.dni_conyuge_path
  )
  const sentenciaDivorcioPath = await subirArchivoSiCorresponde(
    'sentenciaDivorcio',
    'sentencia-divorcio',
    reservaActual!.sentencia_divorcio_path
  )

  if (estadoCivil === 'casado' && !dniConyugePath) {
    redirectEditarConError(loteId, formData, 'Subí el DNI del cónyuge (elegiste "Casado/a")')
  }

  if (estadoCivil === 'divorciado' && !sentenciaDivorcioPath) {
    redirectEditarConError(loteId, formData, 'Subí la sentencia de divorcio (elegiste "Divorciado/a")')
  }

  const { prefijo: telefonoPrefijoEditar, numero: telefonoNumeroEditarGuardar } = telefonoParaGuardar(
    prefijo,
    telefonoNumero
  )

  const { error: errorUpdate } = await admin
    .from('reservas')
    .update({
      nombre_completo: nombreCompleto,
      dni,
      domicilio,
      email,
      telefono_prefijo: telefonoPrefijoEditar,
      telefono_numero: telefonoNumeroEditarGuardar,
      telefono_alternativo: telefonoAlternativo,
      estado_civil: estadoCivil,
      instrumentacion,
      monto_sena: montoSena,
      moneda_sena: monedaSena,
      recibido_por: recibidoPor,
      recibido_por_otro: recibidoPorOtro,
      comprobante_sena_path: comprobantePath,
      dni_frente_path: dniFrentePath,
      dni_dorso_path: dniDorsoPath,
      dni_conyuge_path: dniConyugePath,
      sentencia_divorcio_path: sentenciaDivorcioPath,
    })
    .eq('id', reservaActual!.id)

  if (errorUpdate) {
    console.error('Error al actualizar la reserva:', errorUpdate)
    redirectEditarConError(loteId, formData, 'No se pudo guardar la reserva. Probá de nuevo.')
  }

  redirect(`/admin/lotes/${loteId}`)
}
