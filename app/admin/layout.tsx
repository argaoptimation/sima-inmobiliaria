import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminShell } from '@/components/AdminShell'
import { contarPagosPendientes } from '@/lib/pagos-pendientes'
import { obtenerCotizacionVigente } from '@/lib/cuenta-corriente/obtener-cotizacion-vigente'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'

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
    <AdminShell
      role={profile.role}
      pagosPendientes={pagosPendientes}
      userId={user.id}
      nombreUsuario={profile.full_name ?? user.email ?? 'Usuario'}
      cotizacion={cotizacion}
    >
      {children}
    </AdminShell>
  )
}
