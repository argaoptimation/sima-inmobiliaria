'use client'

import { useState } from 'react'
import { calcularMontoCuota } from '@/lib/lotes/calcular-monto-cuota'
import { generarCuotas } from '@/lib/lotes/generar-cuotas'

interface Props {
  precioTotal: number | null
  montoSenaRegistrada: number | null
  monedaSena: string | null
  cantidadCuotasInicial: string
  modoInicial: 'automatico' | 'manual'
  montosInicial: string[]
  entregaInicial: string
}

const MAX_CUOTAS = 600

function calcularMontosAutomaticos(precioTotal: number, cantidadCuotas: number): string[] {
  const base = calcularMontoCuota(precioTotal, cantidadCuotas)
  // La fecha es un placeholder -- este componente solo usa los montos de
  // cada cuota, no las fechas de vencimiento que generarCuotas() también
  // calcula.
  const cuotas = generarCuotas(cantidadCuotas, base, '2000-01-01', precioTotal)
  return cuotas.map((cuota) => String(cuota.montoBase))
}

export function CuotasYDocumento({
  precioTotal,
  montoSenaRegistrada,
  monedaSena,
  cantidadCuotasInicial,
  modoInicial,
  montosInicial,
  entregaInicial,
}: Props) {
  const [cantidadCuotasTexto, setCantidadCuotasTexto] = useState(cantidadCuotasInicial)
  const [modo, setModo] = useState<'automatico' | 'manual'>(modoInicial)
  const [entregaTexto, setEntregaTexto] = useState(entregaInicial)
  const [montos, setMontos] = useState<string[]>(() => {
    const cantidadInicialNum = Math.min(Number(cantidadCuotasInicial) || 0, MAX_CUOTAS)
    if (modoInicial === 'automatico' && precioTotal !== null && cantidadInicialNum > 0) {
      return calcularMontosAutomaticos(precioTotal, cantidadInicialNum)
    }
    return montosInicial
  })

  const cantidadCuotas = Math.min(Number(cantidadCuotasTexto) || 0, MAX_CUOTAS)

  function recalcularMontos(nuevaCantidad: number, modoActual: 'automatico' | 'manual') {
    if (modoActual === 'automatico' && precioTotal !== null && nuevaCantidad > 0) {
      setMontos(calcularMontosAutomaticos(precioTotal, nuevaCantidad))
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

  const entrega = Number(entregaTexto) || 0
  const sumaManual = Math.round(montos.reduce((acc, valor) => acc + (Number(valor) || 0), 0) * 100) / 100
  const diferencia =
    modo === 'manual' && precioTotal !== null
      ? Math.round((sumaManual + entrega - precioTotal) * 100) / 100
      : null

  return (
    <>
      <input
        name="cantidadCuotas"
        type="number"
        min="1"
        max={MAX_CUOTAS}
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

      <label className="text-sm">
        Entrega (opcional — monto entregado al firmar el boleto, además de la seña)
        <input
          name="entregaMonto"
          type="number"
          step="0.01"
          min="0"
          placeholder="Entrega"
          value={entregaTexto}
          onChange={(evento) => setEntregaTexto(evento.target.value)}
          className="mt-1 block w-full rounded border px-3 py-2"
        />
      </label>

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

      {cantidadCuotas > 0 && precioTotal !== null && (
        <div className="rounded border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
          <p className="font-medium">Balance</p>
          <p className="mt-1">Precio de lista del lote: {precioTotal}</p>
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
                  Diferencia respecto al precio de lista: {diferencia > 0 ? '+' : ''}
                  {diferencia}
                </p>
              )}
            </>
          )}
          {montoSenaRegistrada !== null && montoSenaRegistrada > 0 && (
            <p>
              Seña ya registrada: {montoSenaRegistrada} {monedaSena} (se descuenta de las primeras
              cuotas al confirmar)
            </p>
          )}
          {entrega > 0 && (
            <p>
              Entrega ingresada: {entrega} (no se descuenta de ninguna cuota, reduce el total
              financiado)
            </p>
          )}
        </div>
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
