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

// Cotización para una fecha PASADA puntual (ej. el día en que se cobró una
// seña), con fallback en las dos direcciones. Devuelve también la fecha de
// la cotización que terminó usando, para poder mostrarla en pantalla: si el
// número le cambia el precio al cliente, tiene que quedar claro de dónde
// salió.
//
// Primero la más reciente cargada en esa fecha o antes -- que es la que
// estaba vigente ese día, y resuelve solo los fines de semana y feriados.
// Si no hay ninguna anterior (la seña es más vieja que la primera
// cotización cargada en el sistema), toma la primera posterior: es una
// aproximación, pero es mucho mejor que no descontar la seña.
export async function obtenerCotizacionParaFecha(
  supabase: SupabaseServerClient,
  fecha: string
): Promise<{ valor: number; fecha: string } | null> {
  const { data: anterior } = await supabase
    .from('cotizaciones_dolar')
    .select('valor, fecha')
    .lte('fecha', fecha)
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (anterior) return { valor: anterior.valor, fecha: anterior.fecha }

  const { data: posterior } = await supabase
    .from('cotizaciones_dolar')
    .select('valor, fecha')
    .gt('fecha', fecha)
    .order('fecha', { ascending: true })
    .limit(1)
    .maybeSingle()

  return posterior ? { valor: posterior.valor, fecha: posterior.fecha } : null
}
