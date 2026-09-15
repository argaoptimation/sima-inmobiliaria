'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdminSobreLote, requireAdministrador } from '@/lib/auth/require-admin'
import { mensajeDeError } from '@/lib/errores'
import { identificadorAutomatico } from '@/lib/lotes/identificador-automatico'
import { generarYGuardarContrato } from '@/lib/contratos/generar-y-guardar'
import { generarCuotas, generarCuotasManual } from '@/lib/lotes/generar-cuotas'
import { calcularMontoCuota } from '@/lib/lotes/calcular-monto-cuota'
import { listarNumerosDeCuota } from '@/lib/cuotas/listar-numeros'
import {
  leerMontosNuevos,
  sePuedeEditarElMonto,
  type CuotaEditable,
} from '@/lib/cuotas/editar-monto'
import { mesDeFecha } from '@/lib/lotes/aplicar-indexacion'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { revalidarNotificaciones } from '@/lib/notificaciones/revalidar'
import { resolverAdminPorDefecto } from '@/lib/lotes/admin-por-defecto'
import { cargarVinculosDelLote } from '@/lib/lotes/cargar-vinculos-del-lote'
import { avisoDeSalida, cambiaAlgoAlQuitarlo } from '@/lib/lotes/vinculos-integrante'
import { mensajeDeSalidaHecha, nombreDeCuenta } from '@/lib/lotes/salida-de-integrante'

function idOVacio(valor: FormDataEntryValue | null): string | null {
  const texto = valor as string | null
  return texto && texto.trim() ? texto : null
}

