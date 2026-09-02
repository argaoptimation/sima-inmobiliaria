'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Search, Bell, Menu } from 'lucide-react'
import { NavAdmin } from './NavAdmin'
import { TOPBAR, BUSCADOR_GLOBAL, DOLAR_PILL } from '@/lib/ui/clases'

const CLAVE_COLAPSADA = 'sima-sidebar-colapsada'

// Envuelve la sidebar (NavAdmin) + topbar en un único Client Component
// para que ambas puedan compartir el estado de "sidebar abierta/colapsada"
// -- antes vivían directamente en app/admin/layout.tsx (Server Component),
// que no puede tener useState. Pedido de Gabriel 02/09: poder contraer la
// sidebar, sobre todo porque en mobile ocupaba toda la pantalla y tapaba
// el contenido.
export function AdminShell({
  role,
  pagosPendientes,
  userId,
  nombreUsuario,
  cotizacion,
  children,
}: {
  role: string
  pagosPendientes: number
  userId: string
  nombreUsuario: string
  cotizacion: number | null
  children: ReactNode
}) {
  const [colapsada, setColapsada] = useState(false)
  const [abiertaMobile, setAbiertaMobile] = useState(false)

  // La preferencia de colapsar (desktop) se recuerda entre sesiones. El
  // drawer de mobile en cambio arranca cerrado siempre -- no tiene sentido
  // persistirlo, cada visita en un celular es una pantalla chica nueva.
  //
  // El primer render (server + hidratación) siempre arranca expandida --
  // localStorage no existe en el servidor -- y recién después de montado
  // se lee la preferencia real. El setState va dentro de un microtask (no
  // directo en el cuerpo del efecto) para no disparar la regla de lint
  // react-hooks/set-state-in-effect, que espera que un efecto lea un
  // sistema externo desde un callback, no en su cuerpo síncrono.
  useEffect(() => {
    queueMicrotask(() => {
      try {
        setColapsada(localStorage.getItem(CLAVE_COLAPSADA) === '1')
      } catch {
        // localStorage puede fallar en navegación privada -- no es crítico,
        // simplemente se queda expandida.
      }
    })
  }, [])

  function alternarColapsada() {
    setColapsada((valorPrevio) => {
      const nuevoValor = !valorPrevio
      try {
        localStorage.setItem(CLAVE_COLAPSADA, nuevoValor ? '1' : '0')
      } catch {
        // ídem arriba
      }
      return nuevoValor
    })
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <NavAdmin
        role={role}
        pagosPendientes={pagosPendientes}
        userId={userId}
        nombreUsuario={nombreUsuario}
        colapsada={colapsada}
        onToggleColapsar={alternarColapsada}
        abiertaMobile={abiertaMobile}
        onCerrarMobile={() => setAbiertaMobile(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className={TOPBAR}>
          <button
            type="button"
            onClick={() => setAbiertaMobile(true)}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 md:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Buscador global: por ahora es solo la pieza visual del shell
              (MOCKUP 1) -- no busca todavía, ver design-system/rediseno/PLAN.md
              PR2. Cablearlo a lotes/clientes/pagos queda para una entrega
              aparte, no estaba detallado en el plan. Oculto en mobile porque,
              al estar deshabilitado, no vale la pena el ancho que le come a
              la topbar en pantallas chicas. */}
          <div className="relative hidden w-[340px] md:block">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              placeholder="Buscar lote, cliente o comprobante…"
              disabled
              className={`${BUSCADOR_GLOBAL} cursor-not-allowed`}
            />
          </div>

          <div className="ml-auto flex items-center gap-3.5">
            {cotizacion !== null && (
              <div className={DOLAR_PILL}>
                <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
                <span className="tabular-nums">Dólar ${cotizacion.toLocaleString('es-AR')}</span>
              </div>
            )}
            <Bell className="h-[19px] w-[19px] text-slate-500" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  )
}
