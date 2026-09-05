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
  // A qué cuenta se transfiere cada cuota (clave de participante o ''
  // cuando todavía no se eligió y hay que caer a la del lote).
  cuentaCobroInicialPorCuota: Record<number, string>
  cuentaCobroDelLote: string
  // Saldo de cuenta corriente que ya tiene cada integrante, en la moneda
  // del lote. Positivo = la empresa todavía le debe.
  saldoActualPorClave: Record<string, number>
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
  cuentaCobroInicialPorCuota,
  cuentaCobroDelLote,
  saldoActualPorClave,
}: Props) {
  const [objetivos, setObjetivos] = useState<Fila[]>(() => objetivosIniciales.map(conId))
  const [distribuciones, setDistribuciones] = useState<Record<number, Fila[]>>(() =>
    Object.fromEntries(
      Object.entries(distribucionesIniciales).map(([numero, filas]) => [numero, filas.map(conId)])
    )
  )
  const [cuentasCobro, setCuentasCobro] = useState<Record<number, string>>(
    () => cuentaCobroInicialPorCuota
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

  // Cuánto le entra DIRECTO a cada integrante: la suma de las cuotas cuya
  // cuenta de cobro es esa persona. Es la contracara de lo que le
  // corresponde por distribución, y lo que permite decir "con este vendedor
  // ya estoy al día" sin salir de la pantalla (05/09, pedido de Gabriel).
  const cobraDirectoPorClave = (() => {
    const acumulados = new Map<string, number>()
    for (const cuota of cuotas) {
      const clave = cuentasCobro[cuota.numero] || cuentaCobroDelLote
      if (!clave) continue
      acumulados.set(clave, Math.round(((acumulados.get(clave) ?? 0) + cuota.montoBase) * 100) / 100)
    }
    return acumulados
  })()

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

    const claves = new Set<string>([
      ...acumulados.keys(),
      ...objetivosPorClave.keys(),
      ...cobraDirectoPorClave.keys(),
    ])

    return Array.from(claves).map((clave) => {
      const acumulado = Math.round((acumulados.get(clave) ?? 0) * 100) / 100
      const objetivo = objetivosPorClave.has(clave) ? (objetivosPorClave.get(clave) as number) : null
      const cobraDirecto = Math.round((cobraDirectoPorClave.get(clave) ?? 0) * 100) / 100
      const saldoActual = saldoActualPorClave[clave] ?? 0
      // Positivo: la empresa le sigue debiendo. Negativo: cobró de más.
      // Es el saldo de hoy MÁS lo que le va a corresponder por este lote
      // MENOS lo que va a cobrar directo de las cuotas que le asignamos.
      const saldoProyectado = Math.round((saldoActual + acumulado - cobraDirecto) * 100) / 100
      return {
        clave,
        nombre: nombrePorClave(clave),
        acumulado,
        objetivo,
        cobraDirecto,
        saldoActual,
        saldoProyectado,
      }
    })
  })()

  function resumenDe(clave: string) {
    return resumen.find((fila) => fila.clave === clave) ?? null
  }

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
        {cuotas.map((cuota) => {
          const claveQueCobra = cuentasCobro[cuota.numero] || cuentaCobroDelLote
          const resumenQueCobra = claveQueCobra ? resumenDe(claveQueCobra) : null

          return (
            <div key={cuota.numero} className="rounded-lg border border-blue-100 p-3">
              <p className="mb-2 text-sm font-semibold text-blue-900">
                Cuota {cuota.numero} — {cuota.montoBase} {moneda}
              </p>

              {/* Dos columnas: a la izquierda cómo se reparte la comisión de
                  esta cuota, a la derecha a quién se le transfiere y cómo le
                  queda la cuenta a esa persona. Antes era todo un formulario
                  vertical larguísimo (05/09, pedido de Gabriel: "empezar a
                  utilizar más el ancho de la pantalla"). */}
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Se reparte entre
                  </p>
                  {(distribuciones[cuota.numero] ?? []).map((fila, indice) => (
                    <div key={fila.id} className="flex items-center gap-2">
                      <SelectorParticipante
                        name={`cuota${cuota.numero}Participante`}
                        valor={fila.participanteKey}
                        onChange={(valor) =>
                          modificarFilaCuota(cuota.numero, indice, 'participanteKey', valor)
                        }
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

                <div className="rounded-lg bg-blue-50/50 p-3">
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Le transfieren esta cuota a
                    <select
                      name={`cuota${cuota.numero}CuentaCobro`}
                      value={cuentasCobro[cuota.numero] ?? ''}
                      onChange={(evento) =>
                        setCuentasCobro((anteriores) => ({
                          ...anteriores,
                          [cuota.numero]: evento.target.value,
                        }))
                      }
                      className={`mt-1 w-full ${ENTRADA}`}
                    >
                      <option value="">— la cuenta del lote —</option>
                      {participantesElegibles.map((participante) => (
                        <option key={participante.key} value={participante.key}>
                          {participante.nombre}
                        </option>
                      ))}
                    </select>
                  </label>

                  {resumenQueCobra ? (
                    <div className="mt-2 text-xs text-slate-600">
                      <p className="font-medium text-blue-900">{resumenQueCobra.nombre}</p>
                      <p className="mt-1">
                        Le corresponde de este lote: {resumenQueCobra.acumulado} {moneda}
                      </p>
                      <p>
                        Cobra directo (cuotas asignadas): {resumenQueCobra.cobraDirecto} {moneda}
                      </p>
                      <p className="mt-1 font-semibold">
                        {resumenQueCobra.saldoProyectado > 0
                          ? `Le seguirías debiendo ${resumenQueCobra.saldoProyectado} ${moneda}`
                          : resumenQueCobra.saldoProyectado < 0
                            ? `Cobraría de más ${Math.abs(resumenQueCobra.saldoProyectado)} ${moneda}`
                            : 'Quedarías al día con esta persona'}
                      </p>
                      {resumenQueCobra.saldoActual !== 0 && (
                        <p className="mt-1 text-slate-500">
                          (incluye su saldo de cuenta corriente de hoy:{' '}
                          {resumenQueCobra.saldoActual} {moneda})
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">
                      Sin cuenta elegida acá y sin cuenta de cobro cargada en el lote: el cliente no
                      va a ver ningún alias para pagar esta cuota.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <h2 className={`mb-2 ${TITULO_H2}`}>Resumen del lote</h2>
      <p className="mb-3 text-sm text-slate-600">
        &quot;Le corresponde&quot; es lo que suma para esa persona en la distribución de las cuotas.
        &quot;Cobra directo&quot; es lo que le entra a su cuenta por las cuotas que le asignaste.
        La tercera columna cruza las dos con el saldo de cuenta corriente que ya tiene hoy.
      </p>
      {resumen.length === 0 ? (
        <p className="mb-6 text-sm text-slate-600">Sin distribución cargada todavía.</p>
      ) : (
        <div className={`mb-6 ${TABLA_CONTENEDOR}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className={TABLA_HEADER_FILA}>
              <th className={TABLA_HEADER_CELDA}>Participante</th>
              <th className={TABLA_HEADER_CELDA}>Le corresponde</th>
              <th className={TABLA_HEADER_CELDA}>Cobra directo</th>
              <th className={TABLA_HEADER_CELDA}>Cómo queda la cuenta</th>
              <th className={TABLA_HEADER_CELDA}>Objetivo</th>
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
                  {fila.cobraDirecto} {moneda}
                </td>
                <td className={TABLA_CELDA}>
                  {fila.saldoProyectado > 0
                    ? `Le debés ${fila.saldoProyectado} ${moneda}`
                    : fila.saldoProyectado < 0
                      ? `Cobra de más ${Math.abs(fila.saldoProyectado)} ${moneda}`
                      : 'Al día'}
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
