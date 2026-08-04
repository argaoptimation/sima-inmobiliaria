'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/require-admin'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'

function idOVacio(valor: FormDataEntryValue | null): string | null {
  const texto = valor as string | null
  return texto && texto.trim() ? texto : null
}

export async function actualizarIdentificador(loteId: string, formData: FormData) {
  await requireAdmin()

  const identificador = formData.get('identificador') as string

  const supabase = await createClient()
  const { error } = await supabase.from('lotes').update({ identificador }).eq('id', loteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(error.message)}`)
  }

  redirect(`/admin/lotes/${loteId}`)
}

export async function eliminarLote(loteId: string) {
  await requireAdmin()

  const supabase = await createClient()

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
  await requireAdmin()

  const adminId = idOVacio(formData.get('adminId'))
  const acreedorId = idOVacio(formData.get('acreedorId'))
  const vendedorId = idOVacio(formData.get('vendedorId'))
  const cuentaCobroId = idOVacio(formData.get('cuentaCobroId'))

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
      .select('id, datos_transferencia')
      .eq('id', cuentaCobroId)
      .single()

    if (!persona || !tieneDatosTransferencia(persona.datos_transferencia)) {
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
