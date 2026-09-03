import { createClient } from '@/lib/supabase/server'
import { requireAdminOCobrador } from '@/lib/auth/require-admin'
import { calcularTramosMora } from '@/lib/cobranza/tramos-mora'
import { EncabezadoPagina } from '@/components/EncabezadoPagina'
import { PanelMorososVista } from './PanelMorososVista'
import { BANNER_ERROR, BANNER_OK } from '@/lib/ui/clases'

// Panel de Morosos (PR4 del rediseño, MOCKUP 3): agrupa a todos los clientes
// con cuotas vencidas en 4 tramos -- deben 1, deben 2, posible prejudicial (3+)
// y prejudicial oficial -- con franja de color en una sola lista unificada y
// 4 tarjetas KPI en la cabecera. Mismo cálculo y misma acción marcarPrejudicial.
export default async function PanelMorososPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  await requireAdminOCobrador()

  const { ok, error } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: perfilPropio } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()
  const esAdministrador = perfilPropio?.role === 'administrador'

  const { debe1, debe2, posiblePrejudicial, prejudicialOficial, alDia } =
    await calcularTramosMora(supabase)

  return (
    <main className="flex flex-col gap-5">
      {/* Renombrado a "Panel de cuotas" (pedido de Nico, confirmado por Gabriel
          03/09) -- la URL/slug se deja igual (`/admin/panel-morosos`) a
          propósito, para no romper enlaces/bookmarks existentes; solo cambia
          el nombre visible. Ahora también accesible para cobrador (antes
          requireAdministrador lo bloqueaba de entrar directo por URL). */}
      <EncabezadoPagina titulo="Panel de cuotas" migas={['Panel de cuotas']} />

      {error && <p className={BANNER_ERROR}>{error}</p>}
      {ok && <p className={BANNER_OK}>{ok}</p>}

      {/* KPIs Interactivos y Lista Unificada */}
      <PanelMorososVista
        debe1={debe1}
        debe2={debe2}
        posiblePrejudicial={posiblePrejudicial}
        prejudicialOficial={prejudicialOficial}
        alDia={alDia}
        esAdministrador={esAdministrador}
      />
    </main>
  )
}
