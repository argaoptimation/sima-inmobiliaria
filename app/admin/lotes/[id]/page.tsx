import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcularEstadoCobranza } from '@/lib/cobranza/estado-cliente'
import { calcularInteresMoratorio } from '@/lib/cobranza/interes-moratorio'
import { formatearFechaCorta } from '@/lib/fecha/formatear-fecha-corta'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { notFound, redirect } from 'next/navigation'
import { requireAdminAcreedorOCobrador } from '@/lib/auth/require-admin'
import {
  actualizarDatosGenerales,
  eliminarLote,
  subirDocumentoLote,
  eliminarDocumentoLote,
  rescindirLote,
  marcarPrejudicial,
  desmarcarPrejudicial,
  refinanciarLote,
  generarContratoLote,
  saldarLote,
  condonarInteresMoratorio,
} from './actions'
import { cancelarReserva } from '../actions'
import { confirmarPago } from '../../pagos/actions'
import { BotonEliminarLote } from './BotonEliminarLote'
import { BotonCancelarReserva } from '../BotonCancelarReserva'
import { BotonRescindir } from './BotonRescindir'
import { BotonMarcarPrejudicial, BotonDesmarcarPrejudicial } from './BotonPrejudicial'
import { PanelSaldar } from './PanelSaldar'
import { telefonoParaWhatsApp } from '@/lib/telefono/prefijos'
import { mesDeFecha } from '@/lib/lotes/aplicar-indexacion'
import { EVENTO_HISTORIAL_ETIQUETA } from '@/lib/lotes/eventos-historial'
import { listarNumerosDeCuota } from '@/lib/cuotas/listar-numeros'
import { identificadorAutomatico } from '@/lib/lotes/identificador-automatico'
import { CampoArchivoDirecto } from '@/components/CampoArchivoDirecto'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { RefinanciarCuotas } from './RefinanciarCuotas'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import {
  MapPin,
  Pencil,
  CircleDollarSign,
  ShieldCheck,
  FileText,
  CalendarDays,
  Wallet,
  Receipt,
  FolderOpen,
  ChevronDown,
  Trash2,
  Upload,
  FileSignature,
  Landmark,
} from 'lucide-react'
import { COLUMNA_LECTURA,
  ENTRADA,
  BOTON_PRIMARIO,
  BOTON_SECUNDARIO,
  ENLACE,
  CABECERA_LOTE,
  CABECERA_LOTE_ICONO,
  CABECERA_LOTE_TITULO,
  CABECERA_LOTE_SUBTITULO,
  BOTON_CABECERA_AZUL,
  TARJETA_KPI,
  LOTE_KPI_ETIQUETA,
  LOTE_KPI_ICONO,
  LOTE_KPI_VALOR,
  LOTE_KPI_DATO,
  LOTE_KPI_PILL,
  BARRA_FONDO,
  BARRA_RELLENO,
  AVATAR_INICIALES,
  PILL_ESTADO,
  PILL_ESTADO_NEUTRO,
  PILL_COBRANZA,
  GRILLA_DETALLE,
  COLUMNA_PRINCIPAL,
  COLUMNA_LATERAL,
  PANEL,
  PANEL_SIN_PADDING,
  PANEL_HEADER,
  PANEL_HEADER_ICONO,
  PANEL_TITULO,
  TIRA_DESTACADA,
  TIRA_DESTACADA_ICONO,
  TABLA_EMBEBIDA,
  TARJETA_PAGO,
  TARJETA_PAGO_PENDIENTE,
  BOTON_FILA_AZUL,
  TITULO_H2,
  BANNER_ERROR,
  BANNER_OK,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
  ENLACE_TABLA,
  DESPLEGABLE_CABECERA,
  DESPLEGABLE_CABECERA_CONTADOR,
  GRILLA_DATOS_LOTE,
  DATO_LECTURA_ETIQUETA,
  DATO_LECTURA_VALOR,
  CHIP_ARCHIVO,
  CHIP_ARCHIVO_VACIO,
  ETIQUETA_CAMPO,
} from '@/lib/ui/clases'

const MESES_ABREVIADOS = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
]

function formatearPeriodoIndice(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number)
  return `${MESES_ABREVIADOS[mes - 1]} ${anio}`
}

const MOTIVO_PAGO_ETIQUETA: Record<string, string> = {
  cuota: 'Cuota',
  sena: 'Seña',
  entrega: 'Entrega',
  ajuste: 'Corrección',
  saldar: 'Pago total anticipado',
}