export async function actualizarDatosGenerales(loteId: string, formData: FormData) {
  await requireAdminSobreLote(loteId)

  const ubicacion = ((formData.get('ubicacion') as string) || '').trim() || null
  const precioTotalTexto = ((formData.get('precioTotal') as string) || '').trim()
  const precioTotal = precioTotalTexto ? Number(precioTotalTexto) : null
  const indiceTipo = ((formData.get('indiceTipo') as string) || '').trim() || null
  // Se puede mover el lote de loteo desde acá (08/09): es lo que decide la
  // plantilla del boleto de compraventa, y antes solo se elegía al crearlo.
  const loteoId = ((formData.get('loteoId') as string) || '').trim() || null
  const numeroLote = ((formData.get('numeroLote') as string) || '').trim() || null
  const manzana = ((formData.get('manzana') as string) || '').trim() || null
  const superficieM2Texto = ((formData.get('superficieM2') as string) || '').trim()
  const superficieM2 = superficieM2Texto ? Number(superficieM2Texto) : null
  const cuentaRentas = ((formData.get('cuentaRentas') as string) || '').trim() || null
  const nomenclaturaCatastral = ((formData.get('nomenclaturaCatastral') as string) || '').trim() || null
  const matricula = ((formData.get('matricula') as string) || '').trim() || null

  const supabase = await createClient()

  // El nombre del lote sale de la manzana y el número, no de un campo de
  // texto aparte (09/09, pedido de Nico -- ver
  // lib/lotes/identificador-automatico.ts). Se recalcula en cada guardado:
  // si se corrige la manzana, el nombre la sigue en vez de quedar mintiendo.
  //
  // Si el lote no tiene ninguno de los dos cargados -- los viejos, los que
  // se importaron -- se deja el nombre que ya tenía: renombrarlo a nada
  // sería peor, y la columna es `not null`.
  const identificadorDerivado = identificadorAutomatico(manzana, numeroLote)
  const { data: loteActual } = await supabase
    .from('lotes')
    .select('identificador')
    .eq('id', loteId)
    .single()
  const identificador = identificadorDerivado ?? loteActual?.identificador

  const { error } = await supabase
    .from('lotes')
    .update({
      identificador,
      ubicacion,
      precio_total: precioTotal,
      indice_tipo: indiceTipo,
      loteo_id: loteoId,
      numero_lote: numeroLote,
      manzana,
      superficie_m2: superficieM2,
      cuenta_rentas: cuentaRentas,
      nomenclatura_catastral: nomenclaturaCatastral,
      matricula,
    })
    .eq('id', loteId)

  if (error) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent(
        mensajeDeError(error, {
          // El identificador es único dentro del loteo, así que mover un
          // lote a otro loteo puede chocar con uno que ya se llama igual.
          '23505': `Ese loteo ya tiene un lote llamado "${identificador}". Cambiá la manzana o el número de lote, o elegí otro loteo.`,
        })
      )}`
    )
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

// Rescindir: vendido -> DISPONIBLE, de una sola vez (06/09, pedido de
// Gabriel: "una vez rescindido directamente queda disponible").
//
// Antes eran dos pasos y un estado intermedio: el lote quedaba "rescindido"
// hasta que alguien se acordaba de apretar "Volver a disponible". Ese estado
// no representaba nada del negocio -- un lote rescindido YA está libre para
// venderse -- y lo único que lograba era que un lote vendible no apareciera
// como disponible hasta que alguien hiciera un click extra.
//
// La rescisión queda en el historial, que es donde corresponde: el evento
// dice que pasó de vendido a disponible, con el motivo.
//
// NO toca las cuotas ni los pagos viejos: quedan como historial del ciclo
// anterior (ver historialDelLote / totalCobradoDelLote). Sí saca el cliente
// asignado, porque en el resto de la app un lote disponible no tiene cliente.
export async function rescindirLote(loteId: string) {
  await requireAdministrador()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: lote } = await supabase
    .from('lotes')
    .select('estado, ciclo_actual')
    .eq('id', loteId)
    .single()

  if (!lote || lote.estado !== 'vendido') {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent('Solo se puede rescindir un lote que está vendido')}`
    )
  }

  // Suma 1 al ciclo de venta: la próxima vez que este lote se venda, sus
  // cuotas nuevas quedan marcadas con el ciclo nuevo -- así nunca chocan con
  // las cuotas del ciclo anterior (unique es lote_id+ciclo+numero, no solo
  // lote_id+numero) y el motor de índices tampoco las mezcla.
  const { error } = await supabase
    .from('lotes')
    .update({ estado: 'disponible', cliente_id: null, ciclo_actual: lote!.ciclo_actual + 1 })
    .eq('id', loteId)

  if (error) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  // Un solo evento, no dos: el lote nunca estuvo "rescindido", pasó de
  // vendido a disponible y el motivo fue la rescisión.
  await supabase.from('lote_historial_estados').insert({
    lote_id: loteId,
    evento: 'rescindido',
    estado_anterior: 'vendido',
    estado_nuevo: 'disponible',
    cambiado_por: user!.id,
  })

  redirect(
    `/admin/lotes/${loteId}?ok=${encodeURIComponent('Lote rescindido: vuelve a estar disponible para vender.')}`
  )
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
    .select('id, numero, saldo_pendiente')
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
    .select('numero, plan')
    .eq('lote_id', loteId)
    .eq('ciclo', lote!.ciclo_actual)

  const numeroInicial = Math.max(0, ...(cuotasDelCiclo ?? []).map((cuota) => cuota.numero)) + 1

  // El PLAN, en cambio, sí arranca uno más arriba (migración 0063). Es lo
  // que después permite decirle al cliente "cuota 25 — 2 de 20 del plan
  // refinanciado" en vez de un 25 suelto que no le dice nada al lado de la
  // 10 que acaba de terminar de pagar.
  const planNuevo = Math.max(1, ...(cuotasDelCiclo ?? []).map((cuota) => cuota.plan)) + 1

  const cuotasNuevas =
    modo === 'manual'
      ? generarCuotasManual(montosManuales, fechaPrimeraCuotaNueva)
      : generarCuotas(cantidadNueva, calcularMontoCuota(totalDeuda, cantidadNueva), fechaPrimeraCuotaNueva, totalDeuda)

  const { error: errorInsertarCuotas } = await admin.from('cuotas').insert(
    cuotasNuevas.map((cuota) => ({
      lote_id: loteId,
      numero: numeroInicial + cuota.numero - 1,
      ciclo: lote!.ciclo_actual,
      plan: planNuevo,
      monto_base: cuota.montoBase,
      saldo_pendiente: cuota.montoBase,
      fecha_vencimiento: cuota.fechaVencimiento,
    }))
  )

  if (errorInsertarCuotas) {
    redirect(`/admin/lotes/${loteId}?error=${encodeURIComponent(mensajeDeError(errorInsertarCuotas))}`)
  }

  // Qué cuotas entraron y cuáles salieron, por número (08/09, pedido de
  // Gabriel). Antes el evento solo decía CUÁNTAS eran, y meses después
  // "2 cuotas → 1 cuota nueva" no alcanza para reconstruir la historia del
  // lote: hay que poder leer "pagó hasta la 20, se refinanciaron la 21 a la
  // 30, y de ahí en más paga la 31 a la 40".
  const numerosRefinanciados = cuotasConSaldo!.map((cuota) => cuota.numero)
  const numerosNuevos = cuotasNuevas.map((cuota) => numeroInicial + cuota.numero - 1)

  await admin.from('lote_historial_estados').insert({
    lote_id: loteId,
    evento: 'refinanciado',
    cambiado_por: user!.id,
    detalle:
      `Deuda de ${totalDeuda} ${lote!.moneda} — ` +
      `cuota ${listarNumerosDeCuota(numerosRefinanciados)} ` +
      `(${cuotasConSaldo!.length}) → cuota ${listarNumerosDeCuota(numerosNuevos)} ` +
      `(${cantidadNueva} nueva(s))`,
  })

  // Las cuotas nuevas nacen sin destino de cobro, así que la campana tiene
  // que volver a mirar: puede aparecer un "no hay a dónde pagar" que hasta
  // recién no existía.
  revalidarNotificaciones()

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

  const supabase = await createClient()
  const volver = `/admin/lotes/${loteId}/distribucion`

  // Quién deja de ser integrante con este cambio (15/09, pedido de Gabriel):
  // cambiar el vendedor o el acreedor saca al anterior del lote igual que el
  // botón "Quitar" de su ficha, así que sus cuotas sin cobrar se resuelven
  // de la misma forma y con el mismo aviso previo. Sin esto quedaba
  // repartido en cuotas de un lote del que ya no participa.
  const { data: loteActual } = await supabase
    .from('lotes')
    .select('admin_id, acreedor_id, vendedor_id, ciclo_actual')
    .eq('id', loteId)
    .single()

  if (!loteActual) {
    redirect(`${volver}?error=${encodeURIComponent('No se encontró el lote')}`)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: administradores } = await supabase.from('profiles').select('id').eq('role', 'administrador')
  const adminEfectivo = (adminIdActual: string | null) =>
    resolverAdminPorDefecto({
      adminIdActual,
      administradores: administradores ?? [],
      usuarioActualId: user?.id ?? null,
      usuarioActualEsAdministrador: true,
    })
  const { data: participantes } = await supabase
    .from('lote_participantes')
    .select('profile_id')
    .eq('lote_id', loteId)

  const siguen = new Set(
    [adminEfectivo(adminId), acreedorId, vendedorId, ...(participantes ?? []).map((p) => p.profile_id)].filter(
      (valor): valor is string => Boolean(valor)
    )
  )
  const salen = [
    ...new Set(
      [adminEfectivo(loteActual!.admin_id), loteActual!.acreedor_id, loteActual!.vendedor_id].filter(
        (valor): valor is string => Boolean(valor)
      )
    ),
  ].filter((idPersona) => !siguen.has(idPersona))

  const confirmados = new Set(formData.getAll('confirmarSalida').map(String))
  const salenConCambios: { id: string; nombre: string }[] = []

  if (salen.length > 0) {
    const vinculos = await cargarVinculosDelLote(supabase, loteId, loteActual!.ciclo_actual)

    for (const idPersona of salen) {
      const nombre = await nombreDeCuenta(supabase, idPersona, null)
      const vinculosDeLaPersona = vinculos.de(`profile:${idPersona}`)
      const { bloqueo } = avisoDeSalida(nombre, vinculosDeLaPersona)

      if (bloqueo) {
        redirect(`${volver}?error=${encodeURIComponent(`No se guardó el cambio de roles. ${bloqueo}`)}`)
      }

      if (!cambiaAlgoAlQuitarlo(vinculosDeLaPersona)) continue

      // El formulario manda a quién le mostró el aviso. Si no está, la
      // pantalla estaba vieja (alguien le asignó cuotas en el medio): no se
      // saca a nadie de sus cuotas sin que se haya visto el aviso.
      if (!confirmados.has(idPersona)) {
        redirect(
          `${volver}?error=${encodeURIComponent(
            `No se guardó el cambio de roles: ${nombre} tiene cuotas asignadas en este lote. Elegí el cambio de nuevo y leé el aviso antes de guardar.`
          )}`
        )
      }

      salenConCambios.push({ id: idPersona, nombre })
    }
  }

  const { error } = await supabase
    .from('lotes')
    .update({
      admin_id: adminId,
      acreedor_id: acreedorId,
      vendedor_id: vendedorId,
    })
    .eq('id', loteId)

  if (error) {
    redirect(`${volver}?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  const mensajes = ['Datos de cobro guardados.']

  for (const persona of salenConCambios) {
    const { data: resultado, error: errorSalida } = await supabase.rpc('quitar_integrante_lote', {
      p_lote_id: loteId,
      p_profile_id: persona.id,
      p_cuenta_externa_id: null,
    })

    if (errorSalida) {
      console.error('quitar_integrante_lote (cambio de roles):', errorSalida)
      redirect(
        `${volver}?error=${encodeURIComponent(
          `Los roles se guardaron, pero no se pudo sacar a ${persona.nombre} de sus cuotas sin cobrar. Probá quitarlo de nuevo.`
        )}`
      )
    }

    mensajes.push(mensajeDeSalidaHecha(persona.nombre, resultado))
  }

  if (salenConCambios.length > 0) revalidarNotificaciones()

  redirect(`${volver}?ok=${encodeURIComponent(mensajes.join(' '))}`)
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

// Condonar el interés moratorio de una o de todas las cuotas del lote
// (08/09, migración 0059). Pedido de Nicolás: el interés no es solo un
// número que se cobra, es con lo que negocia para destrabar una deuda
// parada ("pagame el capital y te saco los intereses").
//
// Es un interruptor, no un monto: perdonar "los $50.000 de hoy" haría
// reaparecer intereses mañana, porque la mora se recalcula a diario contra
// la fecha de vencimiento. Con esto la cuota deja de generar interés, y se
// puede volver atrás si el cliente no cumple lo que prometió.
export async function condonarInteresMoratorio(loteId: string, formData: FormData) {
  await requireAdministrador()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const destino = `/admin/lotes/${loteId}`
  // Varias cuotas de una (08/09, pedido de Gabriel): el caso real es
  // "arreglamos por las tres vencidas", no una sola. Se eligen con casillas
  // y llegan todas bajo el mismo nombre.
  const numerosElegidos = formData
    .getAll('numero')
    .map((valor) => Number(valor))
    .filter((numero) => Number.isInteger(numero))
  const motivo = ((formData.get('motivo') as string) || '').trim()
  const restituir = formData.get('restituir') === '1'

  const { data: lote } = await supabase
    .from('lotes')
    .select('estado, ciclo_actual')
    .eq('id', loteId)
    .single()

  if (!lote || lote.estado !== 'vendido') {
    redirect(`${destino}?error=${encodeURIComponent('Solo se puede condonar interés en un lote vendido')}`)
  }

  const admin = createAdminClient()

  if (numerosElegidos.length === 0) {
    redirect(
      `${destino}?error=${encodeURIComponent(
        restituir
          ? 'Marcá al menos una cuota a la que volver a aplicarle el interés'
          : 'Marcá al menos una cuota a la que condonarle el interés'
      )}`
    )
  }

  // El estado esperado se filtra en la consulta: condonar solo agarra las que
  // NO están condonadas y restituir solo las que sí. Si la pantalla estaba
  // vieja (otro admin ya lo hizo), no pasa nada raro, simplemente no encuentra
  // esa cuota. Y solo las que deben algo: condonarle el interés a una cuota ya
  // paga no cambia ningún número y solo ensucia el historial.
  const { data: cuotas } = await admin
    .from('cuotas')
    .select('id, numero')
    .eq('lote_id', loteId)
    .eq('ciclo', lote!.ciclo_actual)
    .eq('interes_condonado', restituir)
    .gt('saldo_pendiente', 0)
    .in('numero', numerosElegidos)

  if (!cuotas || cuotas.length === 0) {
    redirect(
      `${destino}?error=${encodeURIComponent(
        restituir
          ? 'No hay ninguna cuota con el interés condonado para restituir'
          : 'No hay ninguna cuota con saldo a la que condonarle el interés'
      )}`
    )
  }

  const { error } = await admin
    .from('cuotas')
    .update(
      restituir
        ? {
            interes_condonado: false,
            interes_condonado_en: null,
            interes_condonado_por: null,
            interes_condonado_motivo: null,
          }
        : {
            interes_condonado: true,
            interes_condonado_en: new Date().toISOString(),
            interes_condonado_por: user!.id,
            interes_condonado_motivo: motivo || null,
          }
    )
    .in(
      'id',
      cuotas!.map((cuota) => cuota.id)
    )

  if (error) {
    redirect(`${destino}?error=${encodeURIComponent(mensajeDeError(error))}`)
  }

  const numeros = listarNumerosDeCuota(cuotas!.map((cuota) => cuota.numero))

  // Queda en el historial del lote porque es una decisión comercial con
  // plata adentro, no un ajuste técnico: meses después hay que poder ver
  // quién perdonó qué y por qué.
  await admin.from('lote_historial_estados').insert({
    lote_id: loteId,
    evento: restituir ? 'interes_restituido' : 'interes_condonado',
    cambiado_por: user!.id,
    detalle: restituir
      ? `Se volvió a aplicar el interés moratorio a la cuota ${numeros}`
      : `Interés moratorio condonado en la cuota ${numeros}${motivo ? ` — ${motivo}` : ''}`,
  })

  redirect(
    `${destino}?ok=${encodeURIComponent(
      restituir
        ? `Interés moratorio restituido en la cuota ${numeros}`
        : `Interés moratorio condonado en la cuota ${numeros}`
    )}`
  )
}


// Cambiar el monto de cuotas que todavia no pasaron por nada (10/09, pedido
// de Gabriel: "poder modificar sin necesidad de refinanciar, para darle
// flexibilidad a Nico").
//
// Las condiciones de que cuota se puede tocar viven en lib/cuotas/editar-monto
// y se vuelven a chequear ACA, no solo en la pantalla: entre que Nicolas abrio
// el lote y apreto Guardar pudo entrar un pago del cliente. El <select> de la
// pantalla limita lo que se ve, no lo que llega.
export async function cambiarMontoDeCuotas(loteId: string, formData: FormData) {
  await requireAdministrador()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const destino = `/admin/lotes/${loteId}`

  const { data: lote } = await supabase
    .from('lotes')
    .select('estado, ciclo_actual, moneda')
    .eq('id', loteId)
    .single()

  if (!lote) {
    redirect(`${destino}?error=${encodeURIComponent('No se encontro el lote')}`)
  }

  const admin = createAdminClient()
  const hoy = hoyArgentina()

  const { data: cuotas } = await admin
    .from('cuotas')
    .select(
      'id, numero, monto_base, monto_ajustado, saldo_pendiente, fecha_vencimiento, refinanciada, migrada'
    )
    .eq('lote_id', loteId)
    .eq('ciclo', lote!.ciclo_actual)
    .order('numero', { ascending: true })

  if (!cuotas || cuotas.length === 0) {
    redirect(`${destino}?error=${encodeURIComponent('Este lote no tiene cuotas')}`)
  }

  const editables = await cuotasConMontoEditable(admin, loteId, lote!.ciclo_actual, cuotas!, hoy)

  const entradas = cuotas!.map((cuota) => ({
    numero: cuota.numero,
    montoTexto: ((formData.get(`montoCuota${cuota.numero}`) as string) || '').trim(),
  }))

  const { cambios, errores } = leerMontosNuevos(entradas, editables)

  if (errores.length > 0) {
    redirect(
      `${destino}?error=${encodeURIComponent(
        `No se cambio nada. Revisa: ${errores
          .map((error) => `cuota ${error.numero} (${error.motivo})`)
          .join(', ')}`
      )}`
    )
  }

  if (cambios.length === 0) {
    redirect(
      `${destino}?error=${encodeURIComponent('Escribi el monto nuevo de al menos una cuota')}`
    )
  }

  const cuotaPorNumero = new Map(cuotas!.map((cuota) => [cuota.numero, cuota]))

  // Todo o nada: si falla una, se corta y se avisa cual. Se hace en orden de
  // numero de cuota para que el mensaje sea reconstruible.
  for (const cambio of cambios) {
    const cuota = cuotaPorNumero.get(cambio.numero)!
    const { error } = await admin
      .from('cuotas')
      .update({
        monto_base: cambio.montoNuevo,
        monto_ajustado: cambio.montoNuevo,
        saldo_pendiente: cambio.montoNuevo,
      })
      .eq('id', cuota.id)
      // Candado final contra una carrera: si entre la lectura de arriba y
      // este update alguien imputo plata, el saldo ya no es el que leimos y
      // esta condicion no matchea ninguna fila.
      .eq('saldo_pendiente', cuota.saldo_pendiente)

    if (error) {
      redirect(
        `${destino}?error=${encodeURIComponent(
          `Se cambiaron las cuotas anteriores, pero fallo la ${cambio.numero}: ${mensajeDeError(error)}`
        )}`
      )
    }
  }

  const detalle = cambios
    .map((cambio) => {
      const cuota = cuotaPorNumero.get(cambio.numero)!
      return `cuota ${cambio.numero}: ${cuota.monto_ajustado} -> ${cambio.montoNuevo}`
    })
    .join(', ')

  const motivo = ((formData.get('motivo') as string) || '').trim()

  await admin.from('lote_historial_estados').insert({
    lote_id: loteId,
    evento: 'monto_cuota_cambiado',
    cambiado_por: user!.id,
    detalle: `${detalle} ${lote!.moneda}${motivo ? ` — ${motivo}` : ''}`,
  })

  // El monto de una cuota es lo que el cliente ve en su portal y lo que se
  // reparte entre los acreedores: la campana tiene que volver a mirar.
  revalidarNotificaciones()

  redirect(
    `${destino}?ok=${encodeURIComponent(
      cambios.length === 1
        ? `Monto de la cuota ${cambios[0].numero} actualizado`
        : `Monto actualizado en ${cambios.length} cuotas`
    )}`
  )
}

// Que cuotas del lote se pueden editar HOY. Es la misma cuenta que hace la
// pantalla, y vive en una funcion sola para que las dos miren exactamente lo
// mismo: si la pantalla ofreciera una cuota que la accion rechaza, el
// resultado seria un error incomprensible despues de haber tipeado.
export async function cuotasConMontoEditable(
  admin: ReturnType<typeof createAdminClient>,
  loteId: string,
  ciclo: number,
  cuotas: {
    id: string
    numero: number
    monto_base: number
    monto_ajustado: number
    saldo_pendiente: number
    fecha_vencimiento: string
    refinanciada: boolean
    migrada: boolean
  }[],
  hoy: string
): Promise<Map<number, CuotaEditable>> {
  const cuotaIds = cuotas.map((cuota) => cuota.id)

  const [imputaciones, imputacionesMora, pagosPendientes, ajustes] = await Promise.all([
    admin.from('pago_imputaciones').select('cuota_id').in('cuota_id', cuotaIds),
    admin.from('pago_imputaciones_mora').select('cuota_id').in('cuota_id', cuotaIds),
    admin
      .from('pagos')
      .select('cuota_origen_id')
      .eq('lote_id', loteId)
      .not('cuota_origen_id', 'is', null)
      .neq('estado', 'rechazado'),
    admin.from('ajustes_indexacion').select('fecha_desde').eq('lote_id', loteId).eq('ciclo', ciclo),
  ])

  const conPlata = new Set<string>([
    ...(imputaciones.data ?? []).map((fila) => fila.cuota_id),
    ...(imputacionesMora.data ?? []).map((fila) => fila.cuota_id),
  ])
  const conComprobante = new Set<string>(
    (pagosPendientes.data ?? []).map((fila) => fila.cuota_origen_id as string)
  )
  const mesesIndexados = new Set<string>((ajustes.data ?? []).map((fila) => fila.fecha_desde))

  const editables = new Map<number, CuotaEditable>()

  for (const cuota of cuotas) {
    const candidata: CuotaEditable = {
      numero: cuota.numero,
      montoBase: cuota.monto_base,
      montoAjustado: cuota.monto_ajustado,
      saldoPendiente: cuota.saldo_pendiente,
      fechaVencimiento: cuota.fecha_vencimiento,
      refinanciada: cuota.refinanciada,
      migrada: cuota.migrada,
      tieneAjustePorIndice: mesesIndexados.has(mesDeFecha(cuota.fecha_vencimiento)),
      tienePlataImputada: conPlata.has(cuota.id),
      tieneComprobantePendiente: conComprobante.has(cuota.id),
    }

    if (sePuedeEditarElMonto(candidata, hoy)) editables.set(cuota.numero, candidata)
  }

  return editables
}
