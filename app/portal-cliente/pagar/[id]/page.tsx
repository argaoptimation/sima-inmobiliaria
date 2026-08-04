import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { registrarPago } from './actions'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'

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

  const { data: lote } = await supabase
    .from('lotes')
    .select('cuenta_cobro_id')
    .eq('cliente_id', user!.id)
    .single()

  let cuentaCobro: { alias: string | null; banco: string | null; cbu: string | null; titular: string | null } | null = null

  if (lote?.cuenta_cobro_id) {
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

  return (
    <main className="mx-auto mt-12 max-w-md p-6">
      <h1 className="mb-6 text-xl font-semibold">Registrar pago</h1>
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
        <input
          name="monto"
          type="number"
          step="0.01"
          min="0.01"
          placeholder="Monto transferido"
          required
          className="rounded border px-3 py-2"
        />
        <select name="moneda" required className="rounded border px-3 py-2">
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Ya transferí
        </button>
      </form>
    </main>
  )
}
