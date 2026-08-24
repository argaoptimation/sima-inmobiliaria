'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import {
  calcularAjusteEncadenado,
  calcularPeriodoIndiceNecesario,
  calcularRangoMesSiguiente,
  buscarValorIndiceAplicable,
  mesDeFecha,
  type ValorIndiceDisponible,
} from '@/lib/lotes/aplicar-indexacion'
import { mensajeDeError } from '@/lib/errores'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

interface CuotaFila {
  id: string
  numero: number
  monto_base: number
  monto_ajustado: number
  saldo_pendiente: number
  fecha_vencimiento: string
}

// Recorre TODAS las cuotas de un lote en orden de vencimiento, aplicando (o
// dejando pasar) el ajuste de índice que le toca a cada una -- encadenando
// siempre desde el monto_ajustado de la cuota inmediata anterior, nunca
// desde el monto_base propio. Cubre tanto el caso normal (una cuota nueva
// por mes) como el catch-up (varios meses salteados de una sola vez, cada
// uno con el índice que le corresponda vía fallback).
//
// `limiteHasta`: no procesa cuotas que venzan en o después de ese mes --
// esta carga puntual de índice solo justifica ajustar hasta ahí, lo que
// venza después espera a que se cargue el índice que le toca.
async function aplicarCatchUpParaLote(
  supabase: SupabaseServerClient,
  loteId: string,
  indiceNombre: string,
  limiteHasta: string,
  aplicadoPor: string
) {
  const { data: valoresIndice } = await supabase
    .from('indices_valores')
    .select('periodo, valor')
    .eq('nombre', indiceNombre)

  const valoresDisponibles: ValorIndiceDisponible[] = (valoresIndice ?? []).map((v) => ({
    periodo: v.periodo,
    valor: v.valor,
  }))

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, numero, monto_base, monto_ajustado, saldo_pendiente, fecha_vencimiento')
    .eq('lote_id', loteId)
    .order('fecha_vencimiento', { ascending: true })

  if (!cuotas || cuotas.length === 0) return

  const { data: ajustesExistentes } = await supabase
    .from('ajustes_indexacion')
    .select('fecha_desde, indice_periodo')
    .eq('lote_id', loteId)

  // Un placeholder en 0% (indice_periodo null, ver recalcularCuotaYPropagar)
  // NO cuenta como "ya procesado" -- sigue elegible para que un catch-up
  // futuro lo tome apenas se cargue un valor real para ese mes.
  const mesesYaProcesados = new Set(
    (ajustesExistentes ?? []).filter((a) => a.indice_periodo !== null).map((a) => a.fecha_desde)
  )

  let montoAjustadoAnterior: number | null = null

  for (const cuota of cuotas as CuotaFila[]) {
    const mesCuota = mesDeFecha(cuota.fecha_vencimiento)

    // Cuota ya saldada: ancla fija de la cadena, nunca se revisa -- mismo
    // criterio "nunca retroactivo" que ya regía antes.
    if (cuota.saldo_pendiente <= 0) {
      montoAjustadoAnterior = cuota.monto_ajustado
      continue
    }

    if (mesesYaProcesados.has(mesCuota) || mesCuota >= limiteHasta) {
      montoAjustadoAnterior = cuota.monto_ajustado
      continue
    }

    const periodoNecesario = calcularPeriodoIndiceNecesario(cuota.fecha_vencimiento)
    const valorAplicable = buscarValorIndiceAplicable(periodoNecesario, valoresDisponibles)

    if (!valorAplicable) {
      // Ni el mes exacto ni ninguno anterior tiene valor cargado todavía.
      montoAjustadoAnterior = cuota.monto_ajustado
      continue
    }

    const baseParaEncadenar = montoAjustadoAnterior ?? cuota.monto_ajustado
    const ajuste = calcularAjusteEncadenado(valorAplicable.valor, baseParaEncadenar, {
      id: cuota.id,
      montoAjustado: cuota.monto_ajustado,
      saldoPendiente: cuota.saldo_pendiente,
      fechaVencimiento: cuota.fecha_vencimiento,
    })

    const { error: errorAjuste } = await supabase.from('ajustes_indexacion').insert({
      lote_id: loteId,
      porcentaje: valorAplicable.valor,
      fecha_desde: mesCuota,
      indice_nombre: indiceNombre,
      indice_periodo: valorAplicable.periodo,
      aplicado_por: aplicadoPor,
    })

    if (errorAjuste) {
      console.error('No se pudo registrar el ajuste automático de índice:', errorAjuste)
      montoAjustadoAnterior = cuota.monto_ajustado
      continue
    }

    const { error: errorSaldo } = await supabase
      .from('cuotas')
      .update({ monto_ajustado: ajuste.montoAjustadoNuevo, saldo_pendiente: ajuste.saldoPendienteNuevo })
      .eq('id', cuota.id)

    if (errorSaldo) {
      console.error('No se pudo actualizar el saldo de una cuota tras el ajuste automático:', errorSaldo)
    }

    montoAjustadoAnterior = ajuste.montoAjustadoNuevo
  }
}

