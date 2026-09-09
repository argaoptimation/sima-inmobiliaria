import { redirect } from 'next/navigation'

// La proyección dejó de ser una pantalla aparte (10/09): vive embebida en
// el detalle de la cuenta corriente, junto con lo asignado y los
// movimientos. "No podemos estar navegando entre pantallas para ver la
// proyección" (Gabriel, después de repasar la llamada con Nicolás).
//
// Esta ruta queda como redirección y no borrada porque el link estuvo
// disponible una semana y puede estar guardado en un favorito o pegado en
// un WhatsApp. Se lleva el rango de meses tal cual venía.
export default async function ProyeccionCuentaCorrientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  const { id } = await params
  const { desde, hasta } = await searchParams

  const query = new URLSearchParams()
  if (desde) query.set('desde', desde)
  if (hasta) query.set('hasta', hasta)

  const queryString = query.toString()
  redirect(`/admin/cuentas-corrientes/${id}${queryString ? `?${queryString}` : ''}#mes-a-mes`)
}
