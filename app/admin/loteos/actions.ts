'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { mensajeDeError } from '@/lib/errores'
import { extraerPlaceholders } from '@/lib/contratos/extraer-placeholders'
import { PLACEHOLDERS_CONOCIDOS } from '@/lib/contratos/armar-datos-contrato'

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

  // El archivo ya se subió directo del navegador a Storage
  // (CampoArchivoDirecto) -- acá llega el path y el nombre original por
  // separado, nunca el archivo en sí.
  const path = ((formData.get('plantilla') as string) || '').trim()
  const nombreOriginal = ((formData.get('plantillaNombreOriginal') as string) || '').trim()

  if (!path) {
    redirect(`/admin/loteos?error=${encodeURIComponent('Elegí un archivo .docx para subir')}`)
  }

  if (!path.startsWith(`loteos/${loteoId}/`)) {
    redirect(`/admin/loteos?error=${encodeURIComponent('El archivo no es válido, probá subirlo de nuevo')}`)
  }

  if (!nombreOriginal.toLowerCase().endsWith('.docx')) {
    redirect(`/admin/loteos?error=${encodeURIComponent('La plantilla tiene que ser un archivo .docx')}`)
  }

  const admin = createAdminClient()

  // Para buscar los {placeholder} hay que leer el contenido real del
  // .docx -- como el archivo ya está en Storage (no llegó por acá), se
  // vuelve a descargar para poder inspeccionarlo.
  const { data: archivoDescargado, error: errorDescarga } = await admin.storage
    .from('comprobantes')
    .download(path)

  if (errorDescarga || !archivoDescargado) {
    redirect(`/admin/loteos?error=${encodeURIComponent('No se pudo leer la plantilla recién subida. Probá de nuevo.')}`)
  }

  // Aviso (no bloquea la subida) si la plantilla tiene algún {placeholder}
  // que el sistema no sabe completar -- típicamente un typo en el nombre.
  // Gabriel (25/08): que se vea resaltado para que lo complete a mano si
  // hace falta, sin impedir subir la plantilla igual.
  const placeholdersEncontrados = extraerPlaceholders(
    Buffer.from(await archivoDescargado!.arrayBuffer())
  )
  const placeholdersDesconocidos = placeholdersEncontrados.filter(
    (nombre) => !PLACEHOLDERS_CONOCIDOS.includes(nombre)
  )

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
    .update({ plantilla_contrato_path: path, plantilla_contrato_nombre: nombreOriginal })
    .eq('id', loteoId)

  if (errorUpdate) {
    redirect(`/admin/loteos?error=${encodeURIComponent(mensajeDeError(errorUpdate))}`)
  }

  if (loteoPrevio?.plantilla_contrato_path) {
    await admin.storage.from('comprobantes').remove([loteoPrevio.plantilla_contrato_path])
  }

  if (placeholdersDesconocidos.length > 0) {
    const params = new URLSearchParams({
      ok: 'Plantilla de contrato guardada',
      placeholdersDesconocidos: placeholdersDesconocidos.join(','),
    })
    redirect(`/admin/loteos?${params.toString()}`)
  }

  redirect(`/admin/loteos?ok=${encodeURIComponent('Plantilla de contrato guardada')}`)
}
