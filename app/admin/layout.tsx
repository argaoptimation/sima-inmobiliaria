import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NavAdmin } from '@/components/NavAdmin'

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

  return (
    <div>
      <NavAdmin role={profile.role} />
      <div className="p-6">{children}</div>
    </div>
  )
}
