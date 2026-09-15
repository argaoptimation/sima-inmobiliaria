'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { mensajeDeError } from '@/lib/errores'
import { revalidarNotificaciones } from '@/lib/notificaciones/revalidar'
import { cargarVinculosDelLote } from '@/lib/lotes/cargar-vinculos-del-lote'
import { avisoDeSalida } from '@/lib/lotes/vinculos-integrante'
import { mensajeDeSalidaHecha, nombreDeCuenta } from '@/lib/lotes/salida-de-integrante'

// Estas acciones devuelven a /distribucion, no al detalle del lote: desde el
// 06/09 la sección de cobro y la de participantes viven ahí, junto al reparto
// por cuota. Redirigir al detalle dejaba al admin en una pantalla donde el
// formulario que acababa de usar ya no existe.
export async function agregarParticipante(loteId: string, formData: FormData) {
  await requireAdministrador()

  const participanteRaw = ((formData.get('participanteId') as string) || '').trim() || null
  const etiqueta = ((formData.get('etiqueta') as string) || '').trim() || null

  if (!participanteRaw) {
    redirect(`/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent('Elegí a quién agregar')}`)
  }

  const esExterna = participanteRaw!.startsWith('externa:')
  const profileId = esExterna ? null : participanteRaw
  const cuentaExternaId = esExterna ? participanteRaw!.slice('externa:'.length) : null

  const admin = createAdminClient()

  const { data: lote } = await admin
    .from('lotes')
    .select('admin_id, acreedor_id, vendedor_id')
    .eq('id', loteId)
    .single()

  if (
    profileId &&
    (profileId === lote?.admin_id || profileId === lote?.acreedor_id || profileId === lote?.vendedor_id)
  ) {
    redirect(
      `/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent(
        'Esa persona ya es admin, acreedor o vendedor de este lote'
      )}`
    )
  }

  if (profileId) {
    const { data: persona } = await admin
      .from('profiles')
      .select('role')
      .eq('id', profileId)
      .maybeSingle()

    if (!persona || !['administrador', 'acreedor', 'vendedor'].includes(persona.role)) {
      redirect(
        `/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent(
          'Solo se pueden agregar administradores, acreedores o vendedores'
        )}`
      )
    }
  }

  if (cuentaExternaId) {
    const { data: cuentaExterna } = await admin
      .from('cuentas_externas')
      .select('id')
      .eq('id', cuentaExternaId)
      .maybeSingle()

    if (!cuentaExterna) {
      redirect(`/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent('Esa cuenta externa no existe')}`)
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('lote_participantes').insert({
    lote_id: loteId,
    profile_id: profileId,
    cuenta_externa_id: cuentaExternaId,
    etiqueta,
  })

  if (error) {
    const mensaje = mensajeDeError(error, {
      '23505': 'Ese participante ya está agregado a este lote',
    })
    redirect(`/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent(mensaje)}`)
  }

  redirect(`/admin/lotes/${loteId}/distribucion`)
}

// Saca a un integrante del lote: un participante adicional, una cuenta
// externa o el vendedor (15/09, pedido de Gabriel). La pantalla ya mostró
// antes qué cuotas toca y pidió confirmar; acá se vuelve a calcular todo con
// los datos del momento, porque entre que se abrió la pantalla y se confirmó
// el cliente pudo haber informado un pago.
//
// Hasta el 15/09 esto se negaba si la persona cobraba alguna cuota ("cambiá
// a quién se le transfieren y después quitalo") y, si solo tenía parte del
// reparto, la sacaba sin avisar y dejaba ese reparto colgando. Ahora avisa
// y resuelve las dos cosas: ver quitar_integrante_lote (migración 0065) y
// lib/lotes/vinculos-integrante.ts.
//
// El admin y el acreedor no se quitan por acá: el lote siempre tiene admin
// (Nicolás, por defecto) y acreedor, y se cambian en "Roles del lote".
export async function quitarIntegrante(loteId: string, formData: FormData) {
  await requireAdministrador()

  const volver = `/admin/lotes/${loteId}/distribucion`
  const clave = ((formData.get('clave') as string) || '').trim()
  const profileId = clave.startsWith('profile:') ? clave.slice('profile:'.length) : null
  const cuentaExternaId = clave.startsWith('externa:') ? clave.slice('externa:'.length) : null

  if (!profileId && !cuentaExternaId) {
    redirect(`${volver}?error=${encodeURIComponent('No se entendió a quién quitar')}`)
  }

  const supabase = await createClient()

  const { data: lote } = await supabase
    .from('lotes')
    .select('admin_id, acreedor_id, vendedor_id, cuenta_cobro_id, cuenta_cobro_externa_id, ciclo_actual')
    .eq('id', loteId)
    .single()

  if (!lote) {
    redirect(`${volver}?error=${encodeURIComponent('No se encontró el lote')}`)
  }

  const consultaParticipante = supabase.from('lote_participantes').select('id').eq('lote_id', loteId)
  const { data: participante } = profileId
    ? await consultaParticipante.eq('profile_id', profileId).maybeSingle()
    : await consultaParticipante.eq('cuenta_externa_id', cuentaExternaId!).maybeSingle()

  const esVendedor = profileId !== null && profileId === lote!.vendedor_id

  if (!participante && !esVendedor) {
    const mensaje =
      profileId && profileId === lote!.acreedor_id
        ? 'El acreedor no se quita desde acá: se cambia en "Roles del lote".'
        : profileId && profileId === lote!.admin_id
          ? 'El admin no se quita desde acá: se cambia en "Roles del lote".'
          : 'Esa persona ya no es integrante de este lote.'
    redirect(`${volver}?error=${encodeURIComponent(mensaje)}`)
  }

  // Los lotes anteriores al 08/09 pueden tener todavía una cuenta de cobro
  // cargada a nivel lote, que sigue siendo el resguardo de las cuotas sin
  // destino propio (incluidas las ya cobradas, que no se tocan).
  const esLaCuentaDeCobroDelLote =
    (profileId !== null && profileId === lote!.cuenta_cobro_id) ||
    (cuentaExternaId !== null && cuentaExternaId === lote!.cuenta_cobro_externa_id)

  if (esLaCuentaDeCobroDelLote) {
    redirect(
      `${volver}?error=${encodeURIComponent(
        'No se puede quitar: es la cuenta de cobro actual de este lote. Reasignala primero.'
      )}`
    )
  }

  const vinculos = await cargarVinculosDelLote(supabase, loteId, lote!.ciclo_actual)
  const nombre = await nombreDeCuenta(supabase, profileId, cuentaExternaId)
  const { bloqueo } = avisoDeSalida(nombre, vinculos.de(clave))

  if (bloqueo) {
    redirect(`${volver}?error=${encodeURIComponent(bloqueo)}`)
  }

  const { data: resultado, error } = await supabase.rpc('quitar_integrante_lote', {
    p_lote_id: loteId,
    p_profile_id: profileId,
    p_cuenta_externa_id: cuentaExternaId,
  })

  if (error) {
    console.error('quitar_integrante_lote:', error)
    redirect(`${volver}?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  // Las cuotas que quedaron sin destino hacen aparecer "no hay a dónde pagar"
  // en la campana.
  revalidarNotificaciones()

  redirect(`${volver}?ok=${encodeURIComponent(mensajeDeSalidaHecha(nombre, resultado))}`)
}
