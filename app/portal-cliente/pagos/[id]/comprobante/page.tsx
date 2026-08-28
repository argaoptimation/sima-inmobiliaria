import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { subirComprobante } from './actions'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import { CampoArchivoDirecto } from '@/components/CampoArchivoDirecto'

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
      <EnlaceBoton
        href={volverHref}
        className="mb-4 inline-block text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
      >
        ← Volver al lote
      </EnlaceBoton>

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
              <CampoArchivoDirecto
                name="comprobante"
                bucket="comprobantes"
                carpeta={user.id}
                tipoArchivo="comprobante"
                label="Elegí una foto o PDF del comprobante"
                ayuda="Tocá acá para buscar el archivo en tu celular o PC"
                nombreError="El comprobante"
                required
              />
              <BotonEnvio className="rounded-lg bg-blue-800 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-blue-900 cursor-pointer">
                Finalizar
              </BotonEnvio>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
