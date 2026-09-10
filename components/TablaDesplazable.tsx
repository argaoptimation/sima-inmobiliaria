'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// Una tabla ancha adentro de una caja que se desplaza en los dos ejes
// (10/09, pedido de Gabriel). Resuelve dos cosas de una:
//
//   1. Las flechas para moverse a lo ancho. "No todos usan el apretar la
//      rueda del mouse para poder navegar horizontal": es cierto, y el
//      shift+rueda tampoco lo conoce nadie que no sea programador.
//
//   2. Que el encabezado quede fijo al bajar. Para que `sticky top-0`
//      funcione, el thead tiene que estar adentro de una caja que se
//      desplace verticalmente; con la caja creciendo hasta el largo de la
//      tabla, el navegador no tiene contra que pegarlo y el encabezado se
//      va para arriba con todo lo demas.
//
// Sobre el ALTO de la caja, que costo elegir. Se probaron y se descartaron
// dos alternativas, las dos medidas en el navegador:
//
//   * Layout de alto completo, con la pantalla quieta y la tabla como unica
//     zona que se desplaza. Es lo mas prolijo en teoria. Pero arriba de la
//     tabla hay 568 pixeles de encabezado + tarjeta de cotizacion +
//     filtros: en una pantalla de 1080 la tabla quedaba en 424px, seis
//     filas. Peor que antes.
//
//   * Medir el alto disponible al vuelo para terminar justo en el borde de
//     abajo de la pantalla. Mismo problema por el mismo motivo: siete filas.
//
// Asi que la caja es alta -- casi toda la pantalla -- y puede terminar abajo
// del borde, igual que la tabla de antes. Se ven las mismas filas que se
// veian, y ademas el encabezado ya no se va. Lo unico que cambia es que la
// rueda sobre la tabla mueve primero la tabla y despues la pantalla, que es
// como se comporta cualquier planilla.
//
// Es un componente de cliente porque desplazar una caja es, inevitablemente,
// tocar el DOM. Es lo unico que hace del lado del navegador: las filas las
// sigue dibujando el servidor.
export function TablaDesplazable({
  children,
  alto = 'max-h-[calc(100vh-10rem)]',
}: {
  children: React.ReactNode
  alto?: string
}) {
  const caja = useRef<HTMLDivElement>(null)
  const [puedeIzquierda, setPuedeIzquierda] = useState(false)
  const [puedeDerecha, setPuedeDerecha] = useState(false)

  const revisarBordes = useCallback(() => {
    const elemento = caja.current
    if (!elemento) return
    // 2px de tolerancia: con el zoom del navegador en algo que no sea 100%
    // los anchos quedan fraccionarios y `scrollLeft + clientWidth` nunca da
    // exactamente `scrollWidth`, asi que la flecha derecha quedaria siempre
    // encendida al final de todo.
    setPuedeIzquierda(elemento.scrollLeft > 2)
    setPuedeDerecha(elemento.scrollLeft + elemento.clientWidth < elemento.scrollWidth - 2)
  }, [])

  useEffect(() => {
    const elemento = caja.current
    if (!elemento) return

    revisarBordes()
    elemento.addEventListener('scroll', revisarBordes, { passive: true })

    // La tabla cambia de ancho sola: al abrir "Filtros avanzados", al
    // achicar la ventana, al plegar el menu lateral. Sin esto las flechas se
    // quedan con el estado de la primera medicion.
    const observador = new ResizeObserver(revisarBordes)
    observador.observe(elemento)
    if (elemento.firstElementChild) observador.observe(elemento.firstElementChild)

    return () => {
      elemento.removeEventListener('scroll', revisarBordes)
      observador.disconnect()
    }
  }, [revisarBordes])

  function desplazar(sentido: -1 | 1) {
    const elemento = caja.current
    if (!elemento) return
    // 70% del ancho visible y no el 100%: queda un pedazo de lo que se
    // estaba viendo, que es lo que te dice de donde veniste.
    elemento.scrollBy({ left: sentido * elemento.clientWidth * 0.7, behavior: 'smooth' })
  }

  const hayADonde = puedeIzquierda || puedeDerecha

  return (
    <>
      {hayADonde && (
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2">
          <span className="mr-auto text-[11px] font-medium text-slate-400">
            La tabla sigue hacia el costado
          </span>
          <FlechaDeTabla
            sentido="izquierda"
            habilitada={puedeIzquierda}
            onClick={() => desplazar(-1)}
          />
          <FlechaDeTabla sentido="derecha" habilitada={puedeDerecha} onClick={() => desplazar(1)} />
        </div>
      )}
      <div ref={caja} className={`w-full overflow-auto ${alto}`}>
        {children}
      </div>
    </>
  )
}

function FlechaDeTabla({
  sentido,
  habilitada,
  onClick,
}: {
  sentido: 'izquierda' | 'derecha'
  habilitada: boolean
  onClick: () => void
}) {
  const Icono = sentido === 'izquierda' ? ChevronLeft : ChevronRight
  const etiqueta =
    sentido === 'izquierda' ? 'Ver las columnas de la izquierda' : 'Ver las columnas de la derecha'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!habilitada}
      aria-label={etiqueta}
      title={etiqueta}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${
        habilitada
          ? 'cursor-pointer border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'
          : 'border-slate-100 bg-slate-50 text-slate-300'
      }`}
    >
      <Icono className="h-4 w-4" />
    </button>
  )
}
