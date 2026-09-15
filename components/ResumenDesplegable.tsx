'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { BOTON_VER_TODO } from '@/lib/ui/clases'

// Una lista que muestra un resumen y despliega el resto con un botón (14/09).
// Qué entra en el resumen lo decide el servidor, marcando lo que queda
// afuera con FUERA_DEL_RESUMEN (lib/ui/clases.ts). Este componente solo
// guarda si está desplegada y lo escribe en data-resumido, que es lo que
// esconde o muestra esas filas.
export function ResumenDesplegable({
  children,
  hayMas,
  textoVerTodo,
  textoVerMenos,
  aclaracion,
  className = '',
}: {
  children: ReactNode
  hayMas: boolean
  textoVerTodo: string
  textoVerMenos: string
  // Qué se está viendo mientras está resumida, para que nadie lea el
  // resumen como si fuera la lista entera.
  aclaracion?: string
  className?: string
}) {
  const [desplegada, setDesplegada] = useState(false)
  const idLista = useId()
  const resumida = hayMas && !desplegada

  return (
    <div className={`group/resumen space-y-3 ${className}`} data-resumido={resumida ? 'si' : 'no'}>
      <div id={idLista}>{children}</div>
      {hayMas && (
        <div className="space-y-1.5">
          {resumida && aclaracion && (
            <p className="text-center text-[11px] text-slate-500">{aclaracion}</p>
          )}
          <button
            type="button"
            aria-expanded={desplegada}
            aria-controls={idLista}
            onClick={() => setDesplegada((valor) => !valor)}
            className={BOTON_VER_TODO}
          >
            {desplegada ? textoVerMenos : textoVerTodo}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${desplegada ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>
      )}
    </div>
  )
}
