'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { revalidarNotificaciones } from '@/lib/notificaciones/revalidar'
import { leerPorcentaje } from '@/lib/lotes/reparto-por-porcentaje'

interface FilaValida {
  profile_id: string | null
  cuenta_externa_id: string | null
  monto: number
}

function leerFilas(formData: FormData, nombreParticipante: string, nombreMonto: string) {
  const participantes = formData.getAll(nombreParticipante) as string[]
  const montos = formData.getAll(nombreMonto) as string[]
  return participantes.map((participanteKey, indice) => ({
    participanteKey,
    monto: montos[indice] ?? '',
  }))
}

function parseParticipanteKey(key: string): { profile_id: string | null; cuenta_externa_id: string | null } | null {
  if (key.startsWith('profile:')) {
    return { profile_id: key.slice('profile:'.length), cuenta_externa_id: null }
  }
  if (key.startsWith('externa:')) {
    return { profile_id: null, cuenta_externa_id: key.slice('externa:'.length) }
  }
  return null
}

// Filas sin participante elegido o con un monto invalido se descartan sin
// error -- son filas "en blanco" que el admin agrego y no llego a
// completar, no un error del usuario que haya que reportar.
function filasValidas(filas: { participanteKey: string; monto: string }[]): FilaValida[] {
  const resultado: FilaValida[] = []
  for (const fila of filas) {
    const participante = parseParticipanteKey(fila.participanteKey)
    const montoTexto = fila.monto.trim()
    if (!participante || montoTexto === '') continue
    const monto = Number(montoTexto)
    if (!Number.isFinite(monto) || monto < 0) continue
    resultado.push({ ...participante, monto })
  }
  return resultado
}

// Si el mismo participante aparece en mas de una fila dentro de la misma
// cuota, se suman en vez de mandar dos inserts con la misma
// clave unica -- evita un 23505 por algo que para el admin es un detalle
// menor de UI (agrego dos filas para la misma persona sin querer).
function combinarPorParticipante(filas: FilaValida[]): FilaValida[] {
  const mapa = new Map<string, FilaValida>()
  for (const fila of filas) {
    const clave = fila.profile_id ?? `externa:${fila.cuenta_externa_id}`
    const existente = mapa.get(clave)
    if (existente) {
      existente.monto = Math.round((existente.monto + fila.monto) * 100) / 100
    } else {
      mapa.set(clave, { ...fila })
    }
  }
  return Array.from(mapa.values())
}

// A quién se le puede mandar a cobrar una cuota: los mismos que aparecen en
// el selector, es decir el admin, el acreedor y el vendedor del lote más los
// participantes adicionales. Se chequea también en el servidor porque el
// <select> solo limita lo que se ve, no lo que se manda.
async function esIntegranteDelLote(
  supabase: Awaited<ReturnType<typeof createClient>>,
  loteId: string,
  lote: { admin_id: string | null; acreedor_id: string | null; vendedor_id: string | null },
  clave: string
): Promise<boolean> {
  const destino = parseParticipanteKey(clave)
  if (!destino) return false

  if (
    destino.profile_id &&
    [lote.admin_id, lote.acreedor_id, lote.vendedor_id].includes(destino.profile_id)
  ) {
    return true
  }

  // Un administrador siempre vale, aunque el lote tenga admin_id en null:
  // la pantalla lo ofrece igual, porque el admin del lote cae por defecto en
  // Nicolás (ver resolverAdminPorDefecto). Sin esta rama, elegirlo en un
  // lote viejo daría "no es integrante de este lote".
  if (destino.profile_id) {
    const { data: perfil } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', destino.profile_id)
      .maybeSingle()

    if (perfil?.role === 'administrador') return true
  }

  const consulta = supabase
    .from('lote_participantes')
    .select('id')
    .eq('lote_id', loteId)

  const { data: participante } = destino.profile_id
    ? await consulta.eq('profile_id', destino.profile_id).maybeSingle()
    : await consulta.eq('cuenta_externa_id', destino.cuenta_externa_id!).maybeSingle()

  return Boolean(participante)
}

