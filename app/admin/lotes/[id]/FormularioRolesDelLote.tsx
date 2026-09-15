'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { BotonEnvio } from '@/components/BotonEnvio'
import { CAMPO_COMPACTO, ETIQUETA_COMPACTA, BOTON_CHICO_PRIMARIO } from '@/lib/ui/clases'

interface Opcion {
  id: string
  nombre: string
  sinDatos: boolean
}

export interface AvisoDeSalidaDeRol {
  nombre: string
  lineas: string[]
  bloqueo: string | null
  // Si sacarlo cambia alguna cuota o su porcentaje (si no, no hace falta
  // confirmar nada).
  cambia: boolean
}

// "Roles del lote" (admin, acreedor, vendedor) con el mismo aviso previo que
// el botón "Quitar" de las fichas (15/09): cambiar al vendedor saca al
// anterior del lote, y si tenía cuotas atadas eso se ve ANTES de guardar,
// no después. El botón pasa a decir a quién saca, así el click es la
// confirmación.
//
// Manda en `confirmarSalida` a quién le mostró el aviso. El servidor lo
// vuelve a calcular y, si alguien que sale tiene cuotas y no está en esa
// lista (la pantalla estaba vieja), no guarda.
export function FormularioRolesDelLote({
  accion,
  administradores,
  acreedores,
  vendedores,
  valoresIniciales,
  adminSiQuedaVacio,
  participanteProfileIds,
  avisos,
}: {
  accion: (formData: FormData) => void | Promise<void>
  administradores: Opcion[]
  acreedores: Opcion[]
  vendedores: Opcion[]
  valoresIniciales: { adminId: string; acreedorId: string; vendedorId: string }
  // Quién queda de admin si se elige "sin asignar" (Nicolás, por defecto).
  adminSiQuedaVacio: string | null
  participanteProfileIds: string[]
  avisos: Record<string, AvisoDeSalidaDeRol>
}) {
  const [adminId, setAdminId] = useState(valoresIniciales.adminId)
  const [acreedorId, setAcreedorId] = useState(valoresIniciales.acreedorId)
  const [vendedorId, setVendedorId] = useState(valoresIniciales.vendedorId)

  const siguen = new Set(
    [adminId || adminSiQuedaVacio, acreedorId, vendedorId, ...participanteProfileIds].filter(Boolean)
  )
  const salen = [
    ...new Set(
      [valoresIniciales.adminId || adminSiQuedaVacio, valoresIniciales.acreedorId, valoresIniciales.vendedorId].filter(
        (valor): valor is string => Boolean(valor)
      )
    ),
  ].filter((idPersona) => !siguen.has(idPersona))

  const avisosDeLosQueSalen = salen
    .map((idPersona) => ({ idPersona, aviso: avisos[idPersona] }))
    .filter(({ aviso }) => aviso && (aviso.cambia || aviso.bloqueo))
  const hayBloqueo = avisosDeLosQueSalen.some(({ aviso }) => aviso.bloqueo)
  const nombresQueSalen = avisosDeLosQueSalen
    .filter(({ aviso }) => aviso.cambia)
    .map(({ aviso }) => aviso.nombre)

  const selector = (
    etiqueta: string,
    name: string,
    valor: string,
    alCambiar: (valor: string) => void,
    opciones: Opcion[]
  ) => (
    <label className="block">
      <span className={ETIQUETA_COMPACTA}>{etiqueta}</span>
      <select
        name={name}
        value={valor}
        onChange={(evento) => alCambiar(evento.target.value)}
        className={`${CAMPO_COMPACTO} bg-white`}
      >
        <option value="">— sin asignar —</option>
        {opciones.map((persona) => (
          <option key={persona.id} value={persona.id}>
            {persona.nombre}
            {persona.sinDatos && ' — sin datos de transferencia'}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <form action={accion} className="space-y-3">
      <div>
        <p className="text-xs font-bold text-slate-800">Roles del lote</p>
        <p className="text-[11px] text-slate-500">
          Quién es el admin, el acreedor y el vendedor. Junto con los participantes de al lado, son los
          únicos entre los que se reparte cada cuota.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {selector('Admin', 'adminId', adminId, setAdminId, administradores)}
        {selector('Acreedor', 'acreedorId', acreedorId, setAcreedorId, acreedores)}
        {selector('Vendedor', 'vendedorId', vendedorId, setVendedorId, vendedores)}
      </div>

      {avisosDeLosQueSalen.map(({ idPersona, aviso }) => (
        <div
          key={idPersona}
          data-testid="aviso-cambio-de-rol"
          className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
        >
          <p className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Al guardar, {aviso.nombre} deja de ser integrante del lote:
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {aviso.lineas.map((linea) => (
              <li key={linea}>{linea}</li>
            ))}
          </ul>
          {aviso.bloqueo && <p className="font-semibold">{aviso.bloqueo}</p>}
          {aviso.cambia && !aviso.bloqueo && <input type="hidden" name="confirmarSalida" value={idPersona} />}
        </div>
      ))}

      {hayBloqueo ? (
        <button type="button" disabled className={`cursor-not-allowed ${BOTON_CHICO_PRIMARIO}`}>
          Guardar cobro
        </button>
      ) : (
        <BotonEnvio className={`cursor-pointer ${BOTON_CHICO_PRIMARIO}`}>
          {nombresQueSalen.length > 0
            ? `Guardar y sacar a ${nombresQueSalen.join(' y ')} de sus cuotas`
            : 'Guardar cobro'}
        </BotonEnvio>
      )}
    </form>
  )
}
