'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAccesoParaReservar } from '@/lib/auth/require-admin'
import { tieneRecibidoPorValido } from '@/lib/reservas/validar-recibido-por'
import { vendedorIdAlReservar } from '@/lib/lotes/asignar-vendedor-al-reservar'

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
  const telefono = ((formData.get('telefono') as string) || '').trim()
  const telefonoAlternativo = ((formData.get('telefonoAlternativo') as string) || '').trim() || null
  const estadoCivil = ((formData.get('estadoCivil') as string) || '').trim()
  const instrumentacion = ((formData.get('instrumentacion') as string) || '').trim() || null
  const montoSena = Number(formData.get('montoSena'))
  const monedaSena = ((formData.get('monedaSena') as string) || '').trim()
  const recibidoPor = ((formData.get('recibidoPor') as string) || '').trim() || null
  const recibidoPorOtro = ((formData.get('recibidoPorOtro') as string) || '').trim() || null
  const comprobante = formData.get('comprobante') as File

  if (!tieneRecibidoPorValido({ recibidoPor, recibidoPorOtro })) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent(
        'Indicá quién recibió la seña, de la lista o escribiendo el nombre'
      )}`
    )
  }

  if (!comprobante || comprobante.size === 0) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('Subí el comprobante de la seña')}`
    )
  }

  const camposObligatoriosCompletos =
    nombreCompleto.trim() &&
    dni.trim() &&
    domicilio.trim() &&
    email.trim() &&
    telefono.trim() &&
    estadoCivil.trim() &&
    monedaSena.trim()

  if (!camposObligatoriosCompletos) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('Completá todos los campos obligatorios')}`
    )
  }

  if (!Number.isFinite(montoSena) || montoSena < 0 || montoSena > 999999999999.99) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('El monto de la seña no puede ser negativo')}`
    )
  }

  const ESTADOS_CIVILES_VALIDOS = ['soltero', 'casado', 'divorciado', 'viudo']
  const MONEDAS_VALIDAS = ['USD', 'ARS']
  const INSTRUMENTACIONES_VALIDAS = ['boleto', 'escritura']

  if (!ESTADOS_CIVILES_VALIDOS.includes(estadoCivil)) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('Estado civil inválido')}`
    )
  }

  if (!MONEDAS_VALIDAS.includes(monedaSena)) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('Moneda de la seña inválida')}`
    )
  }

  if (instrumentacion && !INSTRUMENTACIONES_VALIDAS.includes(instrumentacion)) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('Instrumentación inválida')}`
    )
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

  const { error: errorReserva } = await admin.from('reservas').insert({
    lote_id: loteId,
    nombre_completo: nombreCompleto,
    dni,
    domicilio,
    email,
    telefono,
    telefono_alternativo: telefonoAlternativo,
    estado_civil: estadoCivil,
    instrumentacion,
    monto_sena: montoSena,
    moneda_sena: monedaSena,
    recibido_por: recibidoPor,
    recibido_por_otro: recibidoPorOtro,
    comprobante_sena_path: comprobantePath,
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
