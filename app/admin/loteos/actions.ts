'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { mensajeDeError } from '@/lib/errores'
import { excedeTamanioMaximo, MAX_ARCHIVO_MB } from '@/lib/storage/validar-tamanio-archivo'

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

export async function actualizarLoteo(loteoId: string, formData: FormData) {
  await requireAdministrador()

  const nombre = ((formData.get('nombre') as string) || '').trim()

  if (!nombre) {
    redirect(`/admin/loteos?error=${encodeURIComponent('Ingresá un nombre para el loteo')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.from('loteos').update({ nombre }).eq('id', loteoId)

  if (error) {
    redirect(`/admin/loteos?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  redirect('/admin/loteos?ok=Loteo actualizado')
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

// Sube (o reemplaza) la plantilla .docx de contrato de un loteo -- ver
// Notas_Decisiones_SIMA.txt punto 89. Reemplazar no borra los contratos ya
// generados con la versión anterior (son archivos aparte, guardados como
// documentos de cada lote): solo cambia qué plantilla se usa de acá en
// adelante.
export async function subirPlantillaContrato(loteoId: string, formData: FormData) {
  await requireAdministrador()

  const archivo = formData.get('plantilla') as File

  if (!archivo || archivo.size === 0) {
    redirect(`/admin/loteos?error=${encodeURIComponent('Elegí un archivo .docx para subir')}`)
  }

  if (!archivo.name.toLowerCase().endsWith('.docx')) {
    redirect(`/admin/loteos?error=${encodeURIComponent('La plantilla tiene que ser un archivo .docx')}`)
  }

  if (excedeTamanioMaximo(archivo)) {
    redirect(
      `/admin/loteos?error=${encodeURIComponent(
        `El archivo pesa más de ${MAX_ARCHIVO_MB} MB — subí uno más liviano.`
      )}`
    )
  }

  const admin = createAdminClient()
  const path = `loteos/${loteoId}/plantilla-contrato-${Date.now()}.docx`

  const { error: errorSubida } = await admin.storage.from('comprobantes').upload(path, archivo)

  if (errorSubida) {
    redirect(`/admin/loteos?error=${encodeURIComponent('No se pudo subir la plantilla. Probá de nuevo.')}`)
  }

  const supabase = await createClient()

  // Borra la plantilla vieja del storage DESPUÉS de que la nueva ya
  // se subió bien -- si algo fallara antes, mejor quedarse con la vieja
  // que sin ninguna.
  const { data: loteoPrevio } = await supabase
    .from('loteos')
    .select('plantilla_contrato_path')
    .eq('id', loteoId)
    .single()

  const { error: errorUpdate } = await supabase
    .from('loteos')
    .update({ plantilla_contrato_path: path, plantilla_contrato_nombre: archivo.name })
    .eq('id', loteoId)

  if (errorUpdate) {
    redirect(`/admin/loteos?error=${encodeURIComponent(mensajeDeError(errorUpdate))}`)
  }

  if (loteoPrevio?.plantilla_contrato_path) {
    await admin.storage.from('comprobantes').remove([loteoPrevio.plantilla_contrato_path])
  }

  redirect(`/admin/loteos?ok=${encodeURIComponent('Plantilla de contrato guardada')}`)
}
