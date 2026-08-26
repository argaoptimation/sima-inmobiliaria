'use client'

import { useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'

interface Props {
  children: React.ReactNode
  className?: string
}

// Envoltorio genérico para convertir cualquier <form method="get"> de
// filtros en uno "en vivo": aplica los cambios solos (sin apretar
// "Filtrar"), tipeando con un debounce corto y al toque en selects /
// checkboxes. No cambia los inputs de cada página -- lee el form entero
// con FormData, así que cualquier <input>/<select> con `name` ya
// funciona sin tocarlo.
export function FiltroEnVivo({ children, className }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const formRef = useRef<HTMLFormElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function aplicar() {
    if (!formRef.current) return
    const datos = new FormData(formRef.current)
    const params = new URLSearchParams()
    for (const [clave, valor] of datos.entries()) {
      if (typeof valor === 'string' && valor.trim() !== '') {
        params.set(clave, valor)
      }
    }
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  function alCambiar() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    aplicar()
  }

  function alTipear() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(aplicar, 300)
  }

  return (
    <form
      ref={formRef}
      className={className}
      onChange={alCambiar}
      onInput={alTipear}
      onSubmit={(evento) => {
        evento.preventDefault()
        if (debounceRef.current) clearTimeout(debounceRef.current)
        aplicar()
      }}
    >
      {children}
    </form>
  )
}
