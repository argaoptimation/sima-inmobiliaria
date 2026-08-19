import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { cargarValorIndice } from './actions'

const NOMBRES_MES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

function formatearPeriodo(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number)
  return `${NOMBRES_MES[mes - 1]} ${anio}`
}

export default async function IndicesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  await requireAdministrador()

  const supabase = await createClient()

  const { data: valores } = await supabase
    .from('indices_valores')
    .select('id, nombre, periodo, valor, cargado_por, created_at')
    .order('periodo', { ascending: false })
    .order('nombre', { ascending: true })

  const cargadorIds = [...new Set((valores ?? []).map((v) => v.cargado_por))]
  const { data: cargadores } =
    cargadorIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', cargadorIds)
      : { data: [] }
  const nombreCargadorPorId = new Map((cargadores ?? []).map((persona) => [persona.id, persona.full_name]))

  const nombresExistentes = [...new Set((valores ?? []).map((v) => v.nombre))].sort()

  return (
    <main>
      <h1 className="mb-2 text-xl font-semibold">Índices</h1>
      <p className="mb-6 text-sm text-gray-600">
        Valores mensuales de índices (IPC, ICC, u otros) para lotes cobrados en pesos. Apenas se
        carga el valor de un mes, se aplica solo a las cuotas que vencen el mes siguiente de los
        lotes atados a ese índice — sin ningún botón adicional. Un mes sin valor cargado
        simplemente no ajusta nada.
      </p>

      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}

      <form action={cargarValorIndice} className="mb-8 flex flex-wrap items-end gap-3 rounded border p-3">
        <label className="text-sm">
          Índice existente
          <select name="nombreExistente" className="mt-1 block rounded border px-3 py-2">
            <option value="">— elegir —</option>
            {nombresExistentes.map((nombre) => (
              <option key={nombre} value={nombre}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          O un índice nuevo
          <input
            name="nombreNuevo"
            type="text"
            placeholder="Ej: IPC"
            className="mt-1 block rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Mes
          <input name="periodo" type="month" required className="mt-1 block rounded border px-3 py-2" />
        </label>
        <label className="text-sm">
          Valor (%)
          <input
            name="valor"
            type="number"
            step="0.01"
            placeholder="Ej: 3"
            required
            className="mt-1 block rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">
          Cargar
        </button>
      </form>

      <p className="mb-2 text-sm text-gray-600">
        Un valor ya cargado no se puede editar desde acá (evita que un cambio silencioso
        desincronice cuotas ya ajustadas). Si hace falta corregir uno, avisale a Gabriel.
      </p>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Índice</th>
            <th>Mes</th>
            <th>Valor</th>
            <th>Cargado por</th>
            <th>Cuándo</th>
          </tr>
        </thead>
        <tbody>
          {(valores ?? []).map((v) => (
            <tr key={v.id} className="border-b">
              <td className="py-2">{v.nombre}</td>
              <td>{formatearPeriodo(v.periodo)}</td>
              <td>{v.valor}%</td>
              <td>{nombreCargadorPorId.get(v.cargado_por) ?? '—'}</td>
              <td>{new Date(v.created_at).toLocaleDateString('es-AR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
