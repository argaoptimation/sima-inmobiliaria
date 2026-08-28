import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { requireAccesoParaReservar } from '@/lib/auth/require-admin'
import { reservarLote } from './actions'
import { CampoTelefono, AyudaTelefono } from '@/components/CampoTelefono'
import { CampoArchivoDirecto } from '@/components/CampoArchivoDirecto'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import {
  ENTRADA,
  BOTON_PRIMARIO,
  BOTON_SECUNDARIO,
  ENLACE,
  TITULO_H1,
  BANNER_ERROR,
  BANNER_OK,
} from '@/lib/ui/clases'

export default async function ReservarLotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    error?: string
    dni?: string
    nombreCompleto?: string
    dniPreservado?: string
    domicilio?: string
    email?: string
    prefijo?: string
    telefonoNumero?: string
    telefonoAlternativo?: string
    estadoCivil?: string
    instrumentacion?: string
    montoSena?: string
    monedaSena?: string
    recibidoPor?: string
    recibidoPorOtro?: string
  }>
}) {
  const { id } = await params
  const {
    error,
    dni: dniBuscado,
    nombreCompleto: nombreCompletoPreservado,
    dniPreservado,
    domicilio: domicilioPreservado,
    email: emailPreservado,
    prefijo: prefijoPreservado,
    telefonoNumero: telefonoNumeroPreservado,
    telefonoAlternativo: telefonoAlternativoPreservado,
    estadoCivil: estadoCivilPreservado,
    instrumentacion: instrumentacionPreservado,
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
    .select('id, identificador, estado')
    .eq('id', id)
    .single()

  if (!lote) {
    notFound()
  }

  let clienteEncontrado: {
    full_name: string
    dni: string | null
    domicilio: string | null
    telefono_prefijo: string | null
    telefono_numero: string | null
    email: string | null
  } | null = null

  if (dniBuscado) {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, dni, domicilio, telefono_prefijo, telefono_numero, email')
      .eq('role', 'cliente')
      .eq('dni', dniBuscado)
      .maybeSingle()
    clienteEncontrado = data
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
  const prefijoForm = prefijoPreservado ?? clienteEncontrado?.telefono_prefijo ?? null
  const numeroForm = telefonoNumeroPreservado ?? clienteEncontrado?.telefono_numero ?? null

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
        <form method="GET" className="mb-4 flex gap-2">
          <input
            name="dni"
            placeholder="Buscar cliente por DNI"
            defaultValue={dniBuscado ?? ''}
            className={`flex-1 ${ENTRADA}`}
          />
          <button type="submit" className={`cursor-pointer ${BOTON_SECUNDARIO}`}>
            Buscar
          </button>
        </form>

        {dniBuscado &&
          (clienteEncontrado ? (
            <p className={BANNER_OK}>
              Encontramos a {clienteEncontrado.full_name} con este DNI. Sus datos se precargaron abajo
              — revisalos antes de confirmar.
            </p>
          ) : (
            <p className="mb-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
              No encontramos ningún cliente con ese DNI — completá los datos manualmente.
            </p>
          ))}

        <form action={reservarLoteConId} className="flex flex-col gap-3">
          {error && <p className={BANNER_ERROR}>{error}</p>}

          <input
            name="nombreCompleto"
            placeholder="Nombre completo"
            defaultValue={nombreCompletoPreservado ?? clienteEncontrado?.full_name ?? ''}
            required
            className={ENTRADA}
          />
          <input
            name="dni"
            placeholder="DNI"
            defaultValue={dniPreservado ?? clienteEncontrado?.dni ?? dniBuscado ?? ''}
            required
            className={ENTRADA}
          />
          <input
            name="domicilio"
            placeholder="Domicilio"
            defaultValue={domicilioPreservado ?? clienteEncontrado?.domicilio ?? ''}
            required
            className={ENTRADA}
          />
          <input
            name="email"
            type="email"
            placeholder="Email"
            defaultValue={emailPreservado ?? clienteEncontrado?.email ?? ''}
            required
            className={ENTRADA}
          />
          <label className="text-sm text-slate-600">
            Teléfono
            <CampoTelefono prefijoGuardado={prefijoForm} numeroGuardado={numeroForm} requerido />
            <AyudaTelefono />
          </label>
          <input
            name="telefonoAlternativo"
            placeholder="Teléfono alternativo (opcional)"
            defaultValue={telefonoAlternativoPreservado ?? ''}
            className={ENTRADA}
          />

          <label className="text-sm text-slate-600">
            Estado civil
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

          <label className="text-sm text-slate-600">
            Instrumentación prevista (opcional)
            <select
              name="instrumentacion"
              defaultValue={instrumentacionPreservado ?? ''}
              className={`${ENTRADA} w-full`}
            >
              <option value="">— sin definir —</option>
              <option value="boleto">Boleto de compraventa</option>
              <option value="escritura">Escritura</option>
            </select>
          </label>

          <input
            name="montoSena"
            type="number"
            step="0.01"
            min="0"
            placeholder="Monto de la seña"
            defaultValue={montoSenaPreservado ?? ''}
            required
            className={ENTRADA}
          />
          <label className="text-sm text-slate-600">
            Moneda de la seña
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
            label="Comprobante de la seña"
            nombreError="El comprobante de la seña"
            required
          />
          <CampoArchivoDirecto
            name="dniFrente"
            bucket="comprobantes"
            carpeta={`reservas/${id}`}
            tipoArchivo="dni-frente"
            label="DNI - frente"
            nombreError="La foto del DNI (frente)"
          />
          <CampoArchivoDirecto
            name="dniDorso"
            bucket="comprobantes"
            carpeta={`reservas/${id}`}
            tipoArchivo="dni-dorso"
            label="DNI - dorso"
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
