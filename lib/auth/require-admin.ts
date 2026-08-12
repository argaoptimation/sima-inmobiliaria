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
    redirect('/login')
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
    redirect('/login')
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
