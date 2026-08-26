'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdminSobreLote, requireAdministrador } from '@/lib/auth/require-admin'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'
import { excedeTamanioMaximo, MAX_ARCHIVO_MB } from '@/lib/storage/validar-tamanio-archivo'
import { mensajeDeError } from '@/lib/errores'
import { armarDatosContrato } from '@/lib/contratos/armar-datos-contrato'
import { generarContrato, ErrorPlantillaContrato } from '@/lib/contratos/generar-contrato'
import { generarCuotas, generarCuotasManual } from '@/lib/lotes/generar-cuotas'
import { calcularMontoCuota } from '@/lib/lotes/calcular-monto-cuota'

function idOVacio(valor: FormDataEntryValue | null): string | null {
  const texto = valor as string | null
  return texto && texto.trim() ? texto : null
}

export async function actualizarDatosGenerales(loteId: string, formData: FormData) {
  await requireAdminSobreLote(loteId)

  const identificador = formData.get('identificador') as string
  const ubicacion = ((formData.get('ubicacion') as string) || '').trim() || null
  const precioTotalTexto = ((formData.get('precioTotal') as string) || '').trim()
  const precioTotal = precioTotalTexto ? Number(precioTotalTexto) : null
  const indiceTipo = ((formData.get('indiceTipo') as string) || '').trim() || null
  const numeroLote = ((formData.get('numeroLote') as string) || '').trim() || null
  const manzana = ((formData.get('manzana') as string) || '').trim() || null
  const superficieM2Texto = ((formData.get('superficieM2') as string) || '').trim()
  const superficieM2 = superficieM2Texto ? Number(superficieM2Texto) : null
  const cuentaRentas = ((formData.get('cuentaRentas') as string) || '').trim() || null
  const nomenclaturaCatastral = ((formData.get('nomenclaturaCatastral') as string) || '').trim() || null
  const matricula = ((formData.get('matricula') as string) || '').trim() || null

  const supabase = await createClient()
  const { error } = await supabase
    .from('lotes')
    .update({
      identificador,
      ubicacion,
      precio_total: precioTotal,
      indice_tipo: indiceTipo,
      numero_lote: numeroLote,
      manzana,
      superficie_m2: superficieM2,
      cuenta_rentas: cuentaRentas,
      nomenclatura_catastral: nomenclaturaCatastral,
      matricula,
    })
    .eq('id', loteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  redirect(`/admin/lotes/${loteId}`)
}

export async function eliminarLote(loteId: string) {
  await requireAdministrador()

  const supabase = await createClient()

  const { data: lote } = await supabase.from('lotes').select('cliente_id').eq('id', loteId).single()

  if (lote?.cliente_id) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent(
        'No se puede eliminar: este lote ya tiene un cliente asignado'
      )}`
    )
  }

  // reservas.lote_id referencia lotes con "on delete cascade" -- sin este
  // chequeo, borrar un lote "reservado" se lleva puesta la reserva entera
  // (seña, datos del comprador, fotos de DNI) en silencio, porque un lote
  // reservado todavía no tiene cliente_id ni cuotas y ninguno de los otros
  // chequeos de esta función lo detecta.
  const { count: reservasActivas } = await supabase
    .from('reservas')
    .select('id', { count: 'exact', head: true })
    .eq('lote_id', loteId)
    .is('cancelada_at', null)

  if (reservasActivas && reservasActivas > 0) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent(
        'No se puede eliminar: este lote tiene una reserva activa'
      )}`
    )
  }

  const { data: cuotas } = await supabase.from('cuotas').select('id').eq('lote_id', loteId)
  const cuotaIds = (cuotas ?? []).map((cuota) => cuota.id)

  if (cuotaIds.length > 0) {
    const { count } = await supabase
      .from('pago_imputaciones')
      .select('id', { count: 'exact', head: true })
      .in('cuota_id', cuotaIds)

    if (count && count > 0) {
      redirect(
        `/admin/lotes/${loteId}?error=${encodeURIComponent(
          'No se puede eliminar: este lote ya tiene pagos imputados'
        )}`
      )
    }
  }

  const { error } = await supabase.from('lotes').delete().eq('id', loteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  redirect('/admin/lotes')
}

