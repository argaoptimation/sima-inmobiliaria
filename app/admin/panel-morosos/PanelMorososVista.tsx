'use client'

import { useState } from 'react'
import type { FilaMoroso } from '@/lib/cobranza/tramos-mora'
import { marcarPrejudicial } from '../lotes/[id]/actions'
import { BotonMarcarPrejudicial } from '../lotes/[id]/BotonPrejudicial'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { IconoWhatsApp } from '@/components/IconoWhatsApp'
import { armarLinkWhatsApp } from '@/lib/cobranza/plantillas-whatsapp'
import {
  NUMERO_TABULAR,
  ENTRADA,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
  ENLACE_TABLA,
} from '@/lib/ui/clases'

type TabTramo = 'todos' | 'debe1' | 'debe2' | 'posible' | 'prejudicial' | 'alDia'

interface Props {
  debe1: FilaMoroso[]
  debe2: FilaMoroso[]
  posiblePrejudicial: FilaMoroso[]
  prejudicialOficial: FilaMoroso[]
  // Agregado 03/09: clientes al día (con saldo pendiente pero sin cuotas
  // vencidas) -- antes no se calculaban acá. "Todos" ahora los incluye.
  alDia: FilaMoroso[]
  // Cobrador ahora entra a este panel (03/09), pero "Marcar prejudicial"
  // sigue siendo una acción exclusiva de administrador -- el server action
  // ya la re-valida (requireAdministrador), esto solo evita mostrar un botón
  // que para cobrador no haría nada.
  esAdministrador: boolean
}

// Normaliza para buscar: sin acentos, sin mayúsculas y sin los puntos del
// DNI. Sin esto, buscar "gonzalez" no encuentra a "González" y buscar
// "20123456" no encuentra al que está cargado como "20.123.456".
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.\-\s]/g, '')
}