// Recalcula el ajuste de UNA cuota puntual (identificada por lote+mes) con
// un nuevo valor aplicable (o revierte a "sin ajuste" si es null, caso
// eliminación) y PROPAGA el cambio en cadena hacia las cuotas siguientes
// que ya tenían su propio ajuste calculado a partir de esta -- se detiene
// al llegar a una cuota saldada (ancla fija) o a una todavía sin procesar.
async function recalcularCuotaYPropagar(
  supabase: SupabaseServerClient,
  loteId: string,
  fechaDesdeCuota: string,
  nuevoValorAplicable: ValorIndiceDisponible | null,
  indiceNombre: string,
  aplicadoPor: string
) {
  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, numero, monto_base, monto_ajustado, saldo_pendiente, fecha_vencimiento')
    .eq('lote_id', loteId)
    .order('fecha_vencimiento', { ascending: true })

  if (!cuotas || cuotas.length === 0) return

  const filas = cuotas as CuotaFila[]
  const indiceCuota = filas.findIndex((c) => mesDeFecha(c.fecha_vencimiento) === fechaDesdeCuota)
  if (indiceCuota === -1) return

  const cuotaObjetivo = filas[indiceCuota]
  if (cuotaObjetivo.saldo_pendiente <= 0) return // saldada, no se revisita

  const cuotaAnterior = indiceCuota > 0 ? filas[indiceCuota - 1] : null
  const montoAjustadoBase = cuotaAnterior?.monto_ajustado ?? cuotaObjetivo.monto_base

  const pagado = cuotaObjetivo.monto_ajustado - cuotaObjetivo.saldo_pendiente
  const montoAjustadoNuevo = nuevoValorAplicable
    ? Math.round(montoAjustadoBase * (1 + nuevoValorAplicable.valor / 100) * 100) / 100
    : Math.round(montoAjustadoBase * 100) / 100
  const saldoPendienteNuevo = Math.max(0, Math.round((montoAjustadoNuevo - pagado) * 100) / 100)

  // Siempre queda una fila (nunca se borra sin reemplazo): si no hay
  // ningún valor aplicable, se deja un "placeholder" en 0% con
  // indice_periodo null. Esto es necesario para que la cadena la siga
  // atravesando más adelante -- si se borrara del todo, una cuota
  // siguiente ya no tendría de dónde heredar el monto correcto la
  // próxima vez que se corrija o elimine un valor más viejo (bug real
  // encontrado el 24/08). `indice_periodo is null` es justamente lo que
  // distingue un placeholder de un ajuste real -- aplicarCatchUpParaLote
  // sigue tratando el mes como "sin cargar todavía" y lo vuelve a
  // procesar solo si en el futuro se carga un valor de verdad.
  await supabase.from('ajustes_indexacion').delete().eq('lote_id', loteId).eq('fecha_desde', fechaDesdeCuota)
  await supabase.from('ajustes_indexacion').insert({
    lote_id: loteId,
    porcentaje: nuevoValorAplicable?.valor ?? 0,
    fecha_desde: fechaDesdeCuota,
    indice_nombre: nuevoValorAplicable ? indiceNombre : null,
    indice_periodo: nuevoValorAplicable?.periodo ?? null,
    aplicado_por: aplicadoPor,
  })

  await supabase
    .from('cuotas')
    .update({ monto_ajustado: montoAjustadoNuevo, saldo_pendiente: saldoPendienteNuevo })
    .eq('id', cuotaObjetivo.id)

  // Cascada: las cuotas siguientes que YA tenían un ajuste calculado a
  // partir de esta necesitan recalcularse con la nueva base -- mismo %
  // que ya tenían, solo cambia de qué monto parten.
  const { data: ajustesSiguientes } = await supabase
    .from('ajustes_indexacion')
    .select('fecha_desde, porcentaje, indice_nombre, indice_periodo')
    .eq('lote_id', loteId)
    .gt('fecha_desde', fechaDesdeCuota)
    .order('fecha_desde', { ascending: true })

  let baseAnterior = montoAjustadoNuevo
  for (let i = indiceCuota + 1; i < filas.length; i++) {
    const cuota = filas[i]

    if (cuota.saldo_pendiente <= 0) break // ancla fija, la cascada no la cruza

    const mesCuota = mesDeFecha(cuota.fecha_vencimiento)
    const ajusteExistente = (ajustesSiguientes ?? []).find((a) => a.fecha_desde === mesCuota)
    if (!ajusteExistente) break // todavía no procesada, se resuelve sola después

    const pagadoCuota = cuota.monto_ajustado - cuota.saldo_pendiente
    const montoAjustadoRecalculado =
      Math.round(baseAnterior * (1 + ajusteExistente.porcentaje / 100) * 100) / 100
    const saldoPendienteRecalculado = Math.max(
      0,
      Math.round((montoAjustadoRecalculado - pagadoCuota) * 100) / 100
    )

    await supabase
      .from('cuotas')
      .update({ monto_ajustado: montoAjustadoRecalculado, saldo_pendiente: saldoPendienteRecalculado })
      .eq('id', cuota.id)

    baseAnterior = montoAjustadoRecalculado
  }
}

