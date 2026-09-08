import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { registrarPago } from './actions'
import { tieneDatosTransferencia } from '@/lib/lotes/validar-cuenta-cobro'
import { resolverDestinoDeCobro } from '@/lib/pagos/quien-cobra'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { MontoYMoneda } from './MontoYMoneda'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import { CampoArchivoDirecto } from '@/components/CampoArchivoDirecto'
import { BotonCopiarValor } from '@/components/BotonCopiarValor'
import { Obligatorio } from '@/components/Obligatorio'
import { ArrowLeft, Landmark } from 'lucide-react'

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
    .select('lote_id, saldo_pendiente, cuenta_cobro_id, cuenta_cobro_externa_id')
    .eq('id', id)
    .maybeSingle()

  if (!cuota) {
    notFound()
  }

  const { data: lote } = await supabase
    .from('lotes')
    .select(
      'cliente_id, cuenta_cobro_id, cuenta_cobro_externa_id, acreedor_id, moneda, interes_moratorio_diario'
    )
    .eq('id', cuota!.lote_id)
    .single()

  if (!lote || lote.cliente_id !== user!.id) {
    notFound()
  }

  let cuentaCobro: { alias: string | null; banco: string | null; cbu: string | null; titular: string | null } | null = null

  // Desde el 05/09 el destino puede ser de la CUOTA (Nicolás reparte cuota
  // por cuota: la 1 al vendedor 1, la 2 al vendedor 2, etc.). Si esa cuota
  // no tiene uno propio, se cae al del lote -- que es como funcionaba antes,
  // así que ninguna cuota vieja se queda sin alias que mostrar.
  //
  // Y si no hay ninguno de los dos, cobra el acreedor del lote. Esa última
  // rama la tenía resolverDestinatarioDelPago desde siempre (es quien
  // confirma el pago) pero esta pantalla no, así que el cliente podía ver
  // "sin datos para transferir" en una cuota que el sistema sí sabía a quién
  // le correspondía. Importa desde el 08/09, que es cuando el lote dejó de
  // tener una cuenta de cobro propia que rellenara el hueco.
  const destinoExplicito = resolverDestinoDeCobro(cuota, lote)
  const perfilQueCobraId =
    destinoExplicito.perfilId ??
    (destinoExplicito.cuentaExternaId ? null : (lote.acreedor_id ?? null))
  const cuentaExternaQueCobraId = destinoExplicito.cuentaExternaId

  if (perfilQueCobraId) {
    const { data } = await supabase
      .from('profiles')
      .select('alias, banco, cbu, titular')
      .eq('id', perfilQueCobraId)
      .single()

    cuentaCobro = data
  } else if (cuentaExternaQueCobraId) {
    const { data } = await supabase
      .from('cuentas_externas')
      .select('alias, banco, cbu, titular')
      .eq('id', cuentaExternaQueCobraId)
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
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 underline-offset-4 hover:text-blue-900 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al lote
      </EnlaceBoton>
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight text-blue-950">Registrar pago</h1>

      {lote!.moneda === 'USD' && cotizacionVigente && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Cotización del dólar hoy
          </p>
          <p className="text-lg font-bold text-blue-900 tabular-nums">
            {cotizacionVigente.valor} <span className="text-sm font-semibold text-slate-500">ARS</span>
          </p>
        </div>
      )}

      <div className="mb-4 rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
        {datosCompletos ? (
          <>
            <p className="mb-3 flex items-center gap-2 text-sm font-bold text-blue-900">
              <Landmark className="h-4 w-4 text-blue-700" />
              Transferí a
            </p>
            <dl className="flex flex-col gap-2 text-sm text-slate-700">
              <div className="flex items-center justify-between gap-3">
                <dt className="font-medium text-slate-500">Titular</dt>
                <dd className="text-right font-semibold text-slate-800">{cuentaCobro!.titular}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-medium text-slate-500">Alias</dt>
                <dd className="flex items-center gap-2">
                  <span className="font-bold text-blue-800">{cuentaCobro!.alias}</span>
                  <BotonCopiarValor valor={cuentaCobro!.alias ?? ''} titulo="Copiar alias" />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-medium text-slate-500">Banco</dt>
                <dd className="text-right font-semibold text-slate-800">{cuentaCobro!.banco}</dd>
              </div>
              {cuentaCobro!.cbu?.trim() && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="font-medium text-slate-500">CBU</dt>
                  <dd className="text-right font-semibold tabular-nums text-slate-800">{cuentaCobro!.cbu}</dd>
                </div>
              )}
            </dl>
          </>
        ) : (
          <p className="text-sm text-slate-600">Consultá los datos de la cuenta con SIMACOR Inmobiliaria.</p>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-lg border-l-4 border-red-600 bg-red-50 p-3 text-sm font-medium text-red-800">
          {error}
        </p>
      )}

      <form action={registrarPagoConId} className="flex flex-col gap-4 rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
        <MontoYMoneda
          saldoPendiente={cuota!.saldo_pendiente}
          monedaLote={lote!.moneda}
          interesMoratorioDiario={lote!.interes_moratorio_diario}
          cotizacionVigente={cotizacionVigente}
        />

        {/* El comprobante va acá mismo (06/09): antes era una pantalla
            aparte después de "Ya transferí". Sigue siendo obligatorio -- sin
            prueba de la transferencia el pago no se puede confirmar. */}
        <div>
          <span className="text-sm text-slate-600">
            Comprobante de la transferencia
            <Obligatorio />
          </span>
          <CampoArchivoDirecto
            name="comprobante"
            bucket="comprobantes"
            carpeta={user!.id}
            tipoArchivo="comprobante"
            label="Arrastrá el comprobante o elegí el archivo"
            ayuda="JPG, PNG o PDF · hasta 15 MB"
            nombreError="El comprobante"
            required
          />
        </div>

        <BotonEnvio className="rounded-lg bg-blue-800 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-blue-900 cursor-pointer">
          Ya transferí
        </BotonEnvio>
      </form>
    </div>
  )
}
