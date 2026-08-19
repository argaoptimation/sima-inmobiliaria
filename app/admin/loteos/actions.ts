'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { mensajeDeError } from '@/lib/errores'

export async function crearLoteo(formData: FormData) {
  await requireAdministrador()

  const nombre = ((formData.get('nombre') as string) || '').trim()

  if (!nombre) {
    redirect(`/admin/loteos?error=${encodeURIComponent('Ingresá un nombre para el loteo')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.from('loteos').insert({ nombre })

  if (error) {
    redirect(`/admin/loteos?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  redirect('/admin/loteos')
}

export async function reasignarLotesEnBloque(formData: FormData) {
  await requireAdministrador()

  const loteIds = formData.getAll('loteIds').map((valor) => valor as string)
  const loteoDestino = ((formData.get('loteoDestino') as string) || '').trim()

  if (loteIds.length === 0) {
    redirect(`/admin/loteos?error=${encodeURIComponent('Seleccioná al menos un lote para reasignar')}`)
  }

  if (!loteoDestino) {
    redirect(`/admin/loteos?error=${encodeURIComponent('Elegí a qué loteo mover los lotes seleccionados')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('lotes')
    .update({ loteo_id: loteoDestino })
    .in('id', loteIds)

  if (error) {
    redirect(`/admin/loteos?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  redirect(
    `/admin/loteos?ok=${encodeURIComponent(`${loteIds.length} lote(s) reasignado(s) correctamente`)}`
  )
}
