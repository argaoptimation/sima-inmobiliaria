import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { requireAccesoParaReservar } from '@/lib/auth/require-admin'
import { reservarLote } from './actions'
import { CamposIdentidadReserva } from './CamposIdentidadReserva'
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

export default async function ReservarLotePage({
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

  await requireAccesoParaReservar(id)

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Los datos del lote que van en la ficha de la derecha (09/09, mockup 3).
  // Antes esta pantalla no mostraba NADA del lote que se estaba reservando
  // mas que su identificador en el titulo: ni la superficie, ni el precio,
  // ni de que loteo era.
  const { data: lote } = await supabase
    .from('lotes')
    .select(
      'id, identificador, estado, loteo_id, ubicacion, moneda, precio_total, superficie_m2, manzana, numero_lote, loteos(nombre)'
    )
    .eq('id', id)
    .single()

  if (!lote) {
    notFound()
  }

  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['administrador', 'acreedor', 'vendedor', 'cobrador'])
    .order('full_name')

  const loteoNombre = Array.isArray(lote!.loteos)
    ? (lote!.loteos[0]?.nombre ?? null)
    : ((lote!.loteos as { nombre: string } | null)?.nombre ?? null)
  const ubicacionEnLaFicha = [lote!.manzana ? `Manzana ${lote!.manzana}` : null, lote!.numero_lote ? `Lote ${lote!.numero_lote}` : null]
    .filter(Boolean)
    .join(' · ')

  const reservarLoteConId = reservarLote.bind(null, id)

  // Si venimos de un error de validación, se respeta exactamente lo que el
  // admin ya había tipeado (aunque esté vacío). Si es la primera carga,
  // se prioriza lo encontrado por DNI.
  return (
    <main>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <EnlaceBoton href="/admin/lotes" className={`text-sm ${ENLACE}`}>
            ← Volver a Lotes
          </EnlaceBoton>
          <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight text-slate-900">
            Reservar {lote!.identificador}
          </h1>
        </div>
      </div>

      {lote!.estado !== 'disponible' ? (
        <p className={`${PANEL} text-sm text-amber-800`}>
          Este lote ya no está disponible para reservar (estado actual: {lote!.estado}).
        </p>
      ) : (
        <form action={reservarLoteConId}>
          <div className={GRILLA_DETALLE}>
            {/* El formulario a la izquierda, partido en tres bloques
                numerados (mockup 3). Son los mismos campos de siempre: lo
                que cambia es que antes venían todos apilados en una columna
                de 28rem, sin ninguna señal de dónde terminaba una cosa y
                empezaba otra. */}
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
                  <CamposIdentidadReserva
                    nombreCompletoInicial={nombreCompletoPreservado ?? ''}
                    dniInicial={dniPreservado ?? ''}
                    domicilioInicial={domicilioPreservado ?? ''}
                    emailInicial={emailPreservado ?? ''}
                    prefijoInicial={prefijoPreservado ?? null}
                    numeroInicial={telefonoNumeroPreservado ?? null}
                  />

                  <label className="text-sm">
                    <span className={ETIQUETA_CAMPO}>Teléfono alternativo / fijo</span>
                    <input
                      name="telefonoAlternativo"
                      placeholder="Opcional"
                      defaultValue={telefonoAlternativoPreservado ?? ''}
                      className={`${ENTRADA} w-full`}
                    />
                  </label>

                  <label className="text-sm">
                    <span className={ETIQUETA_CAMPO}>
                      Estado civil
                      <Obligatorio />
                    </span>
                    <select
                      name="estadoCivil"
                      required
                      defaultValue={estadoCivilPreservado}
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
                      placeholder="Monto de la seña *"
                      defaultValue={montoSenaPreservado ?? ''}
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
                      defaultValue={monedaSenaPreservado ?? 'USD'}
                      className={`${ENTRADA} w-full`}
                    >
                      <option value="USD">USD</option>
                      <option value="ARS">ARS</option>
                    </select>
                  </label>

                  <div className={CAMPO_ANCHO}>
                    <FormaPagoEInstrumentacion
                      formaPagoInicial={formaPagoPreservado ?? ''}
                      instrumentacionInicial={instrumentacionPreservado ?? ''}
                    />
                  </div>

                  <label className="text-sm">
                    <span className={ETIQUETA_CAMPO}>Quién recibió la seña</span>
                    <select
                      name="recibidoPor"
                      defaultValue={recibidoPorPreservado ?? user!.id}
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
                      defaultValue={recibidoPorOtroPreservado ?? ''}
                      className={`${ENTRADA} w-full`}
                    />
                  </label>

                  <div className={CAMPO_ANCHO}>
                    <CampoArchivoDirecto
                      name="comprobante"
                      bucket="comprobantes"
                      carpeta={`reservas/${id}`}
                      tipoArchivo="comprobante"
                      label={
                        <>
                          Comprobante de la seña
                          <Obligatorio />
                        </>
                      }
                      nombreError="El comprobante de la seña"
                      required
                    />
                  </div>
                </div>
              </section>

              <section className={SECCION_FORM}>
                <div className="flex items-center gap-3">
                  <span className={SECCION_FORM_NUMERO}>3</span>
                  <div>
                    <h2 className={SECCION_FORM_TITULO}>Documentación adjunta</h2>
                    <p className={SECCION_FORM_BAJADA}>
                      El DNI del titular es obligatorio. Lo demás depende del estado civil que
                      hayas elegido arriba.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <CampoArchivoDirecto
                    name="dniFrente"
                    bucket="comprobantes"
                    carpeta={`reservas/${id}`}
                    tipoArchivo="dni-frente"
                    label={
                      <>
                        DNI - frente
                        <Obligatorio />
                      </>
                    }
                    nombreError="La foto del DNI (frente)"
                  />
                  <CampoArchivoDirecto
                    name="dniDorso"
                    bucket="comprobantes"
                    carpeta={`reservas/${id}`}
                    tipoArchivo="dni-dorso"
                    label={
                      <>
                        DNI - dorso
                        <Obligatorio />
                      </>
                    }
                    nombreError="La foto del DNI (dorso)"
                  />
                  <CampoArchivoDirecto
                    name="dniConyuge"
                    bucket="comprobantes"
                    carpeta={`reservas/${id}`}
                    tipoArchivo="dni-conyuge"
                    label={'DNI del cónyuge (solo si elegiste "Casado/a" arriba)'}
                    nombreError="La foto del DNI del cónyuge"
                  />
                  <CampoArchivoDirecto
                    name="sentenciaDivorcio"
                    bucket="comprobantes"
                    carpeta={`reservas/${id}`}
                    tipoArchivo="sentencia-divorcio"
                    label={'Sentencia de divorcio (solo si elegiste "Divorciado/a" arriba)'}
                    nombreError="La sentencia de divorcio"
                  />
                </div>
              </section>

              {!lote!.loteo_id && (
                <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Ojo: este lote no tiene un loteo asignado, y la plantilla del contrato sale del
                  loteo. La reserva se va a guardar igual, pero{' '}
                  <strong>el boleto no se va a generar solo</strong> — no lo busques en Boletos de
                  compraventa. Asignale un loteo al lote y generalo desde ahí.
                </p>
              )}

              {/* El pie con la accion, separado de las secciones: es el
                  final del recorrido, no un campo mas. */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.03)]">
                <p className="text-xs text-slate-500">
                  Al confirmar, el lote pasa a estado <strong>reservado</strong>.
                </p>
                <div className="flex items-center gap-2">
                  <EnlaceBoton href="/admin/lotes" className={`text-sm ${ENLACE}`}>
                    Cancelar
                  </EnlaceBoton>
                  <BotonEnvio className={`cursor-pointer ${BOTON_PRIMARIO}`}>
                    Confirmar reserva
                  </BotonEnvio>
                </div>
              </div>
            </div>

            {/* La ficha del lote, a la derecha: que se vea QUE se esta
                reservando mientras se cargan los datos de QUIEN reserva.
                Antes esta pantalla no mostraba nada del lote mas que su
                nombre en el titulo. */}
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
                    {lote!.ubicacion && (
                      <p className="text-xs text-slate-300">{lote!.ubicacion}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  <p className="border-b border-slate-100 pb-1 text-xs font-bold tracking-wider text-slate-400 uppercase">
                    Especificaciones técnicas
                  </p>
                  <div className="space-y-2.5">
                    <div className={FICHA_LOTE_FILA}>
                      <span className="text-slate-500">Estado</span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
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
            </div>
          </div>
        </form>
      )}
    </main>
  )
}
