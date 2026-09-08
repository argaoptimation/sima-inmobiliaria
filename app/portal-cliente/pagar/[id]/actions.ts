'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { mensajeDeError } from '@/lib/errores'

export async function registrarPago(cuotaId: string, formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const monto = Number(formData.get('monto'))
  const moneda = formData.get('moneda') as 'USD' | 'ARS'

  const volverAlFormulario = (mensaje: string) =>
    redirect(`/portal-cliente/pagar/${cuotaId}?error=${encodeURIComponent(mensaje)}`)

  // El comprobante ahora es parte de este mismo formulario (06/09): "Ya
  // transferí" y "subir el comprobante" dejaron de ser dos pasos. El archivo
  // ya se subió directo del navegador a Storage (CampoArchivoDirecto); acá
  // llega solo el path resultante, nunca el archivo. Sin comprobante no se
  // registra el pago: una transferencia sin prueba no se puede confirmar ni
  // imputar de todos modos (guard en confirmarPago).
  const comprobantePath = ((formData.get('comprobante') as string) || '').trim()

  if (!comprobantePath) {
    volverAlFormulario('Subí el comprobante de la transferencia antes de continuar')
  }

  // Sanity check server-side: el path tiene que caer dentro de la propia
  // carpeta del usuario -- lo mismo que exige la policy RLS de Storage, pero
  // repetido acá para no confiar en un string que llega del cliente.
  if (!comprobantePath.startsWith(`${user!.id}/`)) {
    volverAlFormulario('El comprobante no se subió bien, probá elegirlo de nuevo')
  }

  const admin = createAdminClient()

  const { data: cuota, error: errorCuota } = await admin
    .from('cuotas')
    .select('lote_id')
    .eq('id', cuotaId)
    .single()

  if (errorCuota || !cuota) {
    volverAlFormulario('No se encontró la cuota')
  }

  const { data: lote } = await admin
    .from('lotes')
    .select('cliente_id')
    .eq('id', cuota!.lote_id)
    .single()

  if (!lote || lote.cliente_id !== user!.id) {
    volverAlFormulario('Esa cuota no te pertenece')
  }

  const { error: errorPago } = await admin.from('pagos').insert({
    cliente_id: user!.id,
    lote_id: cuota!.lote_id,
    monto,
    moneda,
    motivo: 'cuota',
    comprobante_path: comprobantePath,
    // De qué cuota salió este pago (06/09). La imputación sigue siendo
    // FIFO y puede tocar otras cuotas, pero para saber QUIÉN confirma
    // hace falta la cuota que el cliente estaba pagando: es la que le
    // mostró el alias al que transfirió.
    cuota_origen_id: cuotaId,
  })

  if (errorPago) {
    volverAlFormulario(mensajeDeError(errorPago))
  }

  redirect(
    `/portal-cliente/lotes/${cuota!.lote_id}?ok=${encodeURIComponent(
      'Registramos tu pago. Queda a la espera de que confirmen la transferencia.'
    )}`
  )
}
