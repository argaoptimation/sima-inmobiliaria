import { createClient } from '@/lib/supabase/server'
import { actualizarCobro } from './actions'
import { agregarParticipante, quitarParticipante } from './participantes-actions'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'
import { resolverAdminPorDefecto } from '@/lib/lotes/admin-por-defecto'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import { ENTRADA, BOTON_PRIMARIO, ENLACE, TITULO_H2 } from '@/lib/ui/clases'

// Quiénes cobran este lote: admin, acreedor, vendedor, la cuenta que recibe
// las transferencias hoy, y los participantes adicionales.
//
// Vive en /distribucion y no en el detalle del lote (06/09, pedido de
// Gabriel): definir quiénes participan y repartir las cuotas entre ellos son
// dos mitades de la misma decisión, y tenerlas en pantallas distintas obligaba
// a ir y volver. Como confirmar la venta ya redirige acá, el admin cae directo
// en la pantalla donde puede hacer las dos cosas.
//
// Carga sus propios datos en vez de recibirlos por props: son ocho consultas
// que solo usa este bloque, y pasarlas desde la página que lo dibuja fue lo
// que hizo que el detalle del lote llegara a 1500 líneas.
export async function SeccionCobro({
  loteId,
  editarUsuario,
}: {
  loteId: string
  editarUsuario?: string
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: perfilPropio } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  // Solo el administrador reparte. El acreedor y el cobrador pueden llegar a
  // esta pantalla, pero no ven ni tocan esta sección.
  if (perfilPropio?.role !== 'administrador') return null

  const { data: lote } = await supabase
    .from('lotes')
    .select('admin_id, acreedor_id, vendedor_id, cuenta_cobro_id, cuenta_cobro_externa_id')
    .eq('id', loteId)
    .maybeSingle()

  if (!lote) return null

  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, role, alias, banco, titular')
    .in('role', ['administrador', 'acreedor', 'vendedor'])
    .order('full_name')

  const administradores = (staff ?? []).filter((persona) => persona.role === 'administrador')

  // El Admin del cobro viene preseleccionado (en la práctica, Nicolás) en vez
  // de arrancar en "sin asignar" y tener que elegirlo lote por lote.
  const adminPorDefecto = resolverAdminPorDefecto({
    adminIdActual: lote.admin_id,
    administradores,
    usuarioActualId: user?.id ?? null,
    usuarioActualEsAdministrador: true,
  })

  const acreedores = (staff ?? []).filter((persona) => persona.role === 'acreedor')
  const vendedores = (staff ?? []).filter((persona) => persona.role === 'vendedor')
  const conDatos = (staff ?? []).filter(
    (persona) =>
      tieneDatosTransferencia({
        alias: persona.alias,
        banco: persona.banco,
        titular: persona.titular,
      }) || persona.id === lote.cuenta_cobro_id
  )

  const { data: participantes } = await supabase
    .from('lote_participantes')
    .select('id, profile_id, cuenta_externa_id, etiqueta')
    .eq('lote_id', loteId)
    .order('created_at', { ascending: true })

  const profileIdsParticipantes = (participantes ?? [])
    .map((p) => p.profile_id)
    .filter((pid): pid is string => pid !== null)
  const cuentaExternaIdsParticipantes = (participantes ?? [])
    .map((p) => p.cuenta_externa_id)
    .filter((cid): cid is string => cid !== null)

  const { data: profilesParticipantes } =
    profileIdsParticipantes.length > 0
      ? await supabase
          .from('profiles')
          .select('id, full_name, role')
          .in('id', profileIdsParticipantes)
      : { data: [] }

  const { data: cuentasExternasParticipantes } =
    cuentaExternaIdsParticipantes.length > 0
      ? await supabase
          .from('cuentas_externas')
          .select('id, nombre')
          .in('id', cuentaExternaIdsParticipantes)
      : { data: [] }

  function nombreParticipante(participante: {
    profile_id: string | null
    cuenta_externa_id: string | null
  }) {
    if (participante.profile_id) {
      const persona = profilesParticipantes?.find((p) => p.id === participante.profile_id)
      return persona ? `${persona.full_name} (${persona.role})` : 'Persona eliminada'
    }
    const cuentaExterna = cuentasExternasParticipantes?.find(
      (c) => c.id === participante.cuenta_externa_id
    )
    return cuentaExterna ? `${cuentaExterna.nombre} (cuenta externa)` : 'Cuenta externa eliminada'
  }

  const participantesElegibles = (staff ?? []).filter(
    (persona) =>
      persona.id !== lote.admin_id &&
      persona.id !== lote.acreedor_id &&
      persona.id !== lote.vendedor_id
  )

  const { data: cuentasExternas } = await supabase
    .from('cuentas_externas')
    .select('id, nombre')
    .order('nombre')

  const actualizarCobroConId = actualizarCobro.bind(null, loteId)
  const agregarParticipanteConId = agregarParticipante.bind(null, loteId)

  return (
    <section className="mb-8 max-w-3xl">
      <h2 className={`mb-2 ${TITULO_H2}`}>Cobro</h2>
      <p className="mb-3 text-sm text-slate-600">
        Asigná quiénes son el admin, el acreedor y el vendedor de este lote, y cuál de ellos recibe
        las transferencias actualmente. Solo se puede elegir como cuenta de cobro a alguien que ya
        tenga datos de transferencia cargados
        {editarUsuario && (
          <>
            {' '}
            —{' '}
            <EnlaceBoton href={`/admin/usuarios?editar=${editarUsuario}`} className={ENLACE}>
              cargarlos ahora
            </EnlaceBoton>
          </>
        )}
        . Los que sumes acá son los únicos entre los que después vas a poder repartir cada cuota,
        más abajo.
      </p>

      <form action={actualizarCobroConId} className="flex flex-col gap-3">
        <label className="text-sm">
          Admin
          <select
            name="adminId"
            defaultValue={adminPorDefecto ?? ''}
            className={`${ENTRADA} w-full`}
          >
            <option value="">— sin asignar —</option>
            {administradores.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.full_name}
                {!tieneDatosTransferencia({
                  alias: persona.alias,
                  banco: persona.banco,
                  titular: persona.titular,
                }) && ' — sin datos de transferencia'}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Acreedor
          <select
            name="acreedorId"
            defaultValue={lote.acreedor_id ?? ''}
            className={`${ENTRADA} w-full`}
          >
            <option value="">— sin asignar —</option>
            {acreedores.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.full_name}
                {!tieneDatosTransferencia({
                  alias: persona.alias,
                  banco: persona.banco,
                  titular: persona.titular,
                }) && ' — sin datos de transferencia'}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Vendedor
          <select
            name="vendedorId"
            defaultValue={lote.vendedor_id ?? ''}
            className={`${ENTRADA} w-full`}
          >
            <option value="">— sin asignar —</option>
            {vendedores.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.full_name}
                {!tieneDatosTransferencia({
                  alias: persona.alias,
                  banco: persona.banco,
                  titular: persona.titular,
                }) && ' — sin datos de transferencia'}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Cuenta de cobro actual
          <select
            name="cuentaCobroId"
            defaultValue={
              lote.cuenta_cobro_externa_id
                ? `externa:${lote.cuenta_cobro_externa_id}`
                : (lote.cuenta_cobro_id ?? '')
            }
            className={`${ENTRADA} w-full`}
          >
            <option value="">— sin asignar —</option>
            {conDatos.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.full_name} ({persona.role})
                {!tieneDatosTransferencia({
                  alias: persona.alias,
                  banco: persona.banco,
                  titular: persona.titular,
                }) && ' — sin datos de transferencia'}
              </option>
            ))}
            {(cuentasExternas ?? []).map((cuentaExterna) => (
              <option key={cuentaExterna.id} value={`externa:${cuentaExterna.id}`}>
                {cuentaExterna.nombre} (cuenta externa)
              </option>
            ))}
          </select>
        </label>
        <BotonEnvio className={`cursor-pointer self-start ${BOTON_PRIMARIO}`}>
          Guardar cobro
        </BotonEnvio>
      </form>

      {/* Va pegado debajo de "Cuenta de cobro actual", listando en una línea
          quién más participa; el formulario aparece recién al apretar el "+"
          (antes era un bloque aparte explicado en largo, que hacía ruido). */}
      <div className="mt-4 border-t border-blue-100 pt-4">
        <p className="text-sm font-medium text-blue-900">Otros participantes del cobro</p>
        {(participantes ?? []).length === 0 ? (
          <p className="mt-1 text-sm text-slate-600">Ninguno.</p>
        ) : (
          // Ancla estable para los tests: desde que esta sección comparte
          // pantalla con el reparto por cuota hay más de una <ul> con los
          // mismos nombres adentro (misma convención que tarjeta-pago).
          <ul data-testid="participantes-del-lote" className="mt-2 flex flex-col gap-1">
            {participantes!.map((participante) => (
              <li key={participante.id} className="flex items-center justify-between text-sm">
                <span>
                  {nombreParticipante(participante)}
                  {participante.etiqueta && ` — ${participante.etiqueta}`}
                </span>
                <form action={quitarParticipante.bind(null, loteId, participante.id)}>
                  <BotonEnvio className="cursor-pointer text-red-700 underline-offset-2 hover:underline">
                    Quitar
                  </BotonEnvio>
                </form>
              </li>
            ))}
          </ul>
        )}

        <details className="mt-3">
          <summary className="cursor-pointer select-none text-sm font-medium text-blue-800 underline-offset-4 hover:underline">
            + Agregar participante al lote
          </summary>
          <p className="mt-2 text-xs text-slate-500">
            Gente que comparte la comisión de este lote sin ser el admin, el acreedor ni el vendedor
            principal (ej. un segundo vendedor). Cuánto cobra cada uno se carga cuota por cuota,
            acá abajo.
          </p>
          <form action={agregarParticipanteConId} className="mt-2 flex max-w-sm flex-col gap-3">
            <label className="text-sm">
              Quién
              <select name="participanteId" className={`${ENTRADA} w-full`}>
                <option value="">— elegir —</option>
                {participantesElegibles.map((persona) => (
                  <option key={persona.id} value={persona.id}>
                    {persona.full_name} ({persona.role})
                  </option>
                ))}
                {(cuentasExternas ?? []).map((cuentaExterna) => (
                  <option key={cuentaExterna.id} value={`externa:${cuentaExterna.id}`}>
                    {cuentaExterna.nombre} (cuenta externa)
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Etiqueta (opcional)
              <input name="etiqueta" placeholder="Ej: Vendedor 2" className={`${ENTRADA} w-full`} />
            </label>
            <BotonEnvio className={`cursor-pointer self-start ${BOTON_PRIMARIO}`}>
              Agregar al lote
            </BotonEnvio>
          </form>
        </details>
      </div>
    </section>
  )
}
