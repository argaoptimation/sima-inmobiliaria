'use client'

import { useState } from 'react'

interface Props {
  saldoPendiente: number
  monedaLote: string
  interesMoratorioDiario: number | null
}

export function MontoYMoneda({ saldoPendiente, monedaLote, interesMoratorioDiario }: Props) {
  const [montoTexto, setMontoTexto] = useState(String(saldoPendiente))

  const monto = Number(montoTexto) || 0
  const esPagoParcial = montoTexto.trim() !== '' && monto > 0 && monto < saldoPendiente

  return (
    <>
      <label className="text-sm">
        Monto transferido
        <input
          name="monto"
          type="number"
          step="0.01"
          min="0.01"
          placeholder="Monto transferido"
          value={montoTexto}
          onChange={(evento) => setMontoTexto(evento.target.value)}
          required
          className="mt-1 block w-full rounded border px-3 py-2"
        />
      </label>

      {esPagoParcial && interesMoratorioDiario && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠ Este es un pago parcial — te va a quedar un saldo de{' '}
          {Math.round((saldoPendiente - monto) * 100) / 100} {monedaLote} sobre esta cuota. Si no
          lo cubrís antes del vencimiento, ese saldo empieza a generar un interés moratorio del{' '}
          {interesMoratorioDiario}% por día a partir del día siguiente al vencimiento.
        </p>
      )}

      <select name="moneda" required defaultValue={monedaLote} className="rounded border px-3 py-2">
        <option value="USD">USD</option>
        <option value="ARS">ARS</option>
      </select>
    </>
  )
}
