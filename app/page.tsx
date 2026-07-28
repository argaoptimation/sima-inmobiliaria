import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Home() {
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

  if (profile.role === 'cliente') {
    redirect('/portal-cliente')
  }

  if (profile.role === 'administrador' || profile.role === 'acreedor') {
    redirect('/admin')
  }

  return (
    <main className="mx-auto mt-24 max-w-sm p-6 text-center">
      <p>Tu rol ({profile.role}) todavía no tiene una pantalla propia en esta versión.</p>
    </main>
  )
}
