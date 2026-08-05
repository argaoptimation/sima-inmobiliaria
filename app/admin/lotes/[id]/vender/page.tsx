import { venderLote } from './actions'
import { requireAdminSobreLote } from '@/lib/auth/require-admin'

export default async function VenderLotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  await requireAdminSobreLote(id)
  const { error } = await searchParams
  const venderLoteConId = venderLote.bind(null, id)

  return (
    <main className="max-w-md">
      <h1 className="mb-6 text-xl font-semibold">Vender lote y dar de alta al cliente</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      <form action={venderLoteConId} className="flex flex-col gap-3">
        <input
          name="fullName"
          placeholder="Nombre completo del comprador"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="email"
          type="email"
          placeholder="Email del comprador"
          required
          className="rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Confirmar venta y enviar invitación
        </button>
      </form>
    </main>
  )
}
