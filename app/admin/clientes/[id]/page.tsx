import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { calcularEstadoCobranza } from '@/lib/cobranza/estado-cliente'
import { armarLinkWhatsApp, armarMensajeWhatsApp } from '@/lib/cobranza/plantillas-whatsapp'
import { telefonoParaWhatsApp } from '@/lib/telefono/prefijos'
import { CampoTelefono, AyudaTelefono } from '@/components/CampoTelefono'
import { notFound } from 'next/navigation'
import { resetearContrasenaCliente, eliminarCliente, actualizarDatosCliente } from '../actions'
import { BotonEliminarUsuario } from '@/app/admin/usuarios/BotonEliminarUsuario'

export default async function ClienteDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; ok?: string }>
}) {
  await requireAdministrador()

  const { id } = await params
  const { error, ok } = await searchParams

  const supabase = await createClient()

  const { data: cliente } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, dni, domicilio, telefono')
    .eq('id', id)
    .maybeSingle()

  if (!cliente || cliente.role !== 'cliente') {
    notFound()
  }

  const telefonoWhatsAppCliente = telefonoParaWhatsApp(cliente.telefono)

  const { data: lotes } = await supabase
    .from('lotes')
    .select('id, identificador, moneda, estado')
    .eq('cliente_id', id)
    .order('identificador')

  const hoy = new Date().toISOString().slice(0, 10)

  const lotesConSaldo = await Promise.all(
    (lotes ?? []).map(async (lote) => {
      const { data: cuotas } = await supabase
        .from('cuotas')
        .select('saldo_pendiente, fecha_vencimiento')
        .eq('lote_id', lote.id)
        .order('fecha_vencimiento', { ascending: true })

      const saldoPendiente = (cuotas ?? []).reduce(
        (acumulado, cuota) => acumulado + cuota.saldo_pendiente,
        0
      )

      const estadoCobranza = calcularEstadoCobranza(
        (cuotas ?? []).map((cuota) => ({
          saldoPendiente: cuota.saldo_pendiente,
          fechaVencimiento: cuota.fecha_vencimiento,
        })),
        hoy
      )

      // Botón de WhatsApp: se habilita solo si el lote tiene saldo pendiente
      // y ya existe una plantilla para su estado de cobranza actual (por
      // ahora, "normal" y "moroso" -- "prejudicial" queda sin botón hasta
      // que Nicolás defina esa plantilla, sin tocar nada de este código).
      const proximaCuotaPendiente = (cuotas ?? []).find((cuota) => cuota.saldo_pendiente > 0)
      const telefonoWhatsApp = telefonoParaWhatsApp(cliente!.telefono)
      const mensajeWhatsApp =
        saldoPendiente > 0 && proximaCuotaPendiente
          ? armarMensajeWhatsApp(estadoCobranza, {
              nombre: cliente!.full_name,
              lote: lote.identificador,
              monto: saldoPendiente,
              moneda: lote.moneda,
              fechaVencimiento: proximaCuotaPendiente.fecha_vencimiento,
            })
          : null

      return { ...lote, saldoPendiente, estadoCobranza, mensajeWhatsApp, telefonoWhatsApp }
    })
  )

  return (
    <main className="max-w-2xl">
      <a href="/admin/clientes" className="mb-4 inline-block text-sm underline">
        ← Volver a Clientes
      </a>
      <div className="mb-6">
        <h1 className="mb-1 text-xl font-semibold">{cliente!.full_name}</h1>
        <p className="text-sm text-gray-600">{cliente!.email}</p>
        {cliente!.dni && <p className="text-sm text-gray-600">DNI: {cliente!.dni}</p>}
        {cliente!.domicilio && <p className="text-sm text-gray-600">Domicilio: {cliente!.domicilio}</p>}
        {telefonoWhatsAppCliente && (
          <p className="text-sm text-gray-600">Teléfono: +{telefonoWhatsAppCliente}</p>
        )}
      </div>

      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      {ok && <p className="mb-4 rounded bg-green-100 p-2 text-sm text-green-700">{ok}</p>}

      <h2 className="mb-2 text-lg font-semibold">Lotes</h2>
      {lotesConSaldo.length === 0 ? (
        <p className="mb-6 text-sm text-gray-600">Este cliente todavía no tiene ningún lote.</p>
      ) : (
        <table className="mb-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Identificador</th>
              <th>Estado</th>
              <th>Saldo pendiente</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lotesConSaldo.map((lote) => (
              <tr key={lote.id} className="border-b">
                <td className="py-2">{lote.identificador}</td>
                <td>{lote.estado === 'vendido' ? lote.estadoCobranza : lote.estado}</td>
                <td>
                  {lote.saldoPendiente} {lote.moneda}
                </td>
                <td>
                  <a href={`/admin/lotes/${lote.id}`} className="underline">
                    Ver lote
                  </a>
                </td>
                <td>
                  {lote.mensajeWhatsApp && lote.telefonoWhatsApp && (
                    <a
                      href={armarLinkWhatsApp(lote.telefonoWhatsApp, lote.mensajeWhatsApp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      WhatsApp
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="mb-2 text-lg font-semibold">Editar datos</h2>
      <form
        action={actualizarDatosCliente.bind(null, cliente!.id)}
        className="mb-8 flex max-w-sm flex-col gap-3"
      >
        <label className="text-sm">
          Nombre completo
          <input
            name="fullName"
            defaultValue={cliente!.full_name}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          DNI
          <input
            name="dni"
            defaultValue={cliente!.dni ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Domicilio
          <input
            name="domicilio"
            defaultValue={cliente!.domicilio ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Teléfono (para WhatsApp)
          <CampoTelefono valorGuardado={cliente!.telefono} />
          <AyudaTelefono />
        </label>
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Guardar datos
        </button>
      </form>

      <h2 className="mb-2 text-lg font-semibold">Resetear contraseña</h2>
      <p className="mb-2 text-sm text-gray-600">
        Mínimo 8 caracteres, incluyendo un signo (ej. ! ? . # -)
      </p>
      <form
        action={resetearContrasenaCliente.bind(null, cliente!.id)}
        className="flex max-w-sm gap-2"
      >
        <input
          name="nuevaContrasena"
          type="text"
          placeholder="Nueva contraseña"
          minLength={8}
          required
          className="flex-1 rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">
          Guardar
        </button>
      </form>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Eliminar cuenta</h2>
      <BotonEliminarUsuario eliminarUsuarioAction={eliminarCliente.bind(null, cliente!.id)} />
    </main>
  )
}
