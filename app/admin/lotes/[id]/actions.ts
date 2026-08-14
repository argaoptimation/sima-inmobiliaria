'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdminSobreLote, requireAdministrador } from '@/lib/auth/require-admin'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'

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

  const supabase = await createClient()
  const { error } = await supabase
    .from('lotes')
    .update({ identificador, ubicacion, precio_total: precioTotal })
    .eq('id', loteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(error.message)}`)
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
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/admin/lotes')
}

export async function actualizarCobro(loteId: string, formData: FormData) {
  await requireAdministrador()

  const adminId = idOVacio(formData.get('adminId'))
  const acreedorId = idOVacio(formData.get('acreedorId'))
  const vendedorId = idOVacio(formData.get('vendedorId'))
  const cuentaCobroId = idOVacio(formData.get('cuentaCobroId'))

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

    if (!idsAsociados.includes(cuentaCobroId)) {
      redirect(
        `/admin/lotes/${loteId}?error=${encodeURIComponent(
          'La cuenta de cobro tiene que ser el admin, el acreedor o el vendedor que se está asignando a este lote'
        )}`
      )
    }

    const admin = createAdminClient()
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

  const supabase = await createClient()
  const { error } = await supabase
    .from('lotes')
    .update({
      admin_id: adminId,
      acreedor_id: acreedorId,
      vendedor_id: vendedorId,
      cuenta_cobro_id: cuentaCobroId,
    })
    .eq('id', loteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(error.message)}`)
  }

  redirect(`/admin/lotes/${loteId}`)
}
