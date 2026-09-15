'use client'

import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { BotonEnvio } from '@/components/BotonEnvio'
import { BOTON_CHICO_NEUTRO } from '@/lib/ui/clases'

export interface FichaIntegrante {
  key: string
  nombre: string
  estilo: { ficha: string; avatar: string; papel: string }
  papel: string
  banco: string | null
  alias: string | null
  sinDatos: boolean
  // null: no se quita desde la ficha (el admin y el acreedor se cambian en
  // "Roles del lote"). Si se puede, el aviso de qué cuotas toca.
  salida: { lineas: string[]; bloqueo: string | null } | null
}

// Las fichas de "Entre estos se reparte cada cuota" (mockup 6) con el botón
// para sacar a alguien del lote (15/09, pedido de Gabriel).
//
// Quitar no borra al toque: abre debajo de las fichas un aviso con lo que va
// a pasar con sus cuotas, y recién ahí se confirma. Es la protección contra
// el "lo quité sin querer": el aviso dice en qué cuotas estaba antes de que
// se toque nada.
export function FichasIntegrantes({
  fichas,
  accionQuitar,
}: {
  fichas: FichaIntegrante[]
  accionQuitar: (formData: FormData) => void | Promise<void>
}) {
  const [quitando, setQuitando] = useState<string | null>(null)
  const fichaQuitando = fichas.find((ficha) => ficha.key === quitando) ?? null

  return (
    <>
      <ul data-testid="fichas-integrantes" className="flex flex-wrap items-center gap-3">
        {fichas.map((ficha) => (
          <li
            key={ficha.key}
            data-testid="ficha-integrante"
            className={`flex items-center gap-2.5 rounded-lg border py-2 pr-2 pl-3 ${ficha.estilo.ficha} ${
              quitando === ficha.key ? 'ring-2 ring-rose-300' : ''
            }`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ficha.estilo.avatar}`}
            >
              {ficha.nombre.trim().charAt(0).toUpperCase() || '—'}
            </span>
            <div className="leading-tight">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900">{ficha.nombre}</span>
                <span className={`rounded border px-1.5 text-[10px] font-semibold uppercase ${ficha.estilo.papel}`}>
                  {ficha.papel}
                </span>
              </div>
              {ficha.sinDatos ? (
                <p className="text-[11px] font-medium text-amber-700">Sin datos de transferencia</p>
              ) : (
                <p className="font-mono text-[11px] text-slate-500">
                  {ficha.banco} · alias: {ficha.alias}
                </p>
              )}
            </div>
            {ficha.salida ? (
              <button
                type="button"
                onClick={() => setQuitando(quitando === ficha.key ? null : ficha.key)}
                aria-label={`Quitar a ${ficha.nombre} del lote`}
                aria-expanded={quitando === ficha.key}
                title="Quitar del lote"
                className="ml-1 cursor-pointer self-start rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span className="w-1" aria-hidden="true" />
            )}
          </li>
        ))}
      </ul>

      {fichaQuitando?.salida && (
        <div
          role="alertdialog"
          aria-labelledby="titulo-quitar-integrante"
          data-testid="aviso-quitar-integrante"
          className="mt-3 max-w-3xl space-y-2 rounded-xl border border-rose-200 bg-rose-50/60 p-4"
        >
          <p id="titulo-quitar-integrante" className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <AlertTriangle className="h-4 w-4 text-rose-600" aria-hidden="true" />
            ¿Quitar a {fichaQuitando.nombre} del lote?
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-700">
            {fichaQuitando.salida.lineas.map((linea) => (
              <li key={linea}>{linea}</li>
            ))}
          </ul>

          {fichaQuitando.salida.bloqueo ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs font-medium text-amber-800">
              {fichaQuitando.salida.bloqueo}
            </p>
          ) : (
            <p className="text-[11px] text-slate-500">
              Quitarlo recarga la pantalla: si cambiaste algo del reparto y no lo guardaste, guardalo antes.
            </p>
          )}

          <form action={accionQuitar} className="flex flex-wrap items-center gap-2 pt-1">
            <input type="hidden" name="clave" value={fichaQuitando.key} />
            {!fichaQuitando.salida.bloqueo && (
              <BotonEnvio className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60">
                Sí, quitar a {fichaQuitando.nombre}
              </BotonEnvio>
            )}
            <button
              type="button"
              onClick={() => setQuitando(null)}
              className={`cursor-pointer border border-slate-200 bg-white ${BOTON_CHICO_NEUTRO}`}
            >
              Cancelar
            </button>
          </form>
        </div>
      )}
    </>
  )
}
