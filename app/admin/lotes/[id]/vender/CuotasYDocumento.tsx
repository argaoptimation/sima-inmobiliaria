'use client'

import { useState } from 'react'
import { calcularMontoCuota } from '@/lib/lotes/calcular-monto-cuota'
import { generarCuotas } from '@/lib/lotes/generar-cuotas'
import { calcularMontoAFinanciar } from '@/lib/lotes/monto-a-financiar'
import { CampoArchivoDirecto } from '@/components/CampoArchivoDirecto'
import { ENTRADA } from '@/lib/ui/clases'

interface Props {
  loteId: string
  precioTotal: number | null
  monedaLote: string
  montoSenaRegistrada: number | null
  monedaSena: string | null
  cantidadCuotasInicial: string
  modoInicial: 'automatico' | 'manual'
  montosInicial: string[]
  entregaInicial: string
  interesMoratorioDiarioInicial: string
  // Path del documento ya subido a Storage, cuando el formulario rebotó
  // (por ejemplo por la confirmación de cliente existente). Se conserva
  // para no obligar al admin a volver a adjuntarlo.
  documentoInicial: string | null
}

const MAX_CUOTAS = 600

// Se calcula sobre lo que queda por financiar (precio - seña - entrega), no
// sobre el precio de lista: es la misma cuenta que hace venderLote() del
// lado del servidor, para que lo que se ve acá sea lo que se va a guardar.
function calcularMontosAutomaticos(montoAFinanciar: number, cantidadCuotas: number): string[] {
  const base = calcularMontoCuota(montoAFinanciar, cantidadCuotas)
  // La fecha es un placeholder -- este componente solo usa los montos de
  // cada cuota, no las fechas de vencimiento que generarCuotas() también
  // calcula.
  const cuotas = generarCuotas(cantidadCuotas, base, '2000-01-01', montoAFinanciar)
  return cuotas.map((cuota) => String(cuota.montoBase))
}

