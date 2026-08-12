'use server'

import { createClient } from '@/lib/supabase/server'
import { parsearTextoImportacion } from '@/lib/lotes/parsear-importacion'
import { redirect } from 'next/navigation'
import { requireAdminOAcreedor } from '@/lib/auth/require-admin'

export async function importarLotes(formData: FormData) {
  await requireAdminOAcreedor()

  const texto = (formData.get('filas') as string) || ''
  const resultado = parsearTextoImportacion(texto)

  if ('errores' in resultado) {
    redirect(`/admin/lotes/importar?error=${encodeURIComponent(resultado.errores.join('\n'))}`)
  }

  const supabase = await createClient()

  for (const lote of resultado.lotes) {
    const { error: errorLote } = await supabase.from('lotes').insert({
      identificador: lote.identificador,
      ubicacion: lote.ubicacion,
      precio_total: lote.precioTotal,
      moneda: lote.moneda,
    })

    if (errorLote) {
      redirect(
        `/admin/lotes/importar?error=${encodeURIComponent(
          `No se pudo crear "${lote.identificador}": ${errorLote.message}`
        )}`
      )
    }
  }

  redirect('/admin/lotes')
}
