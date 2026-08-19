import { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// Cotización vigente a una fecha: la más reciente cargada en esa fecha o
// antes (mismo criterio de fallback en cascada que ya usa la pantalla de
// pago del cliente). Devuelve null si todavía no hay ninguna cotización
// cargada hasta esa fecha.
export async function obtenerCotizacionVigente(
  supabase: SupabaseServerClient,
  fecha: string
): Promise<number | null> {
  const { data } = await supabase
    .from('cotizaciones_dolar')
    .select('valor')
    .lte('fecha', fecha)
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data?.valor ?? null
}
