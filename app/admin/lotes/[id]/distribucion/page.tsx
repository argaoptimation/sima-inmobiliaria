import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { obtenerCuotasSinDistribucion } from '@/lib/cuenta-corriente/cuotas-sin-distribucion'
import { guardarDistribucionLote } from './actions'
import { DistribucionCuotas } from './DistribucionCuotas'

export default async function DistribucionLotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; ok?: string }>
}) {
  const { id } = await params
  const { error, ok } = await searchParams

  await requireAdministrador()

  const supabase = await createClient()

  const { data: lote } = await supabase.from('lotes').select('id, identificador, moneda, estado').eq('id', id).single()

  if (!lote) {
    notFound()
  }

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, numero, monto_base')
    .eq('lote_id', id)
    .order('numero', { ascending: true })

  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['administrador', 'acreedor', 'vendedor', 'cobrador'])
    .order('full_name')

  const { data: cuentasExternas } = await supabase.from('cuentas_externas').select('id, nombre').order('nombre')

  const participantesElegibles = [
    ...(staff ?? []).map((persona) => ({
      key: `profile:${persona.id}`,
      nombre: `${persona.full_name} (${persona.role})`,
    })),
    ...(cuentasExternas ?? []).map((cuentaExterna) => ({
      key: `externa:${cuentaExterna.id}`,
      nombre: `${cuentaExterna.nombre} (cuenta externa)`,
    })),
  ]

  const { data: objetivos } = await supabase
    .from('lote_distribucion_objetivos')
    .select('profile_id, cuenta_externa_id, monto_objetivo')
    .eq('lote_id', id)

  const objetivosIniciales = (objetivos ?? []).map((objetivo) => ({
    participanteKey: objetivo.profile_id
      ? `profile:${objetivo.profile_id}`
      : `externa:${objetivo.cuenta_externa_id}`,
    monto: String(objetivo.monto_objetivo),
  }))

  const cuotaIds = (cuotas ?? []).map((cuota) => cuota.id)
  const { data: distribuciones } =
    cuotaIds.length > 0
      ? await supabase
          .from('cuota_distribuciones')
          .select('cuota_id, profile_id, cuenta_externa_id, monto')
          .in('cuota_id', cuotaIds)
      : { data: [] }

  const distribucionesIniciales: Record<number, { participanteKey: string; monto: string }[]> = {}
  for (const cuota of cuotas ?? []) {
    distribucionesIniciales[cuota.numero] = (distribuciones ?? [])
      .filter((distribucion) => distribucion.cuota_id === cuota.id)
      .map((distribucion) => ({
        participanteKey: distribucion.profile_id
          ? `profile:${distribucion.profile_id}`
          : `externa:${distribucion.cuenta_externa_id}`,
        monto: String(distribucion.monto),
      }))
  }

  // Un profile guardado en objetivos/distribuciones puede haber cambiado de
  // role desde entonces y ya no aparecer en participantesElegibles -- si eso
  // pasa, su <select> no tiene ninguna opción que matchee el value inicial y
  // el HTML estándar no manda ningún valor para ese campo, desalineando por
  // posición todas las filas siguientes de esa cuota respecto a sus montos.
  // Se agregan acá esos profiles "huérfanos" con su nombre real para que el
  // <select> siempre tenga una opción que matchee, sin importar el role actual.
  const clavesConocidas = new Set(participantesElegibles.map((p) => p.key))
  const clavesUsadas = new Set<string>()
  for (const fila of objetivosIniciales) clavesUsadas.add(fila.participanteKey)
  for (const filas of Object.values(distribucionesIniciales)) {
    for (const fila of filas) clavesUsadas.add(fila.participanteKey)
  }

  const profileIdsFaltantes = Array.from(clavesUsadas)
    .filter((clave) => clave.startsWith('profile:') && !clavesConocidas.has(clave))
    .map((clave) => clave.slice('profile:'.length))

  if (profileIdsFaltantes.length > 0) {
    const { data: perfilesFaltantes } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('id', profileIdsFaltantes)

    for (const perfil of perfilesFaltantes ?? []) {
      participantesElegibles.push({
        key: `profile:${perfil.id}`,
        nombre: `${perfil.full_name} (${perfil.role})`,
      })
    }
  }

  const guardarDistribucionConId = guardarDistribucionLote.bind(null, id)

  const cuotasSinDistribucion = await obtenerCuotasSinDistribucion(supabase, id)

  return (
    <main className="max-w-4xl">
      <div className="mb-4 flex gap-4">
        <a href="/admin/lotes" className="text-sm underline">
          ← Volver a Lotes
        </a>
        <a href={`/admin/lotes/${id}`} className="text-sm underline">
          ← Volver al lote
        </a>
      </div>
      <h1 className="mb-6 text-xl font-semibold">Distribución de cuotas — {lote!.identificador}</h1>

      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      {ok && <p className="mb-4 rounded bg-green-100 p-2 text-sm text-green-700">Distribución guardada.</p>}

      {cuotasSinDistribucion.length > 0 && (
        <p className="mb-4 rounded bg-amber-100 p-2 text-sm text-amber-800">
          Ojo: la cuota {cuotasSinDistribucion.map((cuota) => cuota.numero).join(', ')} ya se cobró (al
          menos en parte) pero todavía no tiene distribución cargada, así que no se generó ningún Debe en
          la cuenta corriente de nadie por esa cuota.
        </p>
      )}

      {lote!.estado !== 'vendido' ? (
        <p className="mb-4 rounded bg-amber-100 p-2 text-sm text-amber-800">
          Este lote no está vendido (estado actual: {lote!.estado}), todavía no tiene cuotas para
          distribuir.
        </p>
      ) : (
        <form action={guardarDistribucionConId}>
          <DistribucionCuotas
            moneda={lote!.moneda}
            cuotas={(cuotas ?? []).map((cuota) => ({ numero: cuota.numero, montoBase: cuota.monto_base }))}
            participantesElegibles={participantesElegibles}
            objetivosIniciales={objetivosIniciales}
            distribucionesIniciales={distribucionesIniciales}
          />
        </form>
      )}
    </main>
  )
}
