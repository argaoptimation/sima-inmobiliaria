import { createClient } from '@/lib/supabase/server'
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
