'use client'

import { useMemo, useState } from 'react'

export interface LoteBuscable {
  id: string
  identificador: string
  clienteNombre: string
  clienteDni: string | null
}

// Buscador de lote por identificador, nombre del cliente O su DNI (pedido de
// Gabriel 28/08) -- a diferencia de BuscadorLote (cuentas-corrientes, que
// usa un <datalist> nativo con match exacto por identificador), acá hace
// falta filtrar por 3 campos distintos a la vez y mostrar coincidencias
// parciales mientras se escribe, algo que un <datalist> no puede resolver
// solo con un unico `value` por opción. Por eso arma un desplegable propio,
// filtrado en JS.
export function BuscadorLoteAmplio({
  lotes,
  onSeleccionar,
}: {
  lotes: LoteBuscable[]
  onSeleccionar: (lote: LoteBuscable | null) => void
}) {
  const [texto, setTexto] = useState('')
  const [loteId, setLoteId] = useState('')
  const [abierto, setAbierto] = useState(false)

  const coincidencias = useMemo(() => {
    const consulta = texto.trim().toLowerCase()
    if (!consulta) return []
    return lotes
      .filter(
        (lote) =>
          lote.identificador.toLowerCase().includes(consulta) ||
          lote.clienteNombre.toLowerCase().includes(consulta) ||
          (lote.clienteDni ?? '').toLowerCase().includes(consulta)
      )
      .slice(0, 8)
  }, [texto, lotes])

  function seleccionar(lote: LoteBuscable) {
    setTexto(`${lote.identificador} — ${lote.clienteNombre}`)
    setLoteId(lote.id)
    setAbierto(false)
    onSeleccionar(lote)
  }

  function limpiar(nuevoTexto: string) {
    setTexto(nuevoTexto)
    setAbierto(true)
    if (loteId) {
      setLoteId('')
      onSeleccionar(null)
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={texto}
        placeholder="Lote, cliente o DNI..."
        onChange={(evento) => limpiar(evento.target.value)}
        onFocus={() => setAbierto(true)}
        // El blur se demora un toque para que el click en una opción del
        // desplegable (más abajo) alcance a dispararse antes de cerrarlo --
        // si no, el blur lo cierra primero y el click nunca llega a pegarle
        // a nada.
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        autoComplete="off"
        data-testid="buscador-lote-amplio"
        className="mt-1 block w-full rounded border px-3 py-2"
      />
      <input type="hidden" name="loteId" value={loteId} />
      {abierto && coincidencias.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded border bg-white text-sm shadow-lg">
          {coincidencias.map((lote) => (
            <li key={lote.id}>
              <button
                type="button"
                onMouseDown={(evento) => evento.preventDefault()}
                onClick={() => seleccionar(lote)}
                className="block w-full px-3 py-2 text-left hover:bg-gray-100"
              >
                <span className="font-medium">{lote.identificador}</span> — {lote.clienteNombre}
                {lote.clienteDni && <span className="text-gray-500"> (DNI {lote.clienteDni})</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {abierto && texto.trim() && coincidencias.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded border bg-white px-3 py-2 text-sm text-gray-500 shadow-lg">
          Sin coincidencias.
        </div>
      )}
    </div>
  )
}
