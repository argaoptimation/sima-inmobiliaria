'use client'

import { useState } from 'react'
import { BotonEnvio } from '@/components/BotonEnvio'
import {
  ENTRADA,
  BOTON_PRIMARIO,
  TITULO_H2,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
} from '@/lib/ui/clases'

interface Fila {
  id: string
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
  objetivosIniciales: { participanteKey: string; monto: string }[]
  distribucionesIniciales: Record<number, { participanteKey: string; monto: string }[]>
}

let contadorIds = 0
function generarId(): string {
  contadorIds += 1
  return `fila-${contadorIds}`
}

function filaVacia(): Fila {
  return { id: generarId(), participanteKey: '', monto: '' }
}

function conId<T extends { participanteKey: string; monto: string }>(fila: T): Fila {
  return { ...fila, id: generarId() }
}

// Input de texto con búsqueda nativa (datalist) en vez de un <select> con
// todos los participantes en una lista larga -- Nicolás pidió poder
// escribir y filtrar por nombre en vez de scrollear un desplegable. El
// input visible NO se manda en el submit (no tiene `name`): lo que viaja al
// server action es el <input type="hidden"> con la clave ya resuelta, mismo
// formato que antes (`profile:<id>` / `externa:<id>`). Si lo tipeado no
// matchea ningún nombre conocido, la clave queda vacía -- misma fila "sin
// participante" que ya se descarta sin error al guardar. El estado del
// texto se inicializa una sola vez a partir de `valor`: la fila que lo usa
// tiene un `id` estable como key (ver más abajo), así que React nunca
// reutiliza esta instancia para una fila lógica distinta al reordenar.
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
  const [texto, setTexto] = useState(
    () => opciones.find((participante) => participante.key === valor)?.nombre ?? ''
  )

  return (
    <>
      <input
        list="lista-participantes"
        value={texto}
        placeholder="Buscar participante..."
        onChange={(evento) => {
          const nuevoTexto = evento.target.value
          setTexto(nuevoTexto)
          const encontrado = opciones.find((participante) => participante.nombre === nuevoTexto)
          onChange(encontrado ? encontrado.key : '')
        }}
        className={`w-56 ${ENTRADA}`}
      />
      <input type="hidden" name={name} value={valor} />
    </>
  )
}

export function DistribucionCuotas({
  moneda,
  cuotas,
  participantesElegibles,
  objetivosIniciales,
  distribucionesIniciales,
}: Props) {
  const [objetivos, setObjetivos] = useState<Fila[]>(() => objetivosIniciales.map(conId))
  const [distribuciones, setDistribuciones] = useState<Record<number, Fila[]>>(() =>
    Object.fromEntries(
      Object.entries(distribucionesIniciales).map(([numero, filas]) => [numero, filas.map(conId)])
    )
  )

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
      const montoTexto = fila.monto.trim()
      if (montoTexto === '') continue
      const monto = Number(montoTexto)
      if (!Number.isFinite(monto)) continue
      objetivosPorClave.set(fila.participanteKey, (objetivosPorClave.get(fila.participanteKey) ?? 0) + monto)
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
      <datalist id="lista-participantes">
        {participantesElegibles.map((participante) => (
          <option key={participante.key} value={participante.nombre} />
        ))}
      </datalist>

      <h2 className={`mb-2 mt-6 ${TITULO_H2}`}>Objetivos (opcional)</h2>
      <p className="mb-3 text-sm text-slate-600">
        Cuánto le corresponde en total a cada participante de este lote. Sin objetivo cargado, el
        resumen de abajo solo muestra lo acumulado, sin comparar contra nada.
      </p>
      <div className="mb-6 flex flex-col gap-2">
        {objetivos.map((fila, indice) => (
          <div key={fila.id} className="flex items-center gap-2">
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
              className={`w-40 ${ENTRADA}`}
            />
            <button
              type="button"
              onClick={() => quitarObjetivo(indice)}
              className="cursor-pointer text-sm text-red-700 underline-offset-2 hover:underline"
            >
              Quitar
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={agregarObjetivo}
          className="cursor-pointer self-start text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
        >
          + Agregar objetivo
        </button>
      </div>

      <h2 className={`mb-2 ${TITULO_H2}`}>Cuotas — distribución</h2>
      <div className="mb-6 flex flex-col gap-4">
        {cuotas.map((cuota) => (
          <div key={cuota.numero} className="rounded-lg border border-blue-100 p-3">
            <p className="mb-2 text-sm font-semibold text-blue-900">
              Cuota {cuota.numero} — {cuota.montoBase} {moneda}
            </p>
            <div className="flex flex-col gap-2">
              {(distribuciones[cuota.numero] ?? []).map((fila, indice) => (
                <div key={fila.id} className="flex items-center gap-2">
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
                    className={`w-40 ${ENTRADA}`}
                  />
                  <button
                    type="button"
                    onClick={() => quitarFilaCuota(cuota.numero, indice)}
                    className="cursor-pointer text-sm text-red-700 underline-offset-2 hover:underline"
                  >
                    Quitar
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => agregarFilaCuota(cuota.numero)}
                className="cursor-pointer self-start text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
              >
                + Agregar participante a esta cuota
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className={`mb-2 ${TITULO_H2}`}>Resumen del lote</h2>
      {resumen.length === 0 ? (
        <p className="mb-6 text-sm text-slate-600">Sin distribución cargada todavía.</p>
      ) : (
        <div className={`mb-6 ${TABLA_CONTENEDOR}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className={TABLA_HEADER_FILA}>
              <th className={TABLA_HEADER_CELDA}>Participante</th>
              <th className={TABLA_HEADER_CELDA}>Acumulado</th>
              <th className={TABLA_HEADER_CELDA}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {resumen.map((fila) => (
              <tr key={fila.clave} className={TABLA_FILA}>
                <td className={TABLA_CELDA}>{fila.nombre}</td>
                <td className={TABLA_CELDA}>
                  {fila.acumulado} {moneda}
                </td>
                <td className={TABLA_CELDA}>
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
        </div>
      )}

      <BotonEnvio className={`cursor-pointer ${BOTON_PRIMARIO}`}>Guardar distribución</BotonEnvio>
    </>
  )
}
