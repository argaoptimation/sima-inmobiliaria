import { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// Piezas compartidas entre las dos formas de sacar a alguien de un lote:
// el botón "Quitar" de su ficha (quitarIntegrante) y cambiarlo en "Roles del
// lote" (actualizarCobro).

export async function nombreDeCuenta(
  supabase: SupabaseServerClient,
  profileId: string | null,
  cuentaExternaId: string | null
): Promise<string> {
  if (profileId) {
    const { data } = await supabase.from('profiles').select('full_name').eq('id', profileId).maybeSingle()
    return data?.full_name ?? 'Esa persona'
  }
  const { data } = await supabase.from('cuentas_externas').select('nombre').eq('id', cuentaExternaId!).maybeSingle()
  return data?.nombre ?? 'Esa cuenta'
}

// Lo que se le cuenta al admin después de confirmar, con lo que devolvió
// quitar_integrante_lote.
export function mensajeDeSalidaHecha(nombre: string, resultado: unknown): string {
  const { repartos = 0, destinos = 0 } = (resultado ?? {}) as { repartos?: number; destinos?: number }
  const partes = [`${nombre} ya no es integrante del lote.`]
  if (repartos > 0) {
    partes.push(`Se le sacó la parte del reparto en ${repartos} ${repartos === 1 ? 'cuota' : 'cuotas'} sin cobrar.`)
  }
  if (destinos > 0) {
    partes.push(
      `${destinos} ${destinos === 1 ? 'cuota quedó' : 'cuotas quedaron'} sin destino: elegí a quién se le transfieren.`
    )
  }
  return partes.join(' ')
}
