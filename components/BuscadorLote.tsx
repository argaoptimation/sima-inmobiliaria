'use client'

import { useState } from 'react'
import { ENTRADA } from '@/lib/ui/clases'

// Mismo patrón que el buscador de participante de "Distribución de cuotas":
// input de texto con datalist nativo para no tener que scrollear un
// desplegable largo. El input visible no se manda (sin `name`); lo que
// viaja al server action es el hidden con el id ya resuelto.
export function BuscadorLote({ lotes }: { lotes: { id: string; identificador: string }[] }) {
  const [texto, setTexto] = useState('')
  const [loteId, setLoteId] = useState('')

  return (
    <>
      <input
        list="lista-lotes-cuenta-corriente"
        value={texto}
        placeholder="Buscar lote..."
        onChange={(evento) => {
          const nuevoTexto = evento.target.value
          setTexto(nuevoTexto)
          const encontrado = lotes.find((lote) => lote.identificador === nuevoTexto)
          setLoteId(encontrado ? encontrado.id : '')
        }}
        className={`w-full ${ENTRADA}`}
      />
      <datalist id="lista-lotes-cuenta-corriente">
        {lotes.map((lote) => (
          <option key={lote.id} value={lote.identificador} />
        ))}
      </datalist>
      <input type="hidden" name="loteId" value={loteId} />
    </>
  )
}
