'use client'

import { useState } from 'react'
import { calcularMontoCuota } from '@/lib/lotes/calcular-monto-cuota'
import { generarCuotas } from '@/lib/lotes/generar-cuotas'
import { calcularMontoAFinanciar } from '@/lib/lotes/monto-a-financiar'
import type { SenaADescontar } from '@/lib/lotes/convertir-sena'
import { CampoArchivoDirecto } from '@/components/CampoArchivoDirecto'
import { BotonEnvio } from '@/components/BotonEnvio'
import { mesDeFinalizacion } from '@/lib/lotes/mes-de-finalizacion'
import {
  ENTRADA,
  BOTON_PRIMARIO,
  GRILLA_DETALLE,
  SECCION_FORM,
  SECCION_FORM_NUMERO,
  SECCION_FORM_TITULO,
  SECCION_FORM_BAJADA,
  GRILLA_CAMPOS,
  CAMPO_ANCHO,
  ETIQUETA_CAMPO,
  PANEL,
  FICHA_LOTE_FILA,
  FICHA_LOTE_DESTACADO,
} from '@/lib/ui/clases'

interface Props {
  loteId: string
  precioTotal: number | null
  monedaLote: string
  montoSenaRegistrada: number | null
  monedaSena: string | null
  // Ya resuelta del lado del servidor: convertir una seña cobrada en
  // otra moneda necesita la cotización del día, que sale de la base.
  sena: SenaADescontar
  cantidadCuotasInicial: string
  modoInicial: 'automatico' | 'manual'
  montosInicial: string[]
  entregaInicial: string
  interesMoratorioDiarioInicial: string
  // Path del documento ya subido a Storage, cuando el formulario rebotó
  // (por ejemplo por la confirmación de cliente existente). Se conserva
  // para no obligar al admin a volver a adjuntarlo.
  documentoInicial: string | null
  // Fecha de la primera cuota. Vive acá y no en el servidor porque es uno
  // de los dos datos que definen en qué mes termina de pagar, y ese número
  // tiene que moverse mientras se elige la fecha.
  fechaPrimeraCuotaInicial: string
  // JSX armado en el servidor. Este componente pasó a ser el dueño de la
  // grilla (09/09, mockup 4) porque el resumen de liquidación de la derecha
  // necesita el estado que vive acá: la cantidad de cuotas y la entrega
  // cambian mientras se tipea. Pasar las secciones de al lado como props es
  // más simple que levantar el estado a un contexto para tres números.
  seccionCliente: React.ReactNode
  seccionParticipantes: React.ReactNode
  fichaTecnica: React.ReactNode
  textoBotonEnvio: string
}

