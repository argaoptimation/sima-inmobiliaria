import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Search, Bell } from 'lucide-react'
import { NavAdmin } from '@/components/NavAdmin'
import { contarPagosPendientes } from '@/lib/pagos-pendientes'
import { obtenerCotizacionVigente } from '@/lib/cuenta-corriente/obtener-cotizacion-vigente'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { TOPBAR, BUSCADOR_GLOBAL, DOLAR_PILL } from '@/lib/ui/clases'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/login')
  }

  const rolesConAcceso = ['administrador', 'acreedor', 'vendedor', 'cobrador']

  if (!rolesConAcceso.includes(profile.role)) {
    redirect('/')
  }

  const pagosPendientes = await contarPagosPendientes(supabase, profile.role, user.id)
  const cotizacion = await obtenerCotizacionVigente(supabase, hoyArgentina())

  return (
    <div className="flex h-screen overflow-hidden">
      <NavAdmin
        role={profile.role}
        pagosPendientes={pagosPendientes}
        userId={user.id}
        nombreUsuario={profile.full_name ?? user.email ?? 'Usuario'}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className={TOPBAR}>
          <div className="relative w-[340px]">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" />
            {/* Buscador global: por ahora es solo la pieza visual del shell
                (MOCKUP 1) -- no busca todavía, ver design-system/rediseno/PLAN.md
                PR2. Cablearlo a lotes/clientes/pagos queda para una entrega
                aparte, no estaba detallado en el plan. */}
            <input
              type="search"
              placeholder="Buscar lote, cliente o comprobante…"
              disabled
              className={`${BUSCADOR_GLOBAL} cursor-not-allowed`}
            />
          </div>
          <div className="ml-auto flex items-center gap-3.5">
            {cotizacion !== null && (
              <div className={DOLAR_PILL}>
                <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
                <span className="tabular-nums">Dólar ${cotizacion.toLocaleString('es-AR')}</span>
              </div>
            )}
            <Bell className="h-[19px] w-[19px] text-slate-500" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  )
}
