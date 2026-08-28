'use client'

import { useState } from 'react'
import { BuscadorLote } from '../BuscadorLote'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { BotonEnvio } from '@/components/BotonEnvio'
import { ENTRADA, BOTON_PRIMARIO } from '@/lib/ui/clases'

export function FormularioMovimientoManual({
  agregarMovimientoManualAction,
  nombresUnicosParaSugerir,
  lotes,
}: {
  agregarMovimientoManualAction: (formData: FormData) => Promise<void>
  nombresUnicosParaSugerir: string[]
  lotes: { id: string; identificador: string }[]
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
          <option value="haber">Haber (plata que le llegó)</option>
          <option value="debe">Debe manual (gasto, adelanto, descuento)</option>
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
        <input name="fechaEvento" type="date" required defaultValue={hoyArgentina()} className={`w-full ${ENTRADA}`} />
      </label>
      {tipo === 'haber' && (
        <>
          <label className="text-sm text-slate-600">
            De quién vino la plata (obligatorio si es pago directo del cliente)
            <input
              name="deParteDe"
              list="lista-personas-cuenta-corriente"
              placeholder="Buscar o escribir un nombre..."
              className={`w-full ${ENTRADA}`}
            />
            <datalist id="lista-personas-cuenta-corriente">
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
