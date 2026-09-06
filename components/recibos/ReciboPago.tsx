import type { DatosRecibo } from '@/lib/comprobantes/datos-recibo'
import { formatearFechaCorta } from '@/lib/fecha/formatear-fecha-corta'
import { mesYAnioEnLetras } from '@/lib/fecha/mes-en-letras'
import { DIRECCION_EMPRESA, TELEFONO_EMPRESA } from '@/lib/config/empresa'

const ETIQUETA_MOTIVO: Record<DatosRecibo['motivo'], string> = {
  cuota: 'Cuota',
  sena: 'Seña',
  entrega: 'Entrega',
  ajuste: 'Ajuste',
  // Mismo texto que se usa en el resto de la UI desde el 25/08 (ver
  // PanelEfectivo/admin/pagos) -- "Saldar" quedó reservado para el nombre
  // interno de la acción, no para lo que ve el cliente.
  saldar: 'Pago total anticipado',
}

const ETIQUETA_MEDIO_PAGO: Record<DatosRecibo['medioPago'], string> = {
  efectivo: 'EFECTIVO',
  transferencia: 'TRANSFERENCIA',
}

function montoFormateado(monto: number, moneda: string) {
  return `${moneda} ${monto.toFixed(2)}`
}

// Calcado del modelo que pasó Gabriel (comprobante_pago.png, 04/09) --
// mismo layout exacto: logo + dirección arriba, datos del cliente, franja
// LOTE/MANZANA/LOTEO/Cuota, párrafo de texto y el total en un recuadro.
// Pensado para ocupar solo la mitad de una hoja A4 al imprimir (ver la
// clase .recibo-imprimible en app/globals.css) -- así no se gasta una hoja
// entera por cada recibo.
export function ReciboPago({ datos }: { datos: DatosRecibo }) {
  const tieneCuotas = datos.motivo === 'cuota' && datos.cuotas.length > 0
  const numerosCuota = datos.cuotas.map((cuota) => cuota.numero).join(', ')

  const mesesUnicos = tieneCuotas
    ? [...new Set(datos.cuotas.map((cuota) => JSON.stringify(mesYAnioEnLetras(cuota.fechaVencimiento))))].map(
        (texto) => JSON.parse(texto) as { mes: string; anio: string }
      )
    : []
  const textoMeses = mesesUnicos
    .map((mesAnio) => `${mesAnio.mes} del año ${mesAnio.anio}`)
    .join(', ')

  return (
    <div className="recibo-imprimible mx-auto w-[190mm] max-w-full bg-white p-8 text-slate-800 print:mx-0 print:w-[190mm] print:p-8 print:shadow-none">
      {/* Encabezado */}
      <div className="mb-4 flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- next/image
            achata la transparencia de este logo al reescalarlo (bug
            reproducido 03/09), acá va plano igual que en login/set-password. */}
        <img src="/logo.png" alt="SIMACOR" className="h-16 w-auto" />
        <div className="pt-1 text-right text-sm font-semibold text-slate-700">
          <p>{DIRECCION_EMPRESA}</p>
          <p>{TELEFONO_EMPRESA}</p>
        </div>
      </div>

      {/* Datos del cliente */}
      <div className="mb-4">
        <p className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-800">Datos del cliente</p>
        <p className="text-sm">
          <span className="font-semibold">Nombre:</span> {datos.clienteNombre}
        </p>
        {datos.clienteDni && (
          <p className="text-sm">
            <span className="font-semibold">DNI:</span> {datos.clienteDni}
          </p>
        )}
      </div>

      {/* Franja lote / manzana / loteo / cuota */}
      <div className="mb-4 grid grid-cols-4 divide-x divide-slate-200 rounded-lg border border-slate-300 text-sm">
        <div className="p-2">
          <span className="font-bold">LOTE:</span> {datos.numeroLote ?? '—'}
        </div>
        <div className="p-2">
          <span className="font-bold">MANZANA:</span> {datos.manzana ?? '—'}
        </div>
        <div className="p-2">
          <span className="font-bold">LOTEO:</span> {datos.loteoNombre ?? datos.identificadorLote}
        </div>
        <div className="p-2">
          {tieneCuotas ? (
            <>
              <span className="font-bold">Cuota:</span> N°{numerosCuota}{' '}
            </>
          ) : (
            <>
              <span className="font-bold">Concepto:</span> {ETIQUETA_MOTIVO[datos.motivo]}{' '}
            </>
          )}
          <span className="font-bold">Fecha:</span> {formatearFechaCorta(datos.fecha)}
        </div>
      </div>

      {/* Párrafo */}
      <p className="mb-4 text-justify text-sm leading-relaxed">
        Se ha recibido del/la Sr./Sra. <span className="font-semibold">{datos.clienteNombre}</span> la suma
        de <span className="font-semibold">{montoFormateado(datos.monto, datos.moneda)}</span>. por la
        compra del lote {datos.numeroLote ?? datos.identificadorLote}
        {datos.manzana && ` manzana ${datos.manzana}`}
        {datos.loteoNombre && ` loteo ${datos.loteoNombre}`}.
        <br />
        {tieneCuotas ? (
          <>
            Cuota n°{numerosCuota} correspondiente al mes de{' '}
            <span className="font-semibold">{textoMeses}</span>.{' '}
          </>
        ) : (
          <>
            {ETIQUETA_MOTIVO[datos.motivo]}.{' '}
          </>
        )}
        Forma de pago: <span className="font-semibold">{ETIQUETA_MEDIO_PAGO[datos.medioPago]}</span>
      </p>

      {/* Total */}
      <div className="flex justify-end">
        <div className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">
          Total: {montoFormateado(datos.monto, datos.moneda)}
        </div>
      </div>
    </div>
  )
}
