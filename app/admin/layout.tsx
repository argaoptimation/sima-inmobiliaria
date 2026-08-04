import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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

  if (profile.role !== 'administrador' && profile.role !== 'acreedor') {
    redirect('/')
  }

  return (
    <div>
      <nav className="flex gap-4 border-b p-4 text-sm">
        <a href="/admin/lotes">Lotes</a>
        <a href="/admin/pagos">Pagos</a>
        <a href="/admin/usuarios">Usuarios</a>
        <a href="/mi-perfil">Mi perfil</a>
      </nav>
      <div className="p-6">{children}</div>
    </div>
  )
}
