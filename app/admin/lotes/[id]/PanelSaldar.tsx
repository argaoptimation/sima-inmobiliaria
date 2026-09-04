'use client'

import { useState } from 'react'
import { BotonEnvio } from '@/components/BotonEnvio'
import { ENTRADA, BOTON_SECUNDARIO } from '@/lib/ui/clases'
import { Obligatorio } from '@/components/Obligatorio'

// Botón "Pago total anticipado" (pedido de Nico, 02/09, renombrado 03/09 --
// "Saldar" quedaba ambiguo, en la llamada Nico prefirió este nombre) que
// revela un formulario chico (monto acordado + medio de pago) -- ver
// saldarLote en actions.ts para la lógica. El nombre interno (componente,
// action, enum 'saldar' en la base) se deja igual a propósito -- solo
// cambia el texto que ve el usuario. Colapsado por default para no sumar
// ruido a la pantalla cuando no se está usando.
export function PanelSaldar({
  saldarAction,
  saldoPendienteTotal,
  moneda,
}: {
  saldarAction: (formData: FormData) => Promise<void>
  saldoPendienteTotal: number
  moneda: string
}) {
  const [abierto, setAbierto] = useState(false)

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={`mb-3 cursor-pointer ${BOTON_SECUNDARIO}`}
      >
        Pago total anticipado
      </button>
    )
  }

  return (
    <form
      action={saldarAction}
      onSubmit={(evento) => {
        if (
          !confirm(
            `¿Registrar el pago total anticipado de este lote? Esto cierra TODA la deuda restante (hoy ${saldoPendienteTotal.toLocaleString(
              'es-AR'
            )} ${moneda}) con el monto que cargues acá -- no se puede deshacer desde la plataforma.`
          )
        ) {
          evento.preventDefault()
        }
      }}
      className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3"
    >
      <label className="text-sm text-slate-600">
        Monto acordado
        <Obligatorio />
        <input
          name="monto"
          type="number"
          step="0.01"
          min="0"
          required
          placeholder={`Saldo actual: ${saldoPendienteTotal}`}
          className={ENTRADA}
        />
      </label>
      <label className="text-sm text-slate-600">
        Medio de pago
        <Obligatorio />
        <select name="medioPago" required defaultValue="transferencia" className={`${ENTRADA} w-full`}>
          <option value="transferencia">Transferencia</option>
          <option value="efectivo">Efectivo</option>
        </select>
      </label>
      <BotonEnvio
        className="cursor-pointer rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-900"
        cargandoTexto="Guardando…"
      >
        Confirmar pago anticipado
      </BotonEnvio>
      <button
        type="button"
        onClick={() => setAbierto(false)}
        className="cursor-pointer text-sm text-slate-500 underline-offset-4 hover:underline"
      >
        Cancelar
      </button>
    </form>
  )
}