// vendido -> rescindido: el lote deja de estar en cobranza activa, pero
// conserva cliente_id y las cuotas/pagos tal cual quedaron (es el registro
// histórico de ese ciclo -- ver historialDelLote / totalCobradoDelLote).
export async function rescindirLote(loteId: string) {
  await requireAdministrador()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: lote } = await supabase.from('lotes').select('estado').eq('id', loteId).single()

  if (!lote || lote.estado !== 'vendido') {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent('Solo se puede rescindir un lote que está vendido')}`
    )
  }

  const { error } = await supabase.from('lotes').update({ estado: 'rescindido' }).eq('id', loteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  await supabase.from('lote_historial_estados').insert({
    lote_id: loteId,
    evento: 'rescindido',
    estado_anterior: 'vendido',
    estado_nuevo: 'rescindido',
    cambiado_por: user!.id,
  })

  redirect(`/admin/lotes/${loteId}`)
}

// rescindido -> disponible: deja el lote listo para venderse de nuevo.
// Saca el cliente asignado (un lote "disponible" en el resto de la app
// siempre asume que no tiene cliente) -- pero NO toca las cuotas/pagos
// viejos, que quedan como historial de ese ciclo anterior.
export async function volverADisponible(loteId: string) {
  await requireAdministrador()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: lote } = await supabase.from('lotes').select('estado, ciclo_actual').eq('id', loteId).single()

  if (!lote || lote.estado !== 'rescindido') {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent('Solo se puede volver a disponible un lote rescindido')}`
    )
  }

  // Suma 1 al ciclo de venta: la próxima vez que este lote se venda, sus
  // cuotas nuevas quedan marcadas con el ciclo nuevo -- así nunca chocan
  // con las cuotas del ciclo anterior (unique es lote_id+ciclo+numero,
  // no solo lote_id+numero) y el motor de índices tampoco las mezcla.
  const { error } = await supabase
    .from('lotes')
    .update({ estado: 'disponible', cliente_id: null, ciclo_actual: lote!.ciclo_actual + 1 })
    .eq('id', loteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  await supabase.from('lote_historial_estados').insert({
    lote_id: loteId,
    evento: 'vuelto_disponible',
    estado_anterior: 'rescindido',
    estado_nuevo: 'disponible',
    cambiado_por: user!.id,
  })

  redirect(`/admin/lotes/${loteId}`)
}

