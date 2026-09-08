import { createClient } from '@/lib/supabase/server'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { cargarLoteEnCurso } from './actions'
import { CuotasQueQuedan } from './CuotasQueQuedan'
import { EnlaceBoton } from '@/components/EnlaceBoton'
import { BotonEnvio } from '@/components/BotonEnvio'
import { BuscadorPersona } from '@/components/BuscadorPersona'
import { CampoTelefono, AyudaTelefono } from '@/components/CampoTelefono'
import { Obligatorio } from '@/components/Obligatorio'
import { OPCION_ACREEDOR_NUEVO } from '@/lib/lotes/validar-seleccion-acreedor'
import {
  ENTRADA,
  BOTON_PRIMARIO,
  ENLACE,
  TITULO_H1,
  TITULO_H2,
  BANNER_ERROR,
} from '@/lib/ui/clases'

// Alta de un lote que ya estaba vendido antes de usar la plataforma.
//
// Es una pantalla aparte y no un modo del alta normal porque cambia el
// significado de casi todo: no hay reserva, no hay seña, no hay documento
// que subir, y las cuotas viejas no se cobraron acá. Mezclarlo con "Nuevo
// lote" habría dejado un formulario lleno de campos que solo aplican a la
// mitad de los casos.
export default async function CargarLoteEnCursoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireAdministrador()

  const params = await searchParams
  const previo = (campo: string) => params[campo] ?? ''

  // Los montos vuelven como cuotaMonto1..N cuando el formulario rebota.
  const montosPrevios = Array.from(
    { length: Math.min(Number(previo('cuotasPendientes')) || 0, 600) },
    (_, indice) => previo(`cuotaMonto${indice + 1}`)
  )

  const supabase = await createClient()

  const { data: acreedores } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'acreedor')
    .order('full_name')

  const { data: loteos } = await supabase.from('loteos').select('id, nombre').order('nombre')

  // Mismos índices que ofrece el detalle del lote: los que ya se cargaron
  // al menos una vez en /admin/indices.
  const { data: valoresIndice } = await supabase.from('indices_valores').select('indice_nombre')
  const nombresIndicesDisponibles = [
    ...new Set((valoresIndice ?? []).map((fila) => fila.indice_nombre as string)),
  ].sort()

  return (
    <main className="max-w-3xl">
      <EnlaceBoton href="/admin/lotes" className={`mb-4 inline-block ${ENLACE}`}>
        ← Volver a Lotes
      </EnlaceBoton>
      <h1 className={`mb-2 ${TITULO_H1}`}>Cargar lote ya vendido</h1>
      <p className="mb-6 max-w-2xl text-sm text-slate-600">
        Para un lote que ya se vendió antes de usar el sistema y todavía se está pagando. Carga el
        lote, el comprador y el plan de cuotas de una sola vez.
      </p>

      {params.error && <p className={BANNER_ERROR}>{params.error}</p>}

      <form action={cargarLoteEnCurso} className="flex flex-col gap-6">
        {/* Si el email ya existía, el action devuelve el id para que el
            segundo submit valga como confirmación explícita. */}
        {previo('confirmarClienteExistente') && (
          <input
            type="hidden"
            name="confirmarClienteExistente"
            value={previo('confirmarClienteExistente')}
          />
        )}

        <section className="flex flex-col gap-3">
          <h2 className={TITULO_H2}>El lote</h2>
          <label className="text-sm text-slate-600">
            Identificador
            <Obligatorio />
            <input
              name="identificador"
              defaultValue={previo('identificador')}
              placeholder="Ej: Loteo San Martín - Manzana 3 - Lote 12"
              required
              className={`w-full ${ENTRADA}`}
            />
          </label>
          <label className="text-sm text-slate-600">
            Ubicación
            <Obligatorio />
            <input
              name="ubicacion"
              defaultValue={previo('ubicacion')}
              required
              className={`w-full ${ENTRADA}`}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-600">
              Precio total del lote
              <Obligatorio />
              <input
                name="precioTotal"
                type="number"
                step="0.01"
                min="0"
                defaultValue={previo('precioTotal')}
                required
                className={`w-full ${ENTRADA}`}
              />
            </label>
            <label className="text-sm text-slate-600">
              Moneda
              <Obligatorio />
              <select
                name="moneda"
                defaultValue={previo('moneda') || 'USD'}
                required
                className={`w-full ${ENTRADA}`}
              >
                <option value="USD">USD</option>
                <option value="ARS">ARS</option>
              </select>
            </label>
          </div>
          <label className="text-sm text-slate-600">
            Acreedor
            <Obligatorio />
            <BuscadorPersona
              personas={acreedores ?? []}
              name="acreedorNombre"
              listId="lista-acreedores-en-curso"
              placeholder="Escribí parte del nombre y elegí de la lista..."
              opcionesExtra={[{ etiqueta: OPCION_ACREEDOR_NUEVO }]}
              defaultValue={previo('acreedorNombre')}
              requerido
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              name="acreedorNombreNuevo"
              defaultValue={previo('acreedorNombreNuevo')}
              placeholder="Si elegiste 'Crear nuevo acreedor': nombre completo"
              className={ENTRADA}
            />
            <input
              name="acreedorEmailNuevo"
              type="email"
              defaultValue={previo('acreedorEmailNuevo')}
              placeholder="Si elegiste 'Crear nuevo acreedor': email"
              className={ENTRADA}
            />
          </div>
          <label className="text-sm text-slate-600">
            Loteo (opcional)
            <select
              name="loteoId"
              defaultValue={previo('loteoId')}
              className={`w-full ${ENTRADA}`}
            >
              <option value="">— sin loteo —</option>
              {(loteos ?? []).map((loteo) => (
                <option key={loteo.id} value={loteo.id}>
                  {loteo.nombre}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className={TITULO_H2}>El comprador</h2>
          <p className="text-sm text-slate-600">
            No se le manda ninguna invitación por email. Al terminar de cargar el lote se muestra
            una vez la contraseña con la que puede entrar al portal, para que se la pases vos. Si
            se pierde, se genera otra desde su ficha en Clientes.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-600">
              Nombre y apellido
              <Obligatorio />
              <input
                name="clienteNombre"
                defaultValue={previo('clienteNombre')}
                required
                className={`w-full ${ENTRADA}`}
              />
            </label>
            <label className="text-sm text-slate-600">
              Email
              <Obligatorio />
              <input
                name="clienteEmail"
                type="email"
                defaultValue={previo('clienteEmail')}
                required
                className={`w-full ${ENTRADA}`}
              />
            </label>
            <label className="text-sm text-slate-600">
              DNI
              <input name="clienteDni" defaultValue={previo('clienteDni')} className={`w-full ${ENTRADA}`} />
            </label>
            <label className="text-sm text-slate-600">
              Domicilio
              <input
                name="clienteDomicilio"
                defaultValue={previo('clienteDomicilio')}
                className={`w-full ${ENTRADA}`}
              />
            </label>
          </div>
          <label className="text-sm text-slate-600">
            Teléfono
            <CampoTelefono
              prefijoGuardado={previo('prefijo') || null}
              numeroGuardado={previo('telefonoNumero') || null}
            />
            <AyudaTelefono />
          </label>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className={TITULO_H2}>Cómo viene el pago</h2>
          <p className="rounded-lg border-l-4 border-blue-600 bg-blue-50 p-3 text-sm text-slate-700">
            Las cuotas ya pagadas se cargan saldadas, pero <strong>no</strong> como cobranzas del
            sistema: no generan pago, ni reparto, ni movimiento en cuentas corrientes. Esa plata se
            cobró antes, fuera de la plataforma, y contarla acá diría que le debés al acreedor algo
            que ya le pagaste. El monto que cargues abajo vale para las cuotas que quedan; en las
            viejas queda como referencia.
          </p>
          <CuotasQueQuedan
            cuotasYaPagadasInicial={previo('cuotasYaPagadas') || '0'}
            cantidadInicial={previo('cuotasPendientes')}
            fechaInicial={previo('fechaProximaCuota')}
            montosIniciales={montosPrevios}
            modoInicial={previo('modoMontos') === 'distintas' ? 'distintas' : 'iguales'}
          />
          <label className="text-sm text-slate-600 sm:max-w-xs">
            Interés moratorio diario (%) — opcional
            <input
              name="interesMoratorioDiario"
              type="number"
              step="0.001"
              min="0"
              defaultValue={previo('interesMoratorioDiario')}
              className={`w-full ${ENTRADA}`}
            />
          </label>
          <label className="text-sm text-slate-600">
            Índice de ajuste (opcional — solo se aplica si el lote está en pesos)
            <select name="indiceTipo" defaultValue={previo('indiceTipo')} className={`w-full ${ENTRADA}`}>
              <option value="">— sin índice —</option>
              {nombresIndicesDisponibles.map((nombre) => (
                <option key={nombre} value={nombre}>
                  {nombre}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              Si el lote se ajusta por índice, elegilo acá: las cuotas que quedan se van a ajustar
              solas de acá en adelante. En un lote en dólares se ignora.
            </span>
          </label>
        </section>

        <details className="rounded-lg border border-blue-100 text-sm">
          <summary className="cursor-pointer select-none p-3 font-medium text-slate-700">
            Datos legales del lote (solo hacen falta para generar el contrato)
          </summary>
          <div className="grid gap-3 border-t border-blue-100 p-3 sm:grid-cols-2">
            <label className="text-sm text-slate-600">
              Número de lote
              <input name="numeroLote" defaultValue={previo('numeroLote')} className={`w-full ${ENTRADA}`} />
            </label>
            <label className="text-sm text-slate-600">
              Manzana
              <input name="manzana" defaultValue={previo('manzana')} className={`w-full ${ENTRADA}`} />
            </label>
            <label className="text-sm text-slate-600">
              Superficie (m2)
              <input
                name="superficieM2"
                type="number"
                step="0.01"
                min="0"
                defaultValue={previo('superficieM2')}
                className={`w-full ${ENTRADA}`}
              />
            </label>
            <label className="text-sm text-slate-600">
              Cuenta en rentas
              <input name="cuentaRentas" defaultValue={previo('cuentaRentas')} className={`w-full ${ENTRADA}`} />
            </label>
            <label className="text-sm text-slate-600">
              Nomenclatura catastral
              <input
                name="nomenclaturaCatastral"
                defaultValue={previo('nomenclaturaCatastral')}
                className={`w-full ${ENTRADA}`}
              />
            </label>
            <label className="text-sm text-slate-600">
              Matrícula
              <input name="matricula" defaultValue={previo('matricula')} className={`w-full ${ENTRADA}`} />
            </label>
          </div>
        </details>

        <BotonEnvio className={`cursor-pointer self-start ${BOTON_PRIMARIO}`}>
          Cargar lote vendido
        </BotonEnvio>
      </form>
    </main>
  )
}
