import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obtenerDatosRecibo } from '@/lib/comprobantes/datos-recibo'
import { ReciboPago } from '@/components/recibos/ReciboPago'
import { BotonImprimirRecibo } from '@/components/recibos/BotonImprimirRecibo'
import { EnlaceBoton } from '@/components/EnlaceBoton'

// Recibo oficial (mismo modelo que se usa en /admin/pagos y /admin/efectivo,
// 04/09 pedido de Gabriel) -- distinto del "comprobante" que el cliente sube
// como prueba de la transferencia (/portal-cliente/pagos/[id]/comprobante):
// este es el que la empresa emite, disponible recién cuando el pago queda
// confirmado.
export default async function ReciboPagoClientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Ownership: pagos_select (RLS) ya exige cliente_id = auth.uid() para el
  // rol cliente -- mismo patrón que la página de "subir comprobante".
  const { data: pagoPropio } = await supabase
    .from('pagos')
    .select('id, lote_id')
    .eq('id', id)
    .eq('cliente_id', user.id)
    .maybeSingle()

  if (!pagoPropio) {
    return (
      <div className="mx-auto mt-24 max-w-md p-6 text-center text-slate-600">
        <p>Pago no encontrado.</p>
      </div>
    )
  }

  const volverHref = pagoPropio.lote_id ? `/portal-cliente/lotes/${pagoPropio.lote_id}` : '/portal-cliente'
  const datos = await obtenerDatosRecibo(id)

  if (!datos) {
    return (
      <div className="mx-auto mt-24 max-w-md p-6 text-center text-slate-600">
        <p>Este pago todavía no está confirmado -- el recibo va a estar disponible apenas se confirme.</p>
        <EnlaceBoton
          href={volverHref}
          className="mt-3 inline-block text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
        >
          ← Volver
        </EnlaceBoton>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <EnlaceBoton
          href={volverHref}
          className="text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
        >
          ← Volver
        </EnlaceBoton>
        <BotonImprimirRecibo etiqueta="Descargar / Imprimir recibo" />
      </div>
      <ReciboPago datos={datos} />
    </div>
  )
}
