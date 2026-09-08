'use client'

import { useState } from 'react'
import { vencimientosPendientes } from '@/lib/lotes/generar-cuotas-en-curso'
import { ENTRADA } from '@/lib/ui/clases'
import { Obligatorio } from '@/components/Obligatorio'

const MAX_CUOTAS = 600

// dd/mm/aaaa a partir de 'aaaa-mm-dd', sin pasar por Date -- que interpreta
// la fecha sola como UTC y en Argentina la corre un día.
function formatearFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-')
  return `${dia}/${mes}/${anio}`
}

// Los montos de las cuotas que todavía se deben.
//
// Sale un `cuotaMonto1..N` por cuota SIEMPRE, en los dos modos: con montos
// iguales van repetidos en inputs ocultos. Así el server action tiene un
// solo camino y no hay que mantener dos formas de leer lo mismo.
export function CuotasQueQuedan({
  cantidadInicial,
  fechaInicial,
  montosIniciales,
  cuotasYaPagadasInicial,
  modoInicial,
}: {
  cantidadInicial: string
  fechaInicial: string
  montosIniciales: string[]
  cuotasYaPagadasInicial: string
  modoInicial: 'iguales' | 'distintas'
}) {
  const [yaPagadasTexto, setYaPagadasTexto] = useState(cuotasYaPagadasInicial)
  const [cantidadTexto, setCantidadTexto] = useState(cantidadInicial)
  const [fecha, setFecha] = useState(fechaInicial)
  const [modo, setModo] = useState<'iguales' | 'distintas'>(modoInicial)
  const [montoUnico, setMontoUnico] = useState(montosIniciales[0] ?? '')
  const [montos, setMontos] = useState<string[]>(montosIniciales)

  const yaPagadas = Math.max(Number(yaPagadasTexto) || 0, 0)
  const cantidad = Math.min(Math.max(Number(cantidadTexto) || 0, 0), MAX_CUOTAS)
  const vencimientos = vencimientosPendientes(yaPagadas, cantidad, fecha)

  function cambiarMonto(indice: number, valor: string) {
    setMontos((previos) => {
      const copia = [...previos]
      copia[indice] = valor
      return copia
    })
  }

  // Al pasar a montos distintos se arranca desde el monto único ya cargado:
  // lo habitual es que la mayoría coincidan y solo unas pocas cambien, así
  // que copiarlo ahorra tipear la columna entera.
  function cambiarModo(nuevo: 'iguales' | 'distintas') {
    if (nuevo === 'distintas') {
      setMontos((previos) =>
        Array.from({ length: cantidad }, (_, indice) => previos[indice] || montoUnico)
      )
    }
    setModo(nuevo)
  }

  const montosFinales =
    modo === 'iguales'
      ? Array.from({ length: cantidad }, () => montoUnico)
      : Array.from({ length: cantidad }, (_, indice) => montos[indice] ?? '')

  const total = montosFinales.reduce((suma, monto) => suma + (Number(monto) || 0), 0)

  return (
    <>
      <input type="hidden" name="modoMontos" value={modo} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-600">
          Cuotas que ya pagó
          <Obligatorio />
          <input
            name="cuotasYaPagadas"
            type="number"
            min="0"
            step="1"
            value={yaPagadasTexto}
            onChange={(evento) => setYaPagadasTexto(evento.target.value)}
            required
            className={`w-full ${ENTRADA}`}
          />
        </label>
        <label className="text-sm text-slate-600">
          Cuotas que le quedan
          <Obligatorio />
          <input
            name="cuotasPendientes"
            type="number"
            min="1"
            step="1"
            value={cantidadTexto}
            onChange={(evento) => setCantidadTexto(evento.target.value)}
            required
            className={`w-full ${ENTRADA}`}
          />
        </label>
        <label className="text-sm text-slate-600 sm:col-span-2">
          Vencimiento de la próxima cuota
          <Obligatorio />
          <input
            name="fechaProximaCuota"
            type="date"
            value={fecha}
            onChange={(evento) => setFecha(evento.target.value)}
            required
            className={`w-full ${ENTRADA}`}
          />
          <span className="mt-1 block text-xs text-slate-500">
            Las cuotas viejas se fechan hacia atrás desde acá, una por mes.
          </span>
        </label>
      </div>

      <fieldset className="rounded-lg border border-blue-100 px-3 py-2">
        <legend className="text-sm font-medium text-blue-900">
          Las cuotas que quedan, ¿son todas del mismo monto?
        </legend>
        <label className="mr-4 text-sm text-slate-700">
          <input
            type="radio"
            checked={modo === 'iguales'}
            onChange={() => cambiarModo('iguales')}
            className="mr-1"
          />
          Sí, todas iguales
        </label>
        <label className="text-sm text-slate-700">
          <input
            type="radio"
            checked={modo === 'distintas'}
            onChange={() => cambiarModo('distintas')}
            className="mr-1"
          />
          No, cargo una por una
        </label>
      </fieldset>

      {modo === 'iguales' ? (
        <label className="text-sm text-slate-600 sm:max-w-xs">
          Monto de cada cuota que queda
          <Obligatorio />
          <input
            type="number"
            step="0.01"
            min="0"
            data-testid="monto-unico"
            value={montoUnico}
            onChange={(evento) => setMontoUnico(evento.target.value)}
            required
            className={`w-full ${ENTRADA}`}
          />
          <span className="mt-1 block text-xs text-slate-500">
            El valor de hoy, ya refinanciado e indexado. No el del boleto original.
          </span>
        </label>
      ) : cantidad === 0 || vencimientos.length === 0 ? (
        <p className="text-sm text-slate-500">
          Cargá cuántas cuotas quedan y cuándo vence la próxima para poder poner los montos uno
          por uno.
        </p>
      ) : (
        <div className="rounded-lg border border-blue-100 p-3">
          <p className="mb-2 text-sm text-slate-600">
            Un monto por cuota, con el valor de hoy. Vienen precargadas con el mismo número:
            cambiá solo las que difieran.
          </p>
          <div className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
            {vencimientos.map((cuota, indice) => (
              <label key={cuota.numero} className="text-xs text-slate-600">
                Cuota {cuota.numero} — vence {formatearFecha(cuota.fechaVencimiento)}
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  data-testid={`monto-cuota-${cuota.numero}`}
                  value={montos[indice] ?? ''}
                  onChange={(evento) => cambiarMonto(indice, evento.target.value)}
                  required
                  className={`w-full ${ENTRADA}`}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Lo que realmente viaja al servidor, en los dos modos. */}
      {montosFinales.map((monto, indice) => (
        <input key={indice} type="hidden" name={`cuotaMonto${indice + 1}`} value={monto} />
      ))}

      {cantidad > 0 && total > 0 && (
        <p className="rounded-lg border border-blue-100 bg-blue-50/40 p-3 text-sm text-blue-900">
          Le quedan por pagar <span className="font-semibold">{Math.round(total * 100) / 100}</span>{' '}
          en {cantidad} cuota{cantidad === 1 ? '' : 's'}
          {vencimientos.length > 0 && (
            <>
              , de la {vencimientos[0].numero} a la {vencimientos.at(-1)!.numero}, entre{' '}
              {formatearFecha(vencimientos[0].fechaVencimiento)} y{' '}
              {formatearFecha(vencimientos.at(-1)!.fechaVencimiento)}
            </>
          )}
          .
        </p>
      )}
    </>
  )
}
