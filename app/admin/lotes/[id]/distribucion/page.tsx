import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { obtenerCuotasSinDistribucion } from '@/lib/cuenta-corriente/cuotas-sin-distribucion'
import { resolverAdminPorDefecto } from '@/lib/lotes/admin-por-defecto'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'
import { traerTodasLasFilasPorTandas } from '@/lib/supabase/traer-todas-las-filas'
import { guardarDistribucionLote } from './actions'
import { DistribucionCuotas } from './DistribucionCuotas'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { Building2, ChevronLeft, Settings } from 'lucide-react'
import {
  BANNER_ERROR,
  BANNER_OK,
  PANEL,
  PILL_ESTADO,
  PILL_ESTADO_NEUTRO,
  PASO_NUMERO,
  PASO_TITULO,
  PASO_BAJADA,
  FICHA_INTEGRANTE,
} from '@/lib/ui/clases'
import { SeccionCobro } from '../SeccionCobro'

// Distribución de cuotas (15/09, mockup 6 de Stitch). Del mockup se tomo el
// diseño y nada mas (regla de Gabriel del 09/09). Lo que dibuja y la pantalla
// no hace -- exportar a Excel, cargar el reparto en porcentaje, la "regla
// rapida de asignacion", agrupar cuotas iguales en un bloque -- quedo afuera
// y anotado en design-system/mockups/stitch-2026-09/README.md.
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
      'id, identificador, moneda, estado, precio_total, ciclo_actual, admin_id, acreedor_id, vendedor_id, cliente_id, cuenta_cobro_id, cuenta_cobro_externa_id'
    )
    .eq('id', id)
    .single()

  if (!lote) {
    notFound()
  }

  const { data: todasLasCuotas } = await supabase
    .from('cuotas')
    .select(
      'id, numero, monto_base, fecha_vencimiento, refinanciada, cuenta_cobro_id, cuenta_cobro_externa_id'
    )
    .eq('lote_id', id)
    .eq('ciclo', lote.ciclo_actual)
    .order('numero', { ascending: true })

  // Las refinanciadas NO se reparten (10/09, Gabriel: "no deberia permitir
  // seleccionar quien cobra cuotas refinanciadas, directamente deberian
  // desaparecer de la distribucion"). Tiene razon: esas cuotas ya no las va
  // a pagar nadie, su deuda se mudo a las cuotas nuevas, y ofrecerlas hacia
  // que la pantalla pidiera repartir plata que no va a entrar nunca.
  //
  // Lo que YA tenian repartido no se toca ni se borra: es la historia de a
  // quien le correspondia esa plata cuando la cuota estaba viva. Ver la
  // accion y la migracion 0064.
  const cuotas = (todasLasCuotas ?? []).filter((cuota) => !cuota.refinanciada)
  const cuantasRefinanciadas = (todasLasCuotas ?? []).length - cuotas.length
  const sumaDeLasCuotas = Math.round(cuotas.reduce((acc, cuota) => acc + cuota.monto_base, 0) * 100) / 100

  const { data: cliente } = lote.cliente_id
    ? await supabase.from('profiles').select('full_name').eq('id', lote.cliente_id).maybeSingle()
    : { data: null }

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
      ? await supabase
          .from('profiles')
          .select('id, full_name, role, alias, banco, titular')
          .in('id', profileIdsIntegrantes)
      : { data: [] }

  const { data: cuentasExternas } =
    cuentaExternaIdsIntegrantes.length > 0
      ? await supabase
          .from('cuentas_externas')
          .select('id, nombre, alias, banco, titular')
          .in('id', cuentaExternaIdsIntegrantes)
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

  // Quiénes todavía no tienen alias/banco/titular cargados. Antes esto se
  // resolvía escondiéndolos del selector de cuenta de cobro del lote; ahora
  // que el destino se elige por cuota se avisa en vez de bloquear, porque es
  // normal asignarle la cuota a alguien y cargarle los datos después. Sin el
  // aviso, el cliente abriría el portal a pagar y no vería ningún alias.
  const sinDatosTransferencia = new Set<string>()
  for (const persona of perfilesIntegrantes ?? []) {
    if (
      !tieneDatosTransferencia({
        alias: persona.alias,
        banco: persona.banco,
        titular: persona.titular,
      })
    ) {
      sinDatosTransferencia.add(`profile:${persona.id}`)
    }
  }
  for (const cuentaExterna of cuentasExternas ?? []) {
    if (
      !tieneDatosTransferencia({
        alias: cuentaExterna.alias,
        banco: cuentaExterna.banco,
        titular: cuentaExterna.titular,
      })
    ) {
      sinDatosTransferencia.add(`externa:${cuentaExterna.id}`)
    }
  }

  // Las fichas de "Entre estos se reparte cada cuota" (mockup 6): quién es,
  // qué papel tiene en el lote y a qué cuenta se le transfiere. Antes era una
  // fila de pastillas con el nombre solo.
  const PAPEL_ETIQUETA: Record<string, string> = {
    admin: 'Administrador',
    acreedor: 'Acreedor',
    vendedor: 'Vendedor',
  }
  const fichasIntegrantes = [
    ...(perfilesIntegrantes ?? []).map((persona) => {
      const papel = papelEnElLote(persona.id)
      return {
        key: `profile:${persona.id}`,
        nombre: persona.full_name ?? '—',
        estilo: FICHA_INTEGRANTE[papel] ?? FICHA_INTEGRANTE.otro,
        papel: PAPEL_ETIQUETA[papel] ?? papel,
        banco: persona.banco,
        alias: persona.alias,
      }
    }),
    ...(cuentasExternas ?? []).map((cuentaExterna) => ({
      key: `externa:${cuentaExterna.id}`,
      nombre: cuentaExterna.nombre,
      estilo: FICHA_INTEGRANTE.otro,
      papel: 'Cuenta externa',
      banco: cuentaExterna.banco,
      alias: cuentaExterna.alias,
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

  // Paginado y por tandas (15/09): un lote de 60 cuotas repartidas entre 3
  // son 180 filas, pero la lista de ids viaja en la URL y PostgREST corta en
  // 1000 sin avisar. Ver lib/supabase/traer-todas-las-filas.ts.
  const cuotaIds = cuotas.map((cuota) => cuota.id)
  const distribuciones = await traerTodasLasFilasPorTandas<{
    cuota_id: string
    profile_id: string | null
    cuenta_externa_id: string | null
    monto: number
  }>(cuotaIds, (tanda, desde, hasta) =>
    supabase
      .from('cuota_distribuciones')
      .select('id, cuota_id, profile_id, cuenta_externa_id, monto')
      .in('cuota_id', tanda)
      .order('id')
      .range(desde, hasta)
  )

  const distribucionesIniciales: Record<number, { participanteKey: string; monto: string }[]> = {}
  for (const cuota of cuotas) {
    distribucionesIniciales[cuota.numero] = distribuciones
      .filter((distribucion) => distribucion.cuota_id === cuota.id)
      .map((distribucion) => ({
        participanteKey: distribucion.profile_id
          ? `profile:${distribucion.profile_id}`
          : `externa:${distribucion.cuenta_externa_id}`,
        monto: String(distribucion.monto),
      }))
  }

  // A quién se le transfiere cada cuota, ya guardado. Desde el 08/09 este es
  // el único lugar donde se define: el lote ya no tiene una "cuenta de cobro
  // actual" propia (pedido de Gabriel -- era decidir lo mismo dos veces). Los
  // lotes anteriores a ese cambio pueden tener todavía una cargada, y se
  // sigue respetando como resguardo para las cuotas que quedaron sin destino
  // propio.
  const cuentaCobroInicialPorCuota: Record<number, string> = {}
  for (const cuota of cuotas) {
    cuentaCobroInicialPorCuota[cuota.numero] = cuota.cuenta_cobro_id
      ? `profile:${cuota.cuenta_cobro_id}`
      : cuota.cuenta_cobro_externa_id
        ? `externa:${cuota.cuenta_cobro_externa_id}`
        : ''
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
  // También el destino ya guardado de cada cuota: si esa persona dejó de ser
  // integrante del lote, su <select> se quedaría sin ninguna opción que
  // matchee el valor inicial y el próximo guardado le borraría el destino en
  // silencio. Importa más desde el 08/09, que es cuando el destino pasó a
  // vivir solo en la cuota.
  for (const clave of Object.values(cuentaCobroInicialPorCuota)) {
    if (clave) clavesUsadas.add(clave)
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

  const cuentaCobroDelLote = lote.cuenta_cobro_id
    ? `profile:${lote.cuenta_cobro_id}`
    : lote.cuenta_cobro_externa_id
      ? `externa:${lote.cuenta_cobro_externa_id}`
      : ''

  // Saldo de cuenta corriente que YA tiene cada integrante, en la moneda del
  // lote. Es el punto de partida del resumen en vivo: mientras Nicolás
  // asigna quién cobra cada cuota, ve cómo le quedaría la cuenta a esa
  // persona sin salir de la pantalla. Por tandas y paginado: un acreedor con
  // varios lotes pasa de 1000 movimientos rápido.
  const movimientos = await traerTodasLasFilasPorTandas<{
    profile_id: string
    tipo: string
    monto: number
  }>(profileIdsIntegrantes, (tanda, desde, hasta) =>
    supabase
      .from('movimientos_cuenta_corriente')
      .select('id, profile_id, tipo, monto')
      .in('profile_id', tanda)
      .eq('moneda', lote.moneda)
      .order('id')
      .range(desde, hasta)
  )

  const saldoActualPorClave: Record<string, number> = {}
  for (const movimiento of movimientos) {
    const clave = `profile:${movimiento.profile_id}`
    const signo = movimiento.tipo === 'debe' ? 1 : -1
    saldoActualPorClave[clave] =
      Math.round(((saldoActualPorClave[clave] ?? 0) + signo * movimiento.monto) * 100) / 100
  }

  const guardarDistribucionConId = guardarDistribucionLote.bind(null, id)

  const cuotasSinDistribucion = await obtenerCuotasSinDistribucion(supabase, id)

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500">
        <EnlaceBoton href="/admin/lotes" className="inline-flex items-center gap-1 transition hover:text-blue-600">
          <ChevronLeft className="h-3.5 w-3.5" />
          Volver a Lotes
        </EnlaceBoton>
        <span className="text-slate-300">|</span>
        <EnlaceBoton href={`/admin/lotes/${id}`} className="transition hover:text-blue-600">
          ← Volver al lote
        </EnlaceBoton>
      </div>

      <div className={`${PANEL} flex flex-wrap items-center justify-between gap-4`}>
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
            <Building2 className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-heading text-xl font-bold tracking-tight text-slate-900">
                Distribución de cuotas — {lote.identificador}
              </h1>
              <span className={PILL_ESTADO[lote.estado] ?? PILL_ESTADO_NEUTRO}>{lote.estado}</span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Precio total:{' '}
              <strong className="font-semibold text-slate-900 tabular-nums">
                {lote.precio_total ?? '—'} {lote.moneda}
              </strong>
              {cuotas.length > 0 && (
                <>
                  {' '}
                  (suma de las {cuotas.length} cuotas a repartir:{' '}
                  <strong className="font-semibold text-blue-700 tabular-nums">
                    {sumaDeLasCuotas} {lote.moneda}
                  </strong>
                  )
                </>
              )}
              {cliente?.full_name && (
                <>
                  {' '}
                  · Cliente: <strong className="font-semibold text-slate-800">{cliente.full_name}</strong>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {error && <p className={BANNER_ERROR}>{error}</p>}
      {ok && <p className={BANNER_OK}>{ok === '1' ? 'Distribución guardada.' : ok}</p>}

      {/* Paso 1: quiénes cobran, arriba de cómo se reparte. Son dos mitades
          de la misma decisión (06/09, pedido de Gabriel). Arriba las fichas
          de los que ya están; abajo, en SeccionCobro, se cambian. */}
      <section className={PANEL}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <span className={PASO_NUMERO}>1</span>
            <div>
              <h2 className={PASO_TITULO}>
                Entre estos se reparte cada cuota ({participantesElegibles.length}{' '}
                {participantesElegibles.length === 1 ? 'integrante' : 'integrantes'})
              </h2>
              <p className={PASO_BAJADA}>
                Los únicos a los que se les puede repartir una cuota o mandar a cobrarla.
              </p>
            </div>
          </div>
          <EnlaceBoton
            href="/admin/usuarios"
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
          >
            <Settings className="h-3.5 w-3.5" />
            Gestionar cuentas y alias de cobro
          </EnlaceBoton>
        </div>

        {fichasIntegrantes.length === 0 ? (
          <p className="text-xs text-slate-600">
            Este lote todavía no tiene integrantes cargados, así que no hay a quién repartirle las
            cuotas. Cargalos acá abajo.
          </p>
        ) : (
          <ul className="flex flex-wrap items-center gap-3">
            {fichasIntegrantes.map((ficha) => (
              <li
                key={ficha.key}
                className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${ficha.estilo.ficha}`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ficha.estilo.avatar}`}
                >
                  {ficha.nombre.trim().charAt(0).toUpperCase() || '—'}
                </span>
                <div className="leading-tight">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900">{ficha.nombre}</span>
                    <span
                      className={`rounded border px-1.5 text-[10px] font-semibold uppercase ${ficha.estilo.papel}`}
                    >
                      {ficha.papel}
                    </span>
                  </div>
                  {sinDatosTransferencia.has(ficha.key) ? (
                    <p className="text-[11px] font-medium text-amber-700">Sin datos de transferencia</p>
                  ) : (
                    <p className="font-mono text-[11px] text-slate-500">
                      {ficha.banco} · alias: {ficha.alias}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <SeccionCobro loteId={id} />
      </section>

      {cuotasSinDistribucion.length > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Ojo: la cuota {cuotasSinDistribucion.map((cuota) => cuota.numero).join(', ')} ya se cobró (al
          menos en parte) pero todavía no tiene distribución cargada, así que no se generó ningún Debe en
          la cuenta corriente de nadie por esa cuota.
        </p>
      )}

      {cuantasRefinanciadas > 0 && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          {`Este lote se refinanció: ${cuantasRefinanciadas} ${
            cuantasRefinanciadas === 1 ? 'cuota quedó marcada' : 'cuotas quedaron marcadas'
          }`}{' '}
          &quot;Refinanció&quot; y no aparecen acá. Su deuda pasó a las cuotas nuevas, así que repartirlas otra vez sería
          repartir plata que no va a entrar. Lo que ya tenían repartido queda guardado tal cual —
          se ve en el detalle del lote y sigue contando en las cuentas corrientes.
        </p>
      )}

      {lote.estado !== 'vendido' ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Este lote no está vendido (estado actual: {lote.estado}), todavía no tiene cuotas para
          distribuir.
        </p>
      ) : (
        <form action={guardarDistribucionConId} className="space-y-6">
          <DistribucionCuotas
            moneda={lote.moneda}
            cuotas={cuotas.map((cuota) => ({
              numero: cuota.numero,
              montoBase: cuota.monto_base,
              fechaVencimiento: cuota.fecha_vencimiento,
            }))}
            participantesElegibles={participantesElegibles}
            objetivosIniciales={objetivosIniciales}
            distribucionesIniciales={distribucionesIniciales}
            cuentaCobroInicialPorCuota={cuentaCobroInicialPorCuota}
            cuentaCobroDelLote={cuentaCobroDelLote}
            sinDatosTransferencia={[...sinDatosTransferencia]}
            saldoActualPorClave={saldoActualPorClave}
          />
        </form>
      )}
    </main>
  )
}