// Refinanciación (spec confirmada por Nicolás, ver Notas_Decisiones_SIMA.txt
// puntos 73/80/94/95): se refinancia TODA la deuda de una vez -- todas las
// cuotas con saldo pendiente (vencidas impagas + futuras), no una selección
// puntual -- y se carga a mano en cuántas cuotas nuevas se reparte ese
// total, con el mismo mecanismo de cantidad + automático/manual que se usa
// al vender un lote (ver CuotasYDocumento). Las cuotas viejas quedan
// "refinanciada" con saldo 0 (se muestran con la etiqueta "Refinanció"), se
// generan las cuotas nuevas dentro del MISMO ciclo de venta (esto no es una
// reventa). El lote sigue "vendido" -- no es un estado nuevo, sigue
// comportándose igual en todo lo demás.
export async function refinanciarLote(loteId: string, formData: FormData) {
  await requireAdministrador()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: lote } = await supabase
    .from('lotes')
    .select('estado, ciclo_actual, moneda')
    .eq('id', loteId)
    .single()

  if (!lote || lote.estado !== 'vendido') {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent('Solo se puede refinanciar un lote que está vendido')}`
    )
  }

  const cantidadNueva = Number(formData.get('cantidadCuotasNuevas'))
  const modo = ((formData.get('modo') as string) || 'automatico').trim()
  const fechaPrimeraCuotaNueva = ((formData.get('fechaPrimeraCuotaNueva') as string) || '').trim()

  if (!Number.isInteger(cantidadNueva) || cantidadNueva < 1 || cantidadNueva > 600) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent(
        'La cantidad de cuotas nuevas tiene que ser un número entero entre 1 y 600'
      )}`
    )
  }

  if (!fechaPrimeraCuotaNueva) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent('Ingresá la fecha de la primera cuota nueva')}`
    )
  }

  const admin = createAdminClient()

  // Se toma TODA la deuda del lote de una -- no una selección puntual de
  // cuotas -- exactamente como lo pidió Nicolás.
  const { data: cuotasConSaldo } = await admin
    .from('cuotas')
    .select('id, saldo_pendiente')
    .eq('lote_id', loteId)
    .eq('ciclo', lote!.ciclo_actual)
    .gt('saldo_pendiente', 0)

  if (!cuotasConSaldo || cuotasConSaldo.length === 0) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent('Este lote no tiene cuotas con saldo pendiente para refinanciar')}`
    )
  }

  const totalDeuda =
    Math.round(cuotasConSaldo!.reduce((acumulado, cuota) => acumulado + cuota.saldo_pendiente, 0) * 100) / 100

  let montosManuales: number[] = []
  if (modo === 'manual') {
    const montosManualesRaw: string[] = []
    for (let i = 1; i <= cantidadNueva; i++) {
      montosManualesRaw.push(((formData.get(`cuotaMonto${i}`) as string) || '').trim())
    }

    if (montosManualesRaw.some((valor) => valor === '')) {
      redirect(
        `/admin/lotes/${loteId}?error=${encodeURIComponent('Completá el monto de todas las cuotas nuevas')}`
      )
    }

    montosManuales = montosManualesRaw.map((valor) => Number(valor))
    if (!montosManuales.every((monto) => Number.isFinite(monto) && monto >= 0)) {
      redirect(
        `/admin/lotes/${loteId}?error=${encodeURIComponent(
          'Los montos de las cuotas nuevas tienen que ser números válidos, no negativos'
        )}`
      )
    }
  }

  const { error: errorMarcar } = await admin
    .from('cuotas')
    .update({ refinanciada: true, saldo_pendiente: 0 })
    .in(
      'id',
      cuotasConSaldo!.map((cuota) => cuota.id)
    )

  if (errorMarcar) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensajeDeError(errorMarcar))}`)
  }

  // El número de las cuotas nuevas continúa después de la última cuota que
  // ya existe en este ciclo -- no se reinicia en 1 (chocaría con el unique
  // lote_id+ciclo+numero).
  const { data: cuotasDelCiclo } = await admin
    .from('cuotas')
    .select('numero')
    .eq('lote_id', loteId)
    .eq('ciclo', lote!.ciclo_actual)

  const numeroInicial = Math.max(0, ...(cuotasDelCiclo ?? []).map((cuota) => cuota.numero)) + 1

  const cuotasNuevas =
    modo === 'manual'
      ? generarCuotasManual(montosManuales, fechaPrimeraCuotaNueva)
      : generarCuotas(cantidadNueva, calcularMontoCuota(totalDeuda, cantidadNueva), fechaPrimeraCuotaNueva, totalDeuda)

  const { error: errorInsertarCuotas } = await admin.from('cuotas').insert(
    cuotasNuevas.map((cuota) => ({
      lote_id: loteId,
      numero: numeroInicial + cuota.numero - 1,
      ciclo: lote!.ciclo_actual,
      monto_base: cuota.montoBase,
      saldo_pendiente: cuota.montoBase,
      fecha_vencimiento: cuota.fechaVencimiento,
    }))
  )

  if (errorInsertarCuotas) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensajeDeError(errorInsertarCuotas))}`)
  }

  await admin.from('lote_historial_estados').insert({
    lote_id: loteId,
    evento: 'refinanciado',
    cambiado_por: user!.id,
    detalle: `Deuda de ${totalDeuda} ${lote!.moneda} (${cuotasConSaldo!.length} cuota(s)) → ${cantidadNueva} cuota(s) nueva(s)`,
  })

  redirect(`/admin/lotes/${loteId}?ok=${encodeURIComponent('Refinanciación registrada')}`)
}