// Todas las (lote_id, fecha_desde) cuyo ajuste se calculó usando un
// período de índice puntual (exacto o como fallback) -- lo que hace falta
// tocar al corregir o eliminar ese valor.
async function buscarAjustesQueUsaronPeriodo(
  supabase: SupabaseServerClient,
  indiceNombre: string,
  periodo: string
) {
  const { data } = await supabase
    .from('ajustes_indexacion')
    .select('lote_id, fecha_desde')
    .eq('indice_nombre', indiceNombre)
    .eq('indice_periodo', periodo)

  return data ?? []
}

export async function cargarValorIndice(formData: FormData) {
  await requireAdministrador()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const nombreNuevo = ((formData.get('nombreNuevo') as string) || '').trim()
  const nombreExistente = ((formData.get('nombreExistente') as string) || '').trim()
  const nombre = nombreNuevo || nombreExistente

  const mesInput = (formData.get('periodo') as string) || ''
  const valorRaw = ((formData.get('valor') as string) || '').trim()
  const valor = Number(valorRaw)

  if (!nombre) {
    redirect(`/admin/indices?error=${encodeURIComponent('Elegí un índice existente o escribí el nombre de uno nuevo')}`)
  }

  if (!/^\d{4}-\d{2}$/.test(mesInput)) {
    redirect(`/admin/indices?error=${encodeURIComponent('Elegí un mes válido')}`)
  }

  if (!valorRaw || !Number.isFinite(valor) || valor < -100 || valor > 1000) {
    redirect(`/admin/indices?error=${encodeURIComponent('Ingresá un porcentaje válido')}`)
  }

  const periodo = `${mesInput}-01`

  const { error: errorInsert } = await supabase.from('indices_valores').insert({
    nombre,
    periodo,
    valor,
    cargado_por: user!.id,
  })

  if (errorInsert) {
    const mensaje = mensajeDeError(errorInsert, {
      '23505': `Ya se cargó un valor de "${nombre}" para ese mes`,
    })
    redirect(`/admin/indices?error=${encodeURIComponent(mensaje)}`)
  }

  // Aplicación automática con catch-up: no solo la cuota del mes siguiente
  // a ESTE valor, sino cualquier mes anterior que haya quedado sin ajustar
  // por no tener su propio valor cargado a tiempo (usa fallback al último
  // disponible -- ver aplicarCatchUpParaLote).
  const { hastaExclusive: limiteHasta } = calcularRangoMesSiguiente(periodo)

  const { data: lotesConEsteIndice } = await supabase
    .from('lotes')
    .select('id')
    .eq('moneda', 'ARS')
    .eq('indice_tipo', nombre)

  for (const lote of lotesConEsteIndice ?? []) {
    await aplicarCatchUpParaLote(supabase, lote.id, nombre, limiteHasta, user!.id)
  }

  redirect('/admin/indices')
}