export default async function LoteDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    error?: string
    ok?: string
    historialDesde?: string
    historialHasta?: string
  }>
}) {
  const { id } = await params
  const { error, ok, historialDesde, historialHasta } = await searchParams

  await requireAdminAcreedorOCobrador()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: perfilPropio } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const { data: lote } = await supabase
    .from('lotes')
    .select(
      'id, identificador, moneda, estado, cliente_id, admin_id, acreedor_id, vendedor_id, cuenta_cobro_id, cuenta_cobro_externa_id, ubicacion, precio_total, documento_firmado_path, interes_moratorio_diario, indice_tipo, ciclo_actual, loteo_id, numero_lote, manzana, superficie_m2, cuenta_rentas, nomenclatura_catastral, matricula, marcado_prejudicial'
    )
    .eq('id', id)
    .single()

  if (!lote) {
    notFound()
  }

  if (perfilPropio!.role === 'acreedor' && lote!.acreedor_id !== user!.id) {
    redirect('/admin/lotes')
  }

  let documentoFirmadoUrl: string | null = null
  if (lote!.documento_firmado_path) {
    const admin = createAdminClient()
    const { data: documentoSigned } = await admin.storage
      .from('comprobantes')
      .createSignedUrl(lote!.documento_firmado_path, 300)
    documentoFirmadoUrl = documentoSigned?.signedUrl ?? null
  }

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select(
      'id, numero, monto_base, monto_ajustado, saldo_pendiente, fecha_vencimiento, refinanciada, migrada, interes_condonado, interes_condonado_motivo'
    )
    .eq('lote_id', id)
    .eq('ciclo', lote!.ciclo_actual)
    .order('numero', { ascending: true })

  // Historial de pagos del lote -- pedido de Gabriel 25/08 para que se vea
  // acá mismo (sin ir a /admin/pagos) qué se cobró, cuándo y por qué medio
  // (efectivo/transferencia). Todo el historial del lote, no acotado al
  // ciclo vigente (a diferencia de cuotas/ajustes): es justamente un
  // historial, tiene sentido que muestre también lo cobrado en un ciclo
  // anterior si el lote fue rescindido y revendido -- mismo criterio que
  // ya usa "Total cobrado mientras estuvo vendido" más arriba.
  const { data: pagosDelLote } = await supabase
    .from('pagos')
    .select('id, monto, moneda, medio_pago, motivo, estado, created_at, comprobante_path')
    .eq('lote_id', id)
    .order('created_at', { ascending: false })

  // Enlace al comprobante del cliente, para poder mirarlo y confirmar el
  // pago sin salir del lote (05/09, pedido de Nico vía Gabriel: "ver el
  // comprobante de pago del cliente, confirmarlo con un check").
  const pagosConComprobante = await Promise.all(
    (pagosDelLote ?? []).map(async (pago) => {
      if (!pago.comprobante_path) return { ...pago, comprobanteUrl: null }
      const { data } = await createAdminClient()
        .storage.from('comprobantes')
        .createSignedUrl(pago.comprobante_path, 300)
      return { ...pago, comprobanteUrl: data?.signedUrl ?? null }
    })
  )

  // Confirmar un pago pendiente directo desde acá (04/09, pedido de Gabriel:
  // no tener que ir hasta /admin/pagos a buscarlo) -- mismos roles que
  // confirmarPago() ya exige internamente, para no mostrar un botón que en
  // el fondo no hace nada.
  const puedeConfirmarPagoDesdeLote =
    perfilPropio!.role === 'administrador' || perfilPropio!.role === 'acreedor'

  const { data: ajustesIndexacion } = await supabase
    .from('ajustes_indexacion')
    .select('fecha_desde, porcentaje, indice_nombre, indice_periodo, aplicado_por, created_at')
    .eq('lote_id', id)
    .eq('ciclo', lote!.ciclo_actual)
    .order('fecha_desde', { ascending: true })

  const ajustePorMesCuota = new Map((ajustesIndexacion ?? []).map((a) => [a.fecha_desde, a]))

  const aplicadorIndexacionIds = [...new Set((ajustesIndexacion ?? []).map((a) => a.aplicado_por))]
  const { data: aplicadoresIndexacion } =
    aplicadorIndexacionIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', aplicadorIndexacionIds)
      : { data: [] }
  const nombreAplicadorIndexacionPorId = new Map(
    (aplicadoresIndexacion ?? []).map((persona) => [persona.id, persona.full_name])
  )

  const saldoPendienteTotal = (cuotas ?? []).reduce((acum, cuota) => acum + cuota.saldo_pendiente, 0)
  const saldarLoteConId = saldarLote.bind(null, id)

  const hoy = hoyArgentina()
  const estado =
    lote!.estado === 'vendido'
      ? calcularEstadoCobranza(
          (cuotas ?? []).map((cuota) => ({
            saldoPendiente: cuota.saldo_pendiente,
            fechaVencimiento: cuota.fecha_vencimiento,
          })),
          hoy
        )
      : null

  const { data: cliente } = lote!.cliente_id
    ? await supabase
        .from('profiles')
        .select('full_name, dni, email')
        .eq('id', lote!.cliente_id)
        .single()
    : { data: null }

  // Nombres del acreedor y del vendedor para la tarjeta de la cabecera
  // (09/09, mockup 2). Antes esa informacion solo se veia bajando hasta la
  // seccion de Cobro, al final de la pantalla.
  const idsCabecera = [lote!.acreedor_id, lote!.vendedor_id].filter(
    (id): id is string => Boolean(id)
  )
  const { data: personasCabecera } =
    idsCabecera.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', idsCabecera)
      : { data: [] }
  const nombrePersonaCabecera = new Map(
    (personasCabecera ?? []).map((persona) => [persona.id, persona.full_name])
  )
  const acreedorNombre = lote!.acreedor_id
    ? (nombrePersonaCabecera.get(lote!.acreedor_id) ?? null)
    : null
  const vendedorNombre = lote!.vendedor_id
    ? (nombrePersonaCabecera.get(lote!.vendedor_id) ?? null)
    : null

  const { data: reserva } = await supabase
    .from('reservas')
    .select(
      'nombre_completo, dni, domicilio, email, telefono_prefijo, telefono_numero, telefono_alternativo, estado_civil, instrumentacion, monto_sena, moneda_sena, recibido_por, recibido_por_otro, comprobante_sena_path, dni_frente_path, dni_dorso_path, dni_conyuge_path, sentencia_divorcio_path, created_at'
    )
    .eq('lote_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let reservaComprobanteUrl: string | null = null
  let reservaRecibidoPorNombre: string | null = null
  let reservaDniFrenteUrl: string | null = null
  let reservaDniDorsoUrl: string | null = null
  let reservaDniConyugeUrl: string | null = null
  let reservaSentenciaDivorcioUrl: string | null = null

  if (reserva) {
    const admin = createAdminClient()

    const { data: signedUrl } = await admin.storage
      .from('comprobantes')
      .createSignedUrl(reserva.comprobante_sena_path, 300)
    reservaComprobanteUrl = signedUrl?.signedUrl ?? null

    if (reserva.dni_frente_path) {
      const { data: dniFrenteSigned } = await admin.storage
        .from('comprobantes')
        .createSignedUrl(reserva.dni_frente_path, 300)
      reservaDniFrenteUrl = dniFrenteSigned?.signedUrl ?? null
    }

    if (reserva.dni_dorso_path) {
      const { data: dniDorsoSigned } = await admin.storage
        .from('comprobantes')
        .createSignedUrl(reserva.dni_dorso_path, 300)
      reservaDniDorsoUrl = dniDorsoSigned?.signedUrl ?? null
    }

    if (reserva.dni_conyuge_path) {
      const { data: dniConyugeSigned } = await admin.storage
        .from('comprobantes')
        .createSignedUrl(reserva.dni_conyuge_path, 300)
      reservaDniConyugeUrl = dniConyugeSigned?.signedUrl ?? null
    }

    if (reserva.sentencia_divorcio_path) {
      const { data: sentenciaSigned } = await admin.storage
        .from('comprobantes')
        .createSignedUrl(reserva.sentencia_divorcio_path, 300)
      reservaSentenciaDivorcioUrl = sentenciaSigned?.signedUrl ?? null
    }

    if (reserva.recibido_por) {
      const { data: persona } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', reserva.recibido_por)
        .single()
      reservaRecibidoPorNombre = persona?.full_name ?? null
    }
  }

  const { data: documentos } = await supabase
    .from('lote_documentos')
    .select('id, path, descripcion, subido_por, created_at')
    .eq('lote_id', id)
    .order('created_at', { ascending: false })

  const subidoPorIds = [...new Set((documentos ?? []).map((d) => d.subido_por))]
  const { data: subidoPorPersonas } =
    subidoPorIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', subidoPorIds)
      : { data: [] }
  const nombreSubidoPorId = new Map((subidoPorPersonas ?? []).map((persona) => [persona.id, persona.full_name]))

  const adminDocumentos = createAdminClient()
  const documentosConUrl = await Promise.all(
    (documentos ?? []).map(async (documento) => {
      const { data: signedUrl } = await adminDocumentos.storage
        .from('comprobantes')
        .createSignedUrl(documento.path, 300)
      return {
        ...documento,
        url: signedUrl?.signedUrl ?? null,
        nombreSubidoPor: nombreSubidoPorId.get(documento.subido_por) ?? '—',
      }
    })
  )

  // Separa los contratos generados (identificados por la descripción fija
  // que les pone generarContratoLote) del resto de "Documentos" -- 04/09,
  // para que tengan su propia sección en vez de mezclarse con planos/fotos.
  const contratosGenerados = documentosConUrl.filter((d) => d.descripcion.startsWith('Contrato generado'))
  const documentosSinContrato = documentosConUrl.filter((d) => !d.descripcion.startsWith('Contrato generado'))

  // Historial de rescisiones + cuánto se cobró mientras estuvo vendido.
  // Desde el 06/09 rescindir deja el lote directamente disponible, así que
  // "rescindido" ya no es un estado en el que se lo pueda encontrar: es un
  // evento del historial y nada más.
  const { data: historialEstados } = await supabase
    .from('lote_historial_estados')
    .select('evento, estado_anterior, estado_nuevo, cambiado_por, detalle, created_at')
    .eq('lote_id', id)
    .order('created_at', { ascending: true })

  const cambiadorIds = [...new Set((historialEstados ?? []).map((h) => h.cambiado_por))]
  const { data: cambiadores } =
    cambiadorIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', cambiadorIds)
      : { data: [] }
  const nombreCambiadorPorId = new Map((cambiadores ?? []).map((persona) => [persona.id, persona.full_name]))

  // "Total cobrado mientras estuvo vendido" solo tiene sentido si el lote
  // ya pasó por un ciclo de rescisión -- no para cualquier fila de
  // historial (ahora también hay filas de "creado"/"reservado"/etc. que no
  // implican nada que rescindir).
  const pasoPorRescindido = (historialEstados ?? []).some((h) => h.evento === 'rescindido')

  // Filtro desde/hasta del historial de ESTE lote (26/08, pedido de
  // Gabriel: si el día de mañana un lote tiene muchos movimientos, el
  // desplegable quedaría eterno sin poder acotarlo). El total cobrado de
  // arriba sigue calculándose sobre el historial COMPLETO, sin filtrar --
  // el filtro solo acota qué se lista.
  const historialFiltrado = (historialEstados ?? []).filter((cambio) => {
    if (historialDesde && cambio.created_at < historialDesde) return false
    if (historialHasta && cambio.created_at > `${historialHasta}T23:59:59`) return false
    return true
  })
  const hayFiltroHistorial = Boolean(historialDesde || historialHasta)

  let totalCobradoHistorico: number | null = null
  if (pasoPorRescindido) {
    // pagos.lote_id ya identifica directo a qué lote pertenece cada pago
    // (desde que un cliente puede tener varios lotes) -- sumamos lo
    // REALMENTE imputado (no pagos.monto) para que una corrección de monto
    // ya aplicada quede reflejada bien.
    const { data: pagosConfirmados } = await supabase
      .from('pagos')
      .select('id, monto, motivo')
      .eq('lote_id', id)
      .eq('estado', 'confirmado')

    const pagoIdsConfirmados = (pagosConfirmados ?? []).map((p) => p.id)

    const { data: imputaciones } =
      pagoIdsConfirmados.length > 0
        ? await supabase
            .from('pago_imputaciones')
            .select('pago_id, monto_imputado')
            .in('pago_id', pagoIdsConfirmados)
        : { data: [] }

    // La seña y la entrega son plata realmente cobrada pero, desde el
    // 05/09, ya vienen descontadas del total a financiar y por eso no
    // tienen filas en pago_imputaciones. Si solo sumáramos imputaciones,
    // el "total cobrado" de un lote rescindido las dejaría afuera.
    const pagoIdsConImputacion = new Set((imputaciones ?? []).map((i) => i.pago_id))
    const cobradoSinImputar = (pagosConfirmados ?? [])
      .filter((p) => !pagoIdsConImputacion.has(p.id) && (p.motivo === 'sena' || p.motivo === 'entrega'))
      .reduce((acumulado, p) => acumulado + p.monto, 0)

    totalCobradoHistorico =
      (imputaciones ?? []).reduce((acumulado, i) => acumulado + i.monto_imputado, 0) +
      cobradoSinImputar
  }

  // Destinos: a quién se le distribuyó cada cuota de este lote, según la
  // distribución ya configurada por cuota (cuota_distribuciones) -- pedido
  // de Gabriel para poder ver esto directo en el lote rescindido, sin
  // tener que ir a la pantalla aparte de "Ver / editar distribución".
  //
  // Se toma el ÚLTIMO ciclo que tenga cuotas, no el ciclo vigente a secas
  // (08/09). Rescindir suma 1 al ciclo y deja el nuevo sin cuotas, así que
  // acotarlo al vigente dejaba la sección vacía justo en el lote rescindido,
  // que es el caso para el que se pidió. Sigue sin mezclar ciclos: si el
  // lote se revendió, el ciclo nuevo ya tiene sus cuotas y manda ese. Mismo
  // criterio que "Total cobrado mientras estuvo vendido", que también sigue
  // mostrando lo del ciclo anterior.
  let cuotaIdsParaDestinos = (cuotas ?? []).map((cuota) => cuota.id)

  if (cuotaIdsParaDestinos.length === 0) {
    const { data: ultimaCuota } = await supabase
      .from('cuotas')
      .select('ciclo')
      .eq('lote_id', id)
      .order('ciclo', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (ultimaCuota) {
      const { data: cuotasDelUltimoCiclo } = await supabase
        .from('cuotas')
        .select('id')
        .eq('lote_id', id)
        .eq('ciclo', ultimaCuota.ciclo)

      cuotaIdsParaDestinos = (cuotasDelUltimoCiclo ?? []).map((cuota) => cuota.id)
    }
  }

  const { data: distribucionesDelLote } =
    cuotaIdsParaDestinos.length > 0
      ? await supabase
          .from('cuota_distribuciones')
          .select('profile_id, cuenta_externa_id, monto')
          .in('cuota_id', cuotaIdsParaDestinos)
      : { data: [] }

  const destinoPorClave = new Map<string, { nombre: string; monto: number }>()
  if ((distribucionesDelLote ?? []).length > 0) {
    const profileIds = [
      ...new Set((distribucionesDelLote ?? []).map((d) => d.profile_id).filter(Boolean) as string[]),
    ]
    const cuentaExternaIds = [
      ...new Set((distribucionesDelLote ?? []).map((d) => d.cuenta_externa_id).filter(Boolean) as string[]),
    ]

    const { data: profilesDestino } =
      profileIds.length > 0
        ? await supabase.from('profiles').select('id, full_name').in('id', profileIds)
        : { data: [] }
    const { data: cuentasExternasDestino } =
      cuentaExternaIds.length > 0
        ? await supabase.from('cuentas_externas').select('id, titular').in('id', cuentaExternaIds)
        : { data: [] }

    const nombreProfilePorId = new Map((profilesDestino ?? []).map((p) => [p.id, p.full_name]))
    const nombreCuentaExternaPorId = new Map((cuentasExternasDestino ?? []).map((c) => [c.id, c.titular]))

    for (const fila of distribucionesDelLote ?? []) {
      const clave = fila.profile_id ?? `externa:${fila.cuenta_externa_id}`
      const nombre = fila.profile_id
        ? (nombreProfilePorId.get(fila.profile_id) ?? '—')
        : `${nombreCuentaExternaPorId.get(fila.cuenta_externa_id!) ?? '—'} (cuenta externa)`
      const existente = destinoPorClave.get(clave)
      destinoPorClave.set(clave, { nombre, monto: (existente?.monto ?? 0) + fila.monto })
    }
  }

  const destinosOrdenados = [...destinoPorClave.values()].sort((a, b) => b.monto - a.monto)

  // "Mza 5 - Lote 12": el nombre catastral con el que Nico ubica cada
  // lote. Es lo mismo de lo que sale el `identificador`, ver
  // lib/lotes/identificador-automatico.ts.
  const nombreDerivado = identificadorAutomatico(lote!.manzana, lote!.numero_lote)
  const elNombreYaDiceManzanaYLote = nombreDerivado === lote!.identificador

  const ubicacionCatastral = elNombreYaDiceManzanaYLote
    ? ''
    : [
        lote!.manzana ? `Manzana ${lote!.manzana}` : null,
        lote!.numero_lote ? `Lote ${lote!.numero_lote}` : null,
      ]
        .filter(Boolean)
        .join(' · ')

  const actualizarDatosGeneralesConId = actualizarDatosGenerales.bind(null, id)

  const { data: indicesDisponibles } =
    lote!.moneda === 'ARS'
      ? await supabase.from('indices_valores').select('nombre')
      : { data: [] }
  const nombresIndicesDisponibles = [...new Set((indicesDisponibles ?? []).map((v) => v.nombre))].sort()
  const eliminarLoteConId = eliminarLote.bind(null, id)
  const cancelarReservaConId = cancelarReserva.bind(null, id)
  const subirDocumentoConId = subirDocumentoLote.bind(null, id)
  const rescindirConId = rescindirLote.bind(null, id)
  const marcarPrejudicialConId = marcarPrejudicial.bind(null, id, undefined)
  const desmarcarPrejudicialConId = desmarcarPrejudicial.bind(null, id)
  const refinanciarConId = refinanciarLote.bind(null, id)
  const condonarInteresConId = condonarInteresMoratorio.bind(null, id)
  const generarContratoConId = generarContratoLote.bind(null, id)

  const cuotasRefinanciables = (cuotas ?? []).filter((cuota) => cuota.saldo_pendiente > 0)

  // Cuotas a las que tiene sentido condonarles el interés: las que deben
  // algo y hoy están generando mora. Las ya condonadas van aparte, para
  // poder volver atrás (es una palanca de negociación, no algo definitivo).
  const cuotasConMoraViva = (cuotas ?? []).filter(
    (cuota) =>
      !cuota.interes_condonado &&
      cuota.saldo_pendiente > 0 &&
      cuota.fecha_vencimiento < hoy
  )
  const cuotasConInteresCondonado = (cuotas ?? []).filter(
    (cuota) => cuota.interes_condonado && cuota.saldo_pendiente > 0
  )
  const totalDeudaRefinanciable =
    Math.round(cuotasRefinanciables.reduce((acumulado, cuota) => acumulado + cuota.saldo_pendiente, 0) * 100) / 100

  // Loteos para poder reasignar el lote desde acá (08/09, pedido de
  // Gabriel). Un lote cargado sin loteo -- típico de los que se dan de alta
  // ya vendidos, o de los que se importaron sueltos -- no tiene plantilla
  // de contrato, así que el boleto de compraventa no se puede generar y no
  // había forma de arreglarlo sin volver a crear el lote.
  const { data: loteosDisponibles } = await supabase
    .from('loteos')
    .select('id, nombre, plantilla_contrato_path')
    .order('nombre')

  // Para "Generar contrato": hace falta saber si el loteo de este lote ya
  // tiene una plantilla cargada, para mostrar el botón habilitado o el
  // aviso de "cargá una plantilla primero" en vez de dejar que falle recién
  // al hacer clic.
  // Datos derivados de la cabecera (mockup 2). Todos salen de cosas que la
  // pantalla ya tenia; lo unico nuevo es juntarlas arriba en vez de
  // obligar a recorrer la tabla para sacar la cuenta a ojo.
  const cuotasDelCiclo = cuotas ?? []
  const cuotasPagadas = cuotasDelCiclo.filter((cuota) => cuota.saldo_pendiente <= 0).length
  const proximaCuota = cuotasDelCiclo.find((cuota) => cuota.saldo_pendiente > 0) ?? null
  const cuotasQueRestan = cuotasDelCiclo.length - cuotasPagadas
  // Cuanto del plan ya entro. Sale de las cuotas (lo pactado menos lo que
  // sigue debiendo), NO de totalCobradoHistorico: ese numero solo se calcula
  // para lotes que pasaron por una rescision, asi que en un lote normal es
  // null y la tarjeta terminaba diciendo "sin precio pactado cargado" con el
  // precio a la vista.
  //
  // Se mide contra la suma de las cuotas y no contra el precio del lote
  // porque son dos cosas distintas: el precio puede incluir una entrega o
  // una sena que nunca fueron cuota. Comparar el plan contra si mismo es lo
  // unico que da un porcentaje que cierra.
  const totalDelPlan =
    Math.round(
      cuotasDelCiclo.reduce((acum, cuota) => acum + (cuota.monto_ajustado || cuota.monto_base), 0) * 100
    ) / 100
  const cobradoDelPlan = Math.round((totalDelPlan - saldoPendienteTotal) * 100) / 100
  const porcentajeCobrado =
    totalDelPlan > 0 ? Math.min(100, Math.max(0, Math.round((cobradoDelPlan / totalDelPlan) * 100))) : null
  const inicialesCliente = (cliente?.full_name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte: string) => parte[0]?.toUpperCase() ?? '')
    .join('')

  const loteoDelLote =
    (loteosDisponibles ?? []).find((loteo) => loteo.id === lote!.loteo_id) ?? null

  return (
    <main className="w-full">
      {/* Las secciones de formularios y fichas siguen acotadas a un ancho
          cómodo de lectura -- un input de 1800px no le sirve a nadie. Lo
          que se despliega a todo el ancho es lo que son tablas: cuotas,
          historial de pagos, índice y contratos. */}
      {/* Cabecera y tarjetas a TODO el ancho: son de un vistazo, no de
          lectura. El ancho comodo de lectura arranca despues, en las
          fichas y los formularios. */}
      <div className="mb-6 flex flex-col gap-6">
        <EnlaceBoton href="/admin/lotes" className={`inline-flex w-fit items-center gap-1.5 ${ENLACE}`}>
          ← Volver a Lotes
        </EnlaceBoton>

        <div className={CABECERA_LOTE}>
          <div className="flex min-w-0 items-center gap-4">
            <span className={CABECERA_LOTE_ICONO}>
              <MapPin className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className={CABECERA_LOTE_TITULO}>{lote!.identificador}</h1>
                <span
                  data-testid="estado-lote"
                  className={PILL_ESTADO[lote!.estado] ?? PILL_ESTADO_NEUTRO}
                >
                  {lote!.estado}
                </span>
                {estado && (
                  <span
                    data-testid="estado-cobranza"
                    className={
                      lote!.marcado_prejudicial
                        ? PILL_COBRANZA.prejudicial
                        : estado === 'normal'
                          ? PILL_COBRANZA.alDia
                          : estado === 'atrasado'
                            ? PILL_COBRANZA.atrasado
                            : estado === 'moroso'
                              ? PILL_COBRANZA.moroso
                              : PILL_COBRANZA.prejudicial
                    }
                  >
                    {lote!.marcado_prejudicial
                      ? 'Prejudicial'
                      : estado === 'normal'
                        ? 'Al día'
                        : estado === 'atrasado'
                          ? 'Atrasado'
                          : estado === 'moroso'
                            ? 'Moroso'
                            : 'Posible prejudicial'}
                  </span>
                )}
              </div>
              {/* La moneda salio de aca (09/09): ya se ve en la pill de la
                  tarjeta de precio y en la de saldo, dos veces mas abajo.
                  En su lugar, la manzana y el lote -- que es como los
                  nombra Nico y hasta ahora no se veian en el detalle. */}
              <p className={CABECERA_LOTE_SUBTITULO}>
                {ubicacionCatastral && <span>{ubicacionCatastral}</span>}
                {ubicacionCatastral && lote!.ubicacion && (
                  <span className="text-slate-300">·</span>
                )}
                {lote!.ubicacion && <span>{lote!.ubicacion}</span>}
                {cuotasDelCiclo.length > 0 && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span>Plan de {cuotasDelCiclo.length} cuotas</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Documentacion del lote como desplegable en la cabecera
                (09/09, mockup 2): estaba al fondo de la pagina, despues de
                todos los formularios, y es de las cosas que mas se abren.
                Es un <details> nativo: se abre sin JavaScript y no arrastra
                estado. */}
            <details className="relative">
              <summary className={DESPLEGABLE_CABECERA}>
                <FolderOpen className="h-[15px] w-[15px]" />
                Documentación del lote
                {documentosSinContrato.length > 0 && (
                  <span className={DESPLEGABLE_CABECERA_CONTADOR}>
                    {documentosSinContrato.length}
                  </span>
                )}
                <ChevronDown className="h-[15px] w-[15px]" />
              </summary>

              {/* Se abre hacia la DERECHA (`left-0`) y no hacia la izquierda
                  (10/09, lo vio Gabriel): el boton vive pegado al borde
                  izquierdo del contenido, asi que un panel de 26rem anclado
                  a la derecha arrancaba 181px DETRAS del menu lateral y se
                  cortaba. Medido a 1440, 1180, 1000 y 820 de ancho: se
                  cortaba en los cuatro. Hacia la derecha entra entero,
                  porque de ese lado el contenido llega hasta el borde. */}
              <div className="absolute top-full left-0 z-20 mt-2 w-[min(26rem,calc(100vw-3rem))] space-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xl shadow-slate-900/10">
                {documentosSinContrato.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Todavía no se subió ningún documento a este lote.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {documentosSinContrato.map((documento) => {
                      const eliminarDocumentoConId = eliminarDocumentoLote.bind(null, documento.id, id)
                      return (
                        <li
                          key={documento.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2"
                        >
                          <div className="min-w-0">
                            {documento.url ? (
                              <a
                                href={documento.url}
                                target="_blank"
                                className="block truncate text-sm font-semibold text-blue-700 underline-offset-4 hover:underline"
                              >
                                {documento.descripcion}
                              </a>
                            ) : (
                              <span className="block truncate text-sm text-slate-600">
                                {documento.descripcion} (link no disponible)
                              </span>
                            )}
                            <span className="text-[11px] text-slate-500">
                              Subido por {documento.nombreSubidoPor}
                            </span>
                          </div>
                          {perfilPropio!.role !== 'cobrador' && (
                            <form action={eliminarDocumentoConId}>
                              <BotonEnvio
                                className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                aria-label={`Eliminar ${documento.descripcion}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </BotonEnvio>
                            </form>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}

                {perfilPropio!.role !== 'cobrador' && (
                  <form
                    action={subirDocumentoConId}
                    className="space-y-2 border-t border-slate-100 pt-3"
                  >
                    <label className="block text-sm">
                      <span className={ETIQUETA_CAMPO}>Descripción</span>
                      <input
                        name="descripcion"
                        placeholder="Ej: Plano del lote"
                        required
                        className={`${ENTRADA} w-full`}
                      />
                    </label>
                    <CampoArchivoDirecto
                      name="archivo"
                      bucket="comprobantes"
                      carpeta={`lotes/${id}`}
                      tipoArchivo="documento"
                      label="Archivo"
                      accept="*/*"
                      required
                    />
                    <BotonEnvio className={`w-full cursor-pointer justify-center ${BOTON_PRIMARIO}`}>
                      <Upload className="h-[15px] w-[15px]" />
                      Subir documento
                    </BotonEnvio>
                  </form>
                )}
              </div>
            </details>

            {perfilPropio!.role === 'administrador' && lote!.estado === 'reservado' && (
              <>
                <EnlaceBoton
                  href={`/admin/lotes/${id}/reservar/editar`}
                  className={BOTON_CABECERA_AZUL}
                >
                  <Pencil className="h-[15px] w-[15px]" />
                  Editar reserva
                </EnlaceBoton>
                <BotonCancelarReserva cancelarReservaAction={cancelarReservaConId} />
              </>
            )}
            {perfilPropio!.role === 'administrador' && lote!.estado === 'vendido' && (
              <>
                {lote!.marcado_prejudicial ? (
                  <BotonDesmarcarPrejudicial desmarcarPrejudicialAction={desmarcarPrejudicialConId} />
                ) : (
                  <BotonMarcarPrejudicial marcarPrejudicialAction={marcarPrejudicialConId} />
                )}
                <BotonRescindir rescindirAction={rescindirConId} />
              </>
            )}
            {perfilPropio!.role === 'administrador' && (
              <BotonEliminarLote eliminarLoteAction={eliminarLoteConId} />
            )}
          </div>
        </div>

        {error && <p className={BANNER_ERROR}>{error}</p>}
        {ok && <p className={BANNER_OK}>{ok}</p>}

        {/* Las cuatro tarjetas: precio, comprador, saldo y quien cobra.
            Contestan las cuatro preguntas que uno se hace al abrir un lote,
            sin tener que recorrer la pantalla entera. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className={TARJETA_KPI}>
            <div className="flex items-center justify-between gap-2">
              <span className={LOTE_KPI_ETIQUETA}>Precio total pactado</span>
              <span className={LOTE_KPI_ICONO}>
                <CircleDollarSign className="h-4 w-4" />
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={LOTE_KPI_VALOR}>
                {lote!.precio_total ? lote!.precio_total.toLocaleString('es-AR') : '—'}
              </span>
              <span className={LOTE_KPI_PILL}>{lote!.moneda}</span>
            </div>
            {porcentajeCobrado !== null ? (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span className="tabular-nums">
                    Cobrado {cobradoDelPlan.toLocaleString('es-AR')} de{' '}
                    {totalDelPlan.toLocaleString('es-AR')}
                  </span>
                  <span className="font-bold text-blue-700 tabular-nums">{porcentajeCobrado}%</span>
                </div>
                <div className={BARRA_FONDO}>
                  <div className={BARRA_RELLENO} style={{ width: `${porcentajeCobrado}%` }} />
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">Todavía no hay cuotas cargadas.</p>
            )}
          </div>

          <div className={TARJETA_KPI}>
            <div className="flex items-center justify-between gap-2">
              <span className={LOTE_KPI_ETIQUETA}>Cliente</span>
              {cliente && lote!.cliente_id && (
                <EnlaceBoton
                  href={`/admin/clientes/${lote!.cliente_id}`}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800"
                >
                  Ficha →
                </EnlaceBoton>
              )}
            </div>
            {cliente ? (
              <div className="flex min-w-0 items-center gap-3">
                <span className={AVATAR_INICIALES}>{inicialesCliente || '—'}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{cliente.full_name}</p>
                  {cliente.dni && (
                    <p className={`${LOTE_KPI_DATO} tabular-nums`}>DNI {cliente.dni}</p>
                  )}
                </div>
              </div>
            ) : (
              <p className={LOTE_KPI_DATO}>Todavía no hay cliente asignado.</p>
            )}
            {cliente?.email && (
              <p className="truncate text-[12px] text-slate-500" title={cliente.email}>
                {cliente.email}
              </p>
            )}
          </div>

          <div className={TARJETA_KPI}>
            <div className="flex items-center justify-between gap-2">
              <span className={LOTE_KPI_ETIQUETA}>Saldo pendiente</span>
              {cuotasDelCiclo.length > 0 && (
                <span className="rounded-full border border-emerald-200/60 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 tabular-nums">
                  {cuotasPagadas} / {cuotasDelCiclo.length} pagadas
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span className={LOTE_KPI_VALOR}>
                {saldoPendienteTotal.toLocaleString('es-AR')}
              </span>
              <span className={LOTE_KPI_PILL}>{lote!.moneda}</span>
            </div>
            <div className="space-y-0.5">
              {proximaCuota && (
                <p className={LOTE_KPI_DATO}>
                  Próx. vencimiento:{' '}
                  <span className="font-semibold tabular-nums">
                    {formatearFechaCorta(proximaCuota.fecha_vencimiento)}
                  </span>
                </p>
              )}
              {cuotasQueRestan > 0 && (
                <p className="text-[11px] text-slate-500">
                  {cuotasQueRestan} {cuotasQueRestan === 1 ? 'cuota' : 'cuotas'} por cobrar
                </p>
              )}
            </div>
          </div>

          <div className={TARJETA_KPI}>
            <div className="flex items-center justify-between gap-2">
              <span className={LOTE_KPI_ETIQUETA}>Acreedor</span>
              <span className={LOTE_KPI_ICONO}>
                <ShieldCheck className="h-4 w-4" />
              </span>
            </div>
            <div className="space-y-0.5">
              <p className="truncate text-sm font-bold text-slate-900">
                {acreedorNombre ?? 'Sin asignar'}
              </p>
              <p className={LOTE_KPI_DATO}>
                Vendedor: <span className="font-semibold">{vendedorNombre ?? '—'}</span>
              </p>
            </div>
            {lote!.estado === 'vendido' &&
              (documentoFirmadoUrl ? (
                <a
                  href={documentoFirmadoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={BOTON_CABECERA_AZUL}
                >
                  <FileText className="h-[15px] w-[15px]" />
                  Ver documento firmado
                </a>
              ) : (
                <p className="text-[11px] text-slate-500">Documento firmado no disponible</p>
              ))}
          </div>
        </div>
      </div>

      {/* Destinos = reparto entre acreedor/vendedor/participantes -- Nicolás
          confirmó 25/08 que el cobrador puede ver todo lo de si el cliente
          pagó o no, pero NO el reparto entre acreedores. */}
      {destinosOrdenados.length > 0 && perfilPropio!.role !== 'cobrador' && (
        <div className={`mb-6 text-sm ${PANEL}`}>
          <h2 className={`mb-2 ${PANEL_TITULO}`}>Destinos (a quién se distribuyó)</h2>
          {/* Mismo texto que el link de abajo de la tabla de cuotas (08/09,
              pedido de Gabriel): son dos puertas a la MISMA pantalla y
              llamarlas distinto hacía pensar que eran dos cosas. */}
          <p className="mb-2 text-slate-600">
            Según la distribución configurada por cuota (
            <EnlaceBoton href={`/admin/lotes/${id}/distribucion`} className={ENLACE}>
              cobro y distribución de cuotas →
            </EnlaceBoton>
            ).
          </p>
          <ul className="list-inside list-disc">
            {destinosOrdenados.map((destino, i) => (
              <li key={i}>
                {destino.nombre} — {destino.monto} {lote!.moneda}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* La ficha de la reserva (09/09): eran quince <p> sueltos, sin panel,
          justo entre la cabecera nueva y la tabla de cuotas nueva. Mismos
          datos, en grilla, y los adjuntos como chips en vez de una lista de
          links con "no disponible" repetido cinco veces. */}
      {reserva && (
        <div className={`mb-6 ${PANEL_SIN_PADDING}`}>
          <div className={PANEL_HEADER}>
            <div className="flex items-center gap-3">
              <span className={PANEL_HEADER_ICONO}>
                <FileSignature className="h-5 w-5" />
              </span>
              <div>
                <h2 className={PANEL_TITULO}>Reserva</h2>
                <p className="text-xs text-slate-500">
                  Los datos con los que se firmó. Al vender, el comprador final puede ser otro.
                </p>
              </div>
            </div>
            <span className="rounded-xl border border-emerald-200/60 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700 tabular-nums">
              Seña {reserva.monto_sena} {reserva.moneda_sena}
            </span>
          </div>

          <div className="space-y-4 p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className={DATO_LECTURA_ETIQUETA}>Comprador</p>
                <p className={DATO_LECTURA_VALOR}>{reserva.nombre_completo}</p>
              </div>
              <div>
                <p className={DATO_LECTURA_ETIQUETA}>DNI</p>
                <p className={`${DATO_LECTURA_VALOR} tabular-nums`}>{reserva.dni}</p>
              </div>
              <div>
                <p className={DATO_LECTURA_ETIQUETA}>Estado civil</p>
                <p className={DATO_LECTURA_VALOR}>{reserva.estado_civil}</p>
              </div>
              <div>
                <p className={DATO_LECTURA_ETIQUETA}>Recibida por</p>
                <p className={DATO_LECTURA_VALOR}>
                  {reservaRecibidoPorNombre ?? reserva.recibido_por_otro ?? '—'}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className={DATO_LECTURA_ETIQUETA}>Domicilio</p>
                <p className={DATO_LECTURA_VALOR}>{reserva.domicilio}</p>
              </div>
              <div className="sm:col-span-2">
                <p className={DATO_LECTURA_ETIQUETA}>Contacto</p>
                <p className={DATO_LECTURA_VALOR}>
                  {reserva.email} · +
                  {telefonoParaWhatsApp(reserva.telefono_prefijo, reserva.telefono_numero)}
                  {reserva.telefono_alternativo && ` · ${reserva.telefono_alternativo}`}
                </p>
              </div>
              {reserva.instrumentacion && (
                <div>
                  <p className={DATO_LECTURA_ETIQUETA}>Instrumentación prevista</p>
                  <p className={DATO_LECTURA_VALOR}>{reserva.instrumentacion}</p>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3">
              <p className={`mb-2 ${DATO_LECTURA_ETIQUETA}`}>Adjuntos de la reserva</p>
              <div className="flex flex-wrap gap-2">
                <ChipDeArchivo url={reservaComprobanteUrl} nombre="Comprobante de la seña" />
                <ChipDeArchivo url={reservaDniFrenteUrl} nombre="DNI (frente)" />
                <ChipDeArchivo url={reservaDniDorsoUrl} nombre="DNI (dorso)" />
                {reserva.dni_conyuge_path && (
                  <ChipDeArchivo url={reservaDniConyugeUrl} nombre="DNI del cónyuge" />
                )}
                {reserva.sentencia_divorcio_path && (
                  <ChipDeArchivo
                    url={reservaSentenciaDivorcioUrl}
                    nombre="Sentencia de divorcio"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* El link al documento firmado se mudo a la tarjeta de Acreedor de la
          cabecera (09/09): estaba suelto en el medio de la pantalla y ahora
          vive al lado de quien firmo. */}

      {/* Cuotas a la izquierda, historial de pagos a la derecha (05/09,
          pedido de Nico vía Gabriel): antes había que scrollear hasta
          abajo de la tabla de cuotas para ver qué se cobró, y desde ahí
          volver a subir. En pantallas angostas siguen uno debajo del
          otro.

          Medido, no estimado: la tabla de cuotas necesita 617px para no
          cortar ninguna columna y la de pagos 515px. Al historial se le da
          un ancho fijo cómodo (34rem = 544px) y las cuotas se quedan con
          todo el resto, que siempre es más de lo que necesitan. Y el
          reparto arranca recién en 2xl: abajo de eso no entran las dos sin
          que alguna quede con scroll horizontal, así que van una debajo de
          la otra usando el ancho completo. */}
      {/* Cuotas a la izquierda, pagos a la derecha (05/09, pedido de Nico
          vía Gabriel): antes había que scrollear hasta abajo de la tabla de
          cuotas para ver qué se cobró, y desde ahí volver a subir. En
          pantallas angostas siguen uno debajo del otro.

          09/09: pasa a la grilla de 12 columnas del mockup 2 (7-8 para las
          cuotas, 4-5 para los pagos) y arranca en lg. Antes eran dos anchos
          fijos y el reparto no empezaba hasta 2xl, porque la tabla de pagos
          necesitaba 515px de ancho; ahora los pagos son tarjetas apiladas y
          entran cómodas en una columna angosta. */}
      <div className={GRILLA_DETALLE}>
        <div className={COLUMNA_PRINCIPAL}>
      <div className={PANEL_SIN_PADDING}>
      <div className={PANEL_HEADER}>
        <div className="flex items-center gap-3">
          <span className={PANEL_HEADER_ICONO}>
            <CalendarDays className="h-5 w-5" />
          </span>
          <h2 className={PANEL_TITULO}>Cuotas</h2>
        </div>
        {/* El link va para cualquier estado, no solo 'vendido': desde el
            06/09 esa pantalla también tiene la sección de cobro (quién es el
            admin, el acreedor, el vendedor y qué cuenta cobra), que hace falta
            poder editar en un lote reservado o disponible -- si no, quedaba sin
            ninguna puerta de entrada desde la UI. El texto cambia según haya o
            no cuotas que repartir. */}
        {perfilPropio!.role === 'administrador' && (
          <EnlaceBoton href={`/admin/lotes/${id}/distribucion`} className={BOTON_CABECERA_AZUL}>
            {lote!.estado === 'vendido'
              ? 'Cobro y distribución de cuotas →'
              : 'Cobro: quiénes participan de este lote →'}
          </EnlaceBoton>
        )}
      </div>
      <div className="space-y-4 p-5">
      {perfilPropio!.role === 'administrador' && lote!.estado === 'vendido' && saldoPendienteTotal > 0 && (
        <div className={TIRA_DESTACADA}>
          <div className="flex items-center gap-3">
            <span className={TIRA_DESTACADA_ICONO}>
              <Wallet className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-900">Saldar lote</p>
              <p className="text-xs text-slate-600">
                Monto a liquidar:{' '}
                <span className="font-bold text-blue-800 tabular-nums">
                  {saldoPendienteTotal.toLocaleString('es-AR')} {lote!.moneda}
                </span>
              </p>
            </div>
          </div>
          <PanelSaldar
            saldarAction={saldarLoteConId}
            saldoPendienteTotal={saldoPendienteTotal}
            moneda={lote!.moneda}
          />
        </div>
      )}
      {lote!.estado !== 'vendido' && (
        <p className="rounded-xl border border-amber-200/70 bg-amber-50/60 p-3 text-sm text-amber-800">
          Este lote todavía no está vendido — la tabla de abajo es la estructura de cuotas
          planificada, no una deuda real. Todavía no hay ningún cliente que la deba, así que
          ninguna cuota puede estar &quot;vencida&quot; hasta que el lote pase a vendido.
        </p>
      )}
      <div data-testid="tabla-cuotas" className={TABLA_EMBEBIDA}>
      <table className="w-full text-sm">
        <thead>
          <tr className={TABLA_HEADER_FILA}>
            <th className={TABLA_HEADER_CELDA}>Cuota</th>
            <th className={TABLA_HEADER_CELDA}>Vencimiento</th>
            <th className={TABLA_HEADER_CELDA}>Monto base</th>
            <th className={TABLA_HEADER_CELDA}>Ajuste por índice</th>
            <th className={TABLA_HEADER_CELDA}>Saldo pendiente</th>
            <th className={TABLA_HEADER_CELDA}>Interés moratorio</th>
            <th className={TABLA_HEADER_CELDA}></th>
          </tr>
        </thead>
        <tbody>
          {cuotas?.map((cuota) => {
            const vencida =
              lote!.estado === 'vendido' && cuota.saldo_pendiente > 0 && cuota.fecha_vencimiento < hoy
            const interesMoratorio = vencida
              ? calcularInteresMoratorio(
                  {
                    saldoPendiente: cuota.saldo_pendiente,
                    fechaVencimiento: cuota.fecha_vencimiento,
                    interesCondonado: cuota.interes_condonado,
                  },
                  lote!.interes_moratorio_diario,
                  hoy
                )
              : 0
            const ajusteDeEstaCuota = ajustePorMesCuota.get(mesDeFecha(cuota.fecha_vencimiento))
            return (
              <tr key={cuota.id} className={TABLA_FILA}>
                <td className={TABLA_CELDA}>{cuota.numero}</td>
                <td className={TABLA_CELDA}>{formatearFechaCorta(cuota.fecha_vencimiento)}</td>
                <td className={TABLA_CELDA}>
                  {cuota.monto_base} {lote!.moneda}
                </td>
                <td className={TABLA_CELDA}>
                  {ajusteDeEstaCuota ? (
                    <span className="text-blue-700">
                      {ajusteDeEstaCuota.indice_nombre ?? '—'} {ajusteDeEstaCuota.porcentaje}%
                      {ajusteDeEstaCuota.indice_periodo && (
                        <span className="text-slate-500">
                          {' '}
                          (índice {formatearPeriodoIndice(ajusteDeEstaCuota.indice_periodo)})
                        </span>
                      )}
                      <br />
                      <span className="text-slate-600">→ {cuota.monto_ajustado} {lote!.moneda}</span>
                    </span>
                  ) : cuota.monto_ajustado !== cuota.monto_base ? (
                    <span className="text-slate-500">→ {cuota.monto_ajustado} {lote!.moneda}</span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className={TABLA_CELDA}>
                  {cuota.refinanciada ? (
                    <span className="italic text-slate-500">Refinanció</span>
                  ) : cuota.migrada ? (
                    /* Cobrada antes de usar la plataforma: no hay pago ni
                       reparto detras, y el monto es el de hoy. Decirlo acá
                       evita que se lea como una cobranza del sistema que
                       "no aparece" en el historial de pagos. */
                    <span className="italic text-slate-500">Pagada antes del sistema</span>
                  ) : (
                    <>
                      {cuota.saldo_pendiente} {lote!.moneda}
                    </>
                  )}
                </td>
                <td className={TABLA_CELDA}>
                  {cuota.interes_condonado ? (
                    <span
                      className="italic text-emerald-700"
                      title={cuota.interes_condonado_motivo ?? undefined}
                    >
                      Condonado
                    </span>
                  ) : (
                    interesMoratorio > 0 && (
                      <span className="text-red-700">
                        +{interesMoratorio} {lote!.moneda}
                      </span>
                    )
                  )}
                </td>
                <td className={TABLA_CELDA}>{vencida && <span className="text-red-700">Vencida</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>

      {perfilPropio!.role === 'administrador' && lote!.estado === 'vendido' && cuotasRefinanciables.length > 0 && (
        <details className="mb-6 rounded border border-blue-100 text-sm">
          <summary className="cursor-pointer select-none p-3 font-medium">Refinanciar cuotas</summary>
          <form action={refinanciarConId} className="flex flex-col gap-3 border-t border-blue-100 p-3">
            <p className="text-slate-600">
              Se refinancia toda la deuda de una vez: las {cuotasRefinanciables.length} cuota(s) con
              saldo pendiente (vencidas impagas + futuras, cuotas{' '}
              {cuotasRefinanciables.map((cuota) => cuota.numero).join(', ')}) suman{' '}
              <span className="font-semibold">
                {totalDeudaRefinanciable} {lote!.moneda}
              </span>
              . Quedan marcadas &quot;Refinanció&quot; en vez de un saldo, y se generan cuotas
              nuevas a partir de acá con el plan de abajo.
            </p>
            <label className="text-sm">
              Fecha de la primera cuota nueva
              <input
                type="date"
                name="fechaPrimeraCuotaNueva"
                required
                className={`${ENTRADA} w-full`}
              />
            </label>
            <RefinanciarCuotas totalDeuda={totalDeudaRefinanciable} moneda={lote!.moneda} />
            <BotonEnvio className={`cursor-pointer self-start ${BOTON_PRIMARIO}`}>
              Refinanciar
            </BotonEnvio>
          </form>
        </details>
      )}

      {/* Condonar el interés moratorio (08/09, pedido de Nicolás vía
          Gabriel): el interés es con lo que negocia para destrabar una deuda
          parada, así que tiene que poder sacarlo -- y volver a ponerlo si el
          cliente no cumple. Ver migración 0059. */}
      {perfilPropio!.role === 'administrador' &&
        lote!.estado === 'vendido' &&
        (cuotasConMoraViva.length > 0 || cuotasConInteresCondonado.length > 0) && (
          <details className="mb-6 rounded border border-blue-100 text-sm">
            <summary className="cursor-pointer select-none p-3 font-medium">
              Condonar interés moratorio
            </summary>
            <div className="flex flex-col gap-4 border-t border-blue-100 p-3">
              {cuotasConMoraViva.length > 0 && (
                <form action={condonarInteresConId} className="flex flex-col gap-3">
                  <p className="text-slate-600">
                    La cuota deja de generar interés: ni el que ya se acumuló ni el que se
                    seguiría acumulando. Sigue debiendo su capital. No devuelve interés ya
                    cobrado en un pago anterior &mdash; eso sería una devolución de plata que ya
                    entró y se repartió.
                  </p>
                  {/* Casillas y no un desplegable: el caso real es "arreglamos
                      por las tres vencidas", no una sola. */}
                  <fieldset className="flex flex-col gap-1">
                    <legend className="mb-1 text-sm font-medium">A qué cuotas</legend>
                    <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded border border-blue-100 p-2">
                      {cuotasConMoraViva.map((cuota) => (
                        <label key={cuota.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name="numero" value={cuota.numero} />
                          <span>
                            Cuota {cuota.numero} &mdash; venció el{' '}
                            {formatearFechaCorta(cuota.fecha_vencimiento)}, debe{' '}
                            {cuota.saldo_pendiente} {lote!.moneda}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="text-sm">
                    Por qué (opcional, queda en el historial)
                    <input
                      type="text"
                      name="motivo"
                      maxLength={200}
                      placeholder="Ej: acuerdo de pago, cancela el capital esta semana"
                      className={`${ENTRADA} w-full`}
                    />
                  </label>
                  <BotonEnvio className={`cursor-pointer self-start ${BOTON_PRIMARIO}`}>
                    Condonar interés
                  </BotonEnvio>
                </form>
              )}

              {cuotasConInteresCondonado.length > 0 && (
                <form
                  action={condonarInteresConId}
                  className="flex flex-col gap-3 border-t border-blue-100 pt-4"
                >
                  <input type="hidden" name="restituir" value="1" />
                  <p className="text-slate-600">
                    Con el interés condonado: cuota{' '}
                    {listarNumerosDeCuota(cuotasConInteresCondonado.map((cuota) => cuota.numero))}.
                    Si el cliente no cumplió lo que prometió, se puede volver a aplicar &mdash; el
                    interés se recalcula desde el vencimiento original, como si nunca se hubiera
                    condonado.
                  </p>
                  <fieldset className="flex flex-col gap-1">
                    <legend className="mb-1 text-sm font-medium">A qué cuotas</legend>
                    <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded border border-blue-100 p-2">
                      {cuotasConInteresCondonado.map((cuota) => (
                        <label key={cuota.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name="numero" value={cuota.numero} />
                          <span>
                            Cuota {cuota.numero}
                            {cuota.interes_condonado_motivo
                              ? ` — ${cuota.interes_condonado_motivo}`
                              : ''}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <BotonEnvio className={`cursor-pointer self-start ${BOTON_SECUNDARIO}`}>
                    Volver a aplicar el interés
                  </BotonEnvio>
                </form>
              )}
            </div>
          </details>
        )}
      </div>
      </div>
        </div>

        <div className={COLUMNA_LATERAL}>
      {pagosConComprobante.length > 0 && (
        <div className={PANEL_SIN_PADDING}>
          <div className={PANEL_HEADER}>
            <div className="flex items-center gap-3">
              <span className={PANEL_HEADER_ICONO}>
                <Receipt className="h-5 w-5" />
              </span>
              <h2 className={PANEL_TITULO}>Historial de pagos</h2>
            </div>
            {totalCobradoHistorico !== null && (
              <span className="rounded-full border border-blue-200/70 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800 tabular-nums">
                Total: {totalCobradoHistorico.toLocaleString('es-AR')} {lote!.moneda}
              </span>
            )}
          </div>
          {/* Tarjetas y no filas (09/09, mockup 2): en esta columna angosta
              no entran fecha + medio + motivo + monto + comprobante +
              estado en una fila, y lo que hay que poder leer de un pago
              pendiente es justamente lo que no entraba. Cada tarjeta lleva
              data-testid="pago-lote" para que los tests no dependan de si
              esto es una tabla o una lista. */}
          <div className="space-y-3 p-5">
            {pagosConComprobante.map((pago) => {
              const confirmarEstePago = confirmarPago.bind(null, pago.id)
              const pendiente = pago.estado !== 'confirmado'
              return (
                <div
                  key={pago.id}
                  data-testid="pago-lote"
                  className={pendiente ? TARJETA_PAGO_PENDIENTE : TARJETA_PAGO}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-sm font-bold text-slate-900">
                      {MOTIVO_PAGO_ETIQUETA[pago.motivo] ?? pago.motivo}
                    </span>
                    <span className="text-sm font-bold text-blue-900 tabular-nums">
                      {pago.monto} {pago.moneda}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 tabular-nums">
                    {new Date(pago.created_at).toLocaleDateString('es-AR')}
                    <span className="text-slate-400"> · </span>
                    {pago.medio_pago === 'efectivo' ? 'Efectivo' : 'Transferencia'}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={
                        pendiente
                          ? 'inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800'
                          : 'inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700'
                      }
                    >
                      {pendiente ? 'Pendiente' : 'Confirmado'}
                    </span>
                    {pago.comprobanteUrl ? (
                      <a
                        href={pago.comprobanteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`text-xs font-semibold ${ENLACE_TABLA}`}
                      >
                        Ver comprobante →
                      </a>
                    ) : pago.medio_pago === 'efectivo' ? (
                      <span className="text-xs text-slate-500">Sin comprobante (efectivo)</span>
                    ) : null}
                  </div>

                  {puedeConfirmarPagoDesdeLote && pendiente && (
                    <form action={confirmarEstePago} className="pt-1">
                      <input type="hidden" name="montoVisto" value={pago.monto} />
                      <input type="hidden" name="monto" value={pago.monto} />
                      <BotonEnvio className={`w-full cursor-pointer ${BOTON_FILA_AZUL} justify-center`}>
                        Confirmar
                      </BotonEnvio>
                    </form>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
        </div>
      </div>

      <div className={COLUMNA_LECTURA}>

      {(ajustesIndexacion ?? []).length > 0 && (
        <>
          <h2 className={`mb-2 mt-6 ${TITULO_H2}`}>Historial de índice</h2>
          <div className={`mb-2 ${TABLA_CONTENEDOR}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className={TABLA_HEADER_FILA}>
                <th className={TABLA_HEADER_CELDA}>Cuota (mes)</th>
                <th className={TABLA_HEADER_CELDA}>Índice usado</th>
                <th className={TABLA_HEADER_CELDA}>% aplicado</th>
                <th className={TABLA_HEADER_CELDA}>Aplicado por</th>
                <th className={TABLA_HEADER_CELDA}>Cuándo</th>
              </tr>
            </thead>
            <tbody>
              {(ajustesIndexacion ?? []).map((ajuste, i) => (
                <tr key={i} className={TABLA_FILA}>
                  <td className={TABLA_CELDA}>{formatearPeriodoIndice(ajuste.fecha_desde)}</td>
                  <td className={TABLA_CELDA}>
                    {ajuste.indice_nombre ?? '—'}
                    {ajuste.indice_periodo && (
                      <span className="text-slate-500"> ({formatearPeriodoIndice(ajuste.indice_periodo)})</span>
                    )}
                  </td>
                  <td className={TABLA_CELDA}>{ajuste.porcentaje}%</td>
                  <td className={TABLA_CELDA}>{nombreAplicadorIndexacionPorId.get(ajuste.aplicado_por) ?? '—'}</td>
                  <td className={TABLA_CELDA}>{new Date(ajuste.created_at).toLocaleDateString('es-AR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      </div>

      {/* Datos del lote (09/09, mockup 2): era una pila de inputs a lo ancho
          de una columna de 48rem, con el identificador arriba de todo. Ahora
          es un panel a todo el ancho con los campos cortos de a cuatro por
          fila -- manzana, lote, superficie, cuenta de rentas entran en una
          sola linea -- y el guardar en la cabecera del panel, como en el
          mockup.

          El identificador dejo de ser un campo: se arma solo con la manzana
          y el numero (ver lib/lotes/identificador-automatico.ts). Se muestra
          igual, porque es el nombre con el que el lote aparece en los
          recibos y en los contratos, pero de solo lectura.

          Sigue afuera del alcance del cobrador: Nicolas (25/08) confirmo que
          puede VER, no editar. */}
      {perfilPropio!.role !== 'cobrador' && (
        <form action={actualizarDatosGeneralesConId} className={`mt-8 ${PANEL_SIN_PADDING}`}>
          <div className={PANEL_HEADER}>
            <div className="flex items-center gap-3">
              <span className={PANEL_HEADER_ICONO}>
                <Landmark className="h-5 w-5" />
              </span>
              <div>
                <h2 className={PANEL_TITULO}>Datos del lote</h2>
                <p className="text-xs text-slate-500">
                  {elNombreYaDiceManzanaYLote ? (
                    'El nombre del lote sale de la manzana y el número: si los corregís acá, el nombre los sigue.'
                  ) : (
                    <>
                      Hoy se llama{' '}
                      <strong className="font-semibold text-slate-700">
                        {lote!.identificador}
                      </strong>
                      . Si cargás la manzana y el número, pasa a llamarse por ellos.
                    </>
                  )}
                </p>
              </div>
            </div>
            <BotonEnvio className={`cursor-pointer ${BOTON_PRIMARIO}`}>Guardar cambios</BotonEnvio>
          </div>

          <div className={`${GRILLA_DATOS_LOTE} p-5`}>
            <label className="text-sm">
              <span className={ETIQUETA_CAMPO}>Manzana</span>
              <input
                name="manzana"
                defaultValue={lote!.manzana ?? ''}
                placeholder="Ej: 5 o B"
                className={`${ENTRADA} w-full`}
              />
            </label>
            <label className="text-sm">
              <span className={ETIQUETA_CAMPO}>Número de lote</span>
              <input
                name="numeroLote"
                defaultValue={lote!.numero_lote ?? ''}
                placeholder="Ej: 12"
                className={`${ENTRADA} w-full`}
              />
            </label>
            <label className="text-sm">
              <span className={ETIQUETA_CAMPO}>Superficie total (m²)</span>
              <input
                name="superficieM2"
                type="number"
                step="0.01"
                min="0"
                defaultValue={lote!.superficie_m2 ?? ''}
                className={`${ENTRADA} w-full tabular-nums`}
              />
            </label>
            <label className="text-sm">
              <span className={ETIQUETA_CAMPO}>Cuenta en rentas</span>
              <input
                name="cuentaRentas"
                defaultValue={lote!.cuenta_rentas ?? ''}
                className={`${ENTRADA} w-full tabular-nums`}
              />
            </label>

            <label className="text-sm sm:col-span-2">
              <span className={ETIQUETA_CAMPO}>Ubicación</span>
              <input
                name="ubicacion"
                defaultValue={lote!.ubicacion ?? ''}
                placeholder="Ej: Loteo San Martín, Etapa 2"
                className={`${ENTRADA} w-full`}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className={ETIQUETA_CAMPO}>Nomenclatura catastral</span>
              <input
                name="nomenclaturaCatastral"
                defaultValue={lote!.nomenclatura_catastral ?? ''}
                placeholder="Circ. 04 - Secc. B - Ch. 12"
                className={`${ENTRADA} w-full`}
              />
            </label>

            <label className="text-sm sm:col-span-2">
              <span className={ETIQUETA_CAMPO}>Matrícula / folio real</span>
              <input
                name="matricula"
                defaultValue={lote!.matricula ?? ''}
                className={`${ENTRADA} w-full`}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className={ETIQUETA_CAMPO}>Precio total del lote</span>
              {/* La moneda no se edita acá a propósito: se fija al crear el
                  lote, y cambiarla después rompería los cálculos de las
                  cuotas y los pagos ya cargados en la otra moneda. */}
              <div className="flex items-stretch gap-2">
                <input
                  name="precioTotal"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={lote!.precio_total ?? ''}
                  className={`${ENTRADA} w-full tabular-nums`}
                />
                <span
                  className="mt-1 flex shrink-0 items-center rounded-lg border-2 border-slate-200 bg-slate-100 px-3 text-sm font-semibold text-slate-600"
                  title="La moneda se fija al crear el lote y no se puede cambiar acá"
                >
                  {lote!.moneda}
                </span>
              </div>
            </label>

            {/* Reasignar el loteo desde el propio lote (08/09, pedido de
                Gabriel): es lo que decide con qué plantilla se genera el
                boleto de compraventa, y hasta ahora solo se podía elegir al
                crearlo. */}
            <label className="text-sm sm:col-span-2">
              <span className={ETIQUETA_CAMPO}>Loteo</span>
              <select
                name="loteoId"
                defaultValue={lote!.loteo_id ?? ''}
                className={`${ENTRADA} w-full`}
              >
                <option value="">— sin loteo —</option>
                {(loteosDisponibles ?? []).map((loteo) => (
                  <option key={loteo.id} value={loteo.id}>
                    {loteo.nombre}
                    {!loteo.plantilla_contrato_path && ' — sin plantilla de contrato'}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">
                Define qué plantilla se usa para generar el boleto de compraventa.
              </span>
            </label>

            {lote!.moneda === 'ARS' && (
              <label className="text-sm sm:col-span-2">
                <span className={ETIQUETA_CAMPO}>Índice de ajuste (solo lotes en pesos)</span>
                <select
                  name="indiceTipo"
                  defaultValue={lote!.indice_tipo ?? ''}
                  className={`${ENTRADA} w-full`}
                >
                  <option value="">— sin índice —</option>
                  {nombresIndicesDisponibles.map((nombre) => (
                    <option key={nombre} value={nombre}>
                      {nombre}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-slate-500">
                  Con un índice elegido, las cuotas se ajustan solas cada mes con el valor que se
                  cargue en{' '}
                  <EnlaceBoton href="/admin/indices" className={ENLACE}>
                    Índices
                  </EnlaceBoton>
                  . Los disponibles son los que ya se cargaron al menos una vez ahí.
                </span>
              </label>
            )}
          </div>
        </form>
      )}

      {/* Contratos (09/09, mockup 2): mismo panel que el resto en vez de un
          titulo suelto con una lista de <li> con guiones. */}
      {perfilPropio!.role !== 'cobrador' &&
        (lote!.estado === 'vendido' || lote!.estado === 'reservado') && (
          <div className={`mt-6 ${PANEL_SIN_PADDING}`}>
            <div className={PANEL_HEADER}>
              <div className="flex items-center gap-3">
                <span className={PANEL_HEADER_ICONO}>
                  <FileSignature className="h-5 w-5" />
                </span>
                <div>
                  <h2 className={PANEL_TITULO}>Contratos</h2>
                  <p className="text-xs text-slate-500">
                    {lote!.estado === 'reservado'
                      ? 'Sale con los datos de la reserva. Las cuotas se cargan al vender, así que esa parte queda en blanco hasta ese momento.'
                      : 'Se guarda como un documento más de este lote, con los datos cargados hasta ahora.'}
                  </p>
                </div>
              </div>

              {loteoDelLote?.plantilla_contrato_path && (
                <form action={generarContratoConId} className="flex items-end gap-2">
                  <label className="text-sm">
                    <span className={ETIQUETA_CAMPO}>Fecha del contrato</span>
                    <input
                      name="fechaContrato"
                      type="date"
                      required
                      defaultValue={hoy}
                      className={ENTRADA}
                    />
                  </label>
                  <BotonEnvio className={`mb-px cursor-pointer ${BOTON_PRIMARIO}`}>
                    Generar contrato
                  </BotonEnvio>
                </form>
              )}
            </div>

            <div className="p-5">
              {!loteoDelLote?.plantilla_contrato_path ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  El loteo de este lote todavía no tiene una plantilla de contrato cargada —{' '}
                  <EnlaceBoton href="/admin/loteos" className={ENLACE}>
                    subí una acá
                  </EnlaceBoton>{' '}
                  para poder generarlo.
                </p>
              ) : contratosGenerados.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Todavía no se generó ningún contrato para este lote.
                </p>
              ) : (
                <ul className="space-y-2">
                  {contratosGenerados.map((documento) => {
                    const eliminarContratoConId = eliminarDocumentoLote.bind(
                      null,
                      documento.id,
                      id
                    )
                    return (
                      <li
                        key={documento.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm">
                            <FileText className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            {documento.url ? (
                              <a
                                href={documento.url}
                                target="_blank"
                                className="block truncate text-sm font-semibold text-blue-700 underline-offset-4 hover:underline"
                              >
                                {documento.descripcion}
                              </a>
                            ) : (
                              <span className="block truncate text-sm text-slate-600">
                                {documento.descripcion} (link no disponible)
                              </span>
                            )}
                            <span className="text-[11px] text-slate-500">
                              Generado por {documento.nombreSubidoPor}
                            </span>
                          </div>
                        </div>
                        <form action={eliminarContratoConId}>
                          <BotonEnvio
                            className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            aria-label={`Eliminar ${documento.descripcion}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </BotonEnvio>
                        </form>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

      <div className={COLUMNA_LECTURA}>

      {/* La sección de Cobro (admin / acreedor / vendedor / cuenta que
          cobra / participantes) se mudó a /distribucion el 06/09: definir
          quiénes participan y repartir las cuotas entre ellos son dos
          mitades de la misma decisión. Ver SeccionCobro.tsx. */}

      {(historialEstados ?? []).length > 0 && (
        <details className="mt-10 rounded border border-blue-100 text-sm text-slate-600" open={hayFiltroHistorial || undefined}>
          <summary className="cursor-pointer select-none p-3 font-medium">
            Historial de estados del lote ({(historialEstados ?? []).length})
          </summary>
          <div className="border-t border-blue-100 p-3">
            {totalCobradoHistorico !== null && (
              <p className="mb-2">
                Total cobrado mientras estuvo vendido:{' '}
                <span className="font-semibold">
                  {totalCobradoHistorico} {lote!.moneda}
                </span>
              </p>
            )}
            <FiltroEnVivo className="mb-3 flex flex-wrap items-end gap-3">
              <label className="text-sm">
                Desde
                <input
                  type="date"
                  name="historialDesde"
                  defaultValue={historialDesde ?? ''}
                  className={ENTRADA}
                />
              </label>
              <label className="text-sm">
                Hasta
                <input
                  type="date"
                  name="historialHasta"
                  defaultValue={historialHasta ?? ''}
                  className={ENTRADA}
                />
              </label>
              {hayFiltroHistorial && (
                <EnlaceBoton href={`/admin/lotes/${id}`} className={`text-sm ${ENLACE}`}>
                  Limpiar filtro
                </EnlaceBoton>
              )}
            </FiltroEnVivo>
            {historialFiltrado.length === 0 ? (
              <p className="mb-2 text-slate-600">Ningún movimiento coincide con el filtro.</p>
            ) : (
            <ul className="mb-2 list-inside list-disc">
              {historialFiltrado.map((cambio, i) => (
                <li key={i}>
                  {cambio.estado_anterior && cambio.estado_nuevo
                    ? `${cambio.estado_anterior} → ${cambio.estado_nuevo}`
                    : (EVENTO_HISTORIAL_ETIQUETA[cambio.evento] ?? cambio.evento)}{' '}
                  — {nombreCambiadorPorId.get(cambio.cambiado_por) ?? '—'} —{' '}
                  {new Date(cambio.created_at).toLocaleDateString('es-AR')}
                  {cambio.detalle && <span className="text-slate-500"> — {cambio.detalle}</span>}
                </li>
              ))}
            </ul>
            )}
            {(perfilPropio!.role === 'administrador' || perfilPropio!.role === 'cobrador') && (
              <EnlaceBoton href="/admin/historial-lotes" className={ENLACE}>
                Ver historial de todos los lotes →
              </EnlaceBoton>
            )}
          </div>
        </details>
      )}
      </div>
    </main>
  )
}

// Un adjunto: link si el archivo esta, chip apagado si no se pudo firmar la
// URL. Antes cada uno era un parrafo con "Ver X" o "X no disponible", y con
// cinco adjuntos la ficha de la reserva eran cinco renglones de texto.
function ChipDeArchivo({ url, nombre }: { url: string | null; nombre: string }) {
  if (!url) {
    return (
      <span className={CHIP_ARCHIVO_VACIO}>
        <FileText className="h-[14px] w-[14px]" />
        {nombre} — no disponible
      </span>
    )
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={CHIP_ARCHIVO}>
      <FileText className="h-[14px] w-[14px]" />
      {nombre}
    </a>
  )
}
