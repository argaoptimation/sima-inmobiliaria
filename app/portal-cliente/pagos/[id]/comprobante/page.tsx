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
    .select('id, monto, moneda, confirmado_acreedor_por, confirmado_admin_por')
    .eq('id', id)
    .eq('cliente_id', user.id)
    .single()

  if (!pago) {
    return (
      <main className="mx-auto mt-24 max-w-md p-6 text-center">
        <p>Pago no encontrado.</p>
      </main>
    )
  }

  const enRevision = Boolean(pago.confirmado_acreedor_por || pago.confirmado_admin_por)

  const subirComprobanteConId = subirComprobante.bind(null, id)

  return (
    <main className="mx-auto mt-12 max-w-md p-6">
      <h1 className="mb-6 text-xl font-semibold">Subir comprobante</h1>
      {enRevision ? (
        <p className="mb-4 text-sm">
          Este pago ya está en revisión, no se puede modificar el comprobante.
        </p>
      ) : (
        <>
          <p className="mb-6 text-sm">
            Sin subir el comprobante, tu pago no se termina de procesar. Una vez que confirmen la
            recepción, va a quedar imputado a tus cuotas.
          </p>
          <p className="mb-4 text-sm text-gray-600">
            Pago registrado: {pago.monto} {pago.moneda}
          </p>
          {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
          <form action={subirComprobanteConId} className="flex flex-col gap-3">
            <input name="comprobante" type="file" required accept="image/*,.pdf" />
            <button type="submit" className="rounded bg-black px-3 py-2 text-white">
              Finalizar
            </button>
          </form>
        </>
      )}
    </main>
  )
}
