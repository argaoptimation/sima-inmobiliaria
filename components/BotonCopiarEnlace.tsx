'use client'

import { useState } from 'react'
import { Link2, Check } from 'lucide-react'

// Copia un enlace al portapapeles y avisa que lo copió. Pensado para el
// listado de Boletos de compraventa (05/09, pedido de Gabriel: "que ahí
// Nicolás los pueda descargar y enviar fácilmente") -- el enlace ya viene
// firmado y con vencimiento desde el servidor, así se puede pegar en un
// WhatsApp o un mail sin tener que bajar el archivo primero.
export function BotonCopiarEnlace({ enlace, titulo }: { enlace: string; titulo: string }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sin permiso de portapapeles (contexto no seguro, permiso denegado):
      // se abre en una pestaña para que igual pueda copiar la URL a mano.
      window.open(enlace, '_blank', 'noopener')
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      title={titulo}
      aria-label={titulo}
      className="cursor-pointer rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-800"
    >
      {copiado ? (
        <Check className="h-4 w-4 text-green-700" aria-hidden="true" />
      ) : (
        <Link2 className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  )
}
