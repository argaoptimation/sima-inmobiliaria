import { createClient } from '@/lib/supabase/server'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { calcularEstadoCobranza, cuotasVencidas as calcularCuotasVencidas } from './estado-cliente'
import { calcularInteresMoratorio } from './interes-moratorio'
import { armarMensajeWhatsApp } from './plantillas-whatsapp'
import { telefonoParaWhatsApp } from '@/lib/telefono/prefijos'
import { obtenerSiteUrl } from '@/lib/config/site-url'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface FilaMoroso {
  loteId: string
  identificador: string
  clienteId: string
  clienteNombre: string
  cuotasVencidas: number
  saldoPendiente: number
  moneda: string
  loteoNombre?: string
  manzana?: string | null
  numeroLote?: string | null
  // Agregado 03/09 (pedido de Nico: mover el WhatsApp de cobranza acá) --
  // mismo mensaje/monto-con-mora que ya se arma en /admin/lotes, para poder
  // mandarlo directo desde este panel filtrando por tramo.
  telefono: string | null
  mensajeWhatsApp: string | null
}

export interface TramosMora {
  debe1: FilaMoroso[]
  debe2: FilaMoroso[]
  posiblePrejudicial: FilaMoroso[]
  prejudicialOficial: FilaMoroso[]
  // Clientes con saldo pendiente pero sin ninguna cuota vencida todavía --
  // antes se calculaban y se descartaban (no entraban en ningún tramo).
  // Agregado 03/09 (pedido de Nico): que el filtro "Todos" del panel
  // también los incluya, no solo los que están en mora.
  alDia: FilaMoroso[]
}

