import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export async function requireAdmin() {
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

  if (!profile || (profile.role !== 'administrador' && profile.role !== 'acreedor')) {
    redirect('/admin/lotes')
  }
}

export async function requireAdministrador() {
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

  if (!profile || profile.role !== 'administrador') {
    redirect('/admin/lotes')
  }
}

export async function requireAdminSobreLote(loteId: string) {
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
    .eq('id', user!.id)
    .single()

  if (!profile || (profile.role !== 'administrador' && profile.role !== 'acreedor')) {
    redirect('/admin/lotes')
  }

  if (profile!.role === 'acreedor') {
    // Lectura con el cliente admin (secret key), no el de RLS. NOTA DE
    // SEGURIDAD (ver task-2-report.md): investigamos un caso donde esta
    // lectura devuelve un acreedor_id viejo incluso mucho después de que un
    // UPDATE concurrente ya haya confirmado -- reproducido con builds de
    // producción limpios, sin caché de Next.js, sin keep-alive HTTP, y con
    // esperas de hasta 15s, así que usar el cliente admin acá NO cierra el
    // problema por sí solo. Se deja así de todas formas por ser la fuente
    // más autoritativa disponible (bypassea RLS) mientras se investiga la
    // causa raíz a nivel de infraestructura.
    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('acreedor_id').eq('id', loteId).single()

    if (!lote || lote.acreedor_id !== user!.id) {
      redirect('/admin/lotes')
    }
  }
}

// Mismo chequeo que requireAdmin(): alias con nombre mas descriptivo para
// los call sites que bloquean paginas enteras a vendedor/cobrador (evita
// mantener dos copias identicas de la misma logica).
export const requireAdminOAcreedor = requireAdmin

export async function requireAccesoParaReservar(loteId: string) {
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
    .eq('id', user!.id)
    .single()

  const rolesConAcceso = ['administrador', 'acreedor', 'vendedor', 'cobrador']

  if (!profile || !rolesConAcceso.includes(profile.role)) {
    redirect('/login')
  }

  if (profile!.role === 'acreedor') {
    const { data: lote } = await supabase
      .from('lotes')
      .select('acreedor_id')
      .eq('id', loteId)
      .single()

    if (!lote || lote.acreedor_id !== user!.id) {
      redirect('/admin/lotes')
    }
  }
}
