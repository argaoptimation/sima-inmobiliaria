import { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Cuenta los pagos que están esperando LA confirmación del usuario actual
 * (acreedor o administrador), para mostrar en la nav junto al link "Pagos".
 * Mismo criterio de scoping que ya usa `/admin/pagos`: un pago sin
 * `comprobante_path` no cuenta (no hay nada que confirmar todavía).
 */
export async function contarPagosPendientes(
  supabase: SupabaseServerClient,
  role: string,
  userId: string
): Promise<number> {
  if (role === 'acreedor') {
    const { data: misLotes } = await supabase
      .from('lotes')
      .select('id')
      .eq('acreedor_id', userId)

    const loteIds = (misLotes ?? []).map((lote) => lote.id)

    if (loteIds.length === 0) return 0

    const { count } = await supabase
      .from('pagos')
      .select('id', { count: 'exact', head: true })
      .in('lote_id', loteIds)
      .eq('estado', 'pendiente')
      .not('comprobante_path', 'is', null)
      .is('confirmado_acreedor_por', null)
    return count ?? 0
  }

  if (role === 'administrador') {
    const { count } = await supabase
      .from('pagos')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'pendiente')
      .not('comprobante_path', 'is', null)
      .is('confirmado_admin_por', null)
    return count ?? 0
  }

  return 0
}
