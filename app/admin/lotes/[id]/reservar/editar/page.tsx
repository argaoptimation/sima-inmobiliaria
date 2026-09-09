import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { actualizarReserva } from '../actions'
import { CampoTelefono, AyudaTelefono } from '@/components/CampoTelefono'
import { CampoArchivoDirecto } from '@/components/CampoArchivoDirecto'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import {
  ENTRADA,
  BOTON_PRIMARIO,
  ENLACE,
  BANNER_ERROR,
  GRILLA_DETALLE,
  SECCION_FORM,
  SECCION_FORM_NUMERO,
  SECCION_FORM_TITULO,
  SECCION_FORM_BAJADA,
  GRILLA_CAMPOS,
  CAMPO_ANCHO,
  ETIQUETA_CAMPO,
  FICHA_LOTE_TAPA,
  FICHA_LOTE_BADGE,
  FICHA_LOTE_FILA,
  FICHA_LOTE_DESTACADO,
  PANEL_SIN_PADDING,
  PANEL,
} from '@/lib/ui/clases'
import { Obligatorio } from '@/components/Obligatorio'
import { FormaPagoEInstrumentacion } from '@/components/FormaPagoEInstrumentacion'

// Cuánto vive el link firmado que se le pasa a la vista previa de cada
// archivo ya guardado. Cinco minutos, igual que el resto de la app.
const SEGUNDOS_LINK_FIRMADO = 300

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
    prefijo?: string
    telefonoNumero?: string
    telefonoAlternativo?: string
    estadoCivil?: string
    instrumentacion?: string
    formaPago?: string
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
    prefijo: prefijoPreservado,
    telefonoNumero: telefonoNumeroPreservado,
    telefonoAlternativo: telefonoAlternativoPreservado,
    estadoCivil: estadoCivilPreservado,
    instrumentacion: instrumentacionPreservado,
    formaPago: formaPagoPreservado,
    montoSena: montoSenaPreservado,
    monedaSena: monedaSenaPreservado,
    recibidoPor: recibidoPorPreservado,
    recibidoPorOtro: recibidoPorOtroPreservado,
  } = await searchParams

  await requireAdministrador()

  const supabase = await createClient()

  // Los mismos campos que trae la pantalla de reservar: esta comparte su
  // diseño (09/09, reportado por Gabriel -- "Editar reserva" te mandaba a
  // la página vieja, con todo apilado en una columna de 28rem).
  const { data: lote } = await supabase
    .from('lotes')
    .select(
      'id, identificador, estado, ubicacion, moneda, precio_total, superficie_m2, manzana, numero_lote, loteos(nombre)'
    )
    .eq('id', id)
    .single()

  if (!lote) {
    notFound()
  }

  const { data: reserva } = await supabase
    .from('reservas')
    .select(
      'nombre_completo, dni, domicilio, email, telefono_prefijo, telefono_numero, telefono_alternativo, estado_civil, instrumentacion, forma_pago, monto_sena, moneda_sena, recibido_por, recibido_por_otro, comprobante_sena_path, dni_frente_path, dni_dorso_path, dni_conyuge_path, sentencia_divorcio_path'
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

  // Links firmados de lo que ya está guardado, para que la vista previa
  // muestre el archivo de verdad y no un "ya hay un archivo cargado" que
  // obliga a acordarse de memoria cuál era (09/09, pedido de Gabriel).
  async function urlFirmada(path: string | null | undefined) {
    if (!path) return null
    const { data } = await supabase.storage
      .from('comprobantes')
      .createSignedUrl(path, SEGUNDOS_LINK_FIRMADO)
    return data?.signedUrl ?? null
  }

  const [urlComprobante, urlDniFrente, urlDniDorso, urlDniConyuge, urlSentencia] =
    await Promise.all([
      urlFirmada(reserva?.comprobante_sena_path),
      urlFirmada(reserva?.dni_frente_path),
      urlFirmada(reserva?.dni_dorso_path),
      urlFirmada(reserva?.dni_conyuge_path),
      urlFirmada(reserva?.sentencia_divorcio_path),
    ])

  const actualizarReservaConId = actualizarReserva.bind(null, id)

  const prefijoForm = prefijoPreservado ?? reserva?.telefono_prefijo ?? null
  const numeroForm = telefonoNumeroPreservado ?? reserva?.telefono_numero ?? null

  const loteoNombre = Array.isArray(lote!.loteos)
    ? (lote!.loteos[0]?.nombre ?? null)
    : ((lote!.loteos as { nombre: string } | null)?.nombre ?? null)
  const ubicacionEnLaFicha = [
    lote!.manzana ? `Manzana ${lote!.manzana}` : null,
    lote!.numero_lote ? `Lote ${lote!.numero_lote}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <main>
      <div className="mb-5">
        <div className="flex flex-wrap gap-4">
          <EnlaceBoton href="/admin/lotes" className={`text-sm ${ENLACE}`}>
            ← Volver a Lotes
          </EnlaceBoton>
          <EnlaceBoton href={`/admin/lotes/${id}`} className={`text-sm ${ENLACE}`}>
            ← Volver al lote
          </EnlaceBoton>
        </div>
        <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight text-slate-900">
          Editar reserva — {lote!.identificador}
        </h1>
      </div>

      {lote!.estado !== 'reservado' || !reserva ? (
        <p className={`${PANEL} text-sm text-amber-800`}>
          Este lote no está reservado, no se puede editar la reserva (estado actual: {lote!.estado}
          ).
        </p>
      ) : (
        <form action={actualizarReservaConId}>
          <div className={GRILLA_DETALLE}>
            <div className="space-y-4 lg:col-span-7">
              {error && <p className={BANNER_ERROR}>{error}</p>}

              <section className={SECCION_FORM}>
                <div className="flex items-center gap-3">
                  <span className={SECCION_FORM_NUMERO}>1</span>
                  <div>
                    <h2 className={SECCION_FORM_TITULO}>Datos del comprador / titular</h2>
                    <p className={SECCION_FORM_BAJADA}>
                      Quien firma la reserva. Si al vender el comprador final es otra persona, se
                      puede cambiar en ese momento.
                    </p>
                  </div>
                </div>

                <div className={GRILLA_CAMPOS}>
                  <label className="text-sm">
                    <span className={ETIQUETA_CAMPO}>
                      Nombre completo / razón social
                      <Obligatorio />
                    </span>
                    <input
                      name="nombreCompleto"
                      placeholder="Como figura en el DNI"
                      defaultValue={nombreCompletoPreservado ?? reserva.nombre_completo}
                      required
                      className={`${ENTRADA} w-full`}
                    />
                  </label>

                  <label className="text-sm">
                    <span className={ETIQUETA_CAMPO}>
                      DNI
                      <Obligatorio />
                    </span>
                    <input
                      name="dni"
                      placeholder="Sin puntos"
                      defaultValue={dniPreservado ?? reserva.dni}
                      required
                      className={`${ENTRADA} w-full tabular-nums`}
                    />
                  </label>

                  <label className="text-sm">
                    <span className={ETIQUETA_CAMPO}>
                      Domicilio
                      <Obligatorio />
                    </span>
                    <input
                      name="domicilio"
                      placeholder="Calle, número, localidad"
                      defaultValue={domicilioPreservado ?? reserva.domicilio}
                      required
                      className={`${ENTRADA} w-full`}
                    />
                  </label>

                  <label className="text-sm">
                    <span className={ETIQUETA_CAMPO}>
                      Email
                      <Obligatorio />
                    </span>
                    <input
                      name="email"
                      type="email"
                      placeholder="nombre@correo.com"
                      defaultValue={emailPreservado ?? reserva.email}
                      required
                      className={`${ENTRADA} w-full`}
                    />
                  </label>

                  <label className="text-sm">
                    <span className={ETIQUETA_CAMPO}>
                      Teléfono
                      <Obligatorio />
                    </span>
                    <CampoTelefono
                      prefijoGuardado={prefijoForm}
                      numeroGuardado={numeroForm}
                      requerido
                    />
                    <AyudaTelefono />
                  </label>

                  <label className="text-sm">
                    <span className={ETIQUETA_CAMPO}>Teléfono alternativo / fijo</span>
                    <input
                      name="telefonoAlternativo"
                      placeholder="Opcional"
                      defaultValue={
                        telefonoAlternativoPreservado ?? reserva.telefono_alternativo ?? ''
                      }
                      className={`${ENTRADA} w-full`}
                    />
                    <span className="mt-1 block text-xs text-slate-500">
                      Un segundo número por si no atiende el primero.
                    </span>
                  </label>

                  <label className="text-sm">
                    <span className={ETIQUETA_CAMPO}>
                      Estado civil
                      <Obligatorio />
                    </span>
                    <select
                      name="estadoCivil"
                      required
                      defaultValue={estadoCivilPreservado ?? reserva.estado_civil}
                      className={`${ENTRADA} w-full`}
                    >
                      <option value="soltero">Soltero/a</option>
                      <option value="casado">Casado/a</option>
                      <option value="divorciado">Divorciado/a</option>
                      <option value="viudo">Viudo/a</option>
                    </select>
                  </label>
                </div>
              </section>

              <section className={SECCION_FORM}>
                <div className="flex items-center gap-3">
                  <span className={SECCION_FORM_NUMERO}>2</span>
                  <div>
                    <h2 className={SECCION_FORM_TITULO}>Condiciones y pago de la seña</h2>
                    <p className={SECCION_FORM_BAJADA}>
                      Cuánto se cobró de seña, quién la recibió y cómo se va a instrumentar la
                      operación.
                    </p>
                  </div>
                </div>

                <div className={GRILLA_CAMPOS}>
                  <label className="text-sm">
                    <span className={ETIQUETA_CAMPO}>
                      Monto de la seña
                      <Obligatorio />
                    </span>
                    <input
                      name="montoSena"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      defaultValue={montoSenaPreservado ?? reserva.monto_sena}
                      required
                      className={`${ENTRADA} w-full tabular-nums`}
                    />
                  </label>

                  <label className="text-sm">
                    <span className={ETIQUETA_CAMPO}>
                      Moneda de la seña
                      <Obligatorio />
                    </span>
                    <select
                      name="monedaSena"
                      required
                      defaultValue={monedaSenaPreservado ?? reserva.moneda_sena}
                      className={`${ENTRADA} w-full`}
                    >
                      <option value="USD">USD</option>
                      <option value="ARS">ARS</option>
                    </select>
                  </label>

                  {/* Este es el camino de flexibilidad del 04/09: si el cliente
                      cambia de idea (reservó al contado y después pide cuotas, o al
                      revés), se corrige acá y después se genera el boleto desde
                      Boletos de compraventa. Por eso la forma de pago también tiene
                      que poder editarse, no solo la instrumentación. */}
                  <div className={CAMPO_ANCHO}>
                    <FormaPagoEInstrumentacion
                      formaPagoInicial={formaPagoPreservado ?? reserva.forma_pago ?? ''}
                      instrumentacionInicial={
                        instrumentacionPreservado ?? reserva.instrumentacion ?? ''
                      }
                    />
                  </div>

                  <label className="text-sm">
                    <span className={ETIQUETA_CAMPO}>Quién recibió la seña</span>
                    <select
                      name="recibidoPor"
                      defaultValue={recibidoPorPreservado ?? reserva.recibido_por ?? ''}
                      className={`${ENTRADA} w-full`}
                    >
                      <option value="">— no está en la lista, especificar al lado —</option>
                      {staff?.map((persona) => (
                        <option key={persona.id} value={persona.id}>
                          {persona.full_name} ({persona.role})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm">
                    <span className={ETIQUETA_CAMPO}>Si no está en la lista</span>
                    <input
                      name="recibidoPorOtro"
                      placeholder="Nombre de quien la recibió"
                      defaultValue={recibidoPorOtroPreservado ?? reserva.recibido_por_otro ?? ''}
                      className={`${ENTRADA} w-full`}
                    />
                  </label>

                  <div className={CAMPO_ANCHO}>
                    <CampoArchivoDirecto
                      name="comprobante"
                      bucket="comprobantes"
                      carpeta={`reservas/${id}`}
                      tipoArchivo="comprobante"
                      label="Comprobante de la seña"
                      ayuda="Solo si lo querés reemplazar"
                      nombreError="El comprobante de la seña"
                      valorInicial={reserva.comprobante_sena_path}
                      urlInicial={urlComprobante}
                    />
                  </div>
                </div>
              </section>
            </div>

            <div className="space-y-4 lg:col-span-5">
              <div className={PANEL_SIN_PADDING}>
                <div className={FICHA_LOTE_TAPA}>
                  <div className="relative z-10 flex items-center justify-between">
                    <span className={FICHA_LOTE_BADGE}>
                      {ubicacionEnLaFicha || lote!.identificador}
                    </span>
                  </div>
                  <div className="relative z-10">
                    <h3 className="font-heading text-lg font-bold text-white">
                      {loteoNombre ?? lote!.identificador}
                    </h3>
                    {lote!.ubicacion && <p className="text-xs text-slate-300">{lote!.ubicacion}</p>}
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  <p className="border-b border-slate-100 pb-1 text-xs font-bold tracking-wider text-slate-400 uppercase">
                    Especificaciones técnicas
                  </p>
                  <div className="space-y-2.5">
                    <div className={FICHA_LOTE_FILA}>
                      <span className="text-slate-500">Estado</span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 font-bold text-amber-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        {lote!.estado}
                      </span>
                    </div>
                    <div className={FICHA_LOTE_FILA}>
                      <span className="text-slate-500">Identificador</span>
                      <span className="font-semibold text-slate-800">{lote!.identificador}</span>
                    </div>
                    <div className={FICHA_LOTE_FILA}>
                      <span className="text-slate-500">Superficie total</span>
                      <span className="font-bold text-slate-800 tabular-nums">
                        {lote!.superficie_m2 ? `${lote!.superficie_m2} m²` : '—'}
                      </span>
                    </div>
                    <div className={FICHA_LOTE_FILA}>
                      <span className="text-slate-500">Moneda base</span>
                      <span className="font-medium text-slate-800">{lote!.moneda}</span>
                    </div>
                    <div className={FICHA_LOTE_DESTACADO}>
                      <span className="text-xs font-bold text-slate-700">Precio de lista</span>
                      <span className="font-heading text-base font-extrabold text-blue-700 tabular-nums">
                        {lote!.precio_total
                          ? `${lote!.precio_total.toLocaleString('es-AR')} ${lote!.moneda}`
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <section className={SECCION_FORM}>
                <div className="flex items-center gap-3">
                  <span className={SECCION_FORM_NUMERO}>3</span>
                  <div>
                    <h2 className={SECCION_FORM_TITULO}>Documentación adjunta</h2>
                    <p className={SECCION_FORM_BAJADA}>
                      Cada archivo se reemplaza solo si elegís uno nuevo. Si dejás el campo vacío,
                      queda el que ya estaba subido.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <CampoArchivoDirecto
                    name="dniFrente"
                    bucket="comprobantes"
                    carpeta={`reservas/${id}`}
                    tipoArchivo="dni-frente"
                    label="DNI - frente"
                    nombreError="La foto del DNI (frente)"
                    valorInicial={reserva.dni_frente_path}
                    urlInicial={urlDniFrente}
                  />
                  <CampoArchivoDirecto
                    name="dniDorso"
                    bucket="comprobantes"
                    carpeta={`reservas/${id}`}
                    tipoArchivo="dni-dorso"
                    label="DNI - dorso"
                    nombreError="La foto del DNI (dorso)"
                    valorInicial={reserva.dni_dorso_path}
                    urlInicial={urlDniDorso}
                  />
                  <CampoArchivoDirecto
                    name="dniConyuge"
                    bucket="comprobantes"
                    carpeta={`reservas/${id}`}
                    tipoArchivo="dni-conyuge"
                    label="DNI del cónyuge"
                    ayuda='Obligatorio si el estado civil queda en "Casado/a" y todavía no había uno guardado'
                    nombreError="La foto del DNI del cónyuge"
                    valorInicial={reserva.dni_conyuge_path}
                    urlInicial={urlDniConyuge}
                  />
                  <CampoArchivoDirecto
                    name="sentenciaDivorcio"
                    bucket="comprobantes"
                    carpeta={`reservas/${id}`}
                    tipoArchivo="sentencia-divorcio"
                    label="Sentencia de divorcio"
                    ayuda='Obligatoria si el estado civil queda en "Divorciado/a" y todavía no había una guardada'
                    nombreError="La sentencia de divorcio"
                    valorInicial={reserva.sentencia_divorcio_path}
                    urlInicial={urlSentencia}
                  />
                </div>
              </section>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.03)] lg:col-span-12">
              <p className="text-xs text-slate-500">
                El lote sigue en estado <strong>reservado</strong>: esto corrige los datos de la
                reserva, no la cancela.
              </p>
              <div className="flex items-center gap-2">
                <EnlaceBoton href={`/admin/lotes/${id}`} className={`text-sm ${ENLACE}`}>
                  Cancelar
                </EnlaceBoton>
                <BotonEnvio className={`cursor-pointer ${BOTON_PRIMARIO}`}>
                  Guardar cambios
                </BotonEnvio>
              </div>
            </div>
          </div>
        </form>
      )}
    </main>
  )
}
