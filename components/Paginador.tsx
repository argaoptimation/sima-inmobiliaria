import { ChevronLeft, ChevronRight } from 'lucide-react'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { estadoDePaginado, urlDePagina } from '@/lib/ui/paginacion'
import { TABLA_PANEL_PIE } from '@/lib/ui/clases'

// El pie de un listado paginado: "Mostrando 51-100 de 322" + Anterior /
// Siguiente. Es un componente de servidor y los botones son links de
// verdad: así la página se puede compartir, abrir en otra pestaña y volver
// con el botón de atrás del navegador.
//
// Cuando hay una sola página no se dibuja nada. Un paginador que dice
// "página 1 de 1" es ruido: ocupa lugar y no ofrece ninguna acción.
export function Paginador({
  ruta,
  searchParams,
  pagina,
  total,
  queSonLasFilas = 'resultados',
}: {
  ruta: string
  searchParams: Record<string, string | undefined>
  pagina: number
  total: number
  // "lotes", "pagos", "clientes" -- para que el pie diga de qué habla.
  queSonLasFilas?: string
}) {
  const estado = estadoDePaginado(pagina, total)

  if (estado.totalPaginas <= 1) return null

  return (
    <div className={TABLA_PANEL_PIE}>
      <span className="tabular-nums">
        Mostrando{' '}
        <strong className="font-semibold text-slate-700">
          {estado.primeraFila}-{estado.ultimaFila}
        </strong>{' '}
        de <strong className="font-semibold text-slate-700">{total.toLocaleString('es-AR')}</strong>{' '}
        {queSonLasFilas}
      </span>

      <div className="flex items-center gap-2">
        {estado.hayAnterior ? (
          <EnlaceBoton
            href={urlDePagina(ruta, searchParams, estado.pagina - 1)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Anterior
          </EnlaceBoton>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 font-semibold text-slate-300">
            <ChevronLeft className="h-3.5 w-3.5" />
            Anterior
          </span>
        )}

        <span className="px-1 tabular-nums">
          Página {estado.pagina} de {estado.totalPaginas}
        </span>

        {estado.haySiguiente ? (
          <EnlaceBoton
            href={urlDePagina(ruta, searchParams, estado.pagina + 1)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800"
          >
            Siguiente
            <ChevronRight className="h-3.5 w-3.5" />
          </EnlaceBoton>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 font-semibold text-slate-300">
            Siguiente
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </div>
  )
}
