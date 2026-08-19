import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const ROLES_CON_ACCESO = ['administrador', 'acreedor', 'vendedor', 'cobrador']

export default async function HistorialCotizacionDolarPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user!.id).single()

  if (!perfil || !ROLES_CON_ACCESO.includes(perfil.role)) {
    redirect('/login')
  }

  const { data: cotizaciones } = await supabase
    .from('cotizaciones_dolar')
    .select('id, fecha, valor, cargado_por, created_at')
    .order('fecha', { ascending: false })

  const cargadorIds = [...new Set((cotizaciones ?? []).map((c) => c.cargado_por))]
  const { data: cargadores } =
    cargadorIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', cargadorIds)
      : { data: [] }
  const nombreCargadorPorId = new Map((cargadores ?? []).map((persona) => [persona.id, persona.full_name]))

  return (
    <main>
      <div className="mb-4 flex gap-4">
        <a href="/admin/lotes" className="text-sm underline">
          ← Volver a Lotes
        </a>
      </div>
      <h1 className="mb-2 text-xl font-semibold">Historial de cotización del dólar</h1>
      <p className="mb-6 text-sm text-gray-600">
        Un valor por día. El de hoy se puede corregir desde &quot;Lotes&quot;; los días anteriores
        quedan firmes.
      </p>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Fecha</th>
            <th>Valor (ARS por USD)</th>
            <th>Cargada por</th>
            <th>Hora</th>
          </tr>
        </thead>
        <tbody>
          {(cotizaciones ?? []).map((c) => (
            <tr key={c.id} className="border-b">
              <td className="py-2">{c.fecha}</td>
              <td>{c.valor}</td>
              <td>{nombreCargadorPorId.get(c.cargado_por) ?? '—'}</td>
              <td>
                {new Date(c.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}hs
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(cotizaciones ?? []).length === 0 && (
        <p className="mt-4 text-sm text-gray-600">Todavía no se cargó ninguna cotización.</p>
      )}
    </main>
  )
}
