'use client'

import { useEffect } from 'react'

// En un campo numérico, el valor SOLO se cambia tipeando (pedido de Gabriel:
// la rueda el 09/09, las flechas del teclado el 10/09).
//
// El caso real que lo motiva: estás cargando la seña o el monto de una cuota,
// el campo queda con el foco, movés la rueda para seguir llenando el
// formulario y el número cambia solo. Se confirma una seña equivocada y nadie
// se entera hasta que no cierra la cuenta. Con las flechas pasa lo mismo
// cuando alguien navega el formulario con el teclado.
//
// Va como un listener global montado una sola vez en el layout raíz en vez
// de un handler por input: hay campos numéricos en 18 archivos, muchos
// dentro de componentes de servidor que tendrían que volverse cliente solo
// para esto.
//
// Las flechitas del spinner se ocultan por CSS en globals.css.
export function CamposNumericosSoloTipeo() {
  useEffect(() => {
    function esCampoNumerico(elemento: EventTarget | null): elemento is HTMLInputElement {
      return elemento instanceof HTMLInputElement && elemento.type === 'number'
    }

    // `blur()` y no `preventDefault()`: preventDefault frenaría también el
    // scroll de la página, que es justo lo que el usuario quería hacer. Al
    // sacarle el foco, el navegador deja de mandarle la rueda al input, la
    // página scrollea normal y el valor tipeado queda intacto.
    function alGirarLaRueda(evento: WheelEvent) {
      const elemento = evento.target
      if (!esCampoNumerico(elemento)) return
      if (elemento !== document.activeElement) return
      elemento.blur()
    }

    // Acá sí `preventDefault()`: la flecha arriba/abajo dentro de un campo
    // numérico no hace ninguna otra cosa útil que valga la pena conservar
    // (no mueve el cursor, no scrollea la página mientras el input tiene el
    // foco), así que cancelarla no le saca nada a nadie.
    //
    // Izquierda y derecha NO se tocan: esas mueven el cursor dentro del
    // número, que es exactamente lo que hace falta para corregir un dígito.
    function alApretarUnaTecla(evento: KeyboardEvent) {
      if (evento.key !== 'ArrowUp' && evento.key !== 'ArrowDown') return
      if (!esCampoNumerico(evento.target)) return
      evento.preventDefault()
    }

    document.addEventListener('wheel', alGirarLaRueda, { passive: true })
    document.addEventListener('keydown', alApretarUnaTecla)
    return () => {
      document.removeEventListener('wheel', alGirarLaRueda)
      document.removeEventListener('keydown', alApretarUnaTecla)
    }
  }, [])

  return null
}
