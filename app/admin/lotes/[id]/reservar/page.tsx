import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { requireAccesoParaReservar } from '@/lib/auth/require-admin'
import { reservarLote } from './actions'
import { CamposIdentidadReserva } from './CamposIdentidadReserva'
import { CampoArchivoDirecto } from '@/components/CampoArchivoDirecto'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import { ENTRADA, BOTON_PRIMARIO, ENLACE, TITULO_H1, BANNER_ERROR } from '@/lib/ui/clases'
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

  const { data: lote } = await supabase
    .from('lotes')
    .select('id, identificador, estado, loteo_id')
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

  const reservarLoteConId = reservarLote.bind(null, id)

  // Si venimos de un error de validación, se respeta exactamente lo que el
  // admin ya había tipeado (aunque esté vacío). Si es la primera carga,
  // se prioriza lo encontrado por DNI.
  return (
    <main className="max-w-md">
      <EnlaceBoton href="/admin/lotes" className={`mb-4 inline-block ${ENLACE}`}>
        ← Volver a Lotes
      </EnlaceBoton>
      <h1 className={`mb-6 ${TITULO_H1}`}>Reservar {lote!.identificador}</h1>

      {lote!.estado !== 'disponible' ? (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Este lote ya no está disponible para reservar (estado actual: {lote!.estado}).
        </p>
      ) : (
        <>
        <form action={reservarLoteConId} className="flex flex-col gap-3">
          {error && <p className={BANNER_ERROR}>{error}</p>}

          <CamposIdentidadReserva
            nombreCompletoInicial={nombreCompletoPreservado ?? ''}
            dniInicial={dniPreservado ?? ''}
            domicilioInicial={domicilioPreservado ?? ''}
            emailInicial={emailPreservado ?? ''}
            prefijoInicial={prefijoPreservado ?? null}
            numeroInicial={telefonoNumeroPreservado ?? null}
          />
          <input
            name="telefonoAlternativo"
            placeholder="Teléfono alternativo (opcional)"
            defaultValue={telefonoAlternativoPreservado ?? ''}
            className={ENTRADA}
          />

          <label className="text-sm text-slate-600">
            Estado civil
            <Obligatorio />
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

          <FormaPagoEInstrumentacion
            formaPagoInicial={formaPagoPreservado ?? ''}
            instrumentacionInicial={instrumentacionPreservado ?? ''}
          />

          {!lote!.loteo_id && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Ojo: este lote no tiene un loteo asignado, y la plantilla del contrato sale del loteo.
              La reserva se va a guardar igual, pero <strong>el boleto no se va a generar solo</strong>{' '}
              — no lo busques en Boletos de compraventa. Asignale un loteo al lote y generalo desde
              ahí.
            </p>
          )}

          <input
            name="montoSena"
            type="number"
            step="0.01"
            min="0"
            placeholder="Monto de la seña *"
            defaultValue={montoSenaPreservado ?? ''}
            required
            className={ENTRADA}
          />
          <label className="text-sm text-slate-600">
            Moneda de la seña
            <Obligatorio />
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

          <label className="text-sm text-slate-600">
            Quién recibió la seña
            <select
              name="recibidoPor"
              defaultValue={recibidoPorPreservado ?? user!.id}
              className={`${ENTRADA} w-full`}
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
            defaultValue={recibidoPorOtroPreservado ?? ''}
            className={ENTRADA}
          />

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

          <BotonEnvio className={`cursor-pointer ${BOTON_PRIMARIO}`}>Confirmar reserva</BotonEnvio>
        </form>
        </>
      )}
    </main>
  )
}
