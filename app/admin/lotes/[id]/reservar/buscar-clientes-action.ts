'use server'

import { createClient } from '@/lib/supabase/server'

export interface ClienteEncontrado {
  full_name: string
  dni: string | null
  domicilio: string | null
  telefono_prefijo: string | null
  telefono_numero: string | null
  email: string | null
}

const ROLES_CON_ACCESO = ['administrador', 'acreedor', 'vendedor', 'cobrador']

// Autocompletado de clientes ya cargados, por DNI o nombre (pedido de Nico
// 01/09, ver la memoria del backlog de Notion): reemplaza el buscador viejo
// (un <form method="GET">, recarga completa de página) que tenía un bug
// real -- si se apretaba "Buscar" sin querer con el campo vacío (o incluso
// con datos), la recarga perdía TODOS los demás campos ya tipeados en el
// formulario de reserva, incluidos los archivos ya subidos a Storage (hay
// que volver a elegirlos, aunque ya estén subidos, porque la referencia
// vivía en un input oculto que la recarga también borraba). Al ser 100%
// client-side (sin navegación, ver BuscadorClienteReserva.tsx), ese bug
// deja de poder pasar estructuralmente, no solo se lo esquiva.
export async function buscarClientesParaReserva(textoBuscado: string): Promise<ClienteEncontrado[]> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()

  if (!perfil || !ROLES_CON_ACCESO.includes(perfil.role)) return []

  // ",()" tienen significado especial en .or() de PostgREST -- se sacan del
  // texto buscado antes de interpolarlo (mismo criterio que ya usa el
  // buscador de /admin/pagos).
  const texto = textoBuscado.trim().replace(/[,()]/g, '')
  if (texto.length < 2) return []

  const { data } = await supabase
    .from('profiles')
    .select('full_name, dni, domicilio, telefono_prefijo, telefono_numero, email')
    .eq('role', 'cliente')
    .or(`dni.ilike.${texto}%,full_name.ilike.%${texto}%`)
    .order('full_name')
    .limit(8)

  return data ?? []
}
