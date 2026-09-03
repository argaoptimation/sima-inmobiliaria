'use client'

import { useState } from 'react'
import type { FilaMoroso } from '@/lib/cobranza/tramos-mora'
import { marcarPrejudicial } from '../lotes/[id]/actions'
import { BotonMarcarPrejudicial } from '../lotes/[id]/BotonPrejudicial'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { armarLinkWhatsApp } from '@/lib/cobranza/plantillas-whatsapp'
import {
  NUMERO_TABULAR,
  MOROSOS_LISTA_WRAP,
  MOROSOS_GRUPO_HEADER,
  MOROSOS_FILA,
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

export function PanelMorososVista({
  debe1,
  debe2,
  posiblePrejudicial,
  prejudicialOficial,
  alDia,
  esAdministrador,
}: Props) {
  const [tabActivo, setTabActivo] = useState<TabTramo>('todos')

  const totalEnMora =
    debe1.length + debe2.length + posiblePrejudicial.length + prejudicialOficial.length
  // "Todos" (pedido de Nico 03/09): la cabecera principal ahora suma también
  // a los clientes al día, no solo a los que están en mora.
  const totalGeneral = totalEnMora + alDia.length

  const secciones = [
    {
      id: 'debe1' as const,
      titulo: 'Deben 1 cuota',
      subtitulo: '— vencida hace poco, todavía sin acción urgente',
      dotColor: 'bg-amber-400',
      bordeFila: 'border-l-[3px] border-l-amber-400',
      fondoFila: '',
      badgeClase: 'bg-amber-50 text-amber-700 border border-amber-200/60',
      filas: [...debe1].sort((a, b) => a.clienteNombre.localeCompare(b.clienteNombre)),
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
      filas: [...debe2].sort((a, b) => a.clienteNombre.localeCompare(b.clienteNombre)),
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
      filas: [...posiblePrejudicial].sort((a, b) => a.clienteNombre.localeCompare(b.clienteNombre)),
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
      filas: [...prejudicialOficial].sort((a, b) => a.clienteNombre.localeCompare(b.clienteNombre)),
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
      filas: [...alDia].sort((a, b) => a.clienteNombre.localeCompare(b.clienteNombre)),
      conBotonMarcar: false,
    },
  ]

  const seccionesVisibles =
    tabActivo === 'todos'
      ? secciones
      : secciones.filter((sec) => sec.id === tabActivo)

  return (
    <div className="flex flex-col gap-5">
      {/* 6 KPIs que actúan como Tabs de Filtrado Directo -- "Todos" ahora
          suma también a los clientes al día (pedido de Nico 03/09), no solo
          los que están en mora. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <button
          type="button"
          onClick={() => setTabActivo('todos')}
          className={`flex flex-col gap-1.5 rounded-xl border p-[14px_16px] text-left shadow-sm transition-all hover:border-blue-300 ${
            tabActivo === 'todos'
              ? 'border-blue-400 bg-blue-50/50 ring-1 ring-blue-400'
              : 'border-slate-200 bg-white'
          }`}
        >
          <span className={`text-xs font-semibold ${tabActivo === 'todos' ? 'text-blue-800' : 'text-slate-500'}`}>
            Todos
          </span>
          <span className={`text-2xl font-extrabold ${NUMERO_TABULAR} tracking-[-0.02em] ${tabActivo === 'todos' ? 'text-blue-900' : 'text-slate-700'}`}>
            {totalGeneral}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTabActivo('debe1')}
          className={`flex flex-col gap-1.5 rounded-xl border p-[14px_16px] text-left shadow-sm transition-all hover:border-amber-300 ${
            tabActivo === 'debe1'
              ? 'border-amber-400 bg-amber-50/50 ring-1 ring-amber-400'
              : 'border-slate-200 bg-white'
          }`}
        >
          <span className={`text-xs font-semibold ${tabActivo === 'debe1' ? 'text-amber-800' : 'text-slate-500'}`}>
            Deben 1 cuota
          </span>
          <span className={`text-2xl font-extrabold ${NUMERO_TABULAR} tracking-[-0.02em] ${tabActivo === 'debe1' ? 'text-amber-700' : 'text-amber-600'}`}>
            {debe1.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTabActivo('debe2')}
          className={`flex flex-col gap-1.5 rounded-xl border p-[14px_16px] text-left shadow-sm transition-all hover:border-amber-400 ${
            tabActivo === 'debe2'
              ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500'
              : 'border-slate-200 bg-white'
          }`}
        >
          <span className={`text-xs font-semibold ${tabActivo === 'debe2' ? 'text-amber-900' : 'text-slate-500'}`}>
            Deben 2 cuotas
          </span>
          <span className={`text-2xl font-extrabold ${NUMERO_TABULAR} tracking-[-0.02em] ${tabActivo === 'debe2' ? 'text-amber-800' : 'text-amber-700'}`}>
            {debe2.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTabActivo('posible')}
          className={`flex flex-col gap-1.5 rounded-xl border p-[14px_16px] text-left shadow-sm transition-all hover:border-orange-300 ${
            tabActivo === 'posible'
              ? 'border-orange-400 bg-orange-50/50 ring-1 ring-orange-400'
              : 'border-slate-200 bg-white'
          }`}
        >
          <span className={`text-xs font-semibold ${tabActivo === 'posible' ? 'text-orange-800' : 'text-slate-500'}`}>
            Posible prejudicial
          </span>
          <span className={`text-2xl font-extrabold ${NUMERO_TABULAR} tracking-[-0.02em] ${tabActivo === 'posible' ? 'text-orange-700' : 'text-orange-600'}`}>
            {posiblePrejudicial.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTabActivo('prejudicial')}
          className={`flex flex-col gap-1.5 rounded-xl border p-[14px_16px] text-left shadow-sm transition-all hover:border-red-300 ${
            tabActivo === 'prejudicial'
              ? 'border-red-400 bg-red-50/50 ring-1 ring-red-400'
              : 'border-slate-200 bg-white'
          }`}
        >
          <span className={`text-xs font-semibold ${tabActivo === 'prejudicial' ? 'text-red-800' : 'text-slate-500'}`}>
            Prejudicial oficial
          </span>
          <span className={`text-2xl font-extrabold ${NUMERO_TABULAR} tracking-[-0.02em] ${tabActivo === 'prejudicial' ? 'text-red-700' : 'text-red-600'}`}>
            {prejudicialOficial.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTabActivo('alDia')}
          className={`flex flex-col gap-1.5 rounded-xl border p-[14px_16px] text-left shadow-sm transition-all hover:border-emerald-300 ${
            tabActivo === 'alDia'
              ? 'border-emerald-400 bg-emerald-50/50 ring-1 ring-emerald-400'
              : 'border-slate-200 bg-white'
          }`}
        >
          <span className={`text-xs font-semibold ${tabActivo === 'alDia' ? 'text-emerald-800' : 'text-slate-500'}`}>
            Al día
          </span>
          <span className={`text-2xl font-extrabold ${NUMERO_TABULAR} tracking-[-0.02em] ${tabActivo === 'alDia' ? 'text-emerald-700' : 'text-emerald-600'}`}>
            {alDia.length}
          </span>
        </button>
      </div>

      {/* Lista Unificada de Morosos */}
      <div className={MOROSOS_LISTA_WRAP}>
        {totalGeneral === 0 ? (
          <div className="p-8 text-center text-sm font-medium text-slate-600">
            No hay ningún lote vendido con saldo pendiente actualmente.
          </div>
        ) : (
          seccionesVisibles.map((seccion) => {
            if (seccion.filas.length === 0 && tabActivo !== 'todos') {
              return (
                <div key={seccion.id} className="p-8 text-center text-sm text-slate-600">
                  No hay lotes en el tramo de {seccion.titulo.toLowerCase()}.
                </div>
              )
            }
            if (seccion.filas.length === 0) return null

            return (
              <div key={seccion.id} className="flex flex-col">
                {/* Encabezado del grupo */}
                <div className={MOROSOS_GRUPO_HEADER}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${seccion.dotColor}`} />
                  <span className="text-[13.5px] font-bold text-blue-900">{seccion.titulo}</span>
                  <span className="text-[12.5px] text-slate-500">{seccion.subtitulo}</span>
                  <span className={`ml-auto text-xs font-bold text-slate-500 ${NUMERO_TABULAR}`}>
                    ({seccion.filas.length})
                  </span>
                </div>

                {/* Filas */}
                {seccion.filas.map((fila) => {
                  const marcarPrejudicialConId = marcarPrejudicial.bind(
                    null,
                    fila.loteId,
                    '/admin/panel-morosos'
                  )

                  const ubicacionTexto = fila.loteoNombre
                    ? `${fila.loteoNombre}${fila.manzana ? ` · Mz ${fila.manzana}` : ''}${fila.numeroLote ? ` Lt ${fila.numeroLote}` : ''}`
                    : fila.identificador

                  return (
                    <div
                      key={fila.loteId}
                      className={`${MOROSOS_FILA} ${seccion.bordeFila} ${seccion.fondoFila}`}
                    >
                      <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-4">
                        <EnlaceBoton
                          href={`/admin/clientes/${fila.clienteId}`}
                          className={`min-w-0 font-semibold ${ENLACE_TABLA}`}
                        >
                          {fila.clienteNombre}
                        </EnlaceBoton>
                        <span className="text-xs text-slate-500 sm:text-[13px]">
                          {ubicacionTexto}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center justify-center">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${seccion.badgeClase}`}>
                          {fila.cuotasVencidas} {fila.cuotasVencidas === 1 ? 'cuota' : 'cuotas'}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-baseline justify-end gap-1 text-right">
                        <span className="text-xs font-semibold text-slate-500">{fila.moneda}</span>
                        <span className={`text-[13.5px] font-bold text-blue-900 ${NUMERO_TABULAR}`}>
                          {fila.saldoPendiente.toLocaleString('es-AR')}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center justify-end gap-2.5">
                        <EnlaceBoton
                          href={`/admin/lotes/${fila.loteId}`}
                          className="text-xs font-semibold text-blue-700 hover:text-blue-900"
                        >
                          Ver lote
                        </EnlaceBoton>
                        {/* Mandar WhatsApp directo desde acá (pedido de Nico
                            03/09) -- mismo mensaje/link que ya se arma en
                            /admin/lotes, filtrando por tramo en vez de tener
                            que ir a buscar el lote uno por uno. */}
                        {fila.mensajeWhatsApp && fila.telefono && (
                          <a
                            href={armarLinkWhatsApp(fila.telefono, fila.mensajeWhatsApp)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-green-700 hover:text-green-900"
                          >
                            WhatsApp
                          </a>
                        )}
                        {seccion.conBotonMarcar && esAdministrador && (
                          <BotonMarcarPrejudicial
                            marcarPrejudicialAction={marcarPrejudicialConId}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
