'use client'

import { useEffect, useRef, useState } from 'react'
import { PREFIJOS_TELEFONO } from '@/lib/telefono/prefijos'
import { PaisFlag } from './PaisFlag'

// Reemplaza el <select> nativo: un <option> no puede contener un <img>/SVG
// (solo texto plano), así que para mostrar la bandera como ícono real (no
// emoji, ver PaisFlag) hace falta un combobox propio. De paso resuelve el
// otro pedido pendiente -- "no tenemos como buscar rápidamente" -- con un
// campo de búsqueda por nombre o código.
export function SelectorPrefijoTelefono({
  name,
  defaultValue,
}: {
  name: string
  defaultValue: string
}) {
  const [valor, setValor] = useState(defaultValue)
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const contenedorRef = useRef<HTMLDivElement>(null)
  const inputBusquedaRef = useRef<HTMLInputElement>(null)

  const actual = PREFIJOS_TELEFONO.find((p) => p.codigo === valor) ?? PREFIJOS_TELEFONO[0]

  // Sin acentos para comparar -- "mex" tiene que encontrar "México" (si no
  // se le sacan los acentos a ambos lados, "méxico".includes("mex") da
  // false por la "é"). ̀-ͯ son las marcas diacríticas combinantes
  // que separa `normalize('NFD')`.
  const sinAcentos = (texto: string) =>
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()

  const termino = sinAcentos(busqueda.trim())
  const filtrados = PREFIJOS_TELEFONO.filter((prefijo) => {
    if (!termino) return true
    return (
      sinAcentos(prefijo.nombre).includes(termino) ||
      prefijo.codigo.replace('-do', '').includes(termino.replace('+', ''))
    )
  })

  useEffect(() => {
    if (!abierto) return

    function alClickearAfuera(evento: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(evento.target as Node)) {
        setAbierto(false)
      }
    }
    function alPresionarTecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAbierto(false)
    }

    document.addEventListener('mousedown', alClickearAfuera)
    document.addEventListener('keydown', alPresionarTecla)
    inputBusquedaRef.current?.focus()

    return () => {
      document.removeEventListener('mousedown', alClickearAfuera)
      document.removeEventListener('keydown', alPresionarTecla)
    }
  }, [abierto])

  function elegir(codigo: string) {
    setValor(codigo)
    setAbierto(false)
    setBusqueda('')
  }

  return (
    <div ref={contenedorRef} className="relative w-[5.5rem] shrink-0">
      <input type="hidden" name={name} value={valor} />
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label="Prefijo de país"
        title={actual.nombre}
        className="flex w-full cursor-pointer items-center gap-1 rounded-lg border border-blue-100 bg-white px-1.5 py-2 text-sm transition-colors hover:bg-blue-50 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
      >
        <PaisFlag iso={actual.iso} />
        <span className="truncate text-blue-900">
          {actual.codigo === 'otro' ? '—' : `+${actual.codigo.replace('-do', '')}`}
        </span>
      </button>

      {abierto && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-lg border border-blue-100 bg-white shadow-lg"
        >
          <input
            ref={inputBusquedaRef}
            type="text"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder="Buscar país o código..."
            className="w-full border-b border-blue-100 px-3 py-2 text-sm focus:outline-none"
          />
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtrados.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-500">Sin resultados</li>
            )}
            {filtrados.map((prefijo) => (
              <li key={prefijo.codigo}>
                <button
                  type="button"
                  role="option"
                  aria-selected={prefijo.codigo === valor}
                  onClick={() => elegir(prefijo.codigo)}
                  className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-blue-50 ${
                    prefijo.codigo === valor ? 'bg-blue-50 font-semibold text-blue-800' : 'text-blue-900'
                  }`}
                >
                  <PaisFlag iso={prefijo.iso} />
                  <span className="flex-1 truncate">{prefijo.nombre}</span>
                  {prefijo.codigo !== 'otro' && (
                    <span className="text-slate-500">+{prefijo.codigo.replace('-do', '')}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