export async function actualizarCobro(loteId: string, formData: FormData) {
  await requireAdministrador()

  const adminId = idOVacio(formData.get('adminId'))
  const acreedorId = idOVacio(formData.get('acreedorId'))
  const vendedorId = idOVacio(formData.get('vendedorId'))
  const cuentaCobroRaw = idOVacio(formData.get('cuentaCobroId'))
  const esExterna = cuentaCobroRaw?.startsWith('externa:') ?? false
  const cuentaCobroId = esExterna ? null : cuentaCobroRaw
  const cuentaCobroExternaId = esExterna ? cuentaCobroRaw!.slice('externa:'.length) : null

  const idsAValidar = [adminId, acreedorId, vendedorId].filter(
    (valorId): valorId is string => valorId !== null
  )

  if (idsAValidar.length > 0) {
    const adminValidacion = createAdminClient()
    const { data: personas } = await adminValidacion
      .from('profiles')
      .select('id, role')
      .in('id', idsAValidar)

    const rolEsperado = (personaId: string | null) => {
      if (personaId === adminId) return 'administrador'
      if (personaId === acreedorId) return 'acreedor'
      return 'vendedor'
    }

    const rolInvalido = idsAValidar.some((idPersona) => {
      const persona = personas?.find((p) => p.id === idPersona)
      return !persona || persona.role !== rolEsperado(idPersona)
    })

    if (rolInvalido) {
      redirect(
        `/admin/lotes/${loteId}?error=${encodeURIComponent('Uno de los roles asignados no coincide')}`
      )
    }
  }

  if (cuentaCobroId) {
    const idsAsociados = [adminId, acreedorId, vendedorId]
    const admin = createAdminClient()

    if (!idsAsociados.includes(cuentaCobroId)) {
      const { data: participanteCoincide } = await admin
        .from('lote_participantes')
        .select('id')
        .eq('lote_id', loteId)
        .eq('profile_id', cuentaCobroId)
        .maybeSingle()

      if (!participanteCoincide) {
        redirect(
          `/admin/lotes/${loteId}?error=${encodeURIComponent(
            'La cuenta de cobro tiene que ser el admin, el acreedor, el vendedor o un participante adicional de este lote'
          )}`
        )
      }
    }

    const { data: persona } = await admin
      .from('profiles')
      .select('id, alias, banco, titular')
      .eq('id', cuentaCobroId)
      .single()

    if (
      !persona ||
      !tieneDatosTransferencia({ alias: persona.alias, banco: persona.banco, titular: persona.titular })
    ) {
      redirect(
        `/admin/lotes/${loteId}?error=${encodeURIComponent(
          'Esa persona todavía no tiene datos de transferencia cargados'
        )}&editarUsuario=${cuentaCobroId}`
      )
    }
  }

  if (cuentaCobroExternaId) {
    const admin = createAdminClient()
    const { data: cuentaExterna } = await admin
      .from('cuentas_externas')
      .select('id, titular, alias, banco')
      .eq('id', cuentaCobroExternaId)
      .maybeSingle()

    if (
      !cuentaExterna ||
      !tieneDatosTransferencia({
        titular: cuentaExterna.titular,
        alias: cuentaExterna.alias,
        banco: cuentaExterna.banco,
      })
    ) {
      redirect(
        `/admin/lotes/${loteId}?error=${encodeURIComponent(
          'Esa cuenta externa todavía no tiene datos de transferencia completos'
        )}`
      )
    }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('lotes')
    .update({
      admin_id: adminId,
      acreedor_id: acreedorId,
      vendedor_id: vendedorId,
      cuenta_cobro_id: cuentaCobroId,
      cuenta_cobro_externa_id: cuentaCobroExternaId,
    })
    .eq('id', loteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  redirect(`/admin/lotes/${loteId}`)
}

export async function subirDocumentoLote(loteId: string, formData: FormData) {
  await requireAdminSobreLote(loteId)

  const descripcion = ((formData.get('descripcion') as string) || '').trim()
  const archivo = formData.get('archivo') as File

  if (!descripcion) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent('Ingresá una descripción para el documento')}`
    )
  }

  if (!archivo || archivo.size === 0) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent('Elegí un archivo para subir')}`)
  }

  if (excedeTamanioMaximo(archivo)) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent(
        `El archivo pesa más de ${MAX_ARCHIVO_MB} MB — subí uno más liviano.`
      )}`
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const nombreSeguro = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `lotes/${loteId}/documento-${Date.now()}-${nombreSeguro}`

  const { error: errorSubida } = await admin.storage.from('comprobantes').upload(path, archivo)

  if (errorSubida) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent('No se pudo subir el archivo. Probá de nuevo.')}`
    )
  }

  const { error: errorInsert } = await supabase.from('lote_documentos').insert({
    lote_id: loteId,
    path,
    descripcion,
    subido_por: user!.id,
  })

  if (errorInsert) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensajeDeError(errorInsert))}`)
  }

  redirect(`/admin/lotes/${loteId}`)
}

export async function eliminarDocumentoLote(documentoId: string, loteId: string) {
  await requireAdminSobreLote(loteId)

  const supabase = await createClient()

  // El .eq('lote_id', loteId) es una segunda barrera además de
  // requireAdminSobreLote: sin esto, alguien con permiso sobre SU lote
  // podría borrar la fila de un documento de OTRO lote si adivinara su id,
  // ya que requireAdminSobreLote solo valida el loteId recibido, no que
  // documentoId realmente pertenezca a ese lote.
  const { error } = await supabase
    .from('lote_documentos')
    .delete()
    .eq('id', documentoId)
    .eq('lote_id', loteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  redirect(`/admin/lotes/${loteId}`)
}

// Genera el boleto de compraventa de este lote a partir de la plantilla
// vigente de su loteo (ver Notas_Decisiones_SIMA.txt punto 89): toma el
// .docx con placeholders, lo rellena con los datos reales del lote/
// cliente/acreedor/cuotas, y guarda el resultado como un documento más del
// lote -- mismo mecanismo que subirDocumentoLote, salvo que el archivo lo
// genera el servidor en vez de subirlo un usuario.
export async function generarContratoLote(loteId: string, formData: FormData) {
  await requireAdminSobreLote(loteId)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const fechaContrato = ((formData.get('fechaContrato') as string) || '').trim()
  if (!fechaContrato) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent('Elegí la fecha del contrato')}`)
  }

  const { data: lote } = await supabase
    .from('lotes')
    .select(
      'identificador, moneda, cliente_id, acreedor_id, loteo_id, ciclo_actual, ubicacion, precio_total, numero_lote, manzana, superficie_m2, cuenta_rentas, nomenclatura_catastral, matricula, interes_moratorio_diario'
    )
    .eq('id', loteId)
    .single()

  if (!lote) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent('No se encontró el lote')}`)
  }

  if (!lote!.loteo_id) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent(
        'Este lote no tiene un loteo asignado -- asignale uno primero para poder generar el contrato.'
      )}`
    )
  }

  const { data: loteo } = await supabase
    .from('loteos')
    .select('plantilla_contrato_path')
    .eq('id', lote!.loteo_id!)
    .single()

  if (!loteo?.plantilla_contrato_path) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent(
        'El loteo de este lote todavía no tiene una plantilla de contrato cargada (se carga desde /admin/loteos).'
      )}`
    )
  }

  const admin = createAdminClient()

  const [{ data: acreedor }, { data: cliente }, { data: cuotas }, { data: reserva }, { data: plantillaBlob, error: errorDescarga }] =
    await Promise.all([
      lote!.acreedor_id
        ? supabase.from('profiles').select('full_name, dni, domicilio').eq('id', lote!.acreedor_id).single()
        : Promise.resolve({ data: null }),
      lote!.cliente_id
        ? supabase.from('profiles').select('full_name, dni, domicilio, email').eq('id', lote!.cliente_id).single()
        : Promise.resolve({ data: null }),
      supabase
        .from('cuotas')
        .select('numero, monto_base, fecha_vencimiento')
        .eq('lote_id', loteId)
        .eq('ciclo', lote!.ciclo_actual)
        .order('numero', { ascending: true }),
      supabase
        .from('reservas')
        .select('monto_sena')
        .eq('lote_id', loteId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.storage.from('comprobantes').download(loteo!.plantilla_contrato_path),
    ])

  if (errorDescarga || !plantillaBlob) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent('No se pudo descargar la plantilla del loteo. Probá de nuevo.')}`
    )
  }

  if (!cliente) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent('Este lote todavía no tiene un cliente asignado.')}`
    )
  }

  const primeraCuota = (cuotas ?? [])[0] ?? null

  const datosContrato = armarDatosContrato({
    fechaContrato,
    acreedorNombre: acreedor?.full_name ?? null,
    acreedorDni: acreedor?.dni ?? null,
    acreedorDomicilio: acreedor?.domicilio ?? null,
    clienteNombre: cliente!.full_name,
    clienteDni: cliente!.dni ?? null,
    clienteDomicilio: cliente!.domicilio ?? null,
    clienteEmail: cliente!.email ?? null,
    loteIdentificador: lote!.identificador,
    numeroLote: lote!.numero_lote,
    manzana: lote!.manzana,
    ubicacion: lote!.ubicacion,
    superficieM2: lote!.superficie_m2,
    cuentaRentas: lote!.cuenta_rentas,
    nomenclaturaCatastral: lote!.nomenclatura_catastral,
    matricula: lote!.matricula,
    moneda: lote!.moneda,
    precioTotal: lote!.precio_total,
    montoSena: reserva?.monto_sena ?? null,
    cantidadCuotas: (cuotas ?? []).length,
    montoCuota: primeraCuota?.monto_base ?? null,
    primeraCuotaFecha: primeraCuota?.fecha_vencimiento ?? null,
    interesMoratorioDiario: lote!.interes_moratorio_diario,
  })

  const plantillaBuffer = Buffer.from(await plantillaBlob.arrayBuffer())

  let contratoBuffer: Buffer
  try {
    contratoBuffer = generarContrato(plantillaBuffer, datosContrato)
  } catch (error) {
    const mensaje = error instanceof ErrorPlantillaContrato ? error.message : 'No se pudo generar el contrato.'
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensaje)}`)
  }

  const path = `lotes/${loteId}/contrato-generado-${Date.now()}.docx`
  const { error: errorSubida } = await admin.storage.from('comprobantes').upload(path, contratoBuffer!, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })

  if (errorSubida) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent('El contrato se generó pero no se pudo guardar. Probá de nuevo.')}`
    )
  }

  const { error: errorInsert } = await supabase.from('lote_documentos').insert({
    lote_id: loteId,
    path,
    descripcion: `Contrato generado (${fechaContrato})`,
    subido_por: user!.id,
  })

  if (errorInsert) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensajeDeError(errorInsert))}`)
  }

  redirect(`/admin/lotes/${loteId}?ok=${encodeURIComponent('Contrato generado')}`)
}
