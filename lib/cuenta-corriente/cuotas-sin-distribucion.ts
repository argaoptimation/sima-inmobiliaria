import { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface CuotaSinDistribucion {
  cuotaId: string
  loteId: string
  loteIdentificador: string
  numero: number
}

// Cuotas que ya recibieron algun pago pero nunca tuvieron una distribucion
// cargada en cuota_distribuciones: nadie generó Debe automático para ellas,
// y eso nunca puede pasar en silencio (pedido explícito de Gabriel).
// Calculado al vuelo, mismo criterio "compute on read" que el resto del
// sistema -- no hay ninguna tabla que marque esto.
export async function obtenerCuotasSinDistribucion(
  supabase: SupabaseServerClient,
  loteId?: string
): Promise<CuotaSinDistribucion[]> {
  // Supabase-js no soporta comparar dos columnas entre si directamente en
  // el builder (saldo_pendiente < monto_base): se trae todo y se filtra esa
  // comparación en JS, mas abajo.
  let query = supabase
    .from('cuotas')
    .select('id, numero, lote_id, ciclo, saldo_pendiente, monto_base, lotes(identificador, ciclo_actual)')

  if (loteId) {
    query = query.eq('lote_id', loteId)
  }

  const { data: cuotas } = await query

  // Acotado al ciclo de venta VIGENTE de cada lote (ver migración 0039):
  // una cuota vieja de un ciclo rescindido puede tener plata cobrada sin
  // distribución cargada, pero ya es historial cerrado -- no tiene sentido
  // seguir avisando de eso mientras nadie la esté cobrando activamente.
  const cuotasDelCicloVigente = (cuotas ?? []).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cuota) => cuota.ciclo === (cuota.lotes as any)?.ciclo_actual
  )

  const cuotasConAlgoCobrado = cuotasDelCicloVigente.filter(
    (cuota) => cuota.saldo_pendiente < cuota.monto_base
  )

  if (cuotasConAlgoCobrado.length === 0) return []

  const { data: distribuciones } = await supabase
    .from('cuota_distribuciones')
    .select('cuota_id')
    .in(
      'cuota_id',
      cuotasConAlgoCobrado.map((cuota) => cuota.id)
    )

  const cuotasConDistribucion = new Set((distribuciones ?? []).map((distribucion) => distribucion.cuota_id))

  return cuotasConAlgoCobrado
    .filter((cuota) => !cuotasConDistribucion.has(cuota.id))
    .map((cuota) => ({
      cuotaId: cuota.id,
      loteId: cuota.lote_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      loteIdentificador: (cuota.lotes as any)?.identificador ?? '?',
      numero: cuota.numero,
    }))
}