// Corrige el valor de un índice YA cargado -- solo el mes más reciente (no
// se puede reabrir uno viejo si ya hay otro más nuevo cargado después).
// Recalcula, para cada cuota que haya usado este período (exacto o vía
// fallback), su ajuste con el % nuevo, y propaga el cambio en cadena hacia
// las cuotas siguientes de cada lote.
export async function corregirValorIndice(formData: FormData) {
  await requireAdministrador()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const nombre = ((formData.get('nombre') as string) || '').trim()
  const periodo = ((formData.get('periodo') as string) || '').trim()
  const valorNuevoRaw = ((formData.get('valorNuevo') as string) || '').trim()
  const valorNuevo = Number(valorNuevoRaw)

  if (!nombre || !periodo) {
    redirect(`/admin/indices?error=${encodeURIComponent('Faltan datos para corregir el índice')}`)
  }

  if (!valorNuevoRaw || !Number.isFinite(valorNuevo) || valorNuevo < -100 || valorNuevo > 1000) {
    redirect(`/admin/indices?error=${encodeURIComponent('Ingresá un porcentaje válido')}`)
  }

  const { data: masReciente } = await supabase
    .from('indices_valores')
    .select('periodo')
    .eq('nombre', nombre)
    .order('periodo', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!masReciente || masReciente.periodo !== periodo) {
    redirect(
      `/admin/indices?error=${encodeURIComponent(
        'Solo se puede corregir el mes más reciente cargado de este índice'
      )}`
    )
  }

  const { error: errorUpdate } = await supabase
    .from('indices_valores')
    .update({ valor: valorNuevo })
    .eq('nombre', nombre)
    .eq('periodo', periodo)

  if (errorUpdate) {
    redirect(`/admin/indices?error=${encodeURIComponent(mensajeDeError(errorUpdate))}`)
  }

  const afectados = await buscarAjustesQueUsaronPeriodo(supabase, nombre, periodo)

  for (const { lote_id, fecha_desde } of afectados) {
    await recalcularCuotaYPropagar(
      supabase,
      lote_id,
      fecha_desde,
      { periodo, valor: valorNuevo },
      nombre,
      user!.id
    )
  }

  redirect(`/admin/indices?ok=${encodeURIComponent('Índice corregido')}`)
}

// Elimina el valor MÁS RECIENTE cargado de un índice (mismo límite que
// corregirValorIndice). Recalcula cada cuota que lo había usado (exacto o
// vía fallback) con el valor aplicable que quede DESPUÉS de borrar este
// (uno más viejo, o ninguno), y propaga en cadena igual que la corrección.
export async function eliminarValorIndice(formData: FormData) {
  await requireAdministrador()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const nombre = ((formData.get('nombre') as string) || '').trim()
  const periodo = ((formData.get('periodo') as string) || '').trim()

  if (!nombre || !periodo) {
    redirect(`/admin/indices?error=${encodeURIComponent('Faltan datos para eliminar el índice')}`)
  }

  const { data: masReciente } = await supabase
    .from('indices_valores')
    .select('periodo')
    .eq('nombre', nombre)
    .order('periodo', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!masReciente || masReciente.periodo !== periodo) {
    redirect(
      `/admin/indices?error=${encodeURIComponent(
        'Solo se puede eliminar el mes más reciente cargado de este índice'
      )}`
    )
  }

  const afectados = await buscarAjustesQueUsaronPeriodo(supabase, nombre, periodo)

  const { data: valoresRestantes } = await supabase
    .from('indices_valores')
    .select('periodo, valor')
    .eq('nombre', nombre)
    .neq('periodo', periodo)

  const valoresDisponibles: ValorIndiceDisponible[] = (valoresRestantes ?? []).map((v) => ({
    periodo: v.periodo,
    valor: v.valor,
  }))

  for (const { lote_id, fecha_desde } of afectados) {
    const periodoNecesario = calcularPeriodoIndiceNecesario(fecha_desde)
    const fallback = buscarValorIndiceAplicable(periodoNecesario, valoresDisponibles)
    await recalcularCuotaYPropagar(supabase, lote_id, fecha_desde, fallback, nombre, user!.id)
  }

  const { error: errorDelete } = await supabase
    .from('indices_valores')
    .delete()
    .eq('nombre', nombre)
    .eq('periodo', periodo)

  if (errorDelete) {
    redirect(`/admin/indices?error=${encodeURIComponent(mensajeDeError(errorDelete))}`)
  }

  redirect(`/admin/indices?ok=${encodeURIComponent('Índice eliminado')}`)
}
