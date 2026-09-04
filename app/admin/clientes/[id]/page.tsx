import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { calcularEstadoCobranza, cuotasVencidas } from '@/lib/cobranza/estado-cliente'
import { calcularInteresMoratorio } from '@/lib/cobranza/interes-moratorio'
import { armarLinkWhatsApp, armarMensajeWhatsApp } from '@/lib/cobranza/plantillas-whatsapp'
import { telefonoParaWhatsApp } from '@/lib/telefono/prefijos'
import { obtenerSiteUrl } from '@/lib/config/site-url'
import { hoyArgentina } from '@/lib/fecha/hoy-argentina'
import { CampoTelefono, AyudaTelefono } from '@/components/CampoTelefono'
import { notFound } from 'next/navigation'
import { resetearContrasenaCliente, eliminarCliente, actualizarDatosCliente } from '../actions'
import { BotonEliminarUsuario } from '@/app/admin/usuarios/BotonEliminarUsuario'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import { Obligatorio } from '@/components/Obligatorio'
import {
  ENTRADA,
  BOTON_PRIMARIO,
  ENLACE,
  ENLACE_TABLA,
  TITULO_H1,
  TITULO_H2,
  BANNER_ERROR,
  BANNER_OK,
  TABLA_CONTENEDOR,
  TABLA_HEADER_FILA,
  TABLA_HEADER_CELDA,
  TABLA_FILA,
  TABLA_CELDA,
} from '@/lib/ui/clases'

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
    .select('id, full_name, email, role, dni, domicilio, telefono_prefijo, telefono_numero')
    .eq('id', id)
    .maybeSingle()

  if (!cliente || cliente.role !== 'cliente') {
    notFound()
  }

  const telefonoWhatsAppCliente = telefonoParaWhatsApp(cliente.telefono_prefijo, cliente.telefono_numero)

  const { data: lotes } = await supabase
    .from('lotes')
    .select('id, identificador, moneda, estado, marcado_prejudicial, numero_lote, manzana, loteo_id, interes_moratorio_diario')
    .eq('cliente_id', id)
    .order('identificador')

  const loteoIds = [...new Set((lotes ?? []).map((lote) => lote.loteo_id).filter(Boolean))]
  const { data: loteosDeClientes } =
    loteoIds.length > 0
      ? await supabase.from('loteos').select('id, nombre').in('id', loteoIds)
      : { data: [] }
  const nombreLoteoPorId = new Map((loteosDeClientes ?? []).map((loteo) => [loteo.id, loteo.nombre]))

  const hoy = hoyArgentina()

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

      const cuotasNormalizadas = (cuotas ?? []).map((cuota) => ({
        saldoPendiente: cuota.saldo_pendiente,
        fechaVencimiento: cuota.fecha_vencimiento,
      }))

      const estadoCobranza = calcularEstadoCobranza(cuotasNormalizadas, hoy)
      const vencidas = cuotasVencidas(cuotasNormalizadas, hoy)
      // moroso/prejudicial: sumamos el interés moratorio acumulado de cada
      // cuota vencida al monto del mensaje (ver lib/cobranza/plantillas-whatsapp.ts).
      const montoConMora =
        estadoCobranza === 'moroso' || estadoCobranza === 'prejudicial'
          ? saldoPendiente +
            vencidas.reduce(
              (acum, cuota) =>
                acum + calcularInteresMoratorio(cuota, lote.interes_moratorio_diario, hoy),
              0
            )
          : saldoPendiente

      // Botón de WhatsApp: se habilita solo si el lote tiene saldo pendiente
      // y ya existe una plantilla para su estado de cobranza actual (las 4
      // plantillas -- normal/atrasado/moroso/prejudicial -- las escribió
      // Nicolás el 28/08, ver lib/cobranza/plantillas-whatsapp.ts).
      const proximaCuotaPendiente = (cuotas ?? []).find((cuota) => cuota.saldo_pendiente > 0)
      const telefonoWhatsApp = telefonoParaWhatsApp(cliente!.telefono_prefijo, cliente!.telefono_numero)
      const mensajeWhatsApp =
        saldoPendiente > 0 && proximaCuotaPendiente
          ? armarMensajeWhatsApp(estadoCobranza, {
              nombre: cliente!.full_name,
              lote: lote.identificador,
              numeroLote: lote.numero_lote,
              manzana: lote.manzana,
              nombreLoteo: lote.loteo_id ? (nombreLoteoPorId.get(lote.loteo_id) ?? null) : null,
              monto: montoConMora,
              moneda: lote.moneda,
              fechaVencimiento: proximaCuotaPendiente.fecha_vencimiento,
              fechasVencidas: vencidas.map((cuota) => cuota.fechaVencimiento),
              linkPortal: obtenerSiteUrl(),
            })
          : null

      return { ...lote, saldoPendiente, estadoCobranza, mensajeWhatsApp, telefonoWhatsApp }
    })
  )

  return (
    <main className="max-w-2xl">
      <EnlaceBoton href="/admin/clientes" className={`mb-4 inline-block ${ENLACE}`}>
        ← Volver a Clientes
      </EnlaceBoton>
      <div className="mb-6">
        <h1 className={`mb-1 ${TITULO_H1}`}>{cliente!.full_name}</h1>
        <p className="text-sm text-slate-600">{cliente!.email}</p>
        {cliente!.dni && <p className="text-sm text-slate-600">DNI: {cliente!.dni}</p>}
        {cliente!.domicilio && <p className="text-sm text-slate-600">Domicilio: {cliente!.domicilio}</p>}
        {telefonoWhatsAppCliente && (
          <p className="text-sm text-slate-600">Teléfono: +{telefonoWhatsAppCliente}</p>
        )}
      </div>

      {error && <p className={BANNER_ERROR}>{error}</p>}
      {ok && <p className={BANNER_OK}>{ok}</p>}

      <h2 className={`mb-2 ${TITULO_H2}`}>Lotes</h2>
      {lotesConSaldo.length === 0 ? (
        <p className="mb-6 text-sm text-slate-600">Este cliente todavía no tiene ningún lote.</p>
      ) : (
        <div className={`mb-6 ${TABLA_CONTENEDOR}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className={TABLA_HEADER_FILA}>
              <th className={TABLA_HEADER_CELDA}>Identificador</th>
              <th className={TABLA_HEADER_CELDA}>Estado</th>
              <th className={TABLA_HEADER_CELDA}>Saldo pendiente</th>
              <th className={TABLA_HEADER_CELDA}></th>
              <th className={TABLA_HEADER_CELDA}></th>
            </tr>
          </thead>
          <tbody>
            {lotesConSaldo.map((lote) => (
              <tr key={lote.id} className={TABLA_FILA}>
                <td className={TABLA_CELDA}>{lote.identificador}</td>
                <td className={TABLA_CELDA}>
                  {lote.estado !== 'vendido'
                    ? lote.estado
                    : lote.marcado_prejudicial
                      ? 'Prejudicial'
                      : lote.estadoCobranza === 'normal'
                        ? 'Al día'
                        : lote.estadoCobranza === 'atrasado'
                          ? 'Atrasado'
                          : lote.estadoCobranza === 'moroso'
                            ? 'Moroso'
                            : 'Posible prejudicial'}
                </td>
                <td className={TABLA_CELDA}>
                  {lote.saldoPendiente} {lote.moneda}
                </td>
                <td className={TABLA_CELDA}>
                  <EnlaceBoton href={`/admin/lotes/${lote.id}`} className={ENLACE_TABLA}>
                    Ver lote
                  </EnlaceBoton>
                </td>
                <td className={TABLA_CELDA}>
                  {lote.mensajeWhatsApp && lote.telefonoWhatsApp && (
                    <a
                      href={armarLinkWhatsApp(lote.telefonoWhatsApp, lote.mensajeWhatsApp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={ENLACE_TABLA}
                    >
                      WhatsApp
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <h2 className={`mb-2 ${TITULO_H2}`}>Editar datos</h2>
      <form
        action={actualizarDatosCliente.bind(null, cliente!.id)}
        className="mb-8 flex max-w-sm flex-col gap-3"
      >
        <label className="text-sm text-slate-600">
          Nombre completo
          <Obligatorio />
          <input
            name="fullName"
            defaultValue={cliente!.full_name}
            required
            className={`${ENTRADA} w-full`}
          />
        </label>
        <label className="text-sm text-slate-600">
          DNI
          <input
            name="dni"
            defaultValue={cliente!.dni ?? ''}
            className={`${ENTRADA} w-full`}
          />
        </label>
        <label className="text-sm text-slate-600">
          Domicilio
          <input
            name="domicilio"
            defaultValue={cliente!.domicilio ?? ''}
            className={`${ENTRADA} w-full`}
          />
        </label>
        <label className="text-sm text-slate-600">
          Teléfono (para WhatsApp)
          <CampoTelefono
            prefijoGuardado={cliente!.telefono_prefijo}
            numeroGuardado={cliente!.telefono_numero}
          />
          <AyudaTelefono />
        </label>
        <BotonEnvio className={`cursor-pointer self-start ${BOTON_PRIMARIO}`}>Guardar datos</BotonEnvio>
      </form>

      <h2 className={`mb-2 ${TITULO_H2}`}>Resetear contraseña</h2>
      <p className="mb-2 text-sm text-slate-600">
        Mínimo 8 caracteres, incluyendo un signo (ej. ! ? . # -)
      </p>
      <form
        action={resetearContrasenaCliente.bind(null, cliente!.id)}
        className="flex max-w-sm gap-2"
      >
        <input
          name="nuevaContrasena"
          type="text"
          placeholder="Nueva contraseña *"
          minLength={8}
          required
          className={`flex-1 ${ENTRADA}`}
        />
        <BotonEnvio className={`cursor-pointer ${BOTON_PRIMARIO}`}>Guardar</BotonEnvio>
      </form>

      <h2 className={`mb-2 mt-8 ${TITULO_H2}`}>Eliminar cuenta</h2>
      <BotonEliminarUsuario eliminarUsuarioAction={eliminarCliente.bind(null, cliente!.id)} />
    </main>
  )
}
