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
    // SEGURIDAD (ver Notas_Decisiones_SIMA.txt punto 48): investigamos un
    // caso donde esta lectura devuelve un acreedor_id viejo incluso mucho
    // después de que un UPDATE concurrente ya haya confirmado -- reproducido
    // con builds de producción limpios, sin caché de Next.js, sin keep-alive
    // HTTP. Se descartó resolverlo solo con el cliente admin. La causa raíz
    // sigue sin cerrar (parece territorio de configuración de Supabase, no
    // de este código) — lo de abajo es un MITIGANTE, no el arreglo de
    // fondo: se descarta la primera lectura (la más propensa a venir stale,
    // por ser la primera consulta de esta invocación) y se fuerza una
    // relectura después de una espera corta antes de confiar en el dato. El
    // problema documentado es específico a la lectura que es la PRIMERA
    // consulta de la invocación -- por eso se descarta una lectura inicial
    // (deja de ser "la primera consulta") y recién se confía en la segunda,
    // después de una espera. El problema documentado siempre se resolvió
    // solo dentro de un par de intentos cortos (unos cientos de
    // milisegundos) en las pruebas que lo caracterizaron. Reduce la
    // ventana real, no la cierra del todo.
    const admin = createAdminClient()
    await admin.from('lotes').select('acreedor_id').eq('id', loteId).single()
    await new Promise((resolve) => setTimeout(resolve, 250))
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
