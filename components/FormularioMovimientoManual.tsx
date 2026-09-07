'use client'

import { useState } from 'react'
import { BuscadorLote } from './BuscadorLote'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { BotonEnvio } from '@/components/BotonEnvio'
import { ENTRADA, BOTON_PRIMARIO } from '@/lib/ui/clases'
import { Obligatorio } from '@/components/Obligatorio'

// Cargar un movimiento a mano, igual para la cuenta corriente de una persona
// y para una cuenta externa (06/09, pedido de Gabriel: "si al fin y al cabo es
// lo mismo llevar las cuentas de acreedores o personas, replicá lo mismo").
//
// El formulario habla SIEMPRE en debe/haber, aunque la cuenta externa guarde
// débito/crédito: son la misma idea con otro nombre (débito = le debemos =
// debe; crédito = le entró plata = haber), y traducir en el server action deja
// una sola pantalla que aprender en vez de dos vocabularios.
//
// `etiquetas` es lo único que cambia entre las dos: en una cuenta externa no
// tiene sentido hablar de "su parte" de una distribución, porque no participa
// de ninguna.
export interface EtiquetasMovimiento {
  haber: string
  debe: string
}

export const ETIQUETAS_PERSONA: EtiquetasMovimiento = {
  haber: 'Haber (plata que le llegó)',
  debe: 'Debe manual (gasto, adelanto, descuento)',
}

export const ETIQUETAS_CUENTA_EXTERNA: EtiquetasMovimiento = {
  haber: 'Crédito (plata que le llegó)',
  debe: 'Débito (le debemos nosotros)',
}

export function FormularioMovimientoManual({
  agregarMovimientoManualAction,
  nombresUnicosParaSugerir,
  lotes,
  etiquetas = ETIQUETAS_PERSONA,
  idListaSugerencias = 'lista-personas-cuenta-corriente',
}: {
  agregarMovimientoManualAction: (formData: FormData) => Promise<void>
  nombresUnicosParaSugerir: string[]
  lotes: { id: string; identificador: string }[]
  etiquetas?: EtiquetasMovimiento
  idListaSugerencias?: string
}) {
  const [tipo, setTipo] = useState<'haber' | 'debe'>('haber')

  return (
    <form action={agregarMovimientoManualAction} className="mb-8 flex max-w-sm flex-col gap-3">
      <label className="text-sm text-slate-600">
        Tipo
        <select
          name="tipo"
          value={tipo}
          onChange={(evento) => setTipo(evento.target.value === 'debe' ? 'debe' : 'haber')}
          className={`w-full ${ENTRADA}`}
        >
          <option value="haber">{etiquetas.haber}</option>
          <option value="debe">{etiquetas.debe}</option>
        </select>
      </label>
      {tipo === 'debe' && (
        <label className="text-sm text-slate-600">
          ¿Suma o resta?
          <select name="signo" defaultValue="credito" className={`w-full ${ENTRADA}`}>
            <option value="credito">Crédito adicional (aumenta lo que se le debe)</option>
            <option value="gasto">Gasto o descuento (reduce lo que se le debe)</option>
          </select>
        </label>
      )}
      <label className="text-sm text-slate-600">
        Monto
        <Obligatorio />
        <input name="monto" type="number" step="0.01" min="0" required className={`w-full ${ENTRADA}`} />
      </label>
      <label className="text-sm text-slate-600">
        Moneda
        <select name="moneda" defaultValue="USD" className={`w-full ${ENTRADA}`}>
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>
      </label>
      <label className="text-sm text-slate-600">
        Fecha
        <Obligatorio />
        <input name="fechaEvento" type="date" required defaultValue={hoyArgentina()} className={`w-full ${ENTRADA}`} />
      </label>
      {tipo === 'haber' && (
        <>
          <label className="text-sm text-slate-600">
            De quién vino la plata (obligatorio si es pago directo del cliente)
            <input
              name="deParteDe"
              list={idListaSugerencias}
              placeholder="Buscar o escribir un nombre..."
              className={`w-full ${ENTRADA}`}
            />
            <datalist id={idListaSugerencias}>
              {nombresUnicosParaSugerir.map((nombre) => (
                <option key={nombre} value={nombre} />
              ))}
            </datalist>
          </label>
          <label className="text-sm text-slate-600">
            Origen
            <select name="origen" defaultValue="transferencia_empresa" className={`w-full ${ENTRADA}`}>
              <option value="transferencia_empresa">La empresa le transfirió su parte</option>
              <option value="pago_directo_cliente">
                El cliente le pagó directo, salteando a la empresa
              </option>
            </select>
          </label>
        </>
      )}
      <label className="text-sm text-slate-600">
        Lote relacionado (opcional)
        <BuscadorLote lotes={lotes} />
      </label>
      <label className="text-sm text-slate-600">
        Detalle {tipo === 'debe' ? '(obligatorio: explicá el motivo)' : '(opcional)'}
        <input
          name="detalle"
          required={tipo === 'debe'}
          placeholder={tipo === 'debe' ? 'Ej: adelanto de comisión, gasto de escribanía' : undefined}
          className={`w-full ${ENTRADA}`}
        />
      </label>
      <BotonEnvio className={`cursor-pointer self-start ${BOTON_PRIMARIO}`}>Agregar movimiento</BotonEnvio>
    </form>
  )
}
