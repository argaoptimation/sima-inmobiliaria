import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { PAGINA_HEADER, BREADCRUMB, TITULO_H1 } from '@/lib/ui/clases'

// Fila de encabezado de página (PR2 del rediseño, MOCKUP 1): breadcrumb +
// h1 + slot de acciones a la derecha. Reemplaza el <h1 className={TITULO_H1}>
// suelto que tenía cada pantalla de /admin/*. `migas` son los tramos del
// breadcrumb DESPUÉS de "SIMA" (que es fijo, como en el mockup) -- p.ej.
// ["Lotes"] para el listado o ["Lotes", identificador] para el detalle.
// El párrafo descriptivo que algunas pantallas tenían debajo del h1 queda
// afuera de este componente (no es parte del diseño de EncabezadoPagina),
// se sigue poniendo como hermano debajo.
export function EncabezadoPagina({
  titulo,
  migas = [],
  acciones,
  className = 'mb-6',
}: {
  titulo: ReactNode
  migas?: string[]
  acciones?: ReactNode
  className?: string
}) {
  return (
    <div className={`${PAGINA_HEADER} ${className}`}>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className={BREADCRUMB}>
          <span>SIMA</span>
          {migas.map((miga, indice) => (
            <span key={indice} className="flex items-center gap-[7px]">
              <ChevronRight className="h-[13px] w-[13px]" />
              <span>{miga}</span>
            </span>
          ))}
        </div>
        <h1 className={TITULO_H1}>{titulo}</h1>
      </div>
      {acciones && <div className="flex shrink-0 gap-[9px]">{acciones}</div>}
    </div>
  )
}
