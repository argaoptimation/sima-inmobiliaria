import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { registrarPago } from './actions'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { MontoYMoneda } from './MontoYMoneda'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'

export default async function PagarCuotaPage({
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

  const { data: cuota } = await supabase
    .from('cuotas')
    .select('lote_id, saldo_pendiente')
    .eq('id', id)
    .maybeSingle()

  if (!cuota) {
    notFound()
  }

  const { data: lote } = await supabase
    .from('lotes')
    .select('cliente_id, cuenta_cobro_id, moneda, interes_moratorio_diario')
    .eq('id', cuota!.lote_id)
    .single()

  if (!lote || lote.cliente_id !== user!.id) {
    notFound()
  }

  let cuentaCobro: { alias: string | null; banco: string | null; cbu: string | null; titular: string | null } | null = null

  if (lote.cuenta_cobro_id) {
    const { data } = await supabase
      .from('profiles')
      .select('alias, banco, cbu, titular')
      .eq('id', lote.cuenta_cobro_id)
      .single()

    cuentaCobro = data
  }

  const datosCompletos = tieneDatosTransferencia({
    alias: cuentaCobro?.alias ?? null,
    banco: cuentaCobro?.banco ?? null,
    titular: cuentaCobro?.titular ?? null,
  })

  const registrarPagoConId = registrarPago.bind(null, id)

  // Fallback en cascada: la cotización más reciente en o antes de hoy --
  // resuelve solo el caso de fin de semana / día sin cargar (un ORDER BY +
  // LIMIT 1 hace de cascada, sin iterar día por día a mano).
  const hoy = hoyArgentina()
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

  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <EnlaceBoton
        href={`/portal-cliente/lotes/${cuota!.lote_id}`}
        className="mb-4 inline-block text-sm font-medium text-blue-800 underline-offset-4 hover:text-blue-900 hover:underline"
      >
        ← Volver al lote
      </EnlaceBoton>
      <h1 className="mb-6 text-2xl font-extrabold text-blue-900">Registrar pago</h1>

      {lote!.moneda === 'USD' && cotizacionVigente && (
        <div className="mb-4 rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Cotización del dólar hoy</p>
          <p className="mt-1 text-lg font-bold text-blue-900">
            {cotizacionVigente.valor} <span className="text-sm font-semibold text-slate-500">ARS</span>
          </p>
        </div>
      )}

      <div className="mb-6 rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
        {datosCompletos ? (
          <>
            <p className="mb-3 text-sm font-semibold text-blue-900">Transferí a:</p>
            <dl className="space-y-1.5 text-sm text-slate-700">
              <div className="flex gap-2">
                <dt className="font-medium text-slate-500">Titular:</dt>
                <dd>{cuentaCobro!.titular}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-slate-500">Alias:</dt>
                <dd className="font-semibold text-blue-900">{cuentaCobro!.alias}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-slate-500">Banco:</dt>
                <dd>{cuentaCobro!.banco}</dd>
              </div>
              {cuentaCobro!.cbu?.trim() && (
                <div className="flex gap-2">
                  <dt className="font-medium text-slate-500">CBU:</dt>
                  <dd>{cuentaCobro!.cbu}</dd>
                </div>
              )}
            </dl>
          </>
        ) : (
          <p className="text-sm text-slate-600">Consultá los datos de la cuenta con SIMA Inmobiliaria.</p>
        )}
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <form action={registrarPagoConId} className="flex flex-col gap-4">
        <MontoYMoneda
          saldoPendiente={cuota!.saldo_pendiente}
          monedaLote={lote!.moneda}
          interesMoratorioDiario={lote!.interes_moratorio_diario}
          cotizacionVigente={cotizacionVigente}
        />
        <BotonEnvio className="rounded-lg bg-blue-800 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-blue-900 cursor-pointer">
          Ya transferí
        </BotonEnvio>
      </form>
    </div>
  )
}
