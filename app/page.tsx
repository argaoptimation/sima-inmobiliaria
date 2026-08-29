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

  // PR2 del rediseño (ver design-system/rediseno/PLAN.md): el admin aterriza
  // en el dashboard nuevo. Los demás roles siguen yendo a /admin/lotes como
  // antes -- el dashboard cruza métricas globales (cobranza de TODOS los
  // acreedores, mora de TODOS los clientes) que hoy ningún otro rol ve
  // agregadas, así que no se le abre a nadie más en este PR.
  if (profile.role === 'administrador') {
    redirect('/admin/inicio')
  }

  const rolesConAcceso = ['administrador', 'acreedor', 'vendedor', 'cobrador']

  if (rolesConAcceso.includes(profile.role)) {
    redirect('/admin/lotes')
  }

  return (
    <main className="mx-auto mt-24 max-w-sm p-6 text-center">
      <p className="mb-4">Tu rol ({profile.role}) todavía no tiene una pantalla propia en esta versión.</p>
      <a href="/mi-perfil" className="underline">
        Cargar mis datos de transferencia
      </a>
    </main>
  )
}
