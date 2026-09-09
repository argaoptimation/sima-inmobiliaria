import type { SupabaseClient } from '@supabase/supabase-js'
import { resumirCuentaCorrientePorMoneda, type SituacionCuenta } from './situacion'
import { totalesATransferirPorMoneda, type TotalesATransferir } from './totales-a-transferir'

// "¿A quién le tengo que girar plata hoy, y cuánta?" -- la pregunta con la
// que Nicolás abre la pantalla todos los meses antes de ir al banco.
//
// El cálculo NO es nuevo: es el mismo `leCorresponde − cobroDirecto` por
// moneda que ya venía usando la cuenta corriente de cada persona (ver
// situacion.ts). Lo que agrega este módulo es mirarlos a todos juntos y
// sacar el total, que hasta ahora había que hacer a mano sumando pantalla
// por pantalla.
//
// Vive en lib y no adentro de la página porque el Excel tiene que exportar
// EXACTAMENTE lo mismo que se ve (regla de Gabriel, 09/09). Si cada uno
// armara su propia consulta, se separarían a la primera corrección.

export interface PersonaEnResumen {
  id: string
  nombre: string
  rol: string
  porMoneda: Record<string, SituacionCuenta>
}

export interface ResumenDeTransferencias {
  personas: PersonaEnResumen[]
  totales: Record<string, TotalesATransferir>
}

const ROLES_CON_CUENTA = ['administrador', 'acreedor', 'vendedor', 'cobrador']

export async function obtenerResumenDeTransferencias(
  supabase: SupabaseClient,
  opciones: { filtroNombre?: string | null } = {}
): Promise<ResumenDeTransferencias> {
  let queryPersonas = supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ROLES_CON_CUENTA)
    .order('full_name')

  if (opciones.filtroNombre) {
    queryPersonas = queryPersonas.ilike('full_name', `%${opciones.filtroNombre}%`)
  }

  const { data: personasData } = await queryPersonas

  const { data: movimientos } = await supabase
    .from('movimientos_cuenta_corriente')
    .select('profile_id, tipo, monto, moneda')

  const movimientosPorPersona = new Map<
    string,
    { tipo: 'debe' | 'haber'; monto: number; moneda: string }[]
  >()
  for (const movimiento of movimientos ?? []) {
    const lista = movimientosPorPersona.get(movimiento.profile_id) ?? []
    lista.push({ tipo: movimiento.tipo, monto: movimiento.monto, moneda: movimiento.moneda })
    movimientosPorPersona.set(movimiento.profile_id, lista)
  }

  const personas: PersonaEnResumen[] = (personasData ?? []).map((persona) => ({
    id: persona.id as string,
    nombre: persona.full_name as string,
    rol: persona.role as string,
    porMoneda: resumirCuentaCorrientePorMoneda(movimientosPorPersona.get(persona.id) ?? []),
  }))

  // El total se saca SOBRE LO FILTRADO, no sobre todos: si el admin busca
  // "Fernández", el total tiene que decir cuánto suma lo que está viendo. Un
  // total que ignora el filtro es un número que no se corresponde con nada
  // de lo que hay en pantalla.
  return { personas, totales: totalesATransferirPorMoneda(personas) }
}

// Solo los que esperan plata, ordenados por lo que más se les debe. Es el
// orden con el que se hacen las transferencias: primero el grande, porque
// si algo queda para mañana que sea lo chico.
export function soloLosQueEsperan(
  personas: PersonaEnResumen[],
  moneda: string
): PersonaEnResumen[] {
  return personas
    .filter((persona) => (persona.porMoneda[moneda]?.saldo ?? 0) > 0)
    .sort((a, b) => (b.porMoneda[moneda]?.saldo ?? 0) - (a.porMoneda[moneda]?.saldo ?? 0))
}
