import { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface CuotaSinDistribucion {
  cuotaId: string
  loteId: string
  loteIdentificador: string
  numero: number
}

// De un conjunto de cuotas, cuáles aparecen en `tabla` (pago_imputaciones o
// cuota_distribuciones).
//
// Va de a tandas a propósito. Un solo `.in('cuota_id', [...])` con TODAS las
// cuotas viaja como query string: con las 434 cuotas que ya hay en producción
// la URL se pasa del límite del servidor, PostgREST responde un error, y como
// acá el error se traduce en "ninguna cuota tiene plata imputada", el aviso de
// "cuota cobrada sin distribución" desaparecía en silencio -- justo el aviso
// que nunca puede fallar callado. Se veía solo en la pantalla global de
// Cuentas corrientes; la del lote pasa 3 ids y andaba bien.
const CUOTAS_POR_TANDA = 100

async function cuotaIdsPresentesEn(
  supabase: SupabaseServerClient,
  tabla: 'pago_imputaciones' | 'cuota_distribuciones',
  cuotaIds: string[]
): Promise<Set<string>> {
  const encontradas = new Set<string>()

  for (let desde = 0; desde < cuotaIds.length; desde += CUOTAS_POR_TANDA) {
    const tanda = cuotaIds.slice(desde, desde + CUOTAS_POR_TANDA)
    const { data, error } = await supabase.from(tabla).select('cuota_id').in('cuota_id', tanda)

    if (error) {
      // Mejor ruidoso que un aviso que no aparece nunca sin que nadie sepa.
      console.error(`No se pudieron leer las filas de ${tabla}:`, error)
      continue
    }

    for (const fila of data ?? []) encontradas.add(fila.cuota_id)
  }

  return encontradas
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
  let query = supabase
    .from('cuotas')
    .select('id, numero, lote_id, ciclo, lotes(identificador, ciclo_actual)')

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

  if (cuotasDelCicloVigente.length === 0) return []

  // "Cobrada" = tiene plata realmente imputada (pago_imputaciones), que es
  // exactamente lo que dispara generarDebeAutomaticoSiCorresponde. Antes se
  // deducía de `saldo_pendiente < monto_base`, y eso daba falsos positivos
  // en los dos casos donde el saldo se pone en cero SIN que entre plata a
  // esa cuota puntual (bug reportado por Gabriel 04/09 en "DEMO Lote
  // Contrato Quintana": 36 cuotas avisadas como cobradas-sin-distribución
  // sin tener una sola imputación):
  //   - refinanciarLote: marca las cuotas viejas refinanciada=true y les
  //     pone saldo_pendiente=0; la deuda pasa a las cuotas nuevas.
  //   - saldarLote (pago total anticipado): pone en cero el saldo de todas
  //     las cuotas pendientes con UN pago de motivo 'saldar', sin imputar
  //     cuota por cuota.
  const cuotasConPlataImputada = await cuotaIdsPresentesEn(
    supabase,
    'pago_imputaciones',
    cuotasDelCicloVigente.map((cuota) => cuota.id)
  )

  const cuotasConAlgoCobrado = cuotasDelCicloVigente.filter((cuota) =>
    cuotasConPlataImputada.has(cuota.id)
  )

  if (cuotasConAlgoCobrado.length === 0) return []

  const cuotasConDistribucion = await cuotaIdsPresentesEn(
    supabase,
    'cuota_distribuciones',
    cuotasConAlgoCobrado.map((cuota) => cuota.id)
  )

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
