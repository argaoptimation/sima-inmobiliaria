'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import Link from 'next/link'
import type { Notificacion } from '@/lib/notificaciones/obtener-notificaciones'

// La campana de la topbar (08/09, pedido de Gabriel). Antes era un ícono
// decorativo del rediseño; ahora abre la lista de lo que hay para resolver.
//
// No hay "marcar como leída" a propósito: cada aviso describe una situación
// que existe hoy (una cuota sin alias, un índice sin cargar). Se va cuando
// se arregla lo que la causa, no cuando alguien la tapa -- si se pudiera
// silenciar, el aviso que más importa sería el primero en desaparecer.
export function CentroNotificaciones({ notificaciones }: { notificaciones: Notificacion[] }) {
  const [abierto, setAbierto] = useState(false)
  const contenedor = useRef<HTMLDivElement>(null)

  const urgentes = notificaciones.filter((aviso) => aviso.urgencia === 'alta').length

  useEffect(() => {
    if (!abierto) return

    function alClickearAfuera(evento: MouseEvent) {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false)
    }

    function alPresionarEscape(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAbierto(false)
    }

    document.addEventListener('mousedown', alClickearAfuera)
    document.addEventListener('keydown', alPresionarEscape)
    return () => {
      document.removeEventListener('mousedown', alClickearAfuera)
      document.removeEventListener('keydown', alPresionarEscape)
    }
  }, [abierto])

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((valorPrevio) => !valorPrevio)}
        aria-expanded={abierto}
        aria-label={
          notificaciones.length === 0
            ? 'Notificaciones: no hay avisos'
            : `Notificaciones: ${notificaciones.length} aviso(s)`
        }
        data-testid="campana-notificaciones"
        className="relative cursor-pointer rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
      >
        <Bell className="h-[19px] w-[19px]" />
        {notificaciones.length > 0 && (
          <span
            data-testid="badge-notificaciones"
            className={`absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
              urgentes > 0 ? 'bg-red-600' : 'bg-amber-500'
            }`}
          >
            {notificaciones.length}
          </span>
        )}
      </button>

      {abierto && (
        <div
          data-testid="panel-notificaciones"
          className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-blue-100 bg-white shadow-xl shadow-slate-300/40"
        >
          <p className="border-b border-blue-100 px-4 py-3 text-sm font-semibold text-blue-900">
            Para resolver
            {notificaciones.length > 0 && (
              <span className="ml-1 font-normal text-slate-500">({notificaciones.length})</span>
            )}
          </p>

          {notificaciones.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              No hay nada pendiente. Todas las cuotas que vencen tienen a dónde pagarse.
            </p>
          ) : (
            <ul className="max-h-[min(70vh,40rem)] overflow-y-auto">
              {notificaciones.map((aviso) => (
                <li key={aviso.id} className="border-b border-blue-50 last:border-b-0">
                  <Link
                    href={aviso.href}
                    onClick={() => setAbierto(false)}
                    className="block px-4 py-3 transition-colors hover:bg-blue-50/60"
                  >
                    <span className="flex items-start gap-2">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          aviso.urgencia === 'alta' ? 'bg-red-500' : 'bg-amber-400'
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-800">{aviso.titulo}</span>
                        <span className="mt-0.5 block text-xs text-slate-600">{aviso.detalle}</span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
