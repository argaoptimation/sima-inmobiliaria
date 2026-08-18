import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { actualizarReserva } from '../actions'

export default async function EditarReservaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    error?: string
    nombreCompleto?: string
    dniPreservado?: string
    domicilio?: string
    email?: string
    telefono?: string
    telefonoAlternativo?: string
    estadoCivil?: string
    instrumentacion?: string
    montoSena?: string
    monedaSena?: string
    recibidoPor?: string
    recibidoPorOtro?: string
  }>
}) {
  const { id } = await params
  const {
    error,
    nombreCompleto: nombreCompletoPreservado,
    dniPreservado,
    domicilio: domicilioPreservado,
    email: emailPreservado,
    telefono: telefonoPreservado,
    telefonoAlternativo: telefonoAlternativoPreservado,
    estadoCivil: estadoCivilPreservado,
    instrumentacion: instrumentacionPreservado,
    montoSena: montoSenaPreservado,
    monedaSena: monedaSenaPreservado,
    recibidoPor: recibidoPorPreservado,
    recibidoPorOtro: recibidoPorOtroPreservado,
  } = await searchParams

  await requireAdministrador()

  const supabase = await createClient()

  const { data: lote } = await supabase
    .from('lotes')
    .select('id, identificador, estado')
    .eq('id', id)
    .single()

  if (!lote) {
    notFound()
  }

  const { data: reserva } = await supabase
    .from('reservas')
    .select(
      'nombre_completo, dni, domicilio, email, telefono, telefono_alternativo, estado_civil, instrumentacion, monto_sena, moneda_sena, recibido_por, recibido_por_otro'
    )
    .eq('lote_id', id)
    .is('cancelada_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['administrador', 'acreedor', 'vendedor', 'cobrador'])
    .order('full_name')

  const actualizarReservaConId = actualizarReserva.bind(null, id)

  return (
    <main className="max-w-md">
      <div className="mb-4 flex gap-4">
        <a href="/admin/lotes" className="text-sm underline">
          ← Volver a Lotes
        </a>
        <a href={`/admin/lotes/${id}`} className="text-sm underline">
          ← Volver al lote
        </a>
      </div>
      <h1 className="mb-6 text-xl font-semibold">Editar reserva — {lote!.identificador}</h1>

      {lote!.estado !== 'reservado' || !reserva ? (
        <p className="mb-4 rounded bg-amber-100 p-2 text-sm text-amber-800">
          Este lote no está reservado, no se puede editar la reserva (estado actual: {lote!.estado}).
        </p>
      ) : (
        <form action={actualizarReservaConId} className="flex flex-col gap-3">
          {error && <p className="rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}

          <input
            name="nombreCompleto"
            placeholder="Nombre completo"
            defaultValue={nombreCompletoPreservado ?? reserva.nombre_completo}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="dni"
            placeholder="DNI"
            defaultValue={dniPreservado ?? reserva.dni}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="domicilio"
            placeholder="Domicilio"
            defaultValue={domicilioPreservado ?? reserva.domicilio}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="email"
            type="email"
            placeholder="Email"
            defaultValue={emailPreservado ?? reserva.email}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="telefono"
            placeholder="Teléfono"
            defaultValue={telefonoPreservado ?? reserva.telefono}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="telefonoAlternativo"
            placeholder="Teléfono alternativo (opcional)"
            defaultValue={telefonoAlternativoPreservado ?? reserva.telefono_alternativo ?? ''}
            className="rounded border px-3 py-2"
          />

          <label className="text-sm">
            Estado civil
            <select
              name="estadoCivil"
              required
              defaultValue={estadoCivilPreservado ?? reserva.estado_civil}
              className="mt-1 block w-full rounded border px-3 py-2"
            >
              <option value="soltero">Soltero/a</option>
              <option value="casado">Casado/a</option>
              <option value="divorciado">Divorciado/a</option>
              <option value="viudo">Viudo/a</option>
            </select>
          </label>

          <label className="text-sm">
            Instrumentación prevista (opcional)
            <select
              name="instrumentacion"
              defaultValue={instrumentacionPreservado ?? reserva.instrumentacion ?? ''}
              className="mt-1 block w-full rounded border px-3 py-2"
            >
              <option value="">— sin definir —</option>
              <option value="boleto">Boleto de compraventa</option>
              <option value="escritura">Escritura</option>
            </select>
          </label>

          <input
            name="montoSena"
            type="number"
            step="0.01"
            min="0"
            placeholder="Monto de la seña"
            defaultValue={montoSenaPreservado ?? reserva.monto_sena}
            required
            className="rounded border px-3 py-2"
          />
          <label className="text-sm">
            Moneda de la seña
            <select
              name="monedaSena"
              required
              defaultValue={monedaSenaPreservado ?? reserva.moneda_sena}
              className="mt-1 block w-full rounded border px-3 py-2"
            >
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
            </select>
          </label>

          <label className="text-sm">
            Quién recibió la seña
            <select
              name="recibidoPor"
              defaultValue={recibidoPorPreservado ?? reserva.recibido_por ?? ''}
              className="mt-1 block w-full rounded border px-3 py-2"
            >
              <option value="">— no está en la lista, especificar abajo —</option>
              {staff?.map((persona) => (
                <option key={persona.id} value={persona.id}>
                  {persona.full_name} ({persona.role})
                </option>
              ))}
            </select>
          </label>
          <input
            name="recibidoPorOtro"
            placeholder="Si no está en la lista: nombre de quien la recibió"
            defaultValue={recibidoPorOtroPreservado ?? reserva.recibido_por_otro ?? ''}
            className="rounded border px-3 py-2"
          />

          <p className="text-sm text-gray-600">
            Los siguientes archivos solo se reemplazan si elegís uno nuevo — si dejás el campo vacío, se
            mantiene el que ya estaba subido.
          </p>

          <label className="text-sm">
            Comprobante de la seña (opcional, reemplaza el actual)
            <input name="comprobante" type="file" className="mt-1 block w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">
            DNI - frente (opcional, reemplaza el actual)
            <input name="dniFrente" type="file" className="mt-1 block w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">
            DNI - dorso (opcional, reemplaza el actual)
            <input name="dniDorso" type="file" className="mt-1 block w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">
            DNI del cónyuge (opcional, reemplaza el actual — obligatorio si el estado civil queda en
            &quot;Casado/a&quot; y todavía no había uno guardado)
            <input name="dniConyuge" type="file" className="mt-1 block w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">
            Sentencia de divorcio (opcional, reemplaza el actual — obligatoria si el estado civil queda en
            &quot;Divorciado/a&quot; y todavía no había una guardada)
            <input name="sentenciaDivorcio" type="file" className="mt-1 block w-full rounded border px-3 py-2" />
          </label>

          <button type="submit" className="rounded bg-black px-3 py-2 text-white">
            Guardar cambios
          </button>
        </form>
      )}
    </main>
  )
}
