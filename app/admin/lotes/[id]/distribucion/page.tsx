import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { obtenerCuotasSinDistribucion } from '@/lib/cuenta-corriente/cuotas-sin-distribucion'
import { resolverAdminPorDefecto } from '@/lib/lotes/admin-por-defecto'
import { guardarDistribucionLote } from './actions'
import { DistribucionCuotas } from './DistribucionCuotas'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { ENLACE, TITULO_H1, BANNER_ERROR, BANNER_OK } from '@/lib/ui/clases'

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

  const { data: lote } = await supabase
    .from('lotes')
    .select(
      'id, identificador, moneda, estado, precio_total, ciclo_actual, admin_id, acreedor_id, vendedor_id, cuenta_cobro_id, cuenta_cobro_externa_id'
    )
    .eq('id', id)
    .single()

  if (!lote) {
    notFound()
  }

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, numero, monto_base, cuenta_cobro_id, cuenta_cobro_externa_id')
    .eq('lote_id', id)
    .eq('ciclo', lote.ciclo_actual)
    .order('numero', { ascending: true })

  // Integrantes de ESTE lote, no todo el staff (05/09, pedido de Gabriel:
  // "cuando hagamos la distribución de cuotas me va a dejar seleccionar
  // esos 3 integrantes, nada más. Entonces la experiencia va a ser mucho
  // más rápida"). Son el admin, el acreedor y el vendedor del lote más los
  // participantes adicionales que se le hayan agregado.
  const { data: participantesLote } = await supabase
    .from('lote_participantes')
    .select('profile_id, cuenta_externa_id, etiqueta')
    .eq('lote_id', id)

  // El admin del lote entra siempre, aunque el lote sea viejo y tenga
  // admin_id en null: es el default de resolverAdminPorDefecto (en la
  // práctica, Nicolás). Sin esto los lotes anteriores al 05/09 mostraban a
  // Nicolás como "ya no es integrante del lote".
  const { data: administradores } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'administrador')

  const {
    data: { user: usuarioActual },
  } = await supabase.auth.getUser()

  const adminDelLote = resolverAdminPorDefecto({
    adminIdActual: lote.admin_id,
    administradores: administradores ?? [],
    usuarioActualId: usuarioActual?.id ?? null,
    // Esta pantalla ya pasó por requireAdministrador().
    usuarioActualEsAdministrador: true,
  })

  const profileIdsIntegrantes = [
    ...new Set(
      [
        adminDelLote,
        lote.acreedor_id,
        lote.vendedor_id,
        ...(participantesLote ?? []).map((p) => p.profile_id),
      ].filter((valor): valor is string => Boolean(valor))
    ),
  ]

  const cuentaExternaIdsIntegrantes = [
    ...new Set(
      [
        lote.cuenta_cobro_externa_id,
        ...(participantesLote ?? []).map((p) => p.cuenta_externa_id),
      ].filter((valor): valor is string => Boolean(valor))
    ),
  ]

  const { data: perfilesIntegrantes } =
    profileIdsIntegrantes.length > 0
      ? await supabase.from('profiles').select('id, full_name, role').in('id', profileIdsIntegrantes)
      : { data: [] }

  const { data: cuentasExternas } =
    cuentaExternaIdsIntegrantes.length > 0
      ? await supabase.from('cuentas_externas').select('id, nombre').in('id', cuentaExternaIdsIntegrantes)
      : { data: [] }

  const etiquetaPorProfileId = new Map(
    (participantesLote ?? [])
      .filter((p) => p.profile_id && p.etiqueta)
      .map((p) => [p.profile_id as string, p.etiqueta as string])
  )

  function papelEnElLote(profileId: string): string {
    if (profileId === adminDelLote) return 'admin'
    if (profileId === lote!.acreedor_id) return 'acreedor'
    if (profileId === lote!.vendedor_id) return 'vendedor'
    return etiquetaPorProfileId.get(profileId) ?? 'participante'
  }

  const participantesElegibles = [
    ...(perfilesIntegrantes ?? []).map((persona) => ({
      key: `profile:${persona.id}`,
      nombre: `${persona.full_name} (${papelEnElLote(persona.id)})`,
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
        nombre: `${perfil.full_name} (${perfil.role}, ya no es integrante del lote)`,
      })
    }
  }

  // Mismo cuidado para las cuentas externas: desde que la lista se acota a
  // los integrantes del lote, una distribución vieja puede referirse a una
  // cuenta externa que ya no está entre ellos.
  const cuentaExternaIdsFaltantes = Array.from(clavesUsadas)
    .filter((clave) => clave.startsWith('externa:') && !clavesConocidas.has(clave))
    .map((clave) => clave.slice('externa:'.length))

  if (cuentaExternaIdsFaltantes.length > 0) {
    const { data: cuentasFaltantes } = await supabase
      .from('cuentas_externas')
      .select('id, nombre')
      .in('id', cuentaExternaIdsFaltantes)

    for (const cuentaExterna of cuentasFaltantes ?? []) {
      participantesElegibles.push({
        key: `externa:${cuentaExterna.id}`,
        nombre: `${cuentaExterna.nombre} (cuenta externa, ya no es integrante del lote)`,
      })
    }
  }

  // Cuenta que cobra cada cuota, ya guardada. Sin nada cargado, cae a la
  // cuenta del lote -- que es como funcionaba antes de tener cuenta por
  // cuota, así que ninguna cuota queda sin destino.
  const cuentaCobroInicialPorCuota: Record<number, string> = {}
  for (const cuota of cuotas ?? []) {
    cuentaCobroInicialPorCuota[cuota.numero] = cuota.cuenta_cobro_id
      ? `profile:${cuota.cuenta_cobro_id}`
      : cuota.cuenta_cobro_externa_id
        ? `externa:${cuota.cuenta_cobro_externa_id}`
        : ''
  }

  const cuentaCobroDelLote = lote.cuenta_cobro_id
    ? `profile:${lote.cuenta_cobro_id}`
    : lote.cuenta_cobro_externa_id
      ? `externa:${lote.cuenta_cobro_externa_id}`
      : ''

  // Saldo de cuenta corriente que YA tiene cada integrante, en la moneda del
  // lote. Es el punto de partida del resumen en vivo: mientras Nicolás
  // asigna quién cobra cada cuota, ve cómo le quedaría la cuenta a esa
  // persona sin salir de la pantalla.
  const { data: movimientos } =
    profileIdsIntegrantes.length > 0
      ? await supabase
          .from('movimientos_cuenta_corriente')
          .select('profile_id, tipo, monto, moneda')
          .in('profile_id', profileIdsIntegrantes)
          .eq('moneda', lote.moneda)
      : { data: [] }

  const saldoActualPorClave: Record<string, number> = {}
  for (const movimiento of movimientos ?? []) {
    const clave = `profile:${movimiento.profile_id}`
    const signo = movimiento.tipo === 'debe' ? 1 : -1
    saldoActualPorClave[clave] =
      Math.round(((saldoActualPorClave[clave] ?? 0) + signo * movimiento.monto) * 100) / 100
  }

  const guardarDistribucionConId = guardarDistribucionLote.bind(null, id)

  const cuotasSinDistribucion = await obtenerCuotasSinDistribucion(supabase, id)

  return (
    <main>
      <div className="mb-4 flex gap-4">
        <EnlaceBoton href="/admin/lotes" className={`text-sm ${ENLACE}`}>
          ← Volver a Lotes
        </EnlaceBoton>
        <EnlaceBoton href={`/admin/lotes/${id}`} className={`text-sm ${ENLACE}`}>
          ← Volver al lote
        </EnlaceBoton>
      </div>
      <h1 className={`mb-2 ${TITULO_H1}`}>Distribución de cuotas — {lote!.identificador}</h1>
      <p className="mb-6 text-sm text-slate-600">
        Precio total del lote: <span className="font-medium">{lote!.precio_total}</span> {lote!.moneda}
        {(cuotas ?? []).length > 0 && (
          <>
            {' '}
            (suma de las {(cuotas ?? []).length} cuotas:{' '}
            {Math.round(
              (cuotas ?? []).reduce((acc, cuota) => acc + cuota.monto_base, 0) * 100
            ) / 100}{' '}
            {lote!.moneda})
          </>
        )}
      </p>

      {error && <p className={BANNER_ERROR}>{error}</p>}
      {ok && <p className={BANNER_OK}>{ok === '1' ? 'Distribución guardada.' : ok}</p>}

      {/* 05/09, pedido de Gabriel: antes de repartir hay que saber quiénes
          son los integrantes de este lote, porque son los únicos que
          después aparecen para elegir cuota por cuota. Se editan en la
          sección de cobro del lote. */}
      <details className="mb-6 rounded-lg border border-blue-100 bg-blue-50/30 p-3 text-sm" open>
        <summary className="cursor-pointer select-none font-semibold text-blue-900">
          Integrantes de este lote ({participantesElegibles.length})
        </summary>
        {participantesElegibles.length === 0 ? (
          <p className="mt-2 text-slate-600">
            Este lote todavía no tiene integrantes cargados, así que no hay a quién repartirle las
            cuotas.{' '}
            <EnlaceBoton href={`/admin/lotes/${id}`} className={ENLACE}>
              Cargalos en la sección de cobro del lote
            </EnlaceBoton>
            .
          </p>
        ) : (
          <>
            <ul className="mt-2 flex flex-wrap gap-2">
              {participantesElegibles.map((integrante) => (
                <li
                  key={integrante.key}
                  className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-medium text-blue-900"
                >
                  {integrante.nombre}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              Son los únicos que aparecen para elegir cuota por cuota. Para sumar o sacar gente,{' '}
              <EnlaceBoton href={`/admin/lotes/${id}`} className={ENLACE}>
                editá la sección de cobro del lote
              </EnlaceBoton>
              .
            </p>
          </>
        )}
      </details>

      {cuotasSinDistribucion.length > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Ojo: la cuota {cuotasSinDistribucion.map((cuota) => cuota.numero).join(', ')} ya se cobró (al
          menos en parte) pero todavía no tiene distribución cargada, así que no se generó ningún Debe en
          la cuenta corriente de nadie por esa cuota.
        </p>
      )}

      {lote!.estado !== 'vendido' ? (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
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
            cuentaCobroInicialPorCuota={cuentaCobroInicialPorCuota}
            cuentaCobroDelLote={cuentaCobroDelLote}
            saldoActualPorClave={saldoActualPorClave}
          />
        </form>
      )}
    </main>
  )
}
