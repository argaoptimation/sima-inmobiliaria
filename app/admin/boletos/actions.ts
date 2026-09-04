'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { generarYGuardarContrato } from '@/lib/contratos/generar-y-guardar'

// Genera el boleto desde el listado de Boletos de compraventa. Es la misma
// función que usa el botón del detalle del lote y la generación automática
// al reservar (lib/contratos/generar-y-guardar.ts): lo único que cambia es
// a dónde vuelve el usuario con el resultado.
export async function generarBoletoDesdeListado(loteId: string, formData: FormData) {
  await requireAdministrador()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const fechaContrato = ((formData.get('fechaContrato') as string) || '').trim()

  if (!fechaContrato) {
    redirect(`/admin/boletos?error=${encodeURIComponent('Elegí la fecha del boleto')}`)
  }

  const resultado = await generarYGuardarContrato({ loteId, fechaContrato, userId: user!.id })

  if (!resultado.ok) {
    redirect(`/admin/boletos?error=${encodeURIComponent(resultado.error)}`)
  }

  redirect(
    `/admin/boletos?ok=${encodeURIComponent('Boleto generado. Queda en la sección "Contratos" del lote.')}`
  )
}
