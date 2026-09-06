import { createClient } from '@/lib/supabase/server'
import { obtenerCotizacionParaFecha } from '@/lib/cuenta-corriente/obtener-cotizacion-vigente'
import { convertirSenaAMonedaDelLote, type SenaADescontar } from './convertir-sena'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type { SenaADescontar }

const SIN_SENA: SenaADescontar = {
  monto: 0,
  convertida: false,
  cotizacion: null,
  fechaCotizacion: null,
  sinCotizacion: false,
}

// Cuánto de la seña se descuenta del total a financiar, siempre expresado en
// la moneda del lote.
//
// Si la seña se cobró en otra moneda se convierte con la cotización del día
// en que se cobró (fecha de la reserva), no con la de hoy: es plata que ya
// entró, y revaluarla cada vez que se abre la pantalla le movería el precio
// al cliente.
export async function calcularSenaADescontar(
  supabase: SupabaseServerClient,
  {
    montoSena,
    monedaSena,
    monedaLote,
    fechaSena,
  }: {
    montoSena: number | null
    monedaSena: string | null
    monedaLote: string
    fechaSena: string | null
  }
): Promise<SenaADescontar> {
  if (!montoSena || montoSena <= 0 || !monedaSena) return SIN_SENA

  if (monedaSena === monedaLote) {
    return { ...SIN_SENA, monto: montoSena }
  }

  const cotizacion = fechaSena ? await obtenerCotizacionParaFecha(supabase, fechaSena) : null

  const convertido = convertirSenaAMonedaDelLote({
    montoSena,
    monedaSena,
    monedaLote,
    cotizacion: cotizacion?.valor ?? null,
  })

  if (convertido === null) {
    return { ...SIN_SENA, sinCotizacion: true }
  }

  return {
    monto: convertido,
    convertida: true,
    cotizacion: cotizacion?.valor ?? null,
    fechaCotizacion: cotizacion?.fecha ?? null,
    sinCotizacion: false,
  }
}
