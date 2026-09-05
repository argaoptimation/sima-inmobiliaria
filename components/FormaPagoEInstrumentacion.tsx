'use client'

import { useState } from 'react'
import { Obligatorio } from './Obligatorio'
import { ENTRADA } from '@/lib/ui/clases'

interface Props {
  formaPagoInicial: string
  instrumentacionInicial: string
}

// Forma de pago + instrumentación, enlazadas.
//
// Regla de negocio (hablada con Nico el 04/09): el boleto de compraventa
// solo tiene sentido si el lote se vende financiado; pagado en un solo pago
// se va directo a escritura. Pero no es una ley: a veces se hace solo
// escritura aunque sea financiado.
//
// Por eso, desde el 05/09 (pedido de Gabriel), elegir la forma de pago
// PRESELECCIONA la instrumentación -- financiado → boleto, contado →
// escritura -- y el admin la puede pisar a mano si este caso es la
// excepción. Preselecciona, no fuerza: una vez que la tocó, sigue
// mandando lo que él eligió mientras no cambie la forma de pago de nuevo.
export function FormaPagoEInstrumentacion({ formaPagoInicial, instrumentacionInicial }: Props) {
  const [formaPago, setFormaPago] = useState(formaPagoInicial)
  const [instrumentacion, setInstrumentacion] = useState(instrumentacionInicial)

  function manejarCambioFormaPago(valor: string) {
    setFormaPago(valor)
    if (valor === 'financiado') setInstrumentacion('boleto')
    if (valor === 'contado') setInstrumentacion('escritura')
  }

  return (
    <>
      <label className="text-sm text-slate-600">
        Forma de pago
        <Obligatorio />
        <select
          name="formaPago"
          required
          value={formaPago}
          onChange={(evento) => manejarCambioFormaPago(evento.target.value)}
          className={`${ENTRADA} w-full`}
        >
          <option value="" disabled>
            — elegí una —
          </option>
          <option value="financiado">Financiado (en cuotas)</option>
          <option value="contado">Contado (en un solo pago)</option>
        </select>
      </label>

      <label className="text-sm text-slate-600">
        Instrumentación
        <Obligatorio />
        <select
          name="instrumentacion"
          required
          value={instrumentacion}
          onChange={(evento) => setInstrumentacion(evento.target.value)}
          className={`${ENTRADA} w-full`}
        >
          <option value="" disabled>
            — elegí una —
          </option>
          <option value="boleto">Boleto de compraventa</option>
          <option value="escritura">Escritura</option>
        </select>
        <span className="mt-1 block text-xs text-slate-500">
          Se completa sola según la forma de pago (financiado → boleto de compraventa, contado →
          escritura), pero podés cambiarla: si este caso va solo a escritura aunque sea financiado,
          elegí escritura. El boleto se genera automáticamente al confirmar la reserva solo si queda
          en &quot;Boleto de compraventa&quot;. Si más adelante cambia, se edita la reserva y se
          genera el boleto desde Boletos de compraventa: nada queda trabado.
        </span>
      </label>
    </>
  )
}
