'use client'

import { useState } from 'react'
import { calcularMontoCuota } from '@/lib/lotes/calcular-monto-cuota'

interface Props {
  precioTotal: number | null
  montoSenaRegistrada: number | null
  monedaSena: string | null
  cantidadCuotasInicial: string
  modoInicial: 'automatico' | 'manual'
  montosInicial: string[]
}

function calcularMontosAutomaticos(precioTotal: number, cantidadCuotas: number): string[] {
  const base = calcularMontoCuota(precioTotal, cantidadCuotas)
  return Array.from({ length: cantidadCuotas }, (_, indice) => {
    const esUltima = indice === cantidadCuotas - 1
    const monto = esUltima ? Math.round((precioTotal - base * (cantidadCuotas - 1)) * 100) / 100 : base
    return String(monto)
  })
}

export function CuotasYDocumento({
  precioTotal,
  montoSenaRegistrada,
  monedaSena,
  cantidadCuotasInicial,
  modoInicial,
  montosInicial,
}: Props) {
  const [cantidadCuotasTexto, setCantidadCuotasTexto] = useState(cantidadCuotasInicial)
  const [modo, setModo] = useState<'automatico' | 'manual'>(modoInicial)
  const [montos, setMontos] = useState<string[]>(montosInicial)

  const cantidadCuotas = Number(cantidadCuotasTexto) || 0

  function recalcularMontos(nuevaCantidad: number, modoActual: 'automatico' | 'manual') {
    if (modoActual === 'automatico' && precioTotal !== null && nuevaCantidad > 0) {
      setMontos(calcularMontosAutomaticos(precioTotal, nuevaCantidad))
      return
    }
    setMontos((anteriores) => Array.from({ length: nuevaCantidad }, (_, i) => anteriores[i] ?? ''))
  }

  function manejarCambioCantidadCuotas(valor: string) {
    setCantidadCuotasTexto(valor)
    recalcularMontos(Number(valor) || 0, modo)
  }

  function manejarCambioModo(nuevoModo: 'automatico' | 'manual') {
    setModo(nuevoModo)
    recalcularMontos(cantidadCuotas, nuevoModo)
  }

  function manejarCambioMonto(indice: number, valor: string) {
    setMontos((anteriores) => {
      const nuevos = [...anteriores]
      nuevos[indice] = valor
      return nuevos
    })
  }

  const sumaManual = montos.reduce((acc, valor) => acc + (Number(valor) || 0), 0)
  const diferencia =
    modo === 'manual' && precioTotal !== null ? Math.round((sumaManual - precioTotal) * 100) / 100 : null

  return (
    <>
      <input
        name="cantidadCuotas"
        type="number"
        min="1"
        step="1"
        placeholder="Cantidad de cuotas (1 para venta al contado)"
        value={cantidadCuotasTexto}
        onChange={(evento) => manejarCambioCantidadCuotas(evento.target.value)}
        required
        className="rounded border px-3 py-2"
      />

      <fieldset className="rounded border px-3 py-2">
        <legend className="text-sm font-medium">Cómo cargar las cuotas</legend>
        <label className="mr-4 text-sm">
          <input
            type="radio"
            name="modo"
            value="automatico"
            checked={modo === 'automatico'}
            onChange={() => manejarCambioModo('automatico')}
            className="mr-1"
          />
          Automático
        </label>
        <label className="text-sm">
          <input
            type="radio"
            name="modo"
            value="manual"
            checked={modo === 'manual'}
            onChange={() => manejarCambioModo('manual')}
            className="mr-1"
          />
          Manual
        </label>
      </fieldset>

      {modo === 'manual' && cantidadCuotas > 0 && (
        <>
          {precioTotal !== null && (
            <p className="text-sm text-gray-600">Precio de lista del lote: {precioTotal}</p>
          )}
          {Array.from({ length: cantidadCuotas }, (_, indice) => (
            <input
              key={indice}
              name={`cuotaMonto${indice + 1}`}
              type="number"
              step="0.01"
              min="0"
              placeholder={`Cuota ${indice + 1}`}
              value={montos[indice] ?? ''}
              onChange={(evento) => manejarCambioMonto(indice, evento.target.value)}
              required
              className="rounded border px-3 py-2"
            />
          ))}
          <div className="rounded border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
            <p className="font-medium">Balance</p>
            <p className="mt-1">Suma total de las cuotas cargadas: {sumaManual}</p>
            {precioTotal !== null && <p>Precio de lista del lote: {precioTotal}</p>}
            {montoSenaRegistrada !== null && montoSenaRegistrada > 0 && (
              <p>
                Seña ya registrada: {montoSenaRegistrada} {monedaSena} (se descuenta de la cuota 1
                al confirmar)
              </p>
            )}
            {diferencia !== null && (
              <p className="mt-1 font-medium">
                Diferencia respecto al precio de lista: {diferencia > 0 ? '+' : ''}
                {diferencia}
              </p>
            )}
          </div>
        </>
      )}

      <label className="text-sm">
        Documento firmado (boleto de compraventa o escritura)
        <input
          name="documentoFirmado"
          type="file"
          required
          className="mt-1 block w-full rounded border px-3 py-2"
        />
      </label>
    </>
  )
}
