'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'

export async function agregarParticipante(loteId: string, formData: FormData) {
  await requireAdministrador()

  const participanteRaw = ((formData.get('participanteId') as string) || '').trim() || null
  const etiqueta = ((formData.get('etiqueta') as string) || '').trim() || null

  if (!participanteRaw) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent('Elegí a quién agregar')}`)
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
      `/admin/lotes/${loteId}?error=${encodeURIComponent(
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
        `/admin/lotes/${loteId}?error=${encodeURIComponent(
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
      redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent('Esa cuenta externa no existe')}`)
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
    // 23505 = violacion de unique constraint (Postgres): ya esta agregado.
    const mensaje =
      error.code === '23505' ? 'Ese participante ya está agregado a este lote' : error.message
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensaje)}`)
  }

  redirect(`/admin/lotes/${loteId}`)
}

export async function quitarParticipante(loteId: string, participanteId: string) {
  await requireAdministrador()

  const supabase = await createClient()

  const { data: participante } = await supabase
    .from('lote_participantes')
    .select('profile_id, cuenta_externa_id')
    .eq('id', participanteId)
    .maybeSingle()

  if (!participante) {
    redirect(`/admin/lotes/${loteId}`)
  }

  const { data: lote } = await supabase
    .from('lotes')
    .select('cuenta_cobro_id, cuenta_cobro_externa_id')
    .eq('id', loteId)
    .single()

  const esLaCuentaDeCobroActual =
    (participante!.profile_id !== null && participante!.profile_id === lote?.cuenta_cobro_id) ||
    (participante!.cuenta_externa_id !== null &&
      participante!.cuenta_externa_id === lote?.cuenta_cobro_externa_id)

  if (esLaCuentaDeCobroActual) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent(
        'No se puede quitar: es la cuenta de cobro actual de este lote. Reasignala primero.'
      )}`
    )
  }

  const { error } = await supabase.from('lote_participantes').delete().eq('id', participanteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(error.message)}`)
  }

  redirect(`/admin/lotes/${loteId}`)
}
