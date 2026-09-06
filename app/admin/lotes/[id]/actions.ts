'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdminSobreLote, requireAdministrador } from '@/lib/auth/require-admin'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'
import { mensajeDeError } from '@/lib/errores'
import { generarYGuardarContrato } from '@/lib/contratos/generar-y-guardar'
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

  redirect(`/admin/lotes/${loteId}?ok=${encodeURIComponent('Datos del lote guardados.')}`)
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

  redirect(`/admin/lotes/${loteId}?ok=${encodeURIComponent('Lote rescindido.')}`)
}

// Prejudicial es un paso MANUAL del admin, no automático (Nicolás: "es un
// caso importante"; reforzado 26/08 -- lo que calcula solo el sistema por
// cuotas vencidas es apenas una señal de "posible prejudicial", nunca la
// marca real). Un lote vendido puede pasar y salir de esta marca las veces
// que haga falta, cada cambio queda en el historial.
// volverA: a dónde redirigir después (el detalle del lote por defecto). El
// Panel de Morosos pasa '/admin/panel-morosos' acá para poder marcar varios
// candidatos seguidos sin salir de la lista cada vez.
export async function marcarPrejudicial(loteId: string, volverA?: string) {
  await requireAdministrador()

  const destino = volverA || `/admin/lotes/${loteId}`

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: lote } = await supabase.from('lotes').select('estado').eq('id', loteId).single()

  if (!lote || lote.estado !== 'vendido') {
    redirect(`${destino}?error=${encodeURIComponent('Solo se puede marcar como Prejudicial un lote vendido')}`)
  }

  const { error } = await supabase.from('lotes').update({ marcado_prejudicial: true }).eq('id', loteId)

  if (error) {
    redirect(`${destino}?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  await supabase.from('lote_historial_estados').insert({
    lote_id: loteId,
    evento: 'marcado_prejudicial',
    cambiado_por: user!.id,
  })

  redirect(`${destino}?ok=${encodeURIComponent('Lote marcado como Prejudicial')}`)
}

export async function desmarcarPrejudicial(loteId: string) {
  await requireAdministrador()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.from('lotes').update({ marcado_prejudicial: false }).eq('id', loteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  await supabase.from('lote_historial_estados').insert({
    lote_id: loteId,
    evento: 'desmarcado_prejudicial',
    cambiado_por: user!.id,
  })

  redirect(`/admin/lotes/${loteId}?ok=${encodeURIComponent('Lote sacado de Prejudicial')}`)
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

  redirect(`/admin/lotes/${loteId}?ok=${encodeURIComponent('Lote devuelto a disponible.')}`)
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

// Estas acciones devuelven a /distribucion, no al detalle del lote: desde el
// 06/09 la sección de cobro y la de participantes viven ahí, junto al reparto
// por cuota. Redirigir al detalle dejaba al admin en una pantalla donde el
// formulario que acababa de usar ya no existe.
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
        `/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent('Uno de los roles asignados no coincide')}`
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
          `/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent(
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
        `/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent(
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
        `/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent(
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
    redirect(`/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  redirect(`/admin/lotes/${loteId}/distribucion?ok=${encodeURIComponent('Datos de cobro guardados.')}`)
}

export async function subirDocumentoLote(loteId: string, formData: FormData) {
  await requireAdminSobreLote(loteId)

  const descripcion = ((formData.get('descripcion') as string) || '').trim()
  // El archivo ya se subió directo del navegador a Storage
  // (CampoArchivoDirecto) -- acá solo llega el path resultante.
  const path = ((formData.get('archivo') as string) || '').trim()

  if (!descripcion) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent('Ingresá una descripción para el documento')}`
    )
  }

  if (!path) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent('Elegí un archivo para subir')}`)
  }

  if (!path.startsWith(`lotes/${loteId}/`)) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent('El archivo no es válido, probá subirlo de nuevo')}`)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error: errorInsert } = await supabase.from('lote_documentos').insert({
    lote_id: loteId,
    path,
    descripcion,
    subido_por: user!.id,
  })

  if (errorInsert) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensajeDeError(errorInsert))}`)
  }

  redirect(`/admin/lotes/${loteId}?ok=${encodeURIComponent('Documento subido.')}`)
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

  redirect(`/admin/lotes/${loteId}?ok=${encodeURIComponent('Documento eliminado.')}`)
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

  // El trabajo real vive en lib/contratos/generar-y-guardar.ts: lo comparte
  // con la generación automática al reservar y con la pantalla de Boletos
  // de compraventa (04/09).
  const resultado = await generarYGuardarContrato({ loteId, fechaContrato, userId: user!.id })

  if (!resultado.ok) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(resultado.error)}`)
  }

  redirect(`/admin/lotes/${loteId}?ok=${encodeURIComponent('Contrato generado')}`)
}

