import type { SupabaseClient } from '@supabase/supabase-js'
import { fechaEnArgentina } from '@/lib/fecha/hoy-argentina'
import { sumarDias } from '@/lib/fecha/sumar-dias'
import { traerTodasLasFilas } from '@/lib/supabase/traer-todas-las-filas'

// Los pagos que entraron a la caja en un dia, para la pantalla de cierre de
// caja y para su Excel.
//
// Hasta el 11/09 cada uno tenia su propia copia de la consulta, de la regla
// del dia y de las etiquetas -- y la del Excel ya se habia quedado sin
// "Pago total anticipado". Ahora las dos leen de aca.

export interface PagoDelDia {
  id: string
  monto: number
  moneda: string
  medio_pago: 'efectivo' | 'transferencia'
  motivo: string
  cliente_id: string
  lote_id: string
  confirmado_acreedor_at: string | null
  confirmado_admin_at: string | null
  lotes: { identificador: string } | null
}

export const MOTIVO_ETIQUETA: Record<string, string> = {
  cuota: 'Cuota',
  sena: 'Seña',
  entrega: 'Entrega',
  ajuste: 'Corrección',
  saldar: 'Pago total anticipado',
}

// "Recibido el dia X" = el dia en que la confirmacion TERMINO de cerrarse
// -- el toque mas tardio entre acreedor y admin (para transferencia, que
// necesita ambos) o directamente el de admin (para efectivo/cuenta externa,
// que solo necesita uno). No hay una columna unica "confirmado_at" en la
// tabla, se calcula aca.
export function fechaDeConfirmacion(
  pago: Pick<PagoDelDia, 'confirmado_acreedor_at' | 'confirmado_admin_at'>
): string | null {
  const candidatos = [pago.confirmado_acreedor_at, pago.confirmado_admin_at].filter(
    (valor): valor is string => valor !== null
  )
  if (candidatos.length === 0) return null
  const masTardio = candidatos.reduce((a, b) => (a > b ? a : b))
  return fechaEnArgentina(masTardio)
}

export async function obtenerPagosDelDia(
  supabase: SupabaseClient,
  fecha: string // 'YYYY-MM-DD'
): Promise<PagoDelDia[]> {
  // Antes se traian TODOS los pagos confirmados de la historia y el dia se
  // elegia en memoria. Con la cartera real eso pasa las 1000 filas en pocos
  // meses, y PostgREST corta ahi sin avisar: la caja de cualquier dia podia
  // salir incompleta (ver traer-todas-las-filas.ts).
  //
  // Ahora la base devuelve solo lo que pudo cerrarse cerca de ese dia, y el
  // corte exacto lo sigue haciendo fechaDeConfirmacion, en hora argentina.
  // La ventana tiene un dia de mas para cada lado a proposito: asi no hace
  // falta repetir aca la cuenta de husos horarios, que ya vive alla.
  const desde = `${sumarDias(fecha, -1)}T00:00:00Z`
  const hasta = `${sumarDias(fecha, 2)}T00:00:00Z`

  const pagos = await traerTodasLasFilas<PagoDelDia>((inicio, fin) =>
    supabase
      .from('pagos')
      .select(
        'id, monto, moneda, medio_pago, motivo, cliente_id, confirmado_acreedor_at, confirmado_admin_at, lote_id, lotes(identificador)'
      )
      .eq('estado', 'confirmado')
      // El toque mas tardio cae en la ventana si alguno de los dos es
      // posterior al inicio...
      .or(`confirmado_admin_at.gte."${desde}",confirmado_acreedor_at.gte."${desde}"`)
      // ...y ninguno es posterior al final.
      .or(`confirmado_admin_at.is.null,confirmado_admin_at.lt."${hasta}"`)
      .or(`confirmado_acreedor_at.is.null,confirmado_acreedor_at.lt."${hasta}"`)
      .order('id')
      .range(inicio, fin)
  )

  return pagos.filter((pago) => fechaDeConfirmacion(pago) === fecha)
}
