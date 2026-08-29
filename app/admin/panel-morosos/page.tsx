import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { calcularTramosMora, type FilaMoroso } from '@/lib/cobranza/tramos-mora'
import { marcarPrejudicial } from '../lotes/[id]/actions'
import { BotonMarcarPrejudicial } from '../lotes/[id]/BotonPrejudicial'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { EncabezadoPagina } from '@/components/EncabezadoPagina'
import {
  ENLACE_TABLA,
  BANNER_ERROR,
  BANNER_OK,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
} from '@/lib/ui/clases'

// Panel de Morosos (propuesto por Gabriel/Nicolás 26/08): antes de esto, para
// saber quién debe una, dos o tres+ cuotas había que entrar lote por lote.
// Agrupa a todos los clientes vendidos con cuotas vencidas en 4 tramos --
// deben 1, deben 2, posible prejudicial (3+, señal automática) y prejudicial
// oficial (marca manual) -- con el botón de marcar prejudicial disponible acá
// mismo para el tramo de posible prejudicial, sin tener que entrar al lote.
export default async function PanelMorososPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  await requireAdministrador()

  const { ok, error } = await searchParams

  const supabase = await createClient()
  const { debe1, debe2, posiblePrejudicial, prejudicialOficial } = await calcularTramosMora(supabase)

  function tabla(filas: FilaMoroso[], conBotonMarcar: boolean) {
    if (filas.length === 0) {
      return <p className="mb-8 text-sm text-slate-600">No hay lotes en este grupo.</p>
    }
    return (
      <div className={`mb-8 ${TABLA_CONTENEDOR}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className={TABLA_HEADER_FILA}>
            <th className={TABLA_HEADER_CELDA}>Cliente</th>
            <th className={TABLA_HEADER_CELDA}>Lote</th>
            <th className={TABLA_HEADER_CELDA}>Cuotas vencidas</th>
            <th className={TABLA_HEADER_CELDA}>Saldo pendiente</th>
            <th className={TABLA_HEADER_CELDA}></th>
            {conBotonMarcar && <th className={TABLA_HEADER_CELDA}></th>}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => {
            const marcarPrejudicialConId = marcarPrejudicial.bind(null, fila.loteId, '/admin/panel-morosos')
            return (
              <tr key={fila.loteId} className={TABLA_FILA}>
                <td className={TABLA_CELDA}>
                  <EnlaceBoton href={`/admin/clientes/${fila.clienteId}`} className={ENLACE_TABLA}>
                    {fila.clienteNombre}
                  </EnlaceBoton>
                </td>
                <td className={TABLA_CELDA}>{fila.identificador}</td>
                <td className={TABLA_CELDA}>{fila.cuotasVencidas}</td>
                <td className={TABLA_CELDA}>
                  {fila.saldoPendiente} {fila.moneda}
                </td>
                <td className={TABLA_CELDA}>
                  <EnlaceBoton href={`/admin/lotes/${fila.loteId}`} className={ENLACE_TABLA}>
                    Ver lote
                  </EnlaceBoton>
                </td>
                {conBotonMarcar && (
                  <td className={TABLA_CELDA}>
                    <BotonMarcarPrejudicial marcarPrejudicialAction={marcarPrejudicialConId} />
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    )
  }

  return (
    <main>
      <EncabezadoPagina titulo="Panel de morosos" migas={['Panel de morosos']} />

      {error && <p className={BANNER_ERROR}>{error}</p>}
      {ok && <p className={BANNER_OK}>{ok}</p>}

      <h2 className="mb-2 text-lg font-bold text-blue-900">Deben 1 cuota ({debe1.length})</h2>
      {tabla(debe1, false)}

      <h2 className="mb-2 text-lg font-bold text-blue-900">Deben 2 cuotas ({debe2.length})</h2>
      {tabla(debe2, false)}

      <h2 className="mb-2 text-lg font-bold text-orange-700">
        Posible prejudicial — 3 o más cuotas ({posiblePrejudicial.length})
      </h2>
      {tabla(posiblePrejudicial, true)}

      <h2 className="mb-2 text-lg font-bold text-red-800">
        Prejudicial (ya marcado) ({prejudicialOficial.length})
      </h2>
      {tabla(prejudicialOficial, false)}
    </main>
  )
}
