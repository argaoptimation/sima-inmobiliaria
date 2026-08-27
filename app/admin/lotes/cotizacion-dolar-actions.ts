'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { mensajeDeError } from '@/lib/errores'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'

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

  const hoy = hoyArgentina()

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

  // Log insert-only de cada carga/corrección del día (25/08/2026, pedido de
  // Gabriel) -- el upsert de arriba solo deja ver el valor vigente, esta
  // tabla aparte guarda cada valor que se cargó para poder mostrar el
  // historial de correcciones en /admin/cotizacion-dolar (uso interno, no se
  // le muestra al cliente).
  await supabase
    .from('cotizaciones_dolar_historial')
    .insert({ fecha: hoy, valor, cargado_por: user!.id })

  // Necesario desde que /admin/lotes empezó a navegarse con next/link
  // (27/08, spinner de carga): sin esto, el router cache del cliente podía
  // servir la versión de la página que ya tenía prefetcheada de ANTES de
  // este guardado -- el admin veía la cotización vieja hasta refrescar a
  // mano. Con <a> plano (como era antes) nunca hacía falta, cada
  // navegación era una carga completa sin caché.
  revalidatePath('/admin/lotes')
  redirect('/admin/lotes')
}
