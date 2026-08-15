import { requireAdministrador } from '@/lib/auth/require-admin'

export default async function CuentaExternaDetallePage() {
  await requireAdministrador()

  return (
    <main className="max-w-2xl">
      <a href="/admin/cuentas-externas" className="mb-4 inline-block text-sm underline">
        ← Volver a Cuentas externas
      </a>
      <p className="text-sm text-gray-600">Detalle de la cuenta externa (en construcción).</p>
    </main>
  )
}