export async function guardarDistribucionLote(loteId: string, formData: FormData) {
  await requireAdministrador()

  const supabase = await createClient()

  const { data: lote } = await supabase
    .from('lotes')
    .select('estado, ciclo_actual, admin_id, acreedor_id, vendedor_id')
    .eq('id', loteId)
    .single()

  if (!lote || lote.estado !== 'vendido') {
    redirect(
      `/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent('Este lote no está vendido, no se puede guardar una distribución')}`
    )
  }

  // Solo las cuotas VIVAS (10/09, bug encontrado por Gabriel). Una cuota
  // refinanciada ya no la va a pagar nadie: su deuda se mudo a las cuotas
  // nuevas, y su distribucion es historia -- dice a quien le correspondia
  // esa plata cuando la cuota estaba viva, que es de donde sale la cuenta
  // corriente de los acreedores.
  //
  // Que no aparezcan en el formulario no alcanza: esta accion es un
  // REEMPLAZO COMPLETO, asi que si el bucle de abajo las recorriera, no
  // encontraria nada en el formulario para ellas y les borraria el destino.
  // El mismo cuidado esta adentro de guardar_distribucion_lote (migracion
  // 0064), que es la garantia de ultimo recurso.
  const { data: todasLasCuotas } = await supabase
    .from('cuotas')
    .select('id, numero, refinanciada, cuenta_cobro_id, cuenta_cobro_externa_id')
    .eq('lote_id', loteId)
    .eq('ciclo', lote.ciclo_actual)

  if (!todasLasCuotas) {
    redirect(
      `/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent('No se encontraron las cuotas de este lote')}`
    )
  }

  const cuotas = todasLasCuotas.filter((cuota) => !cuota.refinanciada)

  // Reemplazo completo (no diff): se borra todo lo que había guardado
  // antes para este lote y se inserta de nuevo exactamente lo que llegó en
  // este envío -- coherente con el botón único "Guardar distribución" que
  // manda todo el estado del lote junto en cada submit.
  //
  // Cuánto le toca a cada uno del lote, en porcentaje (15/09). Reemplaza a
  // los "objetivos" en plata. Un campo vacío es "sin porcentaje" y no se
  // guarda; uno inválido (negativo, más de 100) tampoco.
  const porcentajesValidos = new Map<string, { profile_id: string | null; cuenta_externa_id: string | null; porcentaje: number }>()
  for (const fila of leerFilas(formData, 'porcentajeParticipante', 'porcentajeValor')) {
    const participante = parseParticipanteKey(fila.participanteKey)
    const porcentaje = leerPorcentaje(fila.monto)
    if (!participante || porcentaje === null) continue
    porcentajesValidos.set(fila.participanteKey, { ...participante, porcentaje })
  }

  const filasParaInsertar: (FilaValida & { cuota_id: string })[] = []

  for (const cuota of cuotas) {
    const filas = combinarPorParticipante(
      filasValidas(leerFilas(formData, `cuota${cuota.numero}Participante`, `cuota${cuota.numero}Monto`))
    )
    for (const fila of filas) {
      filasParaInsertar.push({ ...fila, cuota_id: cuota.id })
    }
  }

  // Borrado + inserción de objetivos y distribuciones en una única
  // transacción atómica en la base -- si algo falla a mitad de camino no
  // se pierde la distribución previamente guardada del lote.
  const { error: errorGuardar } = await supabase.rpc('guardar_distribucion_lote', {
    p_lote_id: loteId,
    p_objetivos: [...porcentajesValidos.values()],
    p_distribuciones: filasParaInsertar.map((fila) => ({
      cuota_id: fila.cuota_id,
      profile_id: fila.profile_id,
      cuenta_externa_id: fila.cuenta_externa_id,
      monto: fila.monto,
    })),
  })

  if (errorGuardar) {
    console.error('guardar_distribucion_lote:', errorGuardar)
    redirect(
      `/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent('No se pudo guardar la distribución. Probá de nuevo.')}`
    )
  }

  // Cuenta que cobra cada cuota (05/09). Va aparte del RPC de arriba porque
  // no es una fila de distribución sino una columna de la propia cuota: es
  // el alias que el cliente ve en su portal cuando va a pagar ESA cuota.
  //
  // Desde el 08/09 es el ÚNICO lugar donde se define el destino: el lote ya
  // no tiene una cuenta de cobro propia. Por eso la validación de "tiene que
  // ser alguien del lote", que antes vivía en actualizarCobro, se mudó acá.
  //
  // La validación va COMPLETA antes de escribir nada: si se validara cuota
  // por cuota dentro del mismo bucle, un destino inválido en la cuota 5
  // dejaría las cuatro primeras ya guardadas y el resto sin tocar.
  const clavesPorCuota = new Map<number, string>()

  for (const cuota of cuotas) {
    const clave = ((formData.get(`cuota${cuota.numero}CuentaCobro`) as string) || '').trim()
    clavesPorCuota.set(cuota.numero, clave)

    // Solo se valida lo que CAMBIÓ. Una cuota puede tener guardado a alguien
    // que después dejó de ser integrante del lote: su opción se sigue
    // ofreciendo para no borrarle el destino en silencio, y rechazar el
    // formulario entero por eso dejaría el lote imposible de guardar.
    const claveGuardada = cuota.cuenta_cobro_id
      ? `profile:${cuota.cuenta_cobro_id}`
      : cuota.cuenta_cobro_externa_id
        ? `externa:${cuota.cuenta_cobro_externa_id}`
        : ''

    if (clave === claveGuardada || clave === '') continue

    if (!(await esIntegranteDelLote(supabase, loteId, lote, clave))) {
      redirect(
        `/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent(
          `A quién se le transfiere la cuota ${cuota.numero} tiene que ser el admin, el acreedor, el vendedor o un participante adicional de este lote`
        )}`
      )
    }
  }

  for (const cuota of cuotas) {
    const clave = clavesPorCuota.get(cuota.numero) ?? ''
    const destino = clave ? parseParticipanteKey(clave) : null

    const { error: errorCuenta } = await supabase
      .from('cuotas')
      .update({
        cuenta_cobro_id: destino?.profile_id ?? null,
        cuenta_cobro_externa_id: destino?.cuenta_externa_id ?? null,
      })
      .eq('id', cuota.id)

    if (errorCuenta) {
      console.error('No se pudo guardar la cuenta de cobro de una cuota:', errorCuenta)
      redirect(
        `/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent(
          `La distribución se guardó, pero falló guardar a quién se le transfiere la cuota ${cuota.numero}. Probá de nuevo.`
        )}`
      )
    }
  }

  // Esta pantalla es la que resuelve dos de los avisos de la campana ("no
  // hay a dónde pagar la cuota N" y "cobraste cuotas sin repartir"), así que
  // es la que más se notaba cuando la campana quedaba desactualizada.
  revalidarNotificaciones()

  redirect(`/admin/lotes/${loteId}/distribucion?ok=1`)
}