// dd/mm/aaaa a partir de un 'aaaa-mm-dd' -- sin pasar por Date, que
// interpreta la fecha sola como UTC y en Argentina la corre un día.
function formatearFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-')
  return `${dia}/${mes}/${anio}`
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
  sena,
  cantidadCuotasInicial,
  modoInicial,
  montosInicial,
  entregaInicial,
  interesMoratorioDiarioInicial,
  documentoInicial,
  fechaPrimeraCuotaInicial,
  seccionCliente,
  seccionParticipantes,
  fichaTecnica,
  textoBotonEnvio,
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
  const [fechaPrimeraCuota, setFechaPrimeraCuota] = useState(fechaPrimeraCuotaInicial)

  const cantidadCuotas = Math.min(Number(cantidadCuotasTexto) || 0, MAX_CUOTAS)
  const entrega = Number(entregaTexto) || 0

  // La seña ya viene calculada en la moneda del lote (convertida si hizo
  // falta) -- mismo número que usa venderLote() del lado del servidor.
  const senaADescontar = sena.monto

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

  // En qué mes termina de pagar. No existía y es la pregunta que sigue a
  // "¿de cuánto es la cuota?". El cálculo vive en lib con sus tests: errar
  // por uno acá (contar desde la primera cuota o desde la siguiente) es la
  // clase de cosa que nadie revisa y que después aparece en un contrato.
  const mesFinalizacion = mesDeFinalizacion(fechaPrimeraCuota, cantidadCuotas)

  const montos = modo === 'manual' ? montosManuales : montosAutomaticos
  const sumaManual =
    Math.round(montosManuales.reduce((acc, valor) => acc + (Number(valor) || 0), 0) * 100) / 100
  const diferencia =
    modo === 'manual' && montoAFinanciar !== null
      ? Math.round((sumaManual - montoAFinanciar) * 100) / 100
      : null

  return (
    <div className={GRILLA_DETALLE}>
      <div className="space-y-4 lg:col-span-7">
        {seccionCliente}

        <section className={SECCION_FORM}>
          <div className="flex items-center gap-3">
            <span className={SECCION_FORM_NUMERO}>2</span>
            <div>
              <h2 className={SECCION_FORM_TITULO}>Estructura financiera</h2>
              <p className={SECCION_FORM_BAJADA}>
                Cuántas cuotas, de cuánto, y qué se descuenta antes de dividir.
              </p>
            </div>
          </div>

          <div className={GRILLA_CAMPOS}>
            <label className="text-sm">
              <span className={ETIQUETA_CAMPO}>
                Fecha de la primera cuota
                <span className="text-red-600"> *</span>
              </span>
              <input
                name="fechaPrimeraCuota"
                type="date"
                value={fechaPrimeraCuota}
                onChange={(evento) => setFechaPrimeraCuota(evento.target.value)}
                required
                className={`${ENTRADA} w-full`}
              />
            </label>

            <label className="text-sm">
              <span className={ETIQUETA_CAMPO}>Cantidad de cuotas</span>
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
                className={`${ENTRADA} w-full tabular-nums`}
              />
            </label>

            <fieldset>
              <legend className={ETIQUETA_CAMPO}>Cómo cargar las cuotas</legend>
              <div className="flex items-center gap-4 py-2">
                <label className="text-sm text-slate-700">
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
              </div>
            </fieldset>

            <label className="text-sm">
              <span className={ETIQUETA_CAMPO}>Entrega al firmar (opcional)</span>
              <input
                name="entregaMonto"
                type="number"
                step="0.01"
                min="0"
                placeholder="Entrega"
                value={entregaTexto}
                onChange={(evento) => setEntregaTexto(evento.target.value)}
                className={`${ENTRADA} w-full tabular-nums`}
              />
              <span className="mt-1 block text-xs text-slate-500">
                Monto entregado al firmar, además de la seña. Se descuenta del total antes de
                dividir en cuotas.
              </span>
            </label>

            <label className="text-sm">
              <span className={ETIQUETA_CAMPO}>Interés moratorio diario (%)</span>
              <input
                name="interesMoratorioDiario"
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="Interés moratorio diario"
                value={interesMoratorioDiarioTexto}
                onChange={(evento) => setInteresMoratorioDiarioTexto(evento.target.value)}
                className={`${ENTRADA} w-full tabular-nums`}
              />
              <span className="mt-1 block text-xs text-slate-500">
                Opcional. Se aplica sobre el saldo impago de una cuota vencida, a partir del día
                siguiente a su vencimiento.
              </span>
            </label>

            {modo === 'manual' && cantidadCuotas > 0 && (
              <div className={CAMPO_ANCHO}>
                <p className={ETIQUETA_CAMPO}>Monto de cada cuota</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
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
                      className={`${ENTRADA} w-full tabular-nums`}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className={CAMPO_ANCHO}>
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
            </div>
          </div>
        </section>

        {seccionParticipantes}
      </div>

      <div className="space-y-4 lg:col-span-5">
        {/* Resumen de liquidación: las mismas cuentas que ya se hacían, pero
            como tarjeta al costado en vez de un bloque de texto perdido
            entre los campos. Es lo que hay que mirar mientras se tipea. */}
        {cantidadCuotas > 0 && precioTotal !== null && montoAFinanciar !== null && (
          <div className={`${PANEL} space-y-3`}>
            <p className="font-heading text-base font-bold text-slate-900">Balance</p>

            <div className="space-y-1.5">
              <div className={FICHA_LOTE_FILA}>
                <span className="text-slate-500">Precio de lista del lote</span>
                <span className="font-semibold text-slate-800 tabular-nums">
                  {precioTotal} {monedaLote}
                </span>
              </div>

              {senaADescontar > 0 && (
                <>
                  <div className={FICHA_LOTE_FILA}>
                    <span className="text-slate-500">− Seña ya cobrada en la reserva:</span>
                    <span className="font-semibold text-emerald-700 tabular-nums">
                      {senaADescontar}
                    </span>
                  </div>
                  {sena.convertida && (
                    <p className="text-[11px] text-slate-500">
                      Son {montoSenaRegistrada} {monedaSena} convertidos a {monedaLote} con la
                      cotización de {sena.fechaCotizacion ? formatearFecha(sena.fechaCotizacion) : ''}
                      {sena.cotizacion ? ` (${sena.cotizacion} ARS por dólar)` : ''}.
                    </p>
                  )}
                </>
              )}

              {entrega > 0 && (
                <div className={FICHA_LOTE_FILA}>
                  <span className="text-slate-500">− Entrega al firmar:</span>
                  <span className="font-semibold text-emerald-700 tabular-nums">{entrega}</span>
                </div>
              )}
            </div>

            {sena.sinCotizacion && montoSenaRegistrada !== null && montoSenaRegistrada > 0 && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                La seña ({montoSenaRegistrada} {monedaSena}) está en otra moneda que el lote (
                {monedaLote}) y todavía no hay ninguna cotización del dólar cargada, así que no se
                puede convertir. Cargá la cotización y volvé a esta pantalla para que se descuente.
              </p>
            )}

            <p className="rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2.5 text-sm font-bold text-blue-900 tabular-nums">
              = Queda a financiar en cuotas: {montoAFinanciar} {monedaLote}
            </p>

            {montoAFinanciar < 0 && (
              <p className="text-sm font-medium text-red-700">
                La seña y la entrega superan el precio del lote. Revisá el monto de la entrega
                antes de confirmar.
              </p>
            )}

            {modo === 'automatico' ? (
              <p className="text-sm text-slate-700 tabular-nums">
                {cantidadCuotas} cuota{cantidadCuotas === 1 ? '' : 's'} de {montos[0] ?? ''}
                {montos.length > 1 && ` (la última: ${montos[montos.length - 1]})`}
              </p>
            ) : (
              <>
                <p className="text-sm text-slate-700 tabular-nums">
                  Suma total de las cuotas cargadas: {sumaManual}
                </p>
                {diferencia !== null && diferencia !== 0 && (
                  <p className="text-sm font-medium text-amber-800 tabular-nums">
                    Diferencia respecto a lo que queda a financiar: {diferencia > 0 ? '+' : ''}
                    {diferencia}
                  </p>
                )}
              </>
            )}

            {mesFinalizacion && (
              <div className={FICHA_LOTE_DESTACADO}>
                <span className="text-xs font-bold text-slate-700">Termina de pagar en</span>
                <span className="font-heading text-sm font-extrabold text-blue-700">
                  {mesFinalizacion}
                </span>
              </div>
            )}

            {Number(interesMoratorioDiarioTexto) > 0 && (
              <p className="text-xs text-slate-500">
                Interés moratorio: {interesMoratorioDiarioTexto}% diario sobre el saldo impago de
                una cuota, desde el día siguiente a su vencimiento
              </p>
            )}
          </div>
        )}

        {fichaTecnica}

        <div className={`${PANEL} space-y-2`}>
          <BotonEnvio className={`w-full cursor-pointer justify-center ${BOTON_PRIMARIO}`}>
            {textoBotonEnvio}
          </BotonEnvio>
          <p className="text-center text-[11px] text-slate-500">
            Al confirmar se crean las cuotas y se le da acceso al comprador. Después vas directo a
            repartir las cuotas.
          </p>
        </div>
      </div>
    </div>
  )
}
