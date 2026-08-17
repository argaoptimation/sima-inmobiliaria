'use client'

import { useState } from 'react'

interface Fila {
  participanteKey: string
  monto: string
}

interface Participante {
  key: string
  nombre: string
}

interface Props {
  moneda: string
  cuotas: { numero: number; montoBase: number }[]
  participantesElegibles: Participante[]
  objetivosIniciales: Fila[]
  distribucionesIniciales: Record<number, Fila[]>
}

function filaVacia(): Fila {
  return { participanteKey: '', monto: '' }
}

function SelectorParticipante({
  name,
  valor,
  onChange,
  opciones,
}: {
  name: string
  valor: string
  onChange: (valor: string) => void
  opciones: Participante[]
}) {
  return (
    <select
      name={name}
      value={valor}
      onChange={(evento) => onChange(evento.target.value)}
      className="rounded border px-2 py-1 text-sm"
    >
      <option value="">— elegir participante —</option>
      {opciones.map((participante) => (
        <option key={participante.key} value={participante.key}>
          {participante.nombre}
        </option>
      ))}
    </select>
  )
}

export function DistribucionCuotas({
  moneda,
  cuotas,
  participantesElegibles,
  objetivosIniciales,
  distribucionesIniciales,
}: Props) {
  const [objetivos, setObjetivos] = useState<Fila[]>(objetivosIniciales)
  const [distribuciones, setDistribuciones] = useState<Record<number, Fila[]>>(distribucionesIniciales)

  function nombrePorClave(clave: string) {
    return participantesElegibles.find((participante) => participante.key === clave)?.nombre ?? clave
  }

  function agregarObjetivo() {
    setObjetivos((anteriores) => [...anteriores, filaVacia()])
  }

  function quitarObjetivo(indice: number) {
    setObjetivos((anteriores) => anteriores.filter((_, i) => i !== indice))
  }

  function modificarObjetivo(indice: number, campo: keyof Fila, valor: string) {
    setObjetivos((anteriores) => anteriores.map((fila, i) => (i === indice ? { ...fila, [campo]: valor } : fila)))
  }

  function agregarFilaCuota(numero: number) {
    setDistribuciones((anteriores) => ({
      ...anteriores,
      [numero]: [...(anteriores[numero] ?? []), filaVacia()],
    }))
  }

  function quitarFilaCuota(numero: number, indice: number) {
    setDistribuciones((anteriores) => ({
      ...anteriores,
      [numero]: (anteriores[numero] ?? []).filter((_, i) => i !== indice),
    }))
  }

  function modificarFilaCuota(numero: number, indice: number, campo: keyof Fila, valor: string) {
    setDistribuciones((anteriores) => ({
      ...anteriores,
      [numero]: (anteriores[numero] ?? []).map((fila, i) => (i === indice ? { ...fila, [campo]: valor } : fila)),
    }))
  }

  // Resumen recalculado en cada render a partir del estado local -- cruza
  // TODAS las cuotas ya editadas en esta sesión (no solo lo persistido),
  // sin ninguna llamada de red. Es lo que le permite a Nicolás ver bajar
  // el saldo pendiente de un participante mientras carga cuota tras cuota.
  const resumen = (() => {
    const acumulados = new Map<string, number>()
    for (const filas of Object.values(distribuciones)) {
      for (const fila of filas) {
        if (!fila.participanteKey) continue
        const monto = Number(fila.monto) || 0
        acumulados.set(fila.participanteKey, (acumulados.get(fila.participanteKey) ?? 0) + monto)
      }
    }

    const objetivosPorClave = new Map<string, number>()
    for (const fila of objetivos) {
      if (!fila.participanteKey) continue
      objetivosPorClave.set(fila.participanteKey, Number(fila.monto) || 0)
    }

    const claves = new Set<string>([...acumulados.keys(), ...objetivosPorClave.keys()])

    return Array.from(claves).map((clave) => {
      const acumulado = Math.round((acumulados.get(clave) ?? 0) * 100) / 100
      const objetivo = objetivosPorClave.has(clave) ? (objetivosPorClave.get(clave) as number) : null
      return { clave, nombre: nombrePorClave(clave), acumulado, objetivo }
    })
  })()

  return (
    <>
      <h2 className="mb-2 mt-6 text-lg font-semibold">Objetivos (opcional)</h2>
      <p className="mb-3 text-sm text-gray-600">
        Cuánto le corresponde en total a cada participante de este lote. Sin objetivo cargado, el
        resumen de abajo solo muestra lo acumulado, sin comparar contra nada.
      </p>
      <div className="mb-6 flex flex-col gap-2">
        {objetivos.map((fila, indice) => (
          <div key={indice} className="flex items-center gap-2">
            <SelectorParticipante
              name="objetivoParticipante"
              valor={fila.participanteKey}
              onChange={(valor) => modificarObjetivo(indice, 'participanteKey', valor)}
              opciones={participantesElegibles}
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Monto objetivo"
              value={fila.monto}
              onChange={(evento) => modificarObjetivo(indice, 'monto', evento.target.value)}
              name="objetivoMonto"
              className="w-40 rounded border px-2 py-1 text-sm"
            />
            <button type="button" onClick={() => quitarObjetivo(indice)} className="text-sm text-red-700 underline">
              Quitar
            </button>
          </div>
        ))}
        <button type="button" onClick={agregarObjetivo} className="self-start text-sm underline">
          + Agregar objetivo
        </button>
      </div>

      <h2 className="mb-2 text-lg font-semibold">Cuotas — distribución</h2>
      <div className="mb-6 flex flex-col gap-4">
        {cuotas.map((cuota) => (
          <div key={cuota.numero} className="rounded border p-3">
            <p className="mb-2 text-sm font-medium">
              Cuota {cuota.numero} — {cuota.montoBase} {moneda}
            </p>
            <div className="flex flex-col gap-2">
              {(distribuciones[cuota.numero] ?? []).map((fila, indice) => (
                <div key={indice} className="flex items-center gap-2">
                  <SelectorParticipante
                    name={`cuota${cuota.numero}Participante`}
                    valor={fila.participanteKey}
                    onChange={(valor) => modificarFilaCuota(cuota.numero, indice, 'participanteKey', valor)}
                    opciones={participantesElegibles}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Monto"
                    value={fila.monto}
                    onChange={(evento) =>
                      modificarFilaCuota(cuota.numero, indice, 'monto', evento.target.value)
                    }
                    name={`cuota${cuota.numero}Monto`}
                    className="w-40 rounded border px-2 py-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => quitarFilaCuota(cuota.numero, indice)}
                    className="text-sm text-red-700 underline"
                  >
                    Quitar
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => agregarFilaCuota(cuota.numero)}
                className="self-start text-sm underline"
              >
                + Agregar participante a esta cuota
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-2 text-lg font-semibold">Resumen del lote</h2>
      {resumen.length === 0 ? (
        <p className="mb-6 text-sm text-gray-600">Sin distribución cargada todavía.</p>
      ) : (
        <table className="mb-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Participante</th>
              <th>Acumulado</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {resumen.map((fila) => (
              <tr key={fila.clave} className="border-b">
                <td className="py-2">{fila.nombre}</td>
                <td>
                  {fila.acumulado} {moneda}
                </td>
                <td>
                  {fila.objetivo === null
                    ? '—'
                    : fila.acumulado >= fila.objetivo
                      ? 'Saldado'
                      : `${fila.acumulado} de ${fila.objetivo}, faltan ${
                          Math.round((fila.objetivo - fila.acumulado) * 100) / 100
                        }`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">
        Guardar distribución
      </button>
    </>
  )
}
