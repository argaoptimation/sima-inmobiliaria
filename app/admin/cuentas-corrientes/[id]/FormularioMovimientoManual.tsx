'use client'

import { useState } from 'react'
import { BuscadorLote } from '../BuscadorLote'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'

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
      <label className="text-sm">
        Tipo
        <select
          name="tipo"
          value={tipo}
          onChange={(evento) => setTipo(evento.target.value === 'debe' ? 'debe' : 'haber')}
          className="mt-1 block w-full rounded border px-3 py-2"
        >
          <option value="haber">Haber (plata que le llegó)</option>
          <option value="debe">Debe manual (gasto, adelanto, descuento)</option>
        </select>
      </label>
      {tipo === 'debe' && (
        <label className="text-sm">
          ¿Suma o resta?
          <select name="signo" defaultValue="credito" className="mt-1 block w-full rounded border px-3 py-2">
            <option value="credito">Crédito adicional (aumenta lo que se le debe)</option>
            <option value="gasto">Gasto o descuento (reduce lo que se le debe)</option>
          </select>
        </label>
      )}
      <label className="text-sm">
        Monto
        <input
          name="monto"
          type="number"
          step="0.01"
          min="0"
          required
          className="mt-1 block w-full rounded border px-3 py-2"
        />
      </label>
      <label className="text-sm">
        Moneda
        <select name="moneda" defaultValue="USD" className="mt-1 block w-full rounded border px-3 py-2">
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>
      </label>
      <label className="text-sm">
        Fecha
        <input
          name="fechaEvento"
          type="date"
          required
          defaultValue={hoyArgentina()}
          className="mt-1 block w-full rounded border px-3 py-2"
        />
      </label>
      {tipo === 'haber' && (
        <>
          <label className="text-sm">
            De quién vino la plata (obligatorio si es pago directo del cliente)
            <input
              name="deParteDe"
              list="lista-personas-cuenta-corriente"
              placeholder="Buscar o escribir un nombre..."
              className="mt-1 block w-full rounded border px-3 py-2"
            />
            <datalist id="lista-personas-cuenta-corriente">
              {nombresUnicosParaSugerir.map((nombre) => (
                <option key={nombre} value={nombre} />
              ))}
            </datalist>
          </label>
          <label className="text-sm">
            Origen
            <select
              name="origen"
              defaultValue="transferencia_empresa"
              className="mt-1 block w-full rounded border px-3 py-2"
            >
              <option value="transferencia_empresa">La empresa le transfirió su parte</option>
              <option value="pago_directo_cliente">
                El cliente le pagó directo, salteando a la empresa
              </option>
            </select>
          </label>
        </>
      )}
      <label className="text-sm">
        Lote relacionado (opcional)
        <BuscadorLote lotes={lotes} />
      </label>
      <label className="text-sm">
        Detalle {tipo === 'debe' ? '(obligatorio: explicá el motivo)' : '(opcional)'}
        <input
          name="detalle"
          required={tipo === 'debe'}
          placeholder={tipo === 'debe' ? 'Ej: adelanto de comisión, gasto de escribanía' : undefined}
          className="mt-1 block w-full rounded border px-3 py-2"
        />
      </label>
      <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
        Agregar movimiento
      </button>
    </form>
  )
}
