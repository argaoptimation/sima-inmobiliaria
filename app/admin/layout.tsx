import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NavAdmin } from '@/components/NavAdmin'
import { contarPagosPendientes } from '@/lib/pagos-pendientes'

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
    .select('role')
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

  return (
    <div>
      <NavAdmin role={profile.role} pagosPendientes={pagosPendientes} userId={user.id} />
      <div className="p-6">{children}</div>
    </div>
  )
}
