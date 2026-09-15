'use client'

import { useEffect, useRef } from 'react'

interface Props {
  // `name` de las casillas que marca (las del mismo <form>).
  nombre: string
  etiqueta: string
  className?: string
}

// Casilla del encabezado de una tabla que marca o desmarca todas las filas
// (15/09, Loteos: "Reasignar lotes en bloque"). No viaja en el formulario:
// no tiene `name`, lo que se manda sigue siendo cada casilla de fila.
//
// Todo va con un listener nativo sobre el <form> y no con el onChange de
// React a propósito: el evento llega al <form> ANTES que al listener de
// React, así que si la resincronización corriera aparte leería el estado
// de las filas previo al click y desmarcaría esta misma casilla.
//
// Queda a medias (indeterminada) cuando hay algunas filas marcadas y otras
// no, y se vuelve a calcular cuando cambian las filas (un filtro en vivo
// reemplaza la tabla sin recargar la página).
export function CasillaMarcarTodos({ nombre, etiqueta, className }: Props) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const casillaGeneral = ref.current
    const form = casillaGeneral?.form
    if (!casillaGeneral || !form) return

    const casillasDeFila = () =>
      [...form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].filter(
        (casilla) => casilla.name === nombre
      )

    function sincronizar() {
      const casillas = casillasDeFila()
      const marcadas = casillas.filter((casilla) => casilla.checked).length
      casillaGeneral!.disabled = casillas.length === 0
      casillaGeneral!.checked = casillas.length > 0 && marcadas === casillas.length
      casillaGeneral!.indeterminate = marcadas > 0 && marcadas < casillas.length
    }

    function alCambiar(evento: Event) {
      if (evento.target === casillaGeneral) {
        for (const casilla of casillasDeFila()) casilla.checked = casillaGeneral!.checked
      }
      sincronizar()
    }

    sincronizar()
    form.addEventListener('change', alCambiar)
    const observador = new MutationObserver(sincronizar)
    observador.observe(form, { childList: true, subtree: true })

    return () => {
      form.removeEventListener('change', alCambiar)
      observador.disconnect()
    }
  }, [nombre])

  return <input ref={ref} type="checkbox" aria-label={etiqueta} title={etiqueta} className={className} />
}
