import { requireAdministrador } from '@/lib/auth/require-admin'
import { crearCuentaExterna } from '../actions'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import { ENTRADA, BOTON_PRIMARIO, ENLACE, TITULO_H1, BANNER_ERROR } from '@/lib/ui/clases'
import { Obligatorio } from '@/components/Obligatorio'

export default async function NuevaCuentaExternaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireAdministrador()
  const { error } = await searchParams

  return (
    <main className="max-w-md">
      <EnlaceBoton href="/admin/cuentas-externas" className={`mb-4 inline-block ${ENLACE}`}>
        ← Volver a Cuentas externas
      </EnlaceBoton>
      <h1 className={`mb-6 ${TITULO_H1}`}>Nueva cuenta externa</h1>
      {error && <p className={BANNER_ERROR}>{error}</p>}
      <form action={crearCuentaExterna} className="flex flex-col gap-3">
        <label className="text-sm text-slate-600">
          Nombre del destinatario
          <Obligatorio />
          <input name="nombre" required className={`w-full ${ENTRADA}`} />
        </label>
        <label className="text-sm text-slate-600">
          Titular de la cuenta
          <input name="titular" className={`w-full ${ENTRADA}`} />
        </label>
        <label className="text-sm text-slate-600">
          Alias
          <input name="alias" className={`w-full ${ENTRADA}`} />
        </label>
        <label className="text-sm text-slate-600">
          Banco
          <input name="banco" className={`w-full ${ENTRADA}`} />
        </label>
        <label className="text-sm text-slate-600">
          CBU (opcional)
          <input name="cbu" className={`w-full ${ENTRADA}`} />
        </label>
        <h2 className="mt-4 text-sm font-semibold text-slate-700">Movimiento inicial (opcional)</h2>
        <label className="text-sm text-slate-600">
          Tipo
          <select name="deudaInicialTipo" defaultValue="debito" className={`w-full ${ENTRADA}`}>
            <option value="debito">Débito — le debemos nosotros a esta cuenta</option>
            <option value="credito">Crédito — esta cuenta nos debe a nosotros</option>
          </select>
        </label>
        <label className="text-sm text-slate-600">
          Monto
          <input name="deudaInicialMonto" type="number" step="0.01" min="0" className={`w-full ${ENTRADA}`} />
        </label>
        <label className="text-sm text-slate-600">
          Moneda
          <select name="deudaInicialMoneda" defaultValue="USD" className={`w-full ${ENTRADA}`}>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </label>
        <label className="text-sm text-slate-600">
          Concepto
          <input
            name="deudaInicialConcepto"
            placeholder="Ej: Materiales de construcción"
            className={`w-full ${ENTRADA}`}
          />
        </label>
        <BotonEnvio className={`cursor-pointer self-start ${BOTON_PRIMARIO}`}>Crear cuenta externa</BotonEnvio>
      </form>
    </main>
  )
}
