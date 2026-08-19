'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { mensajeDeError } from '@/lib/errores'

const ROLES_CON_ACCESO_A_LOTES = ['administrador', 'acreedor', 'vendedor', 'cobrador']

export async function guardarCotizacionDolar(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user!.id).single()

  if (!perfil || !ROLES_CON_ACCESO_A_LOTES.includes(perfil.role)) {
    redirect('/login')
  }

  const valorRaw = ((formData.get('valor') as string) || '').trim()
  const valor = Number(valorRaw)

  if (!valorRaw || !Number.isFinite(valor) || valor <= 0) {
    redirect(`/admin/lotes?error=${encodeURIComponent('Ingresá un valor de cotización válido, mayor a cero')}`)
  }

  const hoy = new Date().toISOString().slice(0, 10)

  // Upsert deliberado (a diferencia de los índices, que son insert-once): la
  // cotización del dólar es un valor operativo del día, no una publicación
  // oficial -- si alguien la carga mal a la mañana, tiene que poder
  // corregirla a la tarde sin pedirle a nadie que edite la base a mano.
  const { error } = await supabase
    .from('cotizaciones_dolar')
    .upsert({ fecha: hoy, valor, cargado_por: user!.id }, { onConflict: 'fecha' })

  if (error) {
    redirect(`/admin/lotes?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  redirect('/admin/lotes')
}
