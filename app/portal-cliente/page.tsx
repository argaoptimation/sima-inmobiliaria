import { createClient } from '@/lib/supabase/server'
import { calcularEstadoCobranza } from '@/lib/cobranza/estado-cliente'
import { redirect } from 'next/navigation'
import { logout } from '@/app/login/actions'

function BotonCerrarSesion() {
  return (
    <form action={logout}>
      <button type="submit" className="text-sm underline">
        Cerrar sesión
      </button>
    </form>
  )
}

function AccionesHeader() {
  return (
    <div className="flex items-center gap-4">
      <a href="/portal-cliente/mi-perfil" className="text-sm underline">
        Mi perfil
      </a>
      <BotonCerrarSesion />
    </div>
  )
}

export default async function PortalClientePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: lotes } = await supabase
    .from('lotes')
    .select('id, identificador, moneda')
    .eq('cliente_id', user!.id)
    .order('identificador')

  if (!lotes || lotes.length === 0) {
    return (
      <main className="mx-auto mt-24 max-w-md p-6 text-center">
        <p className="mb-4">Todavía no tenés un lote asignado.</p>
        <div className="flex justify-center">
          <AccionesHeader />
        </div>
      </main>
    )
  }

  const hoy = new Date().toISOString().slice(0, 10)

  const lotesConEstado = await Promise.all(
    lotes.map(async (lote) => {
      const { data: cuotas } = await supabase
        .from('cuotas')
        .select('saldo_pendiente, fecha_vencimiento')
        .eq('lote_id', lote.id)

      const estado = calcularEstadoCobranza(
        (cuotas ?? []).map((cuota) => ({
          saldoPendiente: cuota.saldo_pendiente,
          fechaVencimiento: cuota.fecha_vencimiento,
        })),
        hoy
      )

      return { ...lote, estado }
    })
  )

  return (
    <main className="mx-auto mt-12 max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tus lotes</h1>
        <AccionesHeader />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Lote</th>
            <th>Moneda</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lotesConEstado.map((lote) => (
            <tr key={lote.id} className="border-b">
              <td className="py-2">{lote.identificador}</td>
              <td>{lote.moneda}</td>
              <td>
                <span
                  className={
                    lote.estado === 'normal'
                      ? 'text-green-700'
                      : lote.estado === 'moroso'
                        ? 'text-amber-700'
                        : 'text-red-700'
                  }
                >
                  {lote.estado}
                </span>
              </td>
              <td>
                <a href={`/portal-cliente/lotes/${lote.id}`} className="underline">
                  Ver detalle
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
