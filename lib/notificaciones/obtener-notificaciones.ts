import { createClient } from '@/lib/supabase/server'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { contarPagosPendientes } from '@/lib/pagos-pendientes'
import { obtenerCuotasSinDistribucion } from '@/lib/cuenta-corriente/cuotas-sin-distribucion'
import { obtenerMesesIndiceFaltantes } from '@/lib/lotes/meses-indice-faltantes'
import { obtenerCotizacionVigente } from '@/lib/cuenta-corriente/obtener-cotizacion-vigente'
import { resolverDestinoDeCobro } from '@/lib/pagos/quien-cobra'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'
import { formatearFechaCorta } from '@/lib/fecha/formatear-fecha-corta'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type UrgenciaNotificacion = 'alta' | 'media'

export interface Notificacion {
  // Clave estable (no un índice): la lista se recalcula en cada carga y una
  // notificación que desaparece no puede desplazar a las de al lado.
  id: string
  titulo: string
  detalle: string
  href: string
  urgencia: UrgenciaNotificacion
}

// Cuántos días para adelante se mira. Un mes y poco: alcanza para que la
// cuota del mes que viene aparezca a tiempo sin llenar la campana de cosas
// que recién hay que resolver en marzo.
const DIAS_DE_ANTICIPO = 35

// Tope por tipo de aviso. Con 200 lotes, "todas las cuotas sin alias" puede
// ser una lista de cien líneas que nadie lee; se muestran las primeras y se
// dice cuántas más hay.
const MAXIMO_POR_TIPO = 5

const IDS_POR_TANDA = 100

async function enTandas<T>(ids: string[], traer: (tanda: string[]) => Promise<T[]>): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; desde < ids.length; desde += IDS_POR_TANDA) {
    filas.push(...(await traer(ids.slice(desde, desde + IDS_POR_TANDA))))
  }
  return filas
}

function sumarDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const resultado = new Date(Date.UTC(anio, mes - 1, dia + dias))
  return resultado.toISOString().slice(0, 10)
}