// "Saldar" (pedido de Nico, 02/09, ver memoria del backlog de Notion):
// Nico negocia con el cliente cerrar el resto de la deuda por un monto
// MENOR al saldo real -- no es un pago normal (que se imputa 1:1 a las
// cuotas vía FIFO), es una decisión manual del admin de dar la deuda por
// saldada. Registra el monto acordado como un pago ya confirmado (no hace
// falta la doble confirmación de siempre, la decide Nico acá mismo) y deja
// TODAS las cuotas pendientes del ciclo vigente en saldo 0 -- sin
// prorratear el monto entre ellas.
//
// Deliberadamente NO crea filas en pago_imputaciones: ese mecanismo es
// para repartir un pago 1:1 entre acreedor/vendedor/admin según la
// distribución configurada de cada cuota, y acá el monto cobrado es MENOR
// al saldo, sin que Nico haya especificado cómo repartir esa diferencia
// entre los distintos participantes. El pago queda registrado (visible en
// Pagos, Cierre de caja, historial del lote) pero no alimenta la cuenta
// corriente de nadie automáticamente -- eso queda pendiente de definir.
export async function saldarLote(loteId: string, formData: FormData) {
  await requireAdministrador()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const destino = `/admin/lotes/${loteId}`

  const montoTexto = ((formData.get('monto') as string) || '').trim()
  const monto = Number(montoTexto)
  const medioPago = formData.get('medioPago') as string

  if (!Number.isFinite(monto) || monto < 0) {
    redirect(`${destino}?error=${encodeURIComponent('Ingresá un monto válido')}`)
  }

  if (medioPago !== 'efectivo' && medioPago !== 'transferencia') {
    redirect(`${destino}?error=${encodeURIComponent('Elegí el medio de pago')}`)
  }

  const { data: lote } = await supabase
    .from('lotes')
    .select('id, estado, moneda, cliente_id, ciclo_actual')
    .eq('id', loteId)
    .single()

  if (!lote || lote.estado !== 'vendido' || !lote.cliente_id) {
    redirect(`${destino}?error=${encodeURIComponent('Solo se puede saldar un lote vendido')}`)
  }

  const { data: cuotasPendientes } = await supabase
    .from('cuotas')
    .select('id, saldo_pendiente')
    .eq('lote_id', loteId)
    .eq('ciclo', lote!.ciclo_actual)
    .gt('saldo_pendiente', 0)

  if (!cuotasPendientes || cuotasPendientes.length === 0) {
    redirect(`${destino}?error=${encodeURIComponent('Este lote no tiene saldo pendiente para saldar')}`)
  }

  const totalPendienteAntes = cuotasPendientes.reduce((acum, cuota) => acum + cuota.saldo_pendiente, 0)

  const { error: errorPago } = await supabase.from('pagos').insert({
    cliente_id: lote!.cliente_id,
    lote_id: loteId,
    monto,
    moneda: lote!.moneda,
    motivo: 'saldar',
    medio_pago: medioPago,
    estado: 'confirmado',
    confirmado_admin_por: user!.id,
    confirmado_admin_at: new Date().toISOString(),
  })

  if (errorPago) {
    redirect(`${destino}?error=${encodeURIComponent(mensajeDeError(errorPago))}`)
  }

  const { error: errorCuotas } = await supabase
    .from('cuotas')
    .update({ saldo_pendiente: 0 })
    .eq('lote_id', loteId)
    .eq('ciclo', lote!.ciclo_actual)
    .gt('saldo_pendiente', 0)

  if (errorCuotas) {
    redirect(
      `${destino}?error=${encodeURIComponent(
        'El pago se registró pero no se pudieron saldar las cuotas. Revisalo manualmente.'
      )}`
    )
  }

  await supabase.from('lote_historial_estados').insert({
    lote_id: loteId,
    evento: 'saldado',
    cambiado_por: user!.id,
    detalle: `Pago total anticipado por ${monto} ${lote!.moneda} (${medioPago}) -- quedaban pendientes ${totalPendienteAntes} ${lote!.moneda}.`,
  })

  redirect(
    `${destino}?ok=${encodeURIComponent('Pago total anticipado registrado -- la deuda restante quedó cerrada.')}`
  )
}
