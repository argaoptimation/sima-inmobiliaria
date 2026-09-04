import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { FiltroEnVivo } from '@/components/FiltroEnVivo'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { EncabezadoPagina } from '@/components/EncabezadoPagina'
import {
  ENTRADA,
  BOTON_SECUNDARIO,
  ENLACE,
  BADGE_BASE,
  BADGE_VERDE,
  BADGE_ROJO,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
  TABLA_CELDA_PRINCIPAL,
} from '@/lib/ui/clases'

// Log de ingresos (04/09, pedido de Gabriel: "quién entró y cuándo") --
// cada fila la escribe app/login/actions.ts, tanto en éxito como en
// fracaso (esto último sirve además como señal de intentos de acceso
// indebido: muchas filas fallidas seguidas para el mismo email).
export default async function HistorialIngresosPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; resultado?: string; desde?: string; hasta?: string }>
}) {
  await requireAdministrador()

  const { email: filtroEmail, resultado: filtroResultado, desde: filtroDesde, hasta: filtroHasta } =
    await searchParams

  const supabase = await createClient()

  let query = supabase
    .from('historial_ingresos')
    .select('id, email, exitoso, motivo_error, creado_at')
    .order('creado_at', { ascending: false })
    .limit(500)

  if (filtroEmail) query = query.ilike('email', `%${filtroEmail}%`)
  if (filtroResultado === 'exitoso') query = query.eq('exitoso', true)
  if (filtroResultado === 'fallido') query = query.eq('exitoso', false)
  if (filtroDesde) query = query.gte('creado_at', filtroDesde)
  if (filtroHasta) query = query.lte('creado_at', `${filtroHasta}T23:59:59`)

  const { data: ingresos } = await query

  const hayFiltrosActivos = Boolean(filtroEmail || filtroResultado || filtroDesde || filtroHasta)

  return (
    <main>
      <EncabezadoPagina titulo="Historial de ingresos" migas={['Historial de ingresos']} />
      <p className="mb-6 text-sm text-slate-600">
        Cada intento de inicio de sesión, exitoso o no (los últimos 500). Varios fallidos seguidos
        para el mismo email pueden ser una señal de que alguien está probando contraseñas.
      </p>

      <FiltroEnVivo className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">
          Email
          <input
            type="text"
            name="email"
            defaultValue={filtroEmail ?? ''}
            placeholder="Buscar por email"
            className={ENTRADA}
          />
        </label>
        <label className="text-sm text-slate-600">
          Resultado
          <select name="resultado" defaultValue={filtroResultado ?? ''} className={ENTRADA}>
            <option value="">Todos</option>
            <option value="exitoso">Exitoso</option>
            <option value="fallido">Fallido</option>
          </select>
        </label>
        <label className="text-sm text-slate-600">
          Desde
          <input type="date" name="desde" defaultValue={filtroDesde ?? ''} className={ENTRADA} />
        </label>
        <label className="text-sm text-slate-600">
          Hasta
          <input type="date" name="hasta" defaultValue={filtroHasta ?? ''} className={ENTRADA} />
        </label>
        <button type="submit" className={`cursor-pointer ${BOTON_SECUNDARIO}`}>
          Filtrar
        </button>
        {hayFiltrosActivos && (
          <EnlaceBoton href="/admin/historial-ingresos" className={ENLACE}>
            Limpiar filtros
          </EnlaceBoton>
        )}
      </FiltroEnVivo>

      {(ingresos ?? []).length === 0 ? (
        <p className="text-sm text-slate-600">Ningún ingreso coincide con los filtros.</p>
      ) : (
        <div className={TABLA_CONTENEDOR}>
          <table className="w-full text-sm">
            <thead>
              <tr className={TABLA_HEADER_FILA}>
                <th className={TABLA_HEADER_CELDA}>Fecha y hora</th>
                <th className={TABLA_HEADER_CELDA}>Email</th>
                <th className={TABLA_HEADER_CELDA}>Resultado</th>
                <th className={TABLA_HEADER_CELDA}>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {(ingresos ?? []).map((ingreso) => (
                <tr key={ingreso.id} className={TABLA_FILA}>
                  <td className={TABLA_CELDA_PRINCIPAL}>
                    {new Date(ingreso.creado_at).toLocaleString('es-AR')}
                  </td>
                  <td className={TABLA_CELDA}>{ingreso.email}</td>
                  <td className={TABLA_CELDA}>
                    {ingreso.exitoso ? (
                      <span className={`${BADGE_BASE} ${BADGE_VERDE}`}>Exitoso</span>
                    ) : (
                      <span className={`${BADGE_BASE} ${BADGE_ROJO}`}>Fallido</span>
                    )}
                  </td>
                  <td className={TABLA_CELDA}>{ingreso.motivo_error ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
