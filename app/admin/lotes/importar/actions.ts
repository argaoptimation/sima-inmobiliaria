'use server'

import { createClient } from '@/lib/supabase/server'
import { generarCuotas } from '@/lib/lotes/generar-cuotas'
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
    const { data: loteCreado, error: errorLote } = await supabase
      .from('lotes')
      .insert({
        identificador: lote.identificador,
        ubicacion: lote.ubicacion,
        precio_total: lote.precioTotal,
        moneda: lote.moneda,
        cantidad_cuotas: lote.cantidadCuotas,
        monto_cuota_base: lote.montoCuotaBase,
        fecha_primera_cuota: lote.fechaPrimeraCuota,
      })
      .select()
      .single()

    if (errorLote || !loteCreado) {
      redirect(
        `/admin/lotes/importar?error=${encodeURIComponent(
          `No se pudo crear "${lote.identificador}": ${errorLote?.message ?? 'error desconocido'}`
        )}`
      )
    }

    const cuotas = generarCuotas(lote.cantidadCuotas, lote.montoCuotaBase, lote.fechaPrimeraCuota)

    const { error: errorCuotas } = await supabase.from('cuotas').insert(
      cuotas.map((cuota) => ({
        lote_id: loteCreado.id,
        numero: cuota.numero,
        monto_base: cuota.montoBase,
        saldo_pendiente: cuota.montoBase,
        fecha_vencimiento: cuota.fechaVencimiento,
      }))
    )

    if (errorCuotas) {
      redirect(
        `/admin/lotes/importar?error=${encodeURIComponent(
          `El lote "${lote.identificador}" se creó pero fallaron sus cuotas: ${errorCuotas.message}`
        )}`
      )
    }
  }

  redirect('/admin/lotes')
}
