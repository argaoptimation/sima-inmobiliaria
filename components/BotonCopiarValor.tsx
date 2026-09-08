'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

// Copia un texto plano al portapapeles (ej. el alias bancario al que el
// cliente tiene que transferir) y avisa que lo copió. Distinto de
// BotonCopiarEnlace: ese es para URLs firmadas y cae en abrir la pestaña si
// no hay permiso de portapapeles; acá el valor es un dato corto que el
// usuario puede tipear a mano igual, así que el fallback es solo no romper.
export function BotonCopiarValor({ valor, titulo }: { valor: string; titulo: string }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Contexto no seguro o permiso denegado: no hay nada que hacer, el
      // valor sigue visible al lado para copiarlo a mano.
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      title={titulo}
      aria-label={titulo}
      className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border border-blue-100 bg-blue-50 text-blue-800 transition-colors hover:bg-blue-100"
    >
      {copiado ? (
        <Check className="h-3.5 w-3.5 text-green-700" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  )
}
