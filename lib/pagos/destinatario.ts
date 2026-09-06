import { createClient } from '@/lib/supabase/server'
import { resolverDestinoDeCobro } from './quien-cobra'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface DestinatarioDelPago {
  // Usuario del staff que confirma este cobro (tiene login), o null.
  perfilId: string | null
  // Cuenta externa que cobra (sin login: nunca confirma), o null.
  cuentaExternaId: string | null
  // El que cobra es el propio administrador: su confirmación de admin ya
  // es la del destinatario, no hay dos personas distintas que chequeen.
  destinatarioEsAdministrador: boolean
  // `true` solo si hay una cuenta de cobro EXPLÍCITA (de la cuota o del
  // lote). Distinguirlo importa para la plata: cuando no hay ninguna
  // cargada, `perfilId` es el acreedor del lote por herencia histórica --
  // es quien confirma, pero el portal del cliente nunca le mostró su alias,
  // así que no hay ninguna evidencia de que la plata le haya entrado a él y
  // NO se le postea ningún Haber.
  cobroDirecto: boolean
}

export interface PagoParaDestinatario {
  cuota_origen_id: string | null
  lote_id: string
  medio_pago?: string | null
}

// `true` si este pago necesita las DOS confirmaciones (la del destinatario
// y la del admin) o le alcanza con la del admin sola.
//
// Alcanza con el admin cuando del otro lado no hay nadie que pueda
// confirmar: una cuenta externa no tiene login, el propio Nicolás no se
// chequea a sí mismo dos veces, un lote sin destinatario asignado no tiene
// a quién esperar, y un pago en efectivo ya tiene como evidencia que
// Nicolás lo tiene en la mano (Notas_Decisiones_SIMA.txt punto 22).
export function alcanzaConLaConfirmacionDelAdmin(
  destinatario: DestinatarioDelPago,
  medioPago: string | null | undefined
): boolean {
  return (
    medioPago === 'efectivo' ||
    destinatario.cuentaExternaId !== null ||
    destinatario.perfilId === null ||
    destinatario.destinatarioEsAdministrador
  )
}

// Quién tiene que hacer la PRIMERA confirmación de un pago: el destinatario
// del cobro, es decir el dueño del alias que el cliente vio al transferir.
//
// Se resuelve desde la cuota que el cliente estaba pagando (pagos
// .cuota_origen_id). Los pagos viejos y los que carga el admin a mano no
// tienen cuota de origen y caen a la cuenta de cobro del lote, y de ahí al
// acreedor -- que es como funcionaba todo antes del 06/09.
export async function resolverDestinatarioDelPago(
  supabase: SupabaseServerClient,
  pago: PagoParaDestinatario
): Promise<DestinatarioDelPago> {
  const { data: cuota } = pago.cuota_origen_id
    ? await supabase
        .from('cuotas')
        .select('cuenta_cobro_id, cuenta_cobro_externa_id')
        .eq('id', pago.cuota_origen_id)
        .maybeSingle()
    : { data: null }

  const { data: lote } = await supabase
    .from('lotes')
    .select('cuenta_cobro_id, cuenta_cobro_externa_id, acreedor_id')
    .eq('id', pago.lote_id)
    .maybeSingle()

  const destino = resolverDestinoDeCobro(cuota, lote)

  // Sin ninguna cuenta de cobro configurada, el que cobra es el acreedor
  // del lote -- el comportamiento histórico.
  const perfilId = destino.perfilId ?? (destino.cuentaExternaId ? null : (lote?.acreedor_id ?? null))

  const { data: perfil } = perfilId
    ? await supabase.from('profiles').select('role').eq('id', perfilId).maybeSingle()
    : { data: null }

  return {
    perfilId,
    cuentaExternaId: destino.cuentaExternaId,
    destinatarioEsAdministrador: perfil?.role === 'administrador',
    cobroDirecto: destino.perfilId !== null || destino.cuentaExternaId !== null,
  }
}

// Ídem pero para una lista de pagos, en pocas consultas en vez de una por
// pago. Devuelve un Map indexado por id de pago.
//
// Las consultas van de a tandas: un solo `.in(...)` con todos los ids viaja
// en la query string y con listas grandes se pasa del límite del servidor
// (mismo problema que ya nos escondió el aviso de cuotas sin distribución,
// ver lib/cuenta-corriente/cuotas-sin-distribucion.ts).
const IDS_POR_TANDA = 100

async function enTandas<T>(
  ids: string[],
  traer: (tanda: string[]) => Promise<T[]>
): Promise<T[]> {
  const filas: T[] = []

  for (let desde = 0; desde < ids.length; desde += IDS_POR_TANDA) {
    filas.push(...(await traer(ids.slice(desde, desde + IDS_POR_TANDA))))
  }

  return filas
}

export async function resolverDestinatariosDePagos(
  supabase: SupabaseServerClient,
  pagos: ({ id: string } & PagoParaDestinatario)[]
): Promise<Map<string, DestinatarioDelPago>> {
  const porPago = new Map<string, DestinatarioDelPago>()

  if (pagos.length === 0) return porPago

  const cuotaIds = [...new Set(pagos.map((p) => p.cuota_origen_id).filter(Boolean) as string[])]
  const loteIds = [...new Set(pagos.map((p) => p.lote_id))]

  const cuotas = await enTandas(cuotaIds, async (tanda) => {
    const { data } = await supabase
      .from('cuotas')
      .select('id, cuenta_cobro_id, cuenta_cobro_externa_id')
      .in('id', tanda)
    return data ?? []
  })

  const lotes = await enTandas(loteIds, async (tanda) => {
    const { data } = await supabase
      .from('lotes')
      .select('id, cuenta_cobro_id, cuenta_cobro_externa_id, acreedor_id')
      .in('id', tanda)
    return data ?? []
  })

  const cuotaPorId = new Map(cuotas.map((c) => [c.id, c]))
  const lotePorId = new Map(lotes.map((l) => [l.id, l]))

  const destinos = pagos.map((pago) => {
    const lote = lotePorId.get(pago.lote_id) ?? null
    const destino = resolverDestinoDeCobro(
      pago.cuota_origen_id ? (cuotaPorId.get(pago.cuota_origen_id) ?? null) : null,
      lote
    )

    return {
      pagoId: pago.id,
      perfilId:
        destino.perfilId ?? (destino.cuentaExternaId ? null : (lote?.acreedor_id ?? null)),
      cuentaExternaId: destino.cuentaExternaId,
      cobroDirecto: destino.perfilId !== null || destino.cuentaExternaId !== null,
    }
  })

  const perfilIds = [...new Set(destinos.map((d) => d.perfilId).filter(Boolean) as string[])]

  const perfiles = await enTandas(perfilIds, async (tanda) => {
    const { data } = await supabase.from('profiles').select('id, role').in('id', tanda)
    return data ?? []
  })

  const rolPorPerfilId = new Map(perfiles.map((p) => [p.id, p.role]))

  for (const destino of destinos) {
    porPago.set(destino.pagoId, {
      perfilId: destino.perfilId,
      cuentaExternaId: destino.cuentaExternaId,
      destinatarioEsAdministrador: destino.perfilId
        ? rolPorPerfilId.get(destino.perfilId) === 'administrador'
        : false,
      cobroDirecto: destino.cobroDirecto,
    })
  }

  return porPago
}
