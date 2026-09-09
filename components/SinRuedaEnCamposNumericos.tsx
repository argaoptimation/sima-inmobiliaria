'use client'

import { useEffect } from 'react'

// La rueda del mouse NO cambia el valor de un campo numérico (09/09, pedido
// de Gabriel). El caso real que lo motiva: estás cargando la seña o el monto
// de una cuota, el campo queda con el foco, scrolleás la página para seguir
// llenando el formulario y el número cambia solo. Se confirma una seña
// equivocada y nadie se entera hasta que no cierra la cuenta.
//
// Va como un listener global montado una sola vez en el layout raíz en vez
// de un `onWheel` por input: hay campos numéricos en 18 archivos, muchos
// dentro de componentes de servidor que tendrían que volverse cliente solo
// para esto.
//
// `blur()` y no `preventDefault()`: preventDefault frenaría también el
// scroll de la página, que es justamente lo que el usuario quería hacer.
// Al sacarle el foco, el navegador deja de mandarle la rueda al input, la
// página scrollea normal y el valor tipeado queda intacto.
//
// Las flechitas del spinner se ocultan por CSS en globals.css. Las flechas
// del teclado siguen funcionando a propósito: ahí la intención es explícita,
// no un accidente.
export function SinRuedaEnCamposNumericos() {
  useEffect(() => {
    function alGirarLaRueda(evento: WheelEvent) {
      const elemento = evento.target
      if (!(elemento instanceof HTMLInputElement)) return
      if (elemento.type !== 'number') return
      if (elemento !== document.activeElement) return
      elemento.blur()
    }

    document.addEventListener('wheel', alGirarLaRueda, { passive: true })
    return () => document.removeEventListener('wheel', alGirarLaRueda)
  }, [])

  return null
}
