'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

// Muestra lo que envuelve solo mientras la moneda elegida en este mismo
// formulario sea ARS (08/09, pedido de Gabriel: "si es en USD ni es
// necesario que aparezca"). En un lote en dólares no hay nada que indexar,
// así que el campo de índice era ruido en la mitad de las altas.
//
// Se engancha al <select name="moneda"> del formulario en vez de recibir la
// moneda por props porque los dos campos viven en secciones distintas de la
// pantalla: el de moneda arriba, en "El lote", y el de índice abajo, en
// "Cómo viene el pago". Subir el estado hasta un componente que envuelva a
// los dos habría obligado a convertir en cliente medio formulario.
//
// Ojo con el efecto de esconderlo: un campo que no está en el DOM no se
// manda en el submit, así que en un lote en dólares el índice llega vacío
// al server. Es justo lo que se quiere -- el action además lo fuerza a null
// cuando la moneda no es ARS.
export function SoloSiPesos({
  monedaInicial,
  children,
}: {
  monedaInicial: string
  children: ReactNode
}) {
  const contenedor = useRef<HTMLDivElement>(null)
  const [moneda, setMoneda] = useState(monedaInicial)

  useEffect(() => {
    const selectMoneda = contenedor.current
      ?.closest('form')
      ?.querySelector<HTMLSelectElement>('select[name="moneda"]')

    if (!selectMoneda) return

    // El navegador puede restaurar el valor elegido antes de que corra este
    // efecto (volver atrás, recarga con el formulario cacheado), así que se
    // lee una vez antes de escuchar.
    setMoneda(selectMoneda.value)

    const alCambiar = () => setMoneda(selectMoneda.value)
    selectMoneda.addEventListener('change', alCambiar)
    return () => selectMoneda.removeEventListener('change', alCambiar)
  }, [])

  return <div ref={contenedor}>{moneda === 'ARS' ? children : null}</div>
}