export function PanelMorososVista({
  debe1,
  debe2,
  posiblePrejudicial,
  prejudicialOficial,
  alDia,
  esAdministrador,
}: Props) {
  const [tabActivo, setTabActivo] = useState<TabTramo>('todos')
  // Un solo campo para cliente, DNI y lote (09/09, pedido de Nico). Tres
  // filtros separados obligaban a saber de antemano en cuál escribir, y en
  // la práctica el que atiende el teléfono tiene UN dato suelto: un
  // apellido, un documento o un número de lote.
  const [busqueda, setBusqueda] = useState('')

  const totalEnMora =
    debe1.length + debe2.length + posiblePrejudicial.length + prejudicialOficial.length
  // "Todos" (pedido de Nico 03/09): la cabecera principal ahora suma también
  // a los clientes al día, no solo a los que están en mora.
  const totalGeneral = totalEnMora + alDia.length

  // Sin useMemo a proposito: el compilador de React ya memoiza esto solo, y
  // envolverlo a mano en un useMemo que devuelve una funcion le impide
  // optimizar el componente entero (regla react-hooks/preserve-manual-memoization).
  const aguja = normalizar(busqueda)
  const coincide = (fila: FilaMoroso) =>
    !aguja ||
    [
      fila.clienteNombre,
      fila.dni ?? '',
      fila.identificador,
      fila.loteoNombre ?? '',
      fila.manzana ?? '',
      fila.numeroLote ?? '',
    ].some((campo) => normalizar(campo).includes(aguja))

  const secciones = [
    {
      id: 'debe1' as const,
      titulo: 'Deben 1 cuota',
      subtitulo: '— vencida hace poco, todavía sin acción urgente',
      dotColor: 'bg-amber-400',
      bordeFila: 'border-l-[3px] border-l-amber-400',
      fondoFila: '',
      badgeClase: 'bg-amber-50 text-amber-700 border border-amber-200/60',
      filas: debe1,
      conBotonMarcar: false,
    },
    {
      id: 'debe2' as const,
      titulo: 'Deben 2 cuotas',
      subtitulo: '— dos cuotas acumuladas, seguimiento activo',
      dotColor: 'bg-amber-500',
      bordeFila: 'border-l-[3px] border-l-amber-500',
      fondoFila: '',
      badgeClase: 'bg-amber-100 text-amber-800 border border-amber-200',
      filas: debe2,
      conBotonMarcar: false,
    },
    {
      id: 'posible' as const,
      titulo: 'Posible prejudicial — 3 o más cuotas',
      subtitulo: '— señal automática, todavía sin marcar',
      dotColor: 'bg-orange-500',
      bordeFila: 'border-l-[3px] border-l-orange-500',
      fondoFila: 'bg-orange-50/40',
      badgeClase: 'bg-orange-100 text-orange-800 border border-orange-200',
      filas: posiblePrejudicial,
      conBotonMarcar: true,
    },
    {
      id: 'prejudicial' as const,
      titulo: 'Prejudicial oficial — ya marcado',
      subtitulo: '— caso derivado a gestión legal',
      dotColor: 'bg-red-500',
      bordeFila: 'border-l-[3px] border-l-red-500',
      fondoFila: 'bg-red-50/40',
      badgeClase: 'bg-red-100 text-red-800 border border-red-200',
      filas: prejudicialOficial,
      conBotonMarcar: false,
    },
    {
      id: 'alDia' as const,
      titulo: 'Al día',
      subtitulo: '— saldo pendiente, ninguna cuota vencida todavía',
      dotColor: 'bg-emerald-500',
      bordeFila: 'border-l-[3px] border-l-emerald-500',
      fondoFila: '',
      badgeClase: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
      filas: alDia,
      conBotonMarcar: false,
    },
  ].map((seccion) => ({
    ...seccion,
    filas: [...seccion.filas]
      .filter(coincide)
      .sort((a, b) => a.clienteNombre.localeCompare(b.clienteNombre)),
  }))

  const seccionesVisibles =
    tabActivo === 'todos' ? secciones : secciones.filter((sec) => sec.id === tabActivo)

  const resultadosVisibles = seccionesVisibles.reduce((acum, sec) => acum + sec.filas.length, 0)

  const kpis = [
    { id: 'todos' as const, etiqueta: 'Todos', valor: totalGeneral, color: 'blue' },
    { id: 'debe1' as const, etiqueta: 'Deben 1 cuota', valor: debe1.length, color: 'amber' },
    { id: 'debe2' as const, etiqueta: 'Deben 2 cuotas', valor: debe2.length, color: 'amber' },
    {
      id: 'posible' as const,
      etiqueta: 'Posible prejudicial',
      valor: posiblePrejudicial.length,
      color: 'orange',
    },
    {
      id: 'prejudicial' as const,
      etiqueta: 'Prejudicial oficial',
      valor: prejudicialOficial.length,
      color: 'red',
    },
    { id: 'alDia' as const, etiqueta: 'Al día', valor: alDia.length, color: 'emerald' },
  ]

  const CLASES_KPI: Record<string, { activo: string; texto: string; numero: string; hover: string }> = {
    blue: {
      activo: 'border-blue-400 bg-blue-50/50 ring-1 ring-blue-400',
      texto: 'text-blue-800',
      numero: 'text-blue-900',
      hover: 'hover:border-blue-300',
    },
    amber: {
      activo: 'border-amber-400 bg-amber-50/50 ring-1 ring-amber-400',
      texto: 'text-amber-800',
      numero: 'text-amber-700',
      hover: 'hover:border-amber-300',
    },
    orange: {
      activo: 'border-orange-400 bg-orange-50/50 ring-1 ring-orange-400',
      texto: 'text-orange-800',
      numero: 'text-orange-700',
      hover: 'hover:border-orange-300',
    },
    red: {
      activo: 'border-red-400 bg-red-50/50 ring-1 ring-red-400',
      texto: 'text-red-800',
      numero: 'text-red-700',
      hover: 'hover:border-red-300',
    },
    emerald: {
      activo: 'border-emerald-400 bg-emerald-50/50 ring-1 ring-emerald-400',
      texto: 'text-emerald-800',
      numero: 'text-emerald-700',
      hover: 'hover:border-emerald-300',
    },
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 6 KPIs que actúan como Tabs de Filtrado Directo -- "Todos" ahora
          suma también a los clientes al día (pedido de Nico 03/09), no solo
          los que están en mora. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((kpi) => {
          const activo = tabActivo === kpi.id
          const clases = CLASES_KPI[kpi.color]
          return (
            <button
              key={kpi.id}
              type="button"
              data-testid={`kpi-${kpi.id}`}
              onClick={() => setTabActivo(kpi.id)}
              className={`flex flex-col gap-1.5 rounded-xl border p-[14px_16px] text-left shadow-sm transition-all ${clases.hover} ${
                activo ? clases.activo : 'border-slate-200 bg-white'
              }`}
            >
              <span className={`text-xs font-semibold ${activo ? clases.texto : 'text-slate-500'}`}>
                {kpi.etiqueta}
              </span>
              <span
                className={`text-2xl font-extrabold ${NUMERO_TABULAR} tracking-[-0.02em] ${
                  activo ? clases.numero : 'text-slate-700'
                }`}
              >
                {kpi.valor}
              </span>
            </button>
          )
        })}
      </div>

      {/* Un solo buscador para cliente, DNI y lote (09/09, pedido de Nico). */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar por cliente, DNI, loteo o lote…"
          aria-label="Buscar por cliente, DNI, loteo o lote"
          className={`${ENTRADA} w-full max-w-md`}
        />
        {busqueda && (
          <span className="text-xs text-slate-500">
            {resultadosVisibles === 1 ? '1 resultado' : `${resultadosVisibles} resultados`}
          </span>
        )}
      </div>

      <div className={TABLA_CONTENEDOR}>
        {totalGeneral === 0 ? (
          <div className="p-8 text-center text-sm font-medium text-slate-600">
            No hay ningún lote vendido con saldo pendiente actualmente.
          </div>
        ) : resultadosVisibles === 0 ? (
          <div className="p-8 text-center text-sm text-slate-600">
            Ningún cliente coincide con &quot;{busqueda}&quot;.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className={TABLA_HEADER_FILA}>
                <th className={TABLA_HEADER_CELDA}>Loteo</th>
                <th className={TABLA_HEADER_CELDA}>Mza</th>
                <th className={TABLA_HEADER_CELDA}>Lote</th>
                <th className={TABLA_HEADER_CELDA}>Comprador</th>
                <th className={TABLA_HEADER_CELDA}>Situación</th>
                <th className={`${TABLA_HEADER_CELDA} text-right`}>Monto cuota</th>
                <th className={`${TABLA_HEADER_CELDA} text-right`}>Intereses</th>
                <th className={`${TABLA_HEADER_CELDA} text-right`}>Total adeudado</th>
                <th className={TABLA_HEADER_CELDA}></th>
              </tr>
            </thead>

            {seccionesVisibles.map((seccion) => {
              if (seccion.filas.length === 0) return null

              return (
                <tbody key={seccion.id} data-testid={`grupo-${seccion.id}`}>
                  <tr>
                    <td colSpan={9} className="bg-slate-50 px-4 py-2">
                      <span className="flex items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${seccion.dotColor}`} />
                        <span className="text-[13.5px] font-bold text-blue-900">{seccion.titulo}</span>
                        <span className="text-[12.5px] text-slate-500">{seccion.subtitulo}</span>
                        <span className={`ml-auto text-xs font-bold text-slate-500 ${NUMERO_TABULAR}`}>
                          ({seccion.filas.length})
                        </span>
                      </span>
                    </td>
                  </tr>

                  {seccion.filas.map((fila) => {
                    const marcarPrejudicialConId = marcarPrejudicial.bind(
                      null,
                      fila.loteId,
                      '/admin/panel-morosos'
                    )

                    return (
                      <tr
                        key={fila.loteId}
                        data-testid="fila-moroso"
                        className={`${TABLA_FILA} ${seccion.bordeFila} ${seccion.fondoFila}`}
                      >
                        <td className={TABLA_CELDA}>{fila.loteoNombre ?? '—'}</td>
                        <td className={TABLA_CELDA}>{fila.manzana ?? '—'}</td>
                        <td className={TABLA_CELDA}>
                          <EnlaceBoton href={`/admin/lotes/${fila.loteId}`} className={ENLACE_TABLA}>
                            {fila.numeroLote ?? fila.identificador}
                          </EnlaceBoton>
                        </td>
                        <td className={TABLA_CELDA}>
                          <EnlaceBoton
                            href={`/admin/clientes/${fila.clienteId}`}
                            className={`font-semibold ${ENLACE_TABLA}`}
                          >
                            {fila.clienteNombre}
                          </EnlaceBoton>
                          {fila.dni && (
                            <span className={`block text-xs text-slate-500 ${NUMERO_TABULAR}`}>
                              DNI {fila.dni}
                            </span>
                          )}
                        </td>
                        <td className={TABLA_CELDA}>
                          {/* "Pagado" / "Al día" en vez de "0 cuotas" (09/09,
                              pedido de Nico): el cero se leía como un dato
                              faltante y no como una buena noticia. */}
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${seccion.badgeClase}`}
                          >
                            {fila.cuotasVencidas > 0
                              ? `${fila.cuotasVencidas} ${fila.cuotasVencidas === 1 ? 'cuota' : 'cuotas'}`
                              : fila.pagado
                                ? 'Pagado'
                                : 'Al día'}
                          </span>
                        </td>
                        <td className={`${TABLA_CELDA} ${NUMERO_TABULAR} text-right whitespace-nowrap`}>
                          {fila.montoCuota.toLocaleString('es-AR')}{' '}
                          <span className="text-xs text-slate-500">{fila.moneda}</span>
                        </td>
                        <td className={`${TABLA_CELDA} ${NUMERO_TABULAR} text-right whitespace-nowrap`}>
                          {fila.interesMoratorio > 0 ? (
                            <span className="text-red-700">
                              +{fila.interesMoratorio.toLocaleString('es-AR')}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td
                          className={`${TABLA_CELDA} ${NUMERO_TABULAR} text-right font-bold whitespace-nowrap text-blue-900`}
                        >
                          {fila.totalAdeudado.toLocaleString('es-AR')}{' '}
                          <span className="text-xs font-normal text-slate-500">{fila.moneda}</span>
                        </td>
                        <td className={TABLA_CELDA}>
                          <span className="flex items-center justify-end gap-2.5">
                            {/* Botón de WhatsApp centralizado acá (pedido de
                                Gabriel 03/09, tras revisar la llamada con
                                Nico): un click abre el chat con el mensaje de
                                deuda pre-armado. El mensaje sigue el estado
                                real de cada fila, no uno fijo. */}
                            {fila.mensajeWhatsApp && fila.telefono && (
                              <a
                                href={armarLinkWhatsApp(fila.telefono, fila.mensajeWhatsApp)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-green-700"
                                title="Enviar recordatorio por WhatsApp"
                              >
                                <IconoWhatsApp className="h-3.5 w-3.5" />
                                WhatsApp
                              </a>
                            )}
                            {seccion.conBotonMarcar && esAdministrador && (
                              <BotonMarcarPrejudicial marcarPrejudicialAction={marcarPrejudicialConId} />
                            )}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              )
            })}
          </table>
        )}
      </div>
    </div>
  )
}
