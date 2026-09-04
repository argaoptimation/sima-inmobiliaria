'use client'

import { BOTON_PRIMARIO } from '@/lib/ui/clases'

// El mismo botón sirve para "imprimir" (admin/efectivo, en papel) y para
// "descargar" (portal del cliente, como PDF): el diálogo de impresión del
// navegador ofrece "Guardar como PDF" -- no hace falta generar un PDF por
// separado, es la misma acción para las dos situaciones (pedido de
// Gabriel 04/09: "básicamente se replicaría la misma lógica en ambas").
export function BotonImprimirRecibo({ etiqueta = 'Imprimir / Descargar PDF' }: { etiqueta?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`cursor-pointer print:hidden ${BOTON_PRIMARIO}`}
    >
      {etiqueta}
    </button>
  )
}
