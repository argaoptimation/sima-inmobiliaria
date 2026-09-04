'use client'

import { useMemo, useState } from 'react'
import { BuscadorLoteAmplio, type LoteBuscable } from './BuscadorLoteAmplio'
import { calcularInteresMoratorio } from '@/lib/cobranza/interes-moratorio'
import { BotonEnvio } from '@/components/BotonEnvio'
import { ENTRADA, BOTON_PRIMARIO } from '@/lib/ui/clases'
import { Obligatorio } from '@/components/Obligatorio'

export interface LoteConDeuda extends LoteBuscable {
  moneda: string
  interesMoratorioDiario: number | null
}

export interface CuotaPendienteInfo {
  id: string
  loteId: string
  numero: number
  fechaVencimiento: string
  saldoPendiente: number
}

// Panel lateral compacto (pedido de Gabriel 28/08 -- "no scroll para abajo,
// un panel al costado"): al elegir un lote en el buscador, muestra sus
// cuotas pendientes con la mora calculada en vivo, sin recargar la página.
// El formulario de "Registrar pago en efectivo" sigue siendo un POST normal
// a registrarPagoEfectivo (Server Action) -- lo único que pasó a vivir en el
// cliente es la búsqueda/selección de lote y el cálculo de mora, que ya era
// una función pura reusable tal cual (lib/cobranza/interes-moratorio.ts).
export function PanelEfectivo({
  lotes,
  cuotasPorLoteId,
  hoy,
  accion,
}: {
  lotes: LoteConDeuda[]
  cuotasPorLoteId: Record<string, CuotaPendienteInfo[]>
  hoy: string
  accion: (formData: FormData) => void | Promise<void>
}) {
  const [loteSeleccionado, setLoteSeleccionado] = useState<LoteConDeuda | null>(null)

  const cuotasConMora = useMemo(() => {
    if (!loteSeleccionado) return []
    const cuotasDelLote = cuotasPorLoteId[loteSeleccionado.id] ?? []
    return cuotasDelLote.map((cuota) => ({
      ...cuota,
      mora: calcularInteresMoratorio(
        { saldoPendiente: cuota.saldoPendiente, fechaVencimiento: cuota.fechaVencimiento },
        loteSeleccionado.interesMoratorioDiario,
        hoy
      ),
    }))
  }, [cuotasPorLoteId, loteSeleccionado, hoy])

  const totalSaldo = cuotasConMora.reduce((acumulado, cuota) => acumulado + cuota.saldoPendiente, 0)
  const totalMora = cuotasConMora.reduce((acumulado, cuota) => acumulado + cuota.mora, 0)

  function elegirLote(lote: LoteBuscable | null) {
    setLoteSeleccionado((lote as LoteConDeuda | null) ?? null)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_20rem]">
      <form action={accion} className="flex flex-col gap-3">
        <label className="text-sm text-slate-600">
          Lote
          <BuscadorLoteAmplio lotes={lotes} onSeleccionar={elegirLote} />
        </label>
        <label className="text-sm text-slate-600">
          Monto
          <Obligatorio />
          <input name="monto" type="number" step="0.01" min="0.01" required className={`${ENTRADA} w-full`} />
        </label>
        <label className="text-sm text-slate-600">
          Moneda
          <select name="moneda" defaultValue="USD" className={`${ENTRADA} w-full`}>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </label>
        <BotonEnvio className={`cursor-pointer self-start ${BOTON_PRIMARIO}`}>Registrar</BotonEnvio>
      </form>

      <aside
        className="rounded-lg border border-blue-100 bg-blue-50/30 p-4 text-sm"
        data-testid="panel-cuotas-lote"
      >
        {!loteSeleccionado ? (
          <p className="text-slate-500">Elegí un lote para ver sus cuotas pendientes y su mora.</p>
        ) : cuotasConMora.length === 0 ? (
          <>
            <p className="mb-1 font-semibold text-blue-900">{loteSeleccionado.clienteNombre}</p>
            <p className="text-slate-500">No tiene cuotas pendientes.</p>
          </>
        ) : (
          <>
            <p className="mb-1 font-semibold text-blue-900">{loteSeleccionado.clienteNombre}</p>
            {loteSeleccionado.clienteDni && (
              <p className="mb-3 text-xs text-slate-500">DNI {loteSeleccionado.clienteDni}</p>
            )}
            <ul className="mb-3 flex flex-col gap-2">
              {cuotasConMora.map((cuota) => (
                <li key={cuota.id} className="border-b border-blue-100 pb-2 last:border-b-0">
                  <div className="flex justify-between text-slate-700">
                    <span>Cuota {cuota.numero}</span>
                    <span>
                      {cuota.saldoPendiente} {loteSeleccionado.moneda}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Vence {cuota.fechaVencimiento}</span>
                    {cuota.mora > 0 && (
                      <span className="font-medium text-red-700">
                        +{cuota.mora} {loteSeleccionado.moneda} mora
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex justify-between border-t border-blue-100 pt-2 font-semibold text-blue-900">
              <span>Total adeudado</span>
              <span>
                {Math.round((totalSaldo + totalMora) * 100) / 100} {loteSeleccionado.moneda}
              </span>
            </div>
            {totalMora > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                (incluye {Math.round(totalMora * 100) / 100} {loteSeleccionado.moneda} de mora)
              </p>
            )}
          </>
        )}
      </aside>
    </div>
  )
}
