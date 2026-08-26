'use client'

import { useState } from 'react'
import { calcularMontoCuota } from '@/lib/lotes/calcular-monto-cuota'
import { generarCuotas } from '@/lib/lotes/generar-cuotas'

interface Props {
  totalDeuda: number
  moneda: string
}

const MAX_CUOTAS = 600

function calcularMontosAutomaticos(totalDeuda: number, cantidadCuotas: number): string[] {
  const base = calcularMontoCuota(totalDeuda, cantidadCuotas)
  // La fecha es un placeholder -- este componente solo usa los montos, no
  // las fechas de vencimiento que generarCuotas() también calcula (esas
  // las pone el campo "Fecha primera cuota nueva" del formulario).
  const cuotas = generarCuotas(cantidadCuotas, base, '2000-01-01', totalDeuda)
  return cuotas.map((cuota) => String(cuota.montoBase))
}

// Mismo patrón de entrada de cuotas que se usa al vender un lote (cantidad +
// automático/manual + balance) -- pedido de Gabriel 26/08: que refinanciar
// se sienta igual de familiar, en vez de una lista de checkboxes.
export function RefinanciarCuotas({ totalDeuda, moneda }: Props) {
  const [cantidadCuotasTexto, setCantidadCuotasTexto] = useState('')
  const [modo, setModo] = useState<'automatico' | 'manual'>('automatico')
  const [montos, setMontos] = useState<string[]>([])

  const cantidadCuotas = Math.min(Number(cantidadCuotasTexto) || 0, MAX_CUOTAS)

  function recalcularMontos(nuevaCantidad: number, modoActual: 'automatico' | 'manual') {
    if (modoActual === 'automatico' && nuevaCantidad > 0) {
      setMontos(calcularMontosAutomaticos(totalDeuda, nuevaCantidad))
      return
    }
    setMontos((anteriores) => Array.from({ length: nuevaCantidad }, (_, i) => anteriores[i] ?? ''))
  }

  function manejarCambioCantidadCuotas(valor: string) {
    setCantidadCuotasTexto(valor)
    recalcularMontos(Math.min(Number(valor) || 0, MAX_CUOTAS), modo)
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

  const sumaManual = Math.round(montos.reduce((acc, valor) => acc + (Number(valor) || 0), 0) * 100) / 100
  const diferencia = modo === 'manual' ? Math.round((sumaManual - totalDeuda) * 100) / 100 : null

  return (
    <>
      <input
        name="cantidadCuotasNuevas"
        type="number"
        min="1"
        max={MAX_CUOTAS}
        step="1"
        placeholder="Cantidad de cuotas nuevas"
        value={cantidadCuotasTexto}
        onChange={(evento) => manejarCambioCantidadCuotas(evento.target.value)}
        required
        className="rounded border px-3 py-2"
      />

      <fieldset className="rounded border px-3 py-2">
        <legend className="text-sm font-medium">Cómo cargar las cuotas nuevas</legend>
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

      {modo === 'manual' &&
        cantidadCuotas > 0 &&
        Array.from({ length: cantidadCuotas }, (_, indice) => (
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

      {cantidadCuotas > 0 && (
        <div className="rounded border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
          <p className="font-medium">Balance</p>
          <p className="mt-1">
            Deuda total a refinanciar: {totalDeuda} {moneda}
          </p>
          {modo === 'automatico' ? (
            <p>
              {cantidadCuotas} cuota{cantidadCuotas === 1 ? '' : 's'} de {montos[0] ?? ''}
              {montos.length > 1 && ` (la última: ${montos[montos.length - 1]})`}
            </p>
          ) : (
            <>
              <p>Suma total de las cuotas cargadas: {sumaManual}</p>
              {diferencia !== null && (
                <p className="font-medium">
                  Diferencia respecto a la deuda: {diferencia > 0 ? '+' : ''}
                  {diferencia}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}
