import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { requireAccesoParaReservar } from '@/lib/auth/require-admin'
import { reservarLote } from './actions'

export default async function ReservarLotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; dni?: string }>
}) {
  const { id } = await params
  const { error, dni: dniBuscado } = await searchParams

  await requireAccesoParaReservar(id)

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: lote } = await supabase
    .from('lotes')
    .select('id, identificador, estado')
    .eq('id', id)
    .single()

  if (!lote) {
    notFound()
  }

  let clienteEncontrado: {
    full_name: string
    dni: string | null
    domicilio: string | null
    telefono: string | null
    email: string | null
  } | null = null

  if (dniBuscado) {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, dni, domicilio, telefono, email')
      .eq('role', 'cliente')
      .eq('dni', dniBuscado)
      .maybeSingle()
    clienteEncontrado = data
  }

  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['administrador', 'acreedor', 'vendedor', 'cobrador'])
    .order('full_name')

  const reservarLoteConId = reservarLote.bind(null, id)

  return (
    <main className="max-w-md">
      <a href="/admin/lotes" className="mb-4 inline-block text-sm underline">
        ← Volver a Lotes
      </a>
      <h1 className="mb-6 text-xl font-semibold">Reservar {lote!.identificador}</h1>

      {lote!.estado !== 'disponible' ? (
        <p className="mb-4 rounded bg-amber-100 p-2 text-sm text-amber-800">
          Este lote ya no está disponible para reservar (estado actual: {lote!.estado}).
        </p>
      ) : (
        <>
        <form method="GET" className="mb-4 flex gap-2">
          <input
            name="dni"
            placeholder="Buscar cliente por DNI"
            defaultValue={dniBuscado ?? ''}
            className="flex-1 rounded border px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded border px-3 py-2 text-sm">
            Buscar
          </button>
        </form>

        {dniBuscado &&
          (clienteEncontrado ? (
            <p className="mb-4 rounded bg-green-100 p-2 text-sm text-green-800">
              Encontramos a {clienteEncontrado.full_name} con este DNI. Sus datos se precargaron abajo
              — revisalos antes de confirmar.
            </p>
          ) : (
            <p className="mb-4 rounded bg-gray-100 p-2 text-sm text-gray-700">
              No encontramos ningún cliente con ese DNI — completá los datos manualmente.
            </p>
          ))}

        <form action={reservarLoteConId} className="flex flex-col gap-3">
          {error && <p className="rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}

          <input
            name="nombreCompleto"
            placeholder="Nombre completo"
            defaultValue={clienteEncontrado?.full_name ?? ''}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="dni"
            placeholder="DNI"
            defaultValue={clienteEncontrado?.dni ?? dniBuscado ?? ''}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="domicilio"
            placeholder="Domicilio"
            defaultValue={clienteEncontrado?.domicilio ?? ''}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="email"
            type="email"
            placeholder="Email"
            defaultValue={clienteEncontrado?.email ?? ''}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="telefono"
            placeholder="Teléfono"
            defaultValue={clienteEncontrado?.telefono ?? ''}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="telefonoAlternativo"
            placeholder="Teléfono alternativo (opcional)"
            className="rounded border px-3 py-2"
          />

          <label className="text-sm">
            Estado civil
            <select
              name="estadoCivil"
              required
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
              defaultValue=""
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
            required
            className="rounded border px-3 py-2"
          />
          <label className="text-sm">
            Moneda de la seña
            <select
              name="monedaSena"
              required
              defaultValue="USD"
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
              defaultValue={user!.id}
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
            className="rounded border px-3 py-2"
          />

          <label className="text-sm">
            Comprobante de la seña
            <input
              name="comprobante"
              type="file"
              required
              className="mt-1 block w-full rounded border px-3 py-2"
            />
          </label>

          <label className="text-sm">
            DNI - frente
            <input
              name="dniFrente"
              type="file"
              className="mt-1 block w-full rounded border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            DNI - dorso
            <input
              name="dniDorso"
              type="file"
              className="mt-1 block w-full rounded border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            DNI del cónyuge (solo si elegiste &quot;Casado/a&quot; arriba)
            <input
              name="dniConyuge"
              type="file"
              className="mt-1 block w-full rounded border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Sentencia de divorcio (solo si elegiste &quot;Divorciado/a&quot; arriba)
            <input
              name="sentenciaDivorcio"
              type="file"
              className="mt-1 block w-full rounded border px-3 py-2"
            />
          </label>

          <button type="submit" className="rounded bg-black px-3 py-2 text-white">
            Confirmar reserva
          </button>
        </form>
        </>
      )}
    </main>
  )
}