export function CuotasYDocumento({
  loteId,
  precioTotal,
  monedaLote,
  montoSenaRegistrada,
  monedaSena,
  cantidadCuotasInicial,
  modoInicial,
  montosInicial,
  entregaInicial,
  interesMoratorioDiarioInicial,
  documentoInicial,
}: Props) {
  const [cantidadCuotasTexto, setCantidadCuotasTexto] = useState(cantidadCuotasInicial)
  const [modo, setModo] = useState<'automatico' | 'manual'>(modoInicial)
  const [entregaTexto, setEntregaTexto] = useState(entregaInicial)
  const [interesMoratorioDiarioTexto, setInteresMoratorioDiarioTexto] = useState(
    interesMoratorioDiarioInicial
  )
  // Solo se usa en modo manual: en automático los montos son derivados
  // (dependen de la cantidad de cuotas Y de la entrega, que cambia mientras
  // se tipea), así que tenerlos en estado obligaba a sincronizarlos a mano.
  const [montosManuales, setMontosManuales] = useState<string[]>(montosInicial)

  const cantidadCuotas = Math.min(Number(cantidadCuotasTexto) || 0, MAX_CUOTAS)
  const entrega = Number(entregaTexto) || 0

  // La seña solo se descuenta si está en la misma moneda del lote -- mismo
  // criterio que venderLote() del lado del servidor.
  const senaADescontar =
    montoSenaRegistrada !== null && montoSenaRegistrada > 0 && monedaSena === monedaLote
      ? montoSenaRegistrada
      : 0

  const montoAFinanciar =
    precioTotal === null
      ? null
      : calcularMontoAFinanciar({ precioTotal, montoSena: senaADescontar, entrega })

  const montosAutomaticos =
    montoAFinanciar !== null && montoAFinanciar >= 0 && cantidadCuotas > 0
      ? calcularMontosAutomaticos(montoAFinanciar, cantidadCuotas)
      : []

  function manejarCambioModo(nuevoModo: 'automatico' | 'manual') {
    setModo(nuevoModo)
    // Al pasar a manual se arranca desde el reparto automático, que es lo
    // que el admin viene viendo en pantalla -- después lo edita. Pisa lo
    // que hubiera tipeado antes: pasar por "Automático" significa
    // justamente recalcular.
    if (nuevoModo === 'manual' && cantidadCuotas > 0) {
      setMontosManuales(
        Array.from({ length: cantidadCuotas }, (_, i) => montosAutomaticos[i] ?? '')
      )
    }
  }

  function manejarCambioCantidadCuotas(valor: string) {
    setCantidadCuotasTexto(valor)
    const nuevaCantidad = Math.min(Number(valor) || 0, MAX_CUOTAS)
    setMontosManuales((anteriores) =>
      Array.from({ length: nuevaCantidad }, (_, i) => anteriores[i] ?? '')
    )
  }

  function manejarCambioMonto(indice: number, valor: string) {
    setMontosManuales((anteriores) => {
      const nuevos = [...anteriores]
      nuevos[indice] = valor
      return nuevos
    })
  }

  const montos = modo === 'manual' ? montosManuales : montosAutomaticos
  const sumaManual =
    Math.round(montosManuales.reduce((acc, valor) => acc + (Number(valor) || 0), 0) * 100) / 100
  const diferencia =
    modo === 'manual' && montoAFinanciar !== null
      ? Math.round((sumaManual - montoAFinanciar) * 100) / 100
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
        className={ENTRADA}
      />

      <fieldset className="rounded-lg border border-blue-100 px-3 py-2">
        <legend className="text-sm font-medium text-blue-900">Cómo cargar las cuotas</legend>
        <label className="mr-4 text-sm text-slate-700">
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
        <label className="text-sm text-slate-700">
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

      <label className="text-sm text-slate-600">
        Entrega (opcional — monto entregado al firmar, además de la seña). Se descuenta del total
        antes de dividir en cuotas.
        <input
          name="entregaMonto"
          type="number"
          step="0.01"
          min="0"
          placeholder="Entrega"
          value={entregaTexto}
          onChange={(evento) => setEntregaTexto(evento.target.value)}
          className={`${ENTRADA} w-full`}
        />
      </label>

      <label className="text-sm text-slate-600">
        Interés moratorio diario (%) — opcional, se aplica sobre el saldo impago de una cuota
        vencida a partir del día siguiente a su vencimiento
        <input
          name="interesMoratorioDiario"
          type="number"
          step="0.01"
          min="0"
          max="100"
          placeholder="Interés moratorio diario"
          value={interesMoratorioDiarioTexto}
          onChange={(evento) => setInteresMoratorioDiarioTexto(evento.target.value)}
          className={`${ENTRADA} w-full`}
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
            className={ENTRADA}
          />
        ))}

      {cantidadCuotas > 0 && precioTotal !== null && montoAFinanciar !== null && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3 text-sm text-blue-900">
          <p className="font-semibold">Balance</p>
          <p className="mt-1">
            Precio de lista del lote: {precioTotal} {monedaLote}
          </p>
          {senaADescontar > 0 && <p>− Seña ya cobrada en la reserva: {senaADescontar}</p>}
          {montoSenaRegistrada !== null && montoSenaRegistrada > 0 && senaADescontar === 0 && (
            <p className="text-amber-800">
              La seña registrada ({montoSenaRegistrada} {monedaSena}) está en otra moneda que el
              lote ({monedaLote}): queda registrada como pago pero no se descuenta de las cuotas.
            </p>
          )}
          {entrega > 0 && <p>− Entrega al firmar: {entrega}</p>}
          <p className="mt-1 font-medium">
            = Queda a financiar en cuotas: {montoAFinanciar} {monedaLote}
          </p>
          {montoAFinanciar < 0 && (
            <p className="mt-1 font-medium text-red-700">
              La seña y la entrega superan el precio del lote. Revisá el monto de la entrega antes
              de confirmar.
            </p>
          )}
          {modo === 'automatico' ? (
            <p className="mt-1">
              {cantidadCuotas} cuota{cantidadCuotas === 1 ? '' : 's'} de {montos[0] ?? ''}
              {montos.length > 1 && ` (la última: ${montos[montos.length - 1]})`}
            </p>
          ) : (
            <>
              <p className="mt-1">Suma total de las cuotas cargadas: {sumaManual}</p>
              {diferencia !== null && diferencia !== 0 && (
                <p className="font-medium text-amber-800">
                  Diferencia respecto a lo que queda a financiar: {diferencia > 0 ? '+' : ''}
                  {diferencia}
                </p>
              )}
            </>
          )}
          {Number(interesMoratorioDiarioTexto) > 0 && (
            <p className="mt-1">
              Interés moratorio: {interesMoratorioDiarioTexto}% diario sobre el saldo impago de
              una cuota, desde el día siguiente a su vencimiento
            </p>
          )}
        </div>
      )}

      <CampoArchivoDirecto
        name="documentoFirmado"
        bucket="comprobantes"
        carpeta={`ventas/${loteId}`}
        tipoArchivo="documento"
        label="Documento firmado (boleto de compraventa o escritura)"
        nombreError="El documento firmado"
        valorInicial={documentoInicial}
        required
      />
    </>
  )
}
