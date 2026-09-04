'use client'

import { BotonEnvio } from '@/components/BotonEnvio'
import { ENTRADA, BOTON_PRIMARIO, TARJETA } from '@/lib/ui/clases'
import { Obligatorio } from '@/components/Obligatorio'

const VALOR_SOSPECHOSO = 50

export function FormularioCargarIndice({
  cargarValorIndiceAction,
  nombresExistentes,
  prellenarNombre,
  prellenarMes,
}: {
  cargarValorIndiceAction: (formData: FormData) => Promise<void>
  nombresExistentes: string[]
  prellenarNombre?: string
  prellenarMes?: string
}) {
  return (
    <form
      id="form-cargar"
      action={cargarValorIndiceAction}
      className={`mb-8 flex flex-wrap items-end gap-3 ${TARJETA}`}
      onSubmit={(evento) => {
        const formulario = evento.currentTarget
        const valor = Number(new FormData(formulario).get('valor'))
        if (Number.isFinite(valor) && Math.abs(valor) >= VALOR_SOSPECHOSO) {
          if (
            !confirm(
              `${valor}% es un valor inusualmente alto o negativo para un mes — revisá que no sea un error de tipeo (ej: 300 en vez de 30, o de más/menos dígitos). ¿Confirmás que es correcto?`
            )
          ) {
            evento.preventDefault()
          }
        }
      }}
    >
      <label className="text-sm text-slate-600">
        Índice existente
        <select
          name="nombreExistente"
          defaultValue={prellenarNombre && nombresExistentes.includes(prellenarNombre) ? prellenarNombre : ''}
          className={ENTRADA}
        >
          <option value="">— elegir —</option>
          {nombresExistentes.map((nombre) => (
            <option key={nombre} value={nombre}>
              {nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm text-slate-600">
        O un índice nuevo
        <input
          name="nombreNuevo"
          type="text"
          placeholder="Ej: IPC"
          defaultValue={prellenarNombre && !nombresExistentes.includes(prellenarNombre) ? prellenarNombre : ''}
          className={ENTRADA}
        />
      </label>
      <label className="text-sm text-slate-600">
        Mes
        <Obligatorio />
        <input
          name="periodo"
          type="month"
          required
          defaultValue={prellenarMes ?? ''}
          className={ENTRADA}
        />
      </label>
      <label className="text-sm text-slate-600">
        Valor (%)
        <Obligatorio />
        <input
          name="valor"
          type="number"
          step="0.01"
          placeholder="Ej: 3 *"
          required
          className={ENTRADA}
        />
      </label>
      <BotonEnvio className={`cursor-pointer ${BOTON_PRIMARIO}`}>Cargar</BotonEnvio>
    </form>
  )
}
