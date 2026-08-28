'use client'

import { useState } from 'react'
import { convertirUsdAPesos } from '@/lib/cobranza/cotizacion-dolar'
import { ENTRADA } from '@/lib/ui/clases'

interface Props {
  saldoPendiente: number
  monedaLote: string
  interesMoratorioDiario: number | null
  cotizacionVigente: { valor: number; fecha: string } | null
}

// Convierte un monto ya cargado en `monedaOrigen` a la moneda nativa del
// lote, para poder comparar contra `saldoPendiente` (que siempre está en la
// moneda del lote) sin importar en qué moneda haya elegido pagar el cliente.
function convertirAMonedaLote(
  monto: number,
  monedaOrigen: string,
  monedaLote: string,
  cotizacion: number | null
): number {
  if (monedaOrigen === monedaLote || !cotizacion) return monto
  if (monedaOrigen === 'ARS' && monedaLote === 'USD') {
    return Math.round((monto / cotizacion) * 100) / 100
  }
  if (monedaOrigen === 'USD' && monedaLote === 'ARS') {
    return convertirUsdAPesos(monto, cotizacion)
  }
  return monto
}

export function MontoYMoneda({
  saldoPendiente,
  monedaLote,
  interesMoratorioDiario,
  cotizacionVigente,
}: Props) {
  const [moneda, setMoneda] = useState(monedaLote)
  const [montoTexto, setMontoTexto] = useState(String(saldoPendiente))

  const monto = Number(montoTexto) || 0
  const cotizacion = cotizacionVigente?.valor ?? null

  function elegirMoneda(nuevaMoneda: string) {
    if (nuevaMoneda === moneda) return
    setMoneda(nuevaMoneda)
    // Al cambiar la moneda se precarga de nuevo el total de la deuda, ahora
    // expresado en la moneda recién elegida -- así el cliente parte siempre
    // del monto completo en la unidad que va a transferir, en vez de
    // arrastrar un número pensado para la moneda anterior.
    setMontoTexto(String(convertirAMonedaLote(saldoPendiente, monedaLote, nuevaMoneda, cotizacion)))
  }

  const montoEnMonedaLote = convertirAMonedaLote(monto, moneda, monedaLote, cotizacion)
  const esPagoParcial =
    montoTexto.trim() !== '' && montoEnMonedaLote > 0 && montoEnMonedaLote < saldoPendiente

  return (
    <>
      <p className="rounded-lg bg-blue-50/40 p-3 text-sm">
        Monto de cuota adeudada:{' '}
        <span className="font-medium">
          {saldoPendiente} {monedaLote}
        </span>
        {monedaLote === 'USD' && cotizacion && (
          <span className="text-slate-600"> (≈ {convertirUsdAPesos(saldoPendiente, cotizacion)} ARS)</span>
        )}
      </p>

      <label className="text-sm text-slate-600">
        Elegí en qué moneda vas a transferir
        <select
          name="moneda"
          required
          value={moneda}
          onChange={(evento) => elegirMoneda(evento.target.value)}
          className={ENTRADA}
        >
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>
      </label>

      <label className="text-sm text-slate-600">
        Monto transferido ({moneda})
        <input
          name="monto"
          type="number"
          step="0.01"
          min="0.01"
          placeholder="Monto transferido"
          value={montoTexto}
          onChange={(evento) => setMontoTexto(evento.target.value)}
          required
          className={`w-full ${ENTRADA}`}
        />
      </label>

      {moneda === 'USD' && monedaLote === 'USD' && cotizacion && monto > 0 && (
        <p className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          Equivalente en pesos: {convertirUsdAPesos(monto, cotizacion)} ARS
        </p>
      )}
      {moneda === 'ARS' && monedaLote === 'USD' && cotizacion && monto > 0 && (
        <p className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          Equivalente en dólares: {Math.round((monto / cotizacion) * 100) / 100} USD
        </p>
      )}

      {esPagoParcial && interesMoratorioDiario && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠ Este es un pago parcial — te va a quedar un saldo de{' '}
          {Math.round((saldoPendiente - montoEnMonedaLote) * 100) / 100} {monedaLote} sobre esta
          cuota. Si no lo cubrís antes del vencimiento, ese saldo empieza a generar un interés
          moratorio del {interesMoratorioDiario}% por día a partir del día siguiente al
          vencimiento.
        </p>
      )}
    </>
  )
}