// Extraído de app/admin/panel-morosos/page.tsx (PR2 del rediseño, ver
// design-system/rediseno/PLAN.md) para que el dashboard de /admin/inicio
// pueda mostrar los mismos 4 tramos sin duplicar la lógica -- MISMO cálculo
// exacto que ya usaba el panel, no se tocó ningún criterio (cuotas del
// ciclo actual, saldo_pendiente > 0 y vencida antes de hoy).
export async function calcularTramosMora(supabase: SupabaseServerClient): Promise<TramosMora> {
  const hoy = hoyArgentina()

  const { data: lotesVendidos } = await supabase
    .from('lotes')
    .select(
      'id, identificador, moneda, cliente_id, ciclo_actual, marcado_prejudicial, loteo_id, manzana, numero_lote, interes_moratorio_diario, loteos(nombre)'
    )
    .eq('estado', 'vendido')
    .not('cliente_id', 'is', null)

  const loteIds = (lotesVendidos ?? []).map((lote) => lote.id)
  const clienteIds = [...new Set((lotesVendidos ?? []).map((lote) => lote.cliente_id as string))]

  const { data: clientes } =
    clienteIds.length > 0
      ? await supabase
          .from('profiles')
          .select('id, full_name, telefono_prefijo, telefono_numero')
          .in('id', clienteIds)
      : { data: [] }
  const clientePorId = new Map((clientes ?? []).map((cliente) => [cliente.id, cliente]))

  const { data: cuotasSinFiltrar } =
    loteIds.length > 0
      ? await supabase
          .from('cuotas')
          .select('lote_id, ciclo, saldo_pendiente, fecha_vencimiento')
          .in('lote_id', loteIds)
          .order('fecha_vencimiento', { ascending: true })
      : { data: [] }

  const cicloActualPorLoteId = new Map((lotesVendidos ?? []).map((lote) => [lote.id, lote.ciclo_actual]))
  const cuotas = (cuotasSinFiltrar ?? []).filter((cuota) => cuota.ciclo === cicloActualPorLoteId.get(cuota.lote_id))

  const cuotasPorLote = new Map<string, { saldo_pendiente: number; fecha_vencimiento: string }[]>()
  for (const cuota of cuotas) {
    const lista = cuotasPorLote.get(cuota.lote_id) ?? []
    lista.push(cuota)
    cuotasPorLote.set(cuota.lote_id, lista)
  }

  const tramos: TramosMora = {
    debe1: [],
    debe2: [],
    posiblePrejudicial: [],
    prejudicialOficial: [],
    alDia: [],
  }

  for (const lote of (lotesVendidos ?? []) as unknown as Array<{
    id: string
    identificador: string
    moneda: string
    cliente_id: string
    ciclo_actual: number
    marcado_prejudicial: boolean
    loteo_id: string | null
    manzana: string | null
    numero_lote: string | null
    interes_moratorio_diario: number
    loteos: { nombre: string } | { nombre: string }[] | null
  }>) {
    const cuotasDelLote = cuotasPorLote.get(lote.id) ?? []
    const cuotasVencidasDelLote = calcularCuotasVencidas(
      cuotasDelLote.map((cuota) => ({
        saldoPendiente: cuota.saldo_pendiente,
        fechaVencimiento: cuota.fecha_vencimiento,
      })),
      hoy
    )
    const cuotasVencidas = cuotasVencidasDelLote.length
    const saldoPendiente = cuotasDelLote.reduce((acum, cuota) => acum + cuota.saldo_pendiente, 0)

    if (saldoPendiente === 0 && !lote.marcado_prejudicial) continue

    const loteoNombre = Array.isArray(lote.loteos)
      ? lote.loteos[0]?.nombre
      : lote.loteos?.nombre

    // Mismo armado que /admin/lotes (cobranzaPorLote): estado de cobranza
    // por cantidad de cuotas vencidas, monto con interés moratorio sumado
    // solo para moroso/prejudicial, mensaje de WhatsApp listo para mandar.
    const cliente = clientePorId.get(lote.cliente_id as string)
    const estadoCobranza = calcularEstadoCobranza(
      cuotasDelLote.map((cuota) => ({
        saldoPendiente: cuota.saldo_pendiente,
        fechaVencimiento: cuota.fecha_vencimiento,
      })),
      hoy
    )
    const proximaCuotaPendiente = cuotasDelLote.find((cuota) => cuota.saldo_pendiente > 0)
    const montoConMora =
      estadoCobranza === 'moroso' || estadoCobranza === 'prejudicial'
        ? saldoPendiente +
          cuotasVencidasDelLote.reduce(
            (acum, cuota) =>
              acum +
              calcularInteresMoratorio(
                { saldoPendiente: cuota.saldoPendiente, fechaVencimiento: cuota.fechaVencimiento },
                lote.interes_moratorio_diario,
                hoy
              ),
            0
          )
        : saldoPendiente
    const mensajeWhatsApp =
      saldoPendiente > 0 && proximaCuotaPendiente && cliente
        ? armarMensajeWhatsApp(estadoCobranza, {
            nombre: cliente.full_name,
            lote: lote.identificador,
            numeroLote: lote.numero_lote,
            manzana: lote.manzana,
            nombreLoteo: loteoNombre ?? null,
            monto: montoConMora,
            moneda: lote.moneda,
            fechaVencimiento: proximaCuotaPendiente.fecha_vencimiento,
            fechasVencidas: cuotasVencidasDelLote.map((cuota) => cuota.fechaVencimiento),
            linkPortal: obtenerSiteUrl(),
          })
        : null

    const fila: FilaMoroso = {
      loteId: lote.id,
      identificador: lote.identificador,
      clienteId: lote.cliente_id as string,
      clienteNombre: cliente?.full_name ?? '—',
      cuotasVencidas,
      saldoPendiente,
      moneda: lote.moneda,
      loteoNombre,
      manzana: lote.manzana,
      numeroLote: lote.numero_lote,
      telefono: telefonoParaWhatsApp(cliente?.telefono_prefijo ?? null, cliente?.telefono_numero ?? null),
      mensajeWhatsApp,
    }

    if (lote.marcado_prejudicial) {
      tramos.prejudicialOficial.push(fila)
    } else if (cuotasVencidas === 1) {
      tramos.debe1.push(fila)
    } else if (cuotasVencidas === 2) {
      tramos.debe2.push(fila)
    } else if (cuotasVencidas >= 3) {
      tramos.posiblePrejudicial.push(fila)
    } else {
      // cuotasVencidas === 0: tiene saldo pendiente pero ninguna cuota
      // vencida todavía -- al día.
      tramos.alDia.push(fila)
    }
  }

  return tramos
}
