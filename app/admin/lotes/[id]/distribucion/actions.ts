'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'

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
// cuota (u objetivos), se suman en vez de mandar dos inserts con la misma
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

export async function guardarDistribucionLote(loteId: string, formData: FormData) {
  await requireAdministrador()

  const supabase = await createClient()

  const { data: lote } = await supabase.from('lotes').select('estado, ciclo_actual').eq('id', loteId).single()

  if (!lote || lote.estado !== 'vendido') {
    redirect(
      `/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent('Este lote no está vendido, no se puede guardar una distribución')}`
    )
  }

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, numero')
    .eq('lote_id', loteId)
    .eq('ciclo', lote.ciclo_actual)

  if (!cuotas) {
    redirect(
      `/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent('No se encontraron las cuotas de este lote')}`
    )
  }

  // Reemplazo completo (no diff): se borra todo lo que había guardado
  // antes para este lote y se inserta de nuevo exactamente lo que llegó en
  // este envío -- coherente con el botón único "Guardar distribución" que
  // manda todo el estado del lote junto en cada submit.
  const objetivosValidos = combinarPorParticipante(
    filasValidas(leerFilas(formData, 'objetivoParticipante', 'objetivoMonto'))
  )

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
    p_objetivos: objetivosValidos.map((fila) => ({
      profile_id: fila.profile_id,
      cuenta_externa_id: fila.cuenta_externa_id,
      monto: fila.monto,
    })),
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
  // Vacío = cae a la cuenta del lote, que es como funcionaba antes.
  for (const cuota of cuotas) {
    const clave = ((formData.get(`cuota${cuota.numero}CuentaCobro`) as string) || '').trim()
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

  redirect(`/admin/lotes/${loteId}/distribucion?ok=1`)
}
