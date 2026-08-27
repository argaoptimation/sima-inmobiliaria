import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { subirComprobante } from './actions'

export default async function ComprobantePagoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: pago } = await supabase
    .from('pagos')
    .select('id, lote_id, monto, moneda, confirmado_acreedor_por, confirmado_admin_por')
    .eq('id', id)
    .eq('cliente_id', user.id)
    .single()

  if (!pago) {
    return (
      <div className="mx-auto mt-24 max-w-md p-6 text-center text-slate-600">
        <p>Pago no encontrado.</p>
      </div>
    )
  }

  const enRevision = Boolean(pago.confirmado_acreedor_por || pago.confirmado_admin_por)
  const volverHref = pago.lote_id ? `/portal-cliente/lotes/${pago.lote_id}` : '/portal-cliente'

  const subirComprobanteConId = subirComprobante.bind(null, id)

  return (
    <div className="mx-auto max-w-md px-6 py-10">
      <a
        href={volverHref}
        className="mb-4 inline-block text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
      >
        ← Volver al lote
      </a>

      <div className="rounded-xl border border-blue-100 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-xl font-bold text-blue-900">Subir comprobante</h1>
        {enRevision ? (
          <p className="text-sm text-slate-600">
            Este pago ya está en revisión, no se puede modificar el comprobante.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-slate-600">
              Sin subir el comprobante, tu pago no se termina de procesar. Una vez que confirmen la
              recepción, va a quedar imputado a tus cuotas — podés salir de esta pantalla y volver
              más tarde, el pago va a seguir esperando el comprobante en &quot;Mis pagos&quot;.
            </p>
            <p className="mb-6 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
              Pago registrado: <span className="font-semibold">{pago.monto} {pago.moneda}</span>
            </p>
            {error && (
              <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
            )}
            <form action={subirComprobanteConId} className="flex flex-col gap-4">
              <label
                htmlFor="comprobante"
                className="rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/50 px-4 py-6 text-center text-sm text-blue-900 transition-colors hover:border-blue-400 hover:bg-blue-50 cursor-pointer"
              >
                <span className="mb-1 block font-semibold">Elegí una foto o PDF del comprobante</span>
                <span className="text-blue-800/70">Tocá acá para buscar el archivo en tu celular o PC</span>
                <input
                  id="comprobante"
                  name="comprobante"
                  type="file"
                  required
                  accept="image/*,.pdf"
                  className="mt-4 block w-full text-sm text-blue-900 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-blue-800 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white file:transition-colors hover:file:bg-blue-900"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-blue-800 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-blue-900 cursor-pointer"
              >
                Finalizar
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
