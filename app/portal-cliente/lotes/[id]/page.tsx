import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcularEstadoCobranza } from '@/lib/cobranza/estado-cliente'
import { calcularInteresMoratorio } from '@/lib/cobranza/interes-moratorio'
import { convertirUsdAPesos } from '@/lib/cobranza/cotizacion-dolar'
import { notFound, redirect } from 'next/navigation'
import { logout } from '@/app/login/actions'

function BotonCerrarSesion() {
  return (
    <form action={logout}>
      <button type="submit" className="text-sm underline">
        Cerrar sesión
      </button>
    </form>
  )
}

export default async function PortalClienteLotePage({
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

  const { data: lote } = await supabase
    .from('lotes')
    .select('id, identificador, moneda, cliente_id, interes_moratorio_diario')
    .eq('id', id)
    .single()

  if (!lote || lote.cliente_id !== user!.id) {
    notFound()
  }

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, numero, monto_base, saldo_pendiente, fecha_vencimiento')
    .eq('lote_id', lote!.id)
    .order('numero', { ascending: true })

  const hoy = new Date().toISOString().slice(0, 10)
  const estado = calcularEstadoCobranza(
    (cuotas ?? []).map((cuota) => ({
      saldoPendiente: cuota.saldo_pendiente,
      fechaVencimiento: cuota.fecha_vencimiento,
    })),
    hoy
  )

  const primeraImpaga = cuotas?.find((cuota) => cuota.saldo_pendiente > 0)

  const totalPendiente = (cuotas ?? []).reduce(
    (acumulado, cuota) => acumulado + cuota.saldo_pendiente,
    0
  )

  // Fallback en cascada: la cotización más reciente en o antes de hoy --
  // mismo criterio que usa la pantalla de pago (resuelve fin de semana / día
  // sin cargar sin iterar día por día a mano).
  const { data: cotizacionVigente } =
    lote!.moneda === 'USD'
      ? await supabase
          .from('cotizaciones_dolar')
          .select('valor, fecha')
          .lte('fecha', hoy)
          .order('fecha', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null }

  const { data: pagos } = await supabase
    .from('pagos')
    .select('id, monto, moneda, estado, comprobante_path')
    .eq('lote_id', lote!.id)
    .order('created_at', { ascending: false })

  const admin = createAdminClient()

  const pagosConLink = await Promise.all(
    (pagos ?? []).map(async (pago) => {
      if (!pago.comprobante_path) {
        return { ...pago, comprobanteUrl: null }
      }

      const { data, error } = await admin.storage
        .from('comprobantes')
        .createSignedUrl(pago.comprobante_path, 300)

      return { ...pago, comprobanteUrl: error ? null : data?.signedUrl ?? null }
    })
  )

  return (
    <main className="mx-auto mt-12 max-w-2xl p-6">
      <a href="/portal-cliente" className="mb-4 inline-block text-sm underline">
        ← Volver a tus lotes
      </a>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{lote!.identificador}</h1>
        <BotonCerrarSesion />
      </div>
      <p className="mb-2 text-sm">
        Estado:{' '}
        <span
          className={
            estado === 'normal'
              ? 'text-green-700'
              : estado === 'moroso'
                ? 'text-amber-700'
                : 'text-red-700'
          }
        >
          {estado}
        </span>
      </p>
      <p className="mb-6 text-sm font-medium">
        Total pendiente: {totalPendiente} {lote!.moneda}
        {lote!.moneda === 'USD' && cotizacionVigente && (
          <span className="font-normal text-gray-600">
            {' '}
            (≈ {convertirUsdAPesos(totalPendiente, cotizacionVigente.valor)} ARS)
          </span>
        )}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Cuota</th>
            <th>Vencimiento</th>
            <th>Monto base</th>
            <th>Saldo pendiente</th>
            <th>Interés moratorio</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cuotas?.map((cuota) => {
            const vencida = cuota.saldo_pendiente > 0 && cuota.fecha_vencimiento < hoy
            const interesMoratorio = vencida
              ? calcularInteresMoratorio(
                  { saldoPendiente: cuota.saldo_pendiente, fechaVencimiento: cuota.fecha_vencimiento },
                  lote!.interes_moratorio_diario,
                  hoy
                )
              : 0
            return (
              <tr key={cuota.id} className="border-b">
                <td className="py-2">{cuota.numero}</td>
                <td>{cuota.fecha_vencimiento}</td>
                <td>
                  {cuota.monto_base} {lote!.moneda}
                  {lote!.moneda === 'USD' && cotizacionVigente && (
                    <span className="block text-xs text-gray-500">
                      ≈ {convertirUsdAPesos(cuota.monto_base, cotizacionVigente.valor)} ARS
                    </span>
                  )}
                </td>
                <td>
                  {cuota.saldo_pendiente} {lote!.moneda}
                  {lote!.moneda === 'USD' && cotizacionVigente && (
                    <span className="block text-xs text-gray-500">
                      ≈ {convertirUsdAPesos(cuota.saldo_pendiente, cotizacionVigente.valor)} ARS
                    </span>
                  )}
                </td>
                <td>
                  {interesMoratorio > 0 && (
                    <span className="text-red-700">
                      +{interesMoratorio} {lote!.moneda}
                    </span>
                  )}
                </td>
                <td>
                  {primeraImpaga?.id === cuota.id && (
                    <a href={`/portal-cliente/pagar/${cuota.id}`} className="underline">
                      Pagar cuota
                    </a>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h2 className="mb-2 mt-10 text-lg font-semibold">Mis pagos</h2>
      {pagosConLink.length === 0 ? (
        <p className="text-sm text-gray-600">Todavía no registraste ningún pago.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Monto</th>
              <th>Estado</th>
              <th>Comprobante</th>
            </tr>
          </thead>
          <tbody>
            {pagosConLink.map((pago) => (
              <tr key={pago.id} className="border-b">
                <td className="py-2">
                  {pago.monto} {pago.moneda}
                </td>
                <td>{pago.estado}</td>
                <td>
                  {!pago.comprobante_path ? (
                    <span className="text-amber-700">
                      ⚠ Falta subir comprobante ·{' '}
                      <a
                        href={`/portal-cliente/pagos/${pago.id}/comprobante`}
                        className="underline"
                      >
                        Subir
                      </a>
                    </span>
                  ) : pago.comprobanteUrl ? (
                    <a href={pago.comprobanteUrl} target="_blank" className="underline">
                      Ver comprobante
                    </a>
                  ) : (
                    <span className="text-gray-500">Comprobante no disponible</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
