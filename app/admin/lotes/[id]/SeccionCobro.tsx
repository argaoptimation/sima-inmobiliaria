import { createClient } from '@/lib/supabase/server'
import { actualizarCobro } from './actions'
import { agregarParticipante, quitarParticipante } from './participantes-actions'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'
import { resolverAdminPorDefecto } from '@/lib/lotes/admin-por-defecto'
import { BotonEnvio } from '@/components/BotonEnvio'
import { Plus, Trash2 } from 'lucide-react'
import {
  CAMPO_COMPACTO,
  ETIQUETA_COMPACTA,
  BOTON_CHICO_PRIMARIO,
  BOTON_AGREGAR_PUNTEADO,
} from '@/lib/ui/clases'

// Quiénes cobran este lote: admin, acreedor, vendedor y los participantes
// adicionales.
//
// La "cuenta de cobro actual" del lote se sacó de acá el 08/09 (pedido de
// Gabriel): desde que cada cuota elige a quién se le transfiere, un destino
// a nivel lote era un segundo lugar donde decidir lo mismo. Ahora eso se
// define cuota por cuota, más abajo en esta misma pantalla, con un
// "aplicar a todas" para el caso normal de que cobre siempre el mismo.
//
// Vive en /distribucion y no en el detalle del lote (06/09, pedido de
// Gabriel): definir quiénes participan y repartir las cuotas entre ellos son
// dos mitades de la misma decisión, y tenerlas en pantallas distintas obligaba
// a ir y volver. Como confirmar la venta ya redirige acá, el admin cae directo
// en la pantalla donde puede hacer las dos cosas.
//
// Desde el 15/09 (mockup 6) se dibuja adentro de la tarjeta "Entre estos se
// reparte cada cuota", debajo de las fichas de los integrantes: arriba se ve
// quiénes son y acá abajo se cambian. Los formularios y sus campos son los
// mismos de antes.
//
// Carga sus propios datos en vez de recibirlos por props: son ocho consultas
// que solo usa este bloque, y pasarlas desde la página que lo dibuja fue lo
// que hizo que el detalle del lote llegara a 1500 líneas.
export async function SeccionCobro({ loteId }: { loteId: string }) {
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
    .select('admin_id, acreedor_id, vendedor_id')
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

  function sinDatos(persona: { alias: string | null; banco: string | null; titular: string | null }) {
    return !tieneDatosTransferencia({
      alias: persona.alias,
      banco: persona.banco,
      titular: persona.titular,
    })
  }

  return (
    <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-2">
      <form action={actualizarCobroConId} className="space-y-3">
        <div>
          <p className="text-xs font-bold text-slate-800">Roles del lote</p>
          <p className="text-[11px] text-slate-500">
            Quién es el admin, el acreedor y el vendedor. Junto con los participantes de al lado,
            son los únicos entre los que se reparte cada cuota.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="block">
            <span className={ETIQUETA_COMPACTA}>Admin</span>
            <select name="adminId" defaultValue={adminPorDefecto ?? ''} className={`${CAMPO_COMPACTO} bg-white`}>
              <option value="">— sin asignar —</option>
              {administradores.map((persona) => (
                <option key={persona.id} value={persona.id}>
                  {persona.full_name}
                  {sinDatos(persona) && ' — sin datos de transferencia'}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={ETIQUETA_COMPACTA}>Acreedor</span>
            <select
              name="acreedorId"
              defaultValue={lote.acreedor_id ?? ''}
              className={`${CAMPO_COMPACTO} bg-white`}
            >
              <option value="">— sin asignar —</option>
              {acreedores.map((persona) => (
                <option key={persona.id} value={persona.id}>
                  {persona.full_name}
                  {sinDatos(persona) && ' — sin datos de transferencia'}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={ETIQUETA_COMPACTA}>Vendedor</span>
            <select
              name="vendedorId"
              defaultValue={lote.vendedor_id ?? ''}
              className={`${CAMPO_COMPACTO} bg-white`}
            >
              <option value="">— sin asignar —</option>
              {vendedores.map((persona) => (
                <option key={persona.id} value={persona.id}>
                  {persona.full_name}
                  {sinDatos(persona) && ' — sin datos de transferencia'}
                </option>
              ))}
            </select>
          </label>
        </div>
        <BotonEnvio className={`cursor-pointer ${BOTON_CHICO_PRIMARIO}`}>Guardar cobro</BotonEnvio>
      </form>

      <div className="space-y-2">
        <div>
          <p className="text-xs font-bold text-slate-800">Otros participantes del cobro</p>
          <p className="text-[11px] text-slate-500">
            Gente que comparte la comisión de este lote sin ser el admin, el acreedor ni el vendedor
            principal (ej. un segundo vendedor).
          </p>
        </div>
        {(participantes ?? []).length === 0 ? (
          <p className="text-xs text-slate-500">Ninguno.</p>
        ) : (
          // Ancla estable para los tests: desde que esta sección comparte
          // pantalla con el reparto por cuota hay más de una lista con los
          // mismos nombres adentro (misma convención que tarjeta-pago).
          <ul data-testid="participantes-del-lote" className="flex flex-wrap gap-2">
            {participantes!.map((participante) => (
              <li
                key={participante.id}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-1 pr-1 pl-3 text-xs"
              >
                <span className="font-semibold text-slate-800">
                  {nombreParticipante(participante)}
                  {participante.etiqueta && (
                    <span className="font-normal text-slate-500"> — {participante.etiqueta}</span>
                  )}
                </span>
                <form action={quitarParticipante.bind(null, loteId, participante.id)}>
                  <BotonEnvio
                    className="cursor-pointer rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Quitar"
                    title="Quitar del lote"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </BotonEnvio>
                </form>
              </li>
            ))}
          </ul>
        )}

        <details className="group">
          <summary className={BOTON_AGREGAR_PUNTEADO}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>+ Agregar participante al lote</span>
          </summary>
          <form
            action={agregarParticipanteConId}
            className="mt-2 grid max-w-md gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2"
          >
            <label className="block">
              <span className={ETIQUETA_COMPACTA}>Quién</span>
              <select name="participanteId" className={`${CAMPO_COMPACTO} bg-white`}>
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
            <label className="block">
              <span className={ETIQUETA_COMPACTA}>Etiqueta (opcional)</span>
              <input name="etiqueta" placeholder="Ej: Vendedor 2" className={`${CAMPO_COMPACTO} bg-white`} />
            </label>
            <div className="sm:col-span-2">
              <BotonEnvio className={`cursor-pointer ${BOTON_CHICO_PRIMARIO}`}>Agregar al lote</BotonEnvio>
            </div>
          </form>
        </details>
      </div>
    </div>
  )
}