// Avisos que le importan a quien está mirando la pantalla, calculados al
// vuelo (08/09, pedido de Gabriel: "un item de notificaciones superior donde
// marque las notificaciones relevantes... poder mantener informado a
// Nicolás"). No hay tabla de notificaciones ni estado de "leída": son
// situaciones que existen o no existen, y se resuelven arreglando lo que las
// causa. Marcarlas como leídas solo serviría para tapar un problema abierto.
//
// Mismo criterio "compute on read" que obtenerCuotasSinDistribucion y
// obtenerMesesIndiceFaltantes, que de hecho se reusan acá: los dos avisos ya
// existían pero solo se veían entrando a la pantalla donde vivían, así que
// nadie se enteraba hasta que iba a mirar.
export async function obtenerNotificaciones(
  supabase: SupabaseServerClient,
  role: string,
  userId: string
): Promise<Notificacion[]> {
  const notificaciones: Notificacion[] = []

  const esAdministrador = role === 'administrador'
  const esCobrador = role === 'cobrador'
  const esAcreedor = role === 'acreedor'

  // El vendedor no administra cobranza: su campana queda vacía a propósito.
  if (!esAdministrador && !esCobrador && !esAcreedor) return notificaciones

  // --- Pagos esperando MI confirmación ---------------------------------
  // El mismo número que ya muestra el badge de "Pagos" en el menú. Va
  // también acá porque la campana es donde se mira "qué tengo pendiente",
  // y separarlos obligaría a acordarse de dos lugares.
  if (esAdministrador || esAcreedor) {
    const pendientes = await contarPagosPendientes(supabase, role, userId)
    if (pendientes > 0) {
      notificaciones.push({
        id: 'pagos-por-confirmar',
        titulo:
          pendientes === 1
            ? 'Hay 1 pago esperando que lo confirmes'
            : `Hay ${pendientes} pagos esperando que los confirmes`,
        detalle: 'El cliente ya subió el comprobante. Hasta que no lo confirmes, la cuota sigue figurando impaga.',
        href: '/admin/pagos',
        urgencia: 'alta',
      })
    }
  }

  // --- Cuotas por vencer sin alias a dónde pagar -----------------------
  notificaciones.push(...(await cuotasSinDondePagar(supabase, esAcreedor ? userId : null)))

  // --- Cuotas ya cobradas sin distribución cargada ---------------------
  // Plata que entró y de la que no se le acreditó a nadie su parte.
  if (esAdministrador) {
    const sinDistribucion = await obtenerCuotasSinDistribucion(supabase)

    const porLote = new Map<string, { identificador: string; numeros: number[] }>()
    for (const cuota of sinDistribucion) {
      const entrada = porLote.get(cuota.loteId)
      if (entrada) entrada.numeros.push(cuota.numero)
      else porLote.set(cuota.loteId, { identificador: cuota.loteIdentificador, numeros: [cuota.numero] })
    }

    for (const [loteId, { identificador, numeros }] of [...porLote].slice(0, MAXIMO_POR_TIPO)) {
      notificaciones.push({
        id: `sin-distribucion-${loteId}`,
        titulo: `${identificador}: cobraste ${numeros.length === 1 ? 'una cuota' : `${numeros.length} cuotas`} sin repartir`,
        detalle: `La cuota ${numeros.sort((a, b) => a - b).join(', ')} ya recibió plata pero no tiene distribución cargada, así que no se generó el Debe de nadie.`,
        href: `/admin/lotes/${loteId}/distribucion`,
        urgencia: 'alta',
      })
    }

    if (porLote.size > MAXIMO_POR_TIPO) {
      notificaciones.push({
        id: 'sin-distribucion-resto',
        titulo: `Y ${porLote.size - MAXIMO_POR_TIPO} lote(s) más con cuotas cobradas sin repartir`,
        detalle: 'Se listan en Cuentas corrientes.',
        href: '/admin/cuentas-corrientes',
        urgencia: 'media',
      })
    }
  }

  // --- Índices del mes sin cargar --------------------------------------
  if (esAdministrador || esCobrador) {
    const faltantes = await obtenerMesesIndiceFaltantes(supabase)

    for (const faltante of faltantes.slice(0, MAXIMO_POR_TIPO)) {
      notificaciones.push({
        id: `indice-${faltante.nombre}-${faltante.periodo}`,
        titulo: `Falta cargar el índice ${faltante.nombre} de ${faltante.periodo}`,
        detalle: `Sin ese valor, ${faltante.lotes.length === 1 ? '1 lote no se ajusta' : `${faltante.lotes.length} lotes no se ajustan`} y las cuotas quedan con el monto viejo.`,
        href: '/admin/indices',
        urgencia: 'media',
      })
    }
  }

  // --- Cotización del dólar del día ------------------------------------
  if (esAdministrador || esCobrador) {
    const hoy = hoyArgentina()
    const { count: lotesEnDolares } = await supabase
      .from('lotes')
      .select('id', { count: 'exact', head: true })
      .eq('moneda', 'USD')
      .eq('estado', 'vendido')

    if (lotesEnDolares && lotesEnDolares > 0) {
      const { data: cotizacionDeHoy } = await supabase
        .from('cotizaciones_dolar')
        .select('fecha')
        .eq('fecha', hoy)
        .maybeSingle()

      if (!cotizacionDeHoy) {
        // Que exista una vieja no alcanza: el cliente que paga hoy convierte
        // con el valor de otro día. Se aclara cuál se está usando mientras
        // tanto, que es lo que Nicolás necesita para decidir si corre.
        const vigente = await obtenerCotizacionVigente(supabase, hoy)
        notificaciones.push({
          id: `cotizacion-${hoy}`,
          titulo: 'Todavía no cargaste la cotización del dólar de hoy',
          detalle: vigente
            ? `Mientras tanto se está usando la última cargada ($${vigente.toLocaleString('es-AR')}).`
            : 'No hay ninguna cotización cargada, así que los lotes en dólares no muestran su equivalente en pesos.',
          href: '/admin/cotizacion-dolar',
          urgencia: vigente ? 'media' : 'alta',
        })
      }
    }
  }

  return notificaciones
}

