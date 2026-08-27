import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { registrarPago } from './actions'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { MontoYMoneda } from './MontoYMoneda'

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
    <main className="mx-auto mt-12 max-w-lg p-6">
      <a href={`/portal-cliente/lotes/${cuota!.lote_id}`} className="mb-4 inline-block text-sm underline">
        ← Volver al lote
      </a>
      <h1 className="mb-4 text-xl font-semibold">Registrar pago</h1>
      {lote!.moneda === 'USD' && cotizacionVigente && (
        <p className="mb-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          Cotización del dólar hoy: <span className="font-semibold">{cotizacionVigente.valor} ARS</span>
        </p>
      )}
      <div className="mb-6 rounded bg-gray-100 p-3 text-sm">
        {datosCompletos ? (
          <>
            <p className="mb-1">Transferí a:</p>
            <p>
              <span className="font-medium">Titular:</span> {cuentaCobro!.titular}
            </p>
            <p>
              <span className="font-medium">Alias:</span> {cuentaCobro!.alias}
            </p>
            <p>
              <span className="font-medium">Banco:</span> {cuentaCobro!.banco}
            </p>
            {cuentaCobro!.cbu?.trim() && (
              <p>
                <span className="font-medium">CBU:</span> {cuentaCobro!.cbu}
              </p>
            )}
          </>
        ) : (
          <p>Consultá los datos de la cuenta con SIMA Inmobiliaria.</p>
        )}
      </div>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      <form action={registrarPagoConId} className="flex flex-col gap-3">
        <MontoYMoneda
          saldoPendiente={cuota!.saldo_pendiente}
          monedaLote={lote!.moneda}
          interesMoratorioDiario={lote!.interes_moratorio_diario}
          cotizacionVigente={cotizacionVigente}
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Ya transferí
        </button>
      </form>
    </main>
  )
}
