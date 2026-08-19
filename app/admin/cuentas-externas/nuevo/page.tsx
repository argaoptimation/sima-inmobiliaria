import { requireAdministrador } from '@/lib/auth/require-admin'
import { crearCuentaExterna } from '../actions'

export default async function NuevaCuentaExternaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireAdministrador()
  const { error } = await searchParams

  return (
    <main className="max-w-md">
      <a href="/admin/cuentas-externas" className="mb-4 inline-block text-sm underline">
        ← Volver a Cuentas externas
      </a>
      <h1 className="mb-6 text-xl font-semibold">Nueva cuenta externa</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      <form action={crearCuentaExterna} className="flex flex-col gap-3">
        <label className="text-sm">
          Nombre del destinatario
          <input name="nombre" required className="mt-1 block w-full rounded border px-3 py-2" />
        </label>
        <label className="text-sm">
          Titular de la cuenta
          <input name="titular" className="mt-1 block w-full rounded border px-3 py-2" />
        </label>
        <label className="text-sm">
          Alias
          <input name="alias" className="mt-1 block w-full rounded border px-3 py-2" />
        </label>
        <label className="text-sm">
          Banco
          <input name="banco" className="mt-1 block w-full rounded border px-3 py-2" />
        </label>
        <label className="text-sm">
          CBU (opcional)
          <input name="cbu" className="mt-1 block w-full rounded border px-3 py-2" />
        </label>
        <h2 className="mt-4 text-sm font-semibold">Movimiento inicial (opcional)</h2>
        <label className="text-sm">
          Tipo
          <select
            name="deudaInicialTipo"
            defaultValue="debito"
            className="mt-1 block w-full rounded border px-3 py-2"
          >
            <option value="debito">Débito — le debemos nosotros a esta cuenta</option>
            <option value="credito">Crédito — esta cuenta nos debe a nosotros</option>
          </select>
        </label>
        <label className="text-sm">
          Monto
          <input
            name="deudaInicialMonto"
            type="number"
            step="0.01"
            min="0"
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Moneda
          <select name="deudaInicialMoneda" defaultValue="USD" className="mt-1 block w-full rounded border px-3 py-2">
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </label>
        <label className="text-sm">
          Concepto
          <input
            name="deudaInicialConcepto"
            placeholder="Ej: Materiales de construcción"
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Crear cuenta externa
        </button>
      </form>
    </main>
  )
}
