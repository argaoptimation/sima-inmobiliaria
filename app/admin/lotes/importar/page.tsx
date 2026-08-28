import { requireAdminOAcreedor } from '@/lib/auth/require-admin'
import { importarLotes } from './actions'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import { ENTRADA, BOTON_PRIMARIO, ENLACE, TITULO_H1 } from '@/lib/ui/clases'

export default async function ImportarLotesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  await requireAdminOAcreedor()

  return (
    <main className="max-w-2xl">
      <EnlaceBoton href="/admin/lotes" className={`mb-4 inline-block ${ENLACE}`}>
        ← Volver a Lotes
      </EnlaceBoton>
      <h1 className={`mb-4 ${TITULO_H1}`}>Importar varios lotes</h1>
      <p className="mb-4 text-sm text-slate-600">
        Pegá una fila por lote, tal cual se copia de una planilla de Excel (las columnas
        separadas por tabulación, no por comas). El orden de las columnas tiene que ser:
        Identificador, Ubicación, Precio total, Moneda (USD o ARS), Email del acreedor. El email
        de acreedor tiene que coincidir con uno ya cargado en el sistema — si todavía no existe,
        creálo primero en &quot;Usuarios&quot;. Las cuotas no se cargan acá: se definen más adelante, cuando
        el lote se vende. Si alguna fila tiene un error, no se crea ningún lote hasta que las
        corrijas todas — así evitamos cargas parciales o con datos mal tipeados.
      </p>
      {error && (
        <p className="mb-4 whitespace-pre-wrap rounded-lg bg-red-50 p-3 text-sm text-red-700">
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
          className={`${ENTRADA} font-mono`}
        />
        <BotonEnvio className={`cursor-pointer self-start ${BOTON_PRIMARIO}`}>Importar</BotonEnvio>
      </form>
    </main>
  )
}
