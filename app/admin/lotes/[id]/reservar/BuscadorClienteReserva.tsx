'use client'

import { useEffect, useState, useTransition } from 'react'
import { buscarClientesParaReserva, type ClienteEncontrado } from './buscar-clientes-action'
import { ENTRADA, BANNER_OK } from '@/lib/ui/clases'

// Buscador live de clientes por DNI o nombre (pedido de Nico 01/09) --
// nunca navega ni recarga la página (a diferencia del <form method="GET">
// que reemplaza), así que no puede pisar el resto del formulario de
// reserva. Ver buscar-clientes-action.ts para el porqué del cambio.
export function BuscadorClienteReserva({
  onSeleccionar,
}: {
  onSeleccionar: (cliente: ClienteEncontrado) => void
}) {
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<ClienteEncontrado[]>([])
  const [seleccionado, setSeleccionado] = useState<ClienteEncontrado | null>(null)
  const [enfocado, setEnfocado] = useState(false)
  const [pendiente, startTransition] = useTransition()

  // El dropdown se abre/cierra en base a `query`/`enfocado` directamente
  // (derivado, no un `abierto` aparte) -- así no hace falta un setState
  // síncrono dentro del efecto solo para "limpiar" cuando el texto es
  // corto: si `query` tiene menos de 2 caracteres, esta condición ya da
  // false sola.
  const mostrarDropdown = enfocado && query.trim().length >= 2 && !seleccionado

  useEffect(() => {
    if (seleccionado) return // ya elegiste uno, no vuelvas a buscar solo

    const texto = query.trim()
    if (texto.length < 2) return

    const timeoutId = setTimeout(() => {
      startTransition(async () => {
        const encontrados = await buscarClientesParaReserva(texto)
        setResultados(encontrados)
      })
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [query, seleccionado])

  function elegir(cliente: ClienteEncontrado) {
    setSeleccionado(cliente)
    setQuery(cliente.dni ? `${cliente.dni} — ${cliente.full_name}` : cliente.full_name)
    setEnfocado(false)
    onSeleccionar(cliente)
  }

  return (
    <div className="relative mb-4">
      <input
        placeholder="Buscar cliente por DNI o nombre"
        value={query}
        onChange={(evento) => {
          setQuery(evento.target.value)
          setSeleccionado(null)
        }}
        onFocus={() => setEnfocado(true)}
        // Delay para que el click en un resultado (más abajo) alcance a
        // registrarse antes de que el dropdown se cierre por el blur.
        onBlur={() => setTimeout(() => setEnfocado(false), 150)}
        autoComplete="off"
        className={`w-full ${ENTRADA}`}
      />

      {mostrarDropdown && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-blue-100 bg-white shadow-lg">
          {resultados.length > 0 ? (
            <ul>
              {resultados.map((cliente) => (
                <li key={`${cliente.dni ?? ''}-${cliente.full_name}`}>
                  <button
                    type="button"
                    onClick={() => elegir(cliente)}
                    className="block w-full cursor-pointer px-3 py-2 text-left text-sm transition-colors hover:bg-blue-50"
                  >
                    <span className="font-semibold text-blue-900">{cliente.dni ?? '— sin DNI —'}</span>
                    <span className="ml-2 text-slate-600">{cliente.full_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            !pendiente && (
              <p className="px-3 py-2 text-sm text-slate-600">
                No encontramos ningún cliente con eso — completá los datos manualmente.
              </p>
            )
          )}
        </div>
      )}

      {seleccionado && (
        <p className={`mt-2 ${BANNER_OK}`}>
          Encontramos a {seleccionado.full_name} — sus datos se precargaron abajo, revisalos antes de
          confirmar.
        </p>
      )}
    </div>
  )
}
