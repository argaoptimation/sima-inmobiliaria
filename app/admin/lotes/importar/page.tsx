import { requireAdminOAcreedor } from '@/lib/auth/require-admin'
import { importarLotes } from './actions'

export default async function ImportarLotesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  await requireAdminOAcreedor()

  return (
    <main className="max-w-2xl">
      <a href="/admin/lotes" className="mb-4 inline-block text-sm underline">
        ← Volver a Lotes
      </a>
      <h1 className="mb-4 text-xl font-semibold">Importar varios lotes</h1>
      <p className="mb-4 text-sm text-gray-600">
        Pegá una fila por lote, tal cual se copia de una planilla de Excel (las columnas
        separadas por tabulación, no por comas). El orden de las columnas tiene que ser:
        Identificador, Ubicación, Precio total, Moneda (USD o ARS), Email del acreedor. El email
        de acreedor tiene que coincidir con uno ya cargado en el sistema — si todavía no existe,
        creálo primero en "Usuarios". Las cuotas no se cargan acá: se definen más adelante, cuando
        el lote se vende. Si alguna fila tiene un error, no se crea ningún lote hasta que las
        corrijas todas — así evitamos cargas parciales o con datos mal tipeados.
      </p>
      {error && (
        <p className="mb-4 whitespace-pre-wrap rounded bg-red-100 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <form action={importarLotes} className="flex flex-col gap-3">
        <textarea
          name="filas"
          required
          rows={10}
          placeholder={
            'Loteo San Martín - Lote 1\tRuta 9 km 12\t15000\tUSD\tacreedor@ejemplo.com\nLoteo San Martín - Lote 2\tRuta 9 km 12\t16000\tUSD\tacreedor@ejemplo.com'
          }
          className="rounded border px-3 py-2 font-mono text-sm"
        />
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Importar
        </button>
      </form>
    </main>
  )
}
