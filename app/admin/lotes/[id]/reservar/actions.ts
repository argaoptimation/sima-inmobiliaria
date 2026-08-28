'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAccesoParaReservar, requireAdministrador } from '@/lib/auth/require-admin'
import { tieneRecibidoPorValido } from '@/lib/reservas/validar-recibido-por'
import { vendedorIdAlReservar } from '@/lib/lotes/asignar-vendedor-al-reservar'
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

// Los archivos ya se subieron directo del navegador a Supabase Storage
// (CampoArchivoDirecto) antes de llegar acá -- esta función solo confirma
// que el path recibido cae dentro de la carpeta esperada del lote. Es la
// misma verificación que ya exige la policy RLS de storage.objects (ver
// migración 0048), repetida acá para no confiar ciegamente en un string
// que llega del formulario.
function pathValido(path: string, loteId: string): boolean {
  return path.startsWith(`reservas/${loteId}/`)
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
  // Ya no llegan archivos acá -- CampoArchivoDirecto los sube directo del
  // navegador a Storage antes del submit, y manda el path resultante.
  const comprobantePath = ((formData.get('comprobante') as string) || '').trim()
  const dniFrentePath = ((formData.get('dniFrente') as string) || '').trim()
  const dniDorsoPath = ((formData.get('dniDorso') as string) || '').trim()
  const dniConyugePathForm = ((formData.get('dniConyuge') as string) || '').trim()
  const sentenciaDivorcioPathForm = ((formData.get('sentenciaDivorcio') as string) || '').trim()

  if (!tieneRecibidoPorValido({ recibidoPor, recibidoPorOtro })) {
    redirectConError(loteId, formData, 'Indicá quién recibió la seña, de la lista o escribiendo el nombre')
  }

  const errorTelefono = errorLongitudTelefono(prefijo, telefonoNumero)
  if (errorTelefono) {
    redirectConError(loteId, formData, errorTelefono)
  }

  if (!comprobantePath) {
    redirectConError(loteId, formData, 'Subí el comprobante de la seña')
  }

  if (!dniFrentePath || !dniDorsoPath) {
    redirectConError(loteId, formData, 'Subí las fotos del DNI (frente y dorso)')
  }

  for (const path of [comprobantePath, dniFrentePath, dniDorsoPath, dniConyugePathForm, sentenciaDivorcioPathForm]) {
    if (path && !pathValido(path, loteId)) {
      redirectConError(loteId, formData, 'Uno de los archivos no es válido, probá subirlo de nuevo')
    }
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

  if (estadoCivil === 'casado' && !dniConyugePathForm) {
    redirectConError(loteId, formData, 'Subí el DNI del cónyuge (elegiste "Casado/a")')
  }

  if (estadoCivil === 'divorciado' && !sentenciaDivorcioPathForm) {
    redirectConError(loteId, formData, 'Subí la sentencia de divorcio (elegiste "Divorciado/a")')
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

  // Los 5 archivos ya están subidos a Storage (CampoArchivoDirecto) -- acá
  // solo quedan los paths, ya validados arriba.
  const dniConyugePath = dniConyugePathForm || null
  const sentenciaDivorcioPath = sentenciaDivorcioPathForm || null

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

  // CampoArchivoDirecto ya subió el archivo nuevo (si eligieron uno) y
  // manda su path -- o, si no tocaron el campo, el campo oculto sigue
  // teniendo el path que ya tenía (se lo pasamos como valorInicial), así
  // que no hace falta un fallback a mano acá como antes. El chequeo de
  // prefijo solo aplica a un path REALMENTE nuevo -- uno ya guardado puede
  // no matchear el patrón actual (reservas viejas, datos de prueba, etc.)
  // y no hay que romperlo con una regla que no existía cuando se guardó.
  function pathDelCampo(campo: string, pathActual: string | null): string | null {
    const valor = ((formData.get(campo) as string) || '').trim()
    if (!valor) return null

    if (valor !== pathActual && !pathValido(valor, loteId)) {
      redirectEditarConError(loteId, formData, `El archivo de "${campo}" no es válido, probá subirlo de nuevo`)
    }

    return valor
  }

  const comprobantePath = pathDelCampo('comprobante', reservaActual!.comprobante_sena_path)
  const dniFrentePath = pathDelCampo('dniFrente', reservaActual!.dni_frente_path)
  const dniDorsoPath = pathDelCampo('dniDorso', reservaActual!.dni_dorso_path)
  const dniConyugePath = pathDelCampo('dniConyuge', reservaActual!.dni_conyuge_path)
  const sentenciaDivorcioPath = pathDelCampo('sentenciaDivorcio', reservaActual!.sentencia_divorcio_path)

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