// Cuotas que vencen pronto (o ya vencieron) y siguen impagas, para las que
// el cliente NO tiene a dónde transferir: o no quedó nadie asignado, o el
// que quedó no tiene alias, banco y titular cargados.
//
// Es el aviso que pidió Gabriel con el ejemplo "Lote1 no tiene cargado quién
// cobra la cuota del próximo mes". Se agrupa por lote porque el arreglo es
// uno solo por lote (entrar a su distribución), no uno por cuota.
async function cuotasSinDondePagar(
  supabase: SupabaseServerClient,
  acreedorId: string | null
): Promise<Notificacion[]> {
  const hoy = hoyArgentina()
  const limite = sumarDias(hoy, DIAS_DE_ANTICIPO)

  let consultaLotes = supabase
    .from('lotes')
    .select('id, identificador, ciclo_actual, acreedor_id, cuenta_cobro_id, cuenta_cobro_externa_id')
    .eq('estado', 'vendido')

  if (acreedorId) consultaLotes = consultaLotes.eq('acreedor_id', acreedorId)

  const { data: lotes } = await consultaLotes

  if (!lotes || lotes.length === 0) return []

  const lotePorId = new Map(lotes.map((lote) => [lote.id, lote]))

  const cuotas = await enTandas(
    lotes.map((lote) => lote.id),
    async (tanda) => {
      const { data } = await supabase
        .from('cuotas')
        .select('lote_id, numero, ciclo, fecha_vencimiento, cuenta_cobro_id, cuenta_cobro_externa_id')
        .in('lote_id', tanda)
        .gt('saldo_pendiente', 0)
        .lte('fecha_vencimiento', limite)
        .order('numero')
      return data ?? []
    }
  )

  // Solo el ciclo vigente del lote: las cuotas de una venta anterior
  // (rescindida y revendida) no son deuda de nadie hoy.
  const delCicloVigente = cuotas.filter((cuota) => cuota.ciclo === lotePorId.get(cuota.lote_id)?.ciclo_actual)

  if (delCicloVigente.length === 0) return []

  // Un solo viaje por cada tipo de destinatario, en vez de uno por cuota.
  const destinos = delCicloVigente.map((cuota) => ({
    cuota,
    destino: resolverDestinoDeCobro(cuota, lotePorId.get(cuota.lote_id) ?? null),
  }))

  const perfilIds = [
    ...new Set(
      destinos.flatMap(({ cuota, destino }) => {
        if (destino.cuentaExternaId) return []
        // Sin destino explícito cobra el acreedor del lote -- misma cascada
        // que resolverDestinatarioDelPago y que el portal del cliente.
        const perfilId = destino.perfilId ?? lotePorId.get(cuota.lote_id)?.acreedor_id ?? null
        return perfilId ? [perfilId] : []
      })
    ),
  ]

  const cuentaExternaIds = [
    ...new Set(destinos.map(({ destino }) => destino.cuentaExternaId).filter((id): id is string => Boolean(id))),
  ]

  const perfiles = await enTandas(perfilIds, async (tanda) => {
    const { data } = await supabase.from('profiles').select('id, alias, banco, titular').in('id', tanda)
    return data ?? []
  })

  const cuentasExternas = await enTandas(cuentaExternaIds, async (tanda) => {
    const { data } = await supabase.from('cuentas_externas').select('id, alias, banco, titular').in('id', tanda)
    return data ?? []
  })

  const perfilPorId = new Map(perfiles.map((perfil) => [perfil.id, perfil]))
  const cuentaExternaPorId = new Map(cuentasExternas.map((cuenta) => [cuenta.id, cuenta]))

  const problemasPorLote = new Map<
    string,
    { identificador: string; numeros: number[]; primerVencimiento: string; motivo: 'nadie' | 'sin_datos' }
  >()

  for (const { cuota, destino } of destinos) {
    const lote = lotePorId.get(cuota.lote_id)
    if (!lote) continue

    const perfilId = destino.cuentaExternaId ? null : (destino.perfilId ?? lote.acreedor_id ?? null)
    const quienCobra = perfilId
      ? perfilPorId.get(perfilId)
      : destino.cuentaExternaId
        ? cuentaExternaPorId.get(destino.cuentaExternaId)
        : undefined

    if (quienCobra && tieneDatosTransferencia(quienCobra)) continue

    const motivo: 'nadie' | 'sin_datos' = quienCobra ? 'sin_datos' : 'nadie'
    const existente = problemasPorLote.get(lote.id)

    if (existente) {
      existente.numeros.push(cuota.numero)
      if (cuota.fecha_vencimiento < existente.primerVencimiento) {
        existente.primerVencimiento = cuota.fecha_vencimiento
      }
      // "Nadie asignado" manda sobre "le faltan los datos": es el problema
      // más grave de los dos y el que hay que resolver primero.
      if (motivo === 'nadie') existente.motivo = 'nadie'
    } else {
      problemasPorLote.set(lote.id, {
        identificador: lote.identificador,
        numeros: [cuota.numero],
        primerVencimiento: cuota.fecha_vencimiento,
        motivo,
      })
    }
  }

  const ordenados = [...problemasPorLote].sort(
    ([, a], [, b]) => a.primerVencimiento.localeCompare(b.primerVencimiento)
  )

  const notificaciones: Notificacion[] = ordenados
    .slice(0, MAXIMO_POR_TIPO)
    .map(([loteId, problema]) => ({
      id: `sin-donde-pagar-${loteId}`,
      titulo: `${problema.identificador}: no hay a dónde pagar la cuota ${problema.numeros.sort((a, b) => a - b).join(', ')}`,
      detalle:
        problema.motivo === 'nadie'
          ? `Vence el ${formatearFechaCorta(problema.primerVencimiento)} y todavía no elegiste quién la cobra, así que el cliente no ve ningún alias en su portal.`
          : `Vence el ${formatearFechaCorta(problema.primerVencimiento)} y a quien la cobra le faltan alias, banco o titular, así que el cliente no ve dónde transferir.`,
      href: `/admin/lotes/${loteId}/distribucion`,
      urgencia: 'alta',
    }))

  if (ordenados.length > MAXIMO_POR_TIPO) {
    notificaciones.push({
      id: 'sin-donde-pagar-resto',
      titulo: `Y ${ordenados.length - MAXIMO_POR_TIPO} lote(s) más sin a dónde pagar`,
      detalle: 'Revisalos desde el listado de lotes.',
      href: '/admin/lotes',
      urgencia: 'media',
    })
  }

  return notificaciones
}
