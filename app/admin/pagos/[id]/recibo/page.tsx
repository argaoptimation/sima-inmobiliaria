import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAdminAcreedorOCobrador } from '@/lib/auth/require-admin'
import { obtenerDatosRecibo } from '@/lib/comprobantes/datos-recibo'
import { ReciboPago } from '@/components/recibos/ReciboPago'
import { BotonImprimirRecibo } from '@/components/recibos/BotonImprimirRecibo'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { ENLACE } from '@/lib/ui/clases'

// Recibo de un pago ya confirmado -- accesible desde /admin/pagos y desde
// /admin/efectivo (04/09, pedido de Gabriel: mismo modelo de recibo para
// cualquier pago, no solo los de efectivo).
export default async function ReciboPagoAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireAdminAcreedorOCobrador()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: perfilPropio } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  // obtenerDatosRecibo lee con el cliente admin (bypassa RLS) -- para
  // acreedor, el ownership se valida acá con el cliente normal: si el pago
  // no es de un lote suyo, esta consulta (RLS) ya no devuelve nada, mismo
  // mecanismo que ya usa /admin/pagos para acotar qué ve cada acreedor.
  if (perfilPropio!.role === 'acreedor') {
    const { data: pagoPropio } = await supabase.from('pagos').select('id').eq('id', id).maybeSingle()
    if (!pagoPropio) notFound()
  }

  const datos = await obtenerDatosRecibo(id)

  if (!datos) {
    return (
      <div className="mx-auto mt-24 max-w-md p-6 text-center text-slate-600">
        <p>Este pago todavía no está confirmado, o no se encontró.</p>
        <EnlaceBoton href="/admin/pagos" className={`mt-3 inline-block ${ENLACE}`}>
          ← Volver a Pagos
        </EnlaceBoton>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <EnlaceBoton href="/admin/pagos" className={ENLACE}>
          ← Volver a Pagos
        </EnlaceBoton>
        <BotonImprimirRecibo />
      </div>
      <ReciboPago datos={datos} />
    </div>
  )
}
