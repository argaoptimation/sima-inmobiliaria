'use client'

import { useId, useState } from 'react'
import { BarChart3, Check, Trash2 } from 'lucide-react'
import { BotonEnvio } from '@/components/BotonEnvio'
import {
  PANEL,
  PANEL_SIN_PADDING,
  PASO_NUMERO,
  PASO_TITULO,
  CAMPO_COMPACTO,
  CAMPO_COMPACTO_SIN_ANCHO,
  ETIQUETA_COMPACTA,
  BOTON_CHICO_PRIMARIO,
  BOTON_CHICO_NEUTRO,
  BOTON_AGREGAR_TEXTO,
  TABLA_CLARA_HEADER,
  PILL_SUMA,
  NUMERO_CUOTA_SUMA,
  FILA_CUOTA_SUMA,
  TARJETA_IMPACTO,
  PILL_IMPACTO,
} from '@/lib/ui/clases'
import { formatearFechaCorta } from '@/lib/fecha/formatear-fecha-corta'
import {
  controlDeSuma,
  porcentajeDeLaCuota,
  paginasDeCuotas,
  CUOTAS_POR_PAGINA,
  type ControlDeSuma,
} from '@/lib/lotes/control-de-suma'

interface Fila {
  id: string
  participanteKey: string
  monto: string
}

interface Participante {
  key: string
  nombre: string
}

interface Props {
  moneda: string
  cuotas: { numero: number; montoBase: number; fechaVencimiento: string }[]
  participantesElegibles: Participante[]
  objetivosIniciales: { participanteKey: string; monto: string }[]
  distribucionesIniciales: Record<number, { participanteKey: string; monto: string }[]>
  // A qué cuenta se transfiere cada cuota (clave de participante, o ''
  // cuando todavía no se eligió).
  cuentaCobroInicialPorCuota: Record<number, string>
  // Resguardo de los lotes anteriores al 08/09, cuando el destino se
  // cargaba a nivel lote. Vacío en todo lote nuevo: desde ese día el
  // destino se elige acá, cuota por cuota.
  cuentaCobroDelLote: string
  // Integrantes que todavía no tienen alias/banco/titular cargados: se les
  // puede asignar una cuota igual, pero el cliente no va a ver dónde pagar
  // hasta que se les carguen.
  sinDatosTransferencia: string[]
  // Saldo de cuenta corriente que ya tiene cada integrante, en la moneda
  // del lote. Positivo = la empresa todavía le debe.
  saldoActualPorClave: Record<string, number>
}

let contadorIds = 0
function generarId(): string {
  contadorIds += 1
  return `fila-${contadorIds}`
}

function filaVacia(): Fila {
  return { id: generarId(), participanteKey: '', monto: '' }
}

function conId<T extends { participanteKey: string; monto: string }>(fila: T): Fila {
  return { ...fila, id: generarId() }
}

// Input de texto con búsqueda nativa (datalist) en vez de un <select> con
// todos los participantes en una lista larga -- Nicolás pidió poder
// escribir y filtrar por nombre en vez de scrollear un desplegable. El
// input visible NO se manda en el submit (no tiene `name`): lo que viaja al
// server action es el <input type="hidden"> con la clave ya resuelta, mismo
// formato que antes (`profile:<id>` / `externa:<id>`). Si lo tipeado no
// matchea ningún nombre conocido, la clave queda vacía -- misma fila "sin
// participante" que ya se descarta sin error al guardar. El estado del
// texto se inicializa una sola vez a partir de `valor`: la fila que lo usa
// tiene un `id` estable como key (ver más abajo), así que React nunca
// reutiliza esta instancia para una fila lógica distinta al reordenar.
//
// El mockup 6 lo dibuja como un <select>; se queda como buscador porque es
// lo que pidió Nico. Los dos inputs tienen que seguir siendo hermanos: los
// e2e llegan al visible desde el oculto.
function SelectorParticipante({
  name,
  valor,
  onChange,
  opciones,
  className = '',
}: {
  name: string
  valor: string
  onChange: (valor: string) => void
  opciones: Participante[]
  className?: string
}) {
  const [texto, setTexto] = useState(
    () => opciones.find((participante) => participante.key === valor)?.nombre ?? ''
  )

  return (
    <>
      <input
        list="lista-participantes"
        value={texto}
        placeholder="Buscar participante..."
        onChange={(evento) => {
          const nuevoTexto = evento.target.value
          setTexto(nuevoTexto)
          const encontrado = opciones.find((participante) => participante.nombre === nuevoTexto)
          onChange(encontrado ? encontrado.key : '')
        }}
        className={`${CAMPO_COMPACTO_SIN_ANCHO} bg-white font-semibold text-slate-800 ${className}`}
      />
      <input type="hidden" name={name} value={valor} />
    </>
  )
}

function textoDelControl(control: ControlDeSuma, montoCuota: number, moneda: string): string {
  if (control.estado === 'completa') return 'Repartida completa ✓'
  if (control.estado === 'sin_repartir') return 'Sin repartir'
  if (control.estado === 'falta') {
    const porcentaje = montoCuota > 0 ? Math.round((control.diferencia / montoCuota) * 100) : null
    return `Faltan ${control.diferencia} ${moneda}${porcentaje === null ? '' : ` (${porcentaje}%)`}`
  }
  return `De más: ${Math.abs(control.diferencia)} ${moneda}`
}

export function DistribucionCuotas({
  moneda,
  cuotas,
  participantesElegibles,
  objetivosIniciales,
  distribucionesIniciales,
  cuentaCobroInicialPorCuota,
  cuentaCobroDelLote,
  sinDatosTransferencia,
  saldoActualPorClave,
}: Props) {
  const [objetivos, setObjetivos] = useState<Fila[]>(() => objetivosIniciales.map(conId))
  const [distribuciones, setDistribuciones] = useState<Record<number, Fila[]>>(() =>
    Object.fromEntries(
      Object.entries(distribucionesIniciales).map(([numero, filas]) => [numero, filas.map(conId)])
    )
  )
  const [cuentasCobro, setCuentasCobro] = useState<Record<number, string>>(
    () => cuentaCobroInicialPorCuota
  )

  // De a 15 cuotas por página, como el mockup. Las de las otras páginas se
  // esconden con CSS y NO se sacan del DOM: el guardado es un reemplazo
  // completo del lote, y una cuota que no viajara en el formulario perdería
  // su reparto al apretar Guardar.
  const [pagina, setPagina] = useState(0)
  const [verTodas, setVerTodas] = useState(false)
  const idMatriz = useId()
  const cantidadPaginas = paginasDeCuotas(cuotas.length)
  const paginado = cuotas.length > CUOTAS_POR_PAGINA
  const desde = pagina * CUOTAS_POR_PAGINA
  const hasta = Math.min(desde + CUOTAS_POR_PAGINA, cuotas.length)

  function irAPagina(nueva: number) {
    setPagina(nueva)
    document.getElementById(idMatriz)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  const clavesSinDatos = new Set(sinDatosTransferencia)

  // Reemplaza el destino de TODAS las cuotas de una (08/09). Es lo que
  // antes hacía la "cuenta de cobro actual" del lote, que se sacó por
  // redundante: el caso normal sigue siendo que cobre siempre el mismo, y
  // sin esto habría que repetir el mismo click sesenta veces por lote.
  function aplicarATodasLasCuotas(clave: string) {
    setCuentasCobro(Object.fromEntries(cuotas.map((cuota) => [cuota.numero, clave])))
  }

  const cuotasSinDestino = cuotas.filter(
    (cuota) => !(cuentasCobro[cuota.numero] || cuentaCobroDelLote)
  )

  const cuotasConDestinoSinDatos = cuotas.filter((cuota) => {
    const clave = cuentasCobro[cuota.numero] || cuentaCobroDelLote
    return clave !== '' && clavesSinDatos.has(clave)
  })

  function nombrePorClave(clave: string) {
    return participantesElegibles.find((participante) => participante.key === clave)?.nombre ?? clave
  }

  function agregarObjetivo() {
    setObjetivos((anteriores) => [...anteriores, filaVacia()])
  }

  function quitarObjetivo(indice: number) {
    setObjetivos((anteriores) => anteriores.filter((_, i) => i !== indice))
  }

  function modificarObjetivo(indice: number, campo: keyof Fila, valor: string) {
    setObjetivos((anteriores) => anteriores.map((fila, i) => (i === indice ? { ...fila, [campo]: valor } : fila)))
  }

  function agregarFilaCuota(numero: number) {
    setDistribuciones((anteriores) => ({
      ...anteriores,
      [numero]: [...(anteriores[numero] ?? []), filaVacia()],
    }))
  }

  function quitarFilaCuota(numero: number, indice: number) {
    setDistribuciones((anteriores) => ({
      ...anteriores,
      [numero]: (anteriores[numero] ?? []).filter((_, i) => i !== indice),
    }))
  }

  function modificarFilaCuota(numero: number, indice: number, campo: keyof Fila, valor: string) {
    setDistribuciones((anteriores) => ({
      ...anteriores,
      [numero]: (anteriores[numero] ?? []).map((fila, i) => (i === indice ? { ...fila, [campo]: valor } : fila)),
    }))
  }

  // Cuánto le entra DIRECTO a cada integrante: la suma de las cuotas cuya
  // cuenta de cobro es esa persona. Es la contracara de lo que le
  // corresponde por distribución, y lo que permite decir "con este vendedor
  // ya estoy al día" sin salir de la pantalla (05/09, pedido de Gabriel).
  const cobraDirectoPorClave = (() => {
    const acumulados = new Map<string, number>()
    for (const cuota of cuotas) {
      const clave = cuentasCobro[cuota.numero] || cuentaCobroDelLote
      if (!clave) continue
      acumulados.set(clave, Math.round(((acumulados.get(clave) ?? 0) + cuota.montoBase) * 100) / 100)
    }
    return acumulados
  })()

  // Resumen recalculado en cada render a partir del estado local -- cruza
  // TODAS las cuotas ya editadas en esta sesión (no solo lo persistido),
  // sin ninguna llamada de red. Es lo que le permite a Nicolás ver bajar
  // el saldo pendiente de un participante mientras carga cuota tras cuota.
  const resumen = (() => {
    const acumulados = new Map<string, number>()
    for (const filas of Object.values(distribuciones)) {
      for (const fila of filas) {
        if (!fila.participanteKey) continue
        const monto = Number(fila.monto) || 0
        acumulados.set(fila.participanteKey, (acumulados.get(fila.participanteKey) ?? 0) + monto)
      }
    }

    const objetivosPorClave = new Map<string, number>()
    for (const fila of objetivos) {
      if (!fila.participanteKey) continue
      const montoTexto = fila.monto.trim()
      if (montoTexto === '') continue
      const monto = Number(montoTexto)
      if (!Number.isFinite(monto)) continue
      objetivosPorClave.set(fila.participanteKey, (objetivosPorClave.get(fila.participanteKey) ?? 0) + monto)
    }

    const claves = new Set<string>([
      ...acumulados.keys(),
      ...objetivosPorClave.keys(),
      ...cobraDirectoPorClave.keys(),
    ])

    return Array.from(claves).map((clave) => {
      const acumulado = Math.round((acumulados.get(clave) ?? 0) * 100) / 100
      const objetivo = objetivosPorClave.has(clave) ? (objetivosPorClave.get(clave) as number) : null
      const cobraDirecto = Math.round((cobraDirectoPorClave.get(clave) ?? 0) * 100) / 100
      const saldoActual = saldoActualPorClave[clave] ?? 0
      // Positivo: la empresa le sigue debiendo. Negativo: cobró de más.
      // Es el saldo de hoy MÁS lo que le va a corresponder por este lote
      // MENOS lo que va a cobrar directo de las cuotas que le asignamos.
      const saldoProyectado = Math.round((saldoActual + acumulado - cobraDirecto) * 100) / 100
      return {
        clave,
        nombre: nombrePorClave(clave),
        acumulado,
        objetivo,
        cobraDirecto,
        saldoActual,
        saldoProyectado,
      }
    })
  })()

  function resumenDe(clave: string) {
    return resumen.find((fila) => fila.clave === clave) ?? null
  }

  const sumaDeLasCuotas = Math.round(cuotas.reduce((acum, cuota) => acum + cuota.montoBase, 0) * 100) / 100
  const controlDelLote = controlDeSuma(
    sumaDeLasCuotas,
    cuotas.flatMap((cuota) => distribuciones[cuota.numero] ?? [])
  )

  return (
    <>
      <datalist id="lista-participantes">
        {participantesElegibles.map((participante) => (
          <option key={participante.key} value={participante.nombre} />
        ))}
      </datalist>

      {/* Cómo le queda la cuenta a cada uno, en vivo (mockup 6: "Impacto en
          cuentas corrientes"). Antes era la tabla "Resumen del lote" al final
          de todas las cuotas; ahora va arriba, antes de empezar a cargar. */}
      <section className={`${PANEL} space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
              <BarChart3 className="h-3.5 w-3.5" />
            </span>
            <div>
              <h2 className={PASO_TITULO}>Impacto en cuentas corrientes, en vivo</h2>
              <p className="max-w-3xl text-xs text-slate-500">
                &quot;Le corresponde&quot; es lo que suma para esa persona en el reparto de las cuotas.
                &quot;Cobra directo&quot; es lo que le entra a su cuenta por las cuotas que le
                asignaste. &quot;Cómo queda la cuenta&quot; cruza las dos con el saldo de cuenta
                corriente que ya tiene hoy. Se recalcula mientras cargás, sin guardar.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded bg-slate-100 px-2.5 py-1 font-mono font-medium text-slate-700">
              Total de las cuotas: {sumaDeLasCuotas} {moneda}
            </span>
          </div>
        </div>

        {resumen.length === 0 ? (
          <p className="text-sm text-slate-600">Sin distribución cargada todavía.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {resumen.map((fila) => {
              const estado =
                fila.saldoProyectado > 0 ? 'leDebes' : fila.saldoProyectado < 0 ? 'cobraDeMas' : 'alDia'
              return (
                <div key={fila.clave} data-testid="resumen-participante" className={TARJETA_IMPACTO}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-300 text-xs font-bold text-slate-800">
                        {fila.nombre.trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate text-xs font-bold text-slate-900" title={fila.nombre}>
                        {fila.nombre}
                      </span>
                    </div>
                    <span className={PILL_IMPACTO[estado]}>
                      {estado === 'leDebes' ? 'Le debés' : estado === 'cobraDeMas' ? 'Cobra de más' : 'Al día'}
                    </span>
                  </div>
                  <dl className="space-y-1.5 pt-1 text-xs">
                    <div className="flex justify-between gap-2 text-slate-600">
                      <dt>Le corresponde:</dt>
                      <dd className="font-mono font-bold text-slate-800">
                        {fila.acumulado} {moneda}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2 text-slate-600">
                      <dt>Cobra directo:</dt>
                      <dd className="font-mono font-bold text-blue-700">
                        {fila.cobraDirecto} {moneda}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-2">
                      <dt className="text-[11px] font-semibold text-slate-700">Cómo queda la cuenta:</dt>
                      <dd
                        className={`font-mono font-bold ${
                          estado === 'leDebes'
                            ? 'text-amber-700'
                            : estado === 'cobraDeMas'
                              ? 'text-rose-700'
                              : 'text-emerald-700'
                        }`}
                      >
                        {estado === 'leDebes'
                          ? `Le debés ${fila.saldoProyectado} ${moneda}`
                          : estado === 'cobraDeMas'
                            ? `Cobra de más ${Math.abs(fila.saldoProyectado)} ${moneda}`
                            : 'Al día'}
                      </dd>
                    </div>
                    {fila.saldoActual !== 0 && (
                      <p className="text-[10px] text-slate-500 italic">
                        Incluye su saldo de cuenta corriente de hoy: {fila.saldoActual} {moneda}.
                      </p>
                    )}
                    <div className="flex justify-between gap-2 text-slate-600">
                      <dt>Objetivo:</dt>
                      <dd className="text-right font-medium text-slate-800">
                        {fila.objetivo === null
                          ? '—'
                          : fila.acumulado >= fila.objetivo
                            ? 'Saldado'
                            : `${fila.acumulado} de ${fila.objetivo}, faltan ${
                                Math.round((fila.objetivo - fila.acumulado) * 100) / 100
                              }`}
                      </dd>
                    </div>
                  </dl>
                </div>
              )
            })}
          </div>
        )}

        {/* Objetivos: cuánto le corresponde en total a cada uno. Son lo que
            alimenta la línea "Objetivo" de las tarjetas de arriba. */}
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <div>
            <p className="text-xs font-bold text-slate-800">Objetivos (opcional)</p>
            <p className="text-[11px] text-slate-500">
              Cuánto le corresponde en total a cada participante de este lote. Sin objetivo cargado,
              la tarjeta solo muestra lo acumulado, sin comparar contra nada.
            </p>
          </div>
          {objetivos.map((fila, indice) => (
            <div key={fila.id} className="flex flex-wrap items-center gap-2">
              <SelectorParticipante
                name="objetivoParticipante"
                valor={fila.participanteKey}
                onChange={(valor) => modificarObjetivo(indice, 'participanteKey', valor)}
                opciones={participantesElegibles}
                className="w-64"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Monto objetivo"
                value={fila.monto}
                onChange={(evento) => modificarObjetivo(indice, 'monto', evento.target.value)}
                name="objetivoMonto"
                className={`${CAMPO_COMPACTO_SIN_ANCHO} w-40 bg-white font-mono`}
              />
              <button
                type="button"
                onClick={() => quitarObjetivo(indice)}
                aria-label="Quitar"
                title="Quitar objetivo"
                className="cursor-pointer rounded p-1 text-slate-400 transition hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button type="button" onClick={agregarObjetivo} className={BOTON_AGREGAR_TEXTO}>
            + Agregar objetivo
          </button>
        </div>
      </section>

      {/* Paso 2: la matriz cuota a cuota. */}
      <section id={idMatriz} className={`${PANEL_SIN_PADDING} scroll-mt-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/50 p-4">
          <div className="flex items-center gap-3">
            <span className={PASO_NUMERO}>2</span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className={PASO_TITULO}>
                  Distribución cuota a cuota ({cuotas.length} {cuotas.length === 1 ? 'cuota' : 'cuotas'})
                </h2>
                <span className={PILL_SUMA[controlDelLote.estado]}>
                  Repartido {controlDelLote.repartido} / {sumaDeLasCuotas} {moneda}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Para cada cuota: entre quiénes se reparte y a quién se le transfiere. Se guarda todo
                junto, recién al apretar &quot;Guardar distribución&quot;.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {paginado && (
              <button
                type="button"
                onClick={() => setVerTodas((valor) => !valor)}
                className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50"
              >
                {verTodas ? `Ver de a ${CUOTAS_POR_PAGINA}` : `Ver todas las ${cuotas.length} cuotas`}
              </button>
            )}
            <BotonEnvio className={`cursor-pointer ${BOTON_CHICO_PRIMARIO}`}>
              <Check className="h-3.5 w-3.5" />
              Guardar distribución
            </BotonEnvio>
          </div>
        </div>

        {/* Elegir de una sola vez a quién se le transfieren TODAS las cuotas.
            Reemplaza a la "cuenta de cobro actual" que estaba en la sección
            de arriba (08/09, pedido de Gabriel): el destino ahora vive en la
            cuota, que es donde se cobra, y este atajo cubre el caso normal de
            que siempre cobre el mismo. */}
        <div className="space-y-3 border-b border-slate-100 p-4">
          <label className="block max-w-md">
            <span className={ETIQUETA_COMPACTA}>Le transfieren todas las cuotas a</span>
            <select
              data-testid="cuenta-cobro-todas"
              value=""
              onChange={(evento) => {
                if (evento.target.value) aplicarATodasLasCuotas(evento.target.value)
              }}
              className={`${CAMPO_COMPACTO} bg-white`}
            >
              <option value="">— elegir para aplicar a todas —</option>
              {participantesElegibles.map((participante) => (
                <option key={participante.key} value={participante.key}>
                  {participante.nombre}
                  {clavesSinDatos.has(participante.key) && ' — sin datos de transferencia'}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-slate-500">
              Pisa lo elegido en todas las cuotas de abajo. Después podés cambiar una por una las que
              cobre otro.
            </span>
          </label>

          {cuotasSinDestino.length > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {cuotasSinDestino.length === cuotas.length
                ? 'Ninguna cuota tiene a quién transferirle todavía: el cliente no va a ver ningún alias para pagar.'
                : `Sin destino todavía: cuota ${cuotasSinDestino.map((cuota) => cuota.numero).join(', ')}. El cliente no va a ver ningún alias para pagar esas.`}
            </p>
          )}

          {cuotasConDestinoSinDatos.length > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              La cuota {cuotasConDestinoSinDatos.map((cuota) => cuota.numero).join(', ')} le toca a
              alguien que todavía no tiene alias, banco y titular cargados, así que el cliente no va a
              ver dónde pagarla. Cargale los datos en Usuarios (o en Cuentas externas) y listo.
            </p>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className={TABLA_CLARA_HEADER}>
              <tr>
                <th className="w-36 border-b border-slate-200 px-4 py-3">Cuota y vto.</th>
                <th className="w-28 border-b border-slate-200 px-4 py-3">Monto</th>
                <th className="min-w-[26rem] border-b border-slate-200 px-4 py-3">Se reparte entre</th>
                <th className="w-60 border-b border-slate-200 px-4 py-3">A quién se le transfiere</th>
                <th className="w-44 border-b border-slate-200 px-4 py-3 text-center">Control de suma</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {cuotas.map((cuota, indiceCuota) => {
                const filas = distribuciones[cuota.numero] ?? []
                const control = controlDeSuma(cuota.montoBase, filas)
                const claveQueCobra = cuentasCobro[cuota.numero] || cuentaCobroDelLote
                const resumenQueCobra = claveQueCobra ? resumenDe(claveQueCobra) : null
                const enLaPagina = verTodas || !paginado || (indiceCuota >= desde && indiceCuota < hasta)

                return (
                  <tr
                    key={cuota.numero}
                    data-cuota={cuota.numero}
                    className={`transition ${FILA_CUOTA_SUMA[control.estado]} ${enLaPagina ? '' : 'hidden'}`}
                  >
                    {/* La fecha de vencimiento al lado del número (08/09,
                        pedido de Nico): esta pantalla se recorre cuota por
                        cuota decidiendo quién cobra cada una, y sin la fecha
                        había que salir al detalle del lote para saber de qué
                        mes se estaba hablando. */}
                    <td className="px-4 py-2.5 align-top whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className={NUMERO_CUOTA_SUMA[control.estado]}>
                          #{String(cuota.numero).padStart(2, '0')}
                        </span>
                        <span className="font-medium text-slate-800 tabular-nums">
                          {formatearFechaCorta(cuota.fechaVencimiento)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 align-top font-mono text-sm font-bold whitespace-nowrap text-slate-900">
                      {cuota.montoBase} {moneda}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <div className="space-y-1.5">
                        {filas.map((fila, indice) => {
                          const porcentaje = porcentajeDeLaCuota(cuota.montoBase, fila.monto)
                          return (
                            <div
                              key={fila.id}
                              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1"
                            >
                              <SelectorParticipante
                                name={`cuota${cuota.numero}Participante`}
                                valor={fila.participanteKey}
                                onChange={(valor) =>
                                  modificarFilaCuota(cuota.numero, indice, 'participanteKey', valor)
                                }
                                opciones={participantesElegibles}
                                className="min-w-0 flex-1"
                              />
                              {/* El porcentaje se calcula, no se carga: lo que
                                  se guarda es el monto. */}
                              <span
                                className="w-12 shrink-0 rounded border border-slate-200 bg-white px-1.5 py-1 text-right font-mono text-[11px] font-bold text-slate-500"
                                title="Porcentaje de la cuota"
                              >
                                {porcentaje === null ? '—' : `${porcentaje}%`}
                              </span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="Monto"
                                value={fila.monto}
                                onChange={(evento) =>
                                  modificarFilaCuota(cuota.numero, indice, 'monto', evento.target.value)
                                }
                                name={`cuota${cuota.numero}Monto`}
                                aria-label={`Monto de la cuota ${cuota.numero}`}
                                className={`${CAMPO_COMPACTO_SIN_ANCHO} w-24 shrink-0 bg-white text-right font-mono font-bold`}
                              />
                              <button
                                type="button"
                                onClick={() => quitarFilaCuota(cuota.numero, indice)}
                                aria-label="Quitar"
                                title="Quitar integrante"
                                className="shrink-0 cursor-pointer rounded p-1 text-slate-400 transition hover:text-red-500"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )
                        })}
                        <button
                          type="button"
                          onClick={() => agregarFilaCuota(cuota.numero)}
                          className={BOTON_AGREGAR_TEXTO}
                        >
                          + Agregar participante a esta cuota
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <select
                        name={`cuota${cuota.numero}CuentaCobro`}
                        value={cuentasCobro[cuota.numero] ?? ''}
                        onChange={(evento) =>
                          setCuentasCobro((anteriores) => ({
                            ...anteriores,
                            [cuota.numero]: evento.target.value,
                          }))
                        }
                        aria-label={`A quién se le transfiere la cuota ${cuota.numero}`}
                        className={`${CAMPO_COMPACTO} bg-white`}
                      >
                        {/* Los lotes anteriores al 08/09 pueden tener todavía
                            una cuenta cargada a nivel lote: se nombra para que
                            no sea un resguardo invisible. En los nuevos no hay
                            ninguna y la opción vacía es lisa y llanamente
                            "sin asignar". */}
                        <option value="">
                          {cuentaCobroDelLote
                            ? `— la cuenta del lote (${nombrePorClave(cuentaCobroDelLote)}) —`
                            : '— sin asignar —'}
                        </option>
                        {participantesElegibles.map((participante) => (
                          <option key={participante.key} value={participante.key}>
                            {participante.nombre}
                            {clavesSinDatos.has(participante.key) && ' — sin datos de transferencia'}
                          </option>
                        ))}
                      </select>
                      {/* Cómo le queda la cuenta a quien cobra esta cuota,
                          en una línea: el detalle está en su tarjeta de
                          arriba. */}
                      {resumenQueCobra ? (
                        <p className="mt-1 text-[11px] text-slate-500">
                          {resumenQueCobra.saldoProyectado > 0
                            ? `Le seguirías debiendo ${resumenQueCobra.saldoProyectado} ${moneda}`
                            : resumenQueCobra.saldoProyectado < 0
                              ? `Cobraría de más ${Math.abs(resumenQueCobra.saldoProyectado)} ${moneda}`
                              : 'Quedarías al día con esta persona'}
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] text-amber-700">
                          Sin destino: el cliente no va a ver dónde pagar esta cuota.
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center align-top">
                      <span className={PILL_SUMA[control.estado]}>
                        {textoDelControl(control, cuota.montoBase, moneda)}
                      </span>
                      <p className="mt-1 font-mono text-[10px] text-slate-500">
                        Asignado: {control.repartido} / {cuota.montoBase} {moneda}
                      </p>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4 text-xs">
          <div className="flex flex-wrap items-center gap-3 text-slate-500">
            {paginado && !verTodas && (
              <>
                <span>
                  Mostrando cuotas {desde + 1}–{hasta} de {cuotas.length}
                </span>
                <span className="text-slate-300">|</span>
              </>
            )}
            <span className="font-mono font-semibold text-slate-700">
              Total repartido: {controlDelLote.repartido} / {sumaDeLasCuotas} {moneda}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {paginado && !verTodas && (
              <nav aria-label="Páginas de cuotas" className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={pagina === 0}
                  onClick={() => irAPagina(pagina - 1)}
                  className={`${BOTON_CHICO_NEUTRO} cursor-pointer border border-slate-200 bg-white`}
                >
                  Anterior
                </button>
                {Array.from({ length: cantidadPaginas }, (_, numeroPagina) => (
                  <button
                    key={numeroPagina}
                    type="button"
                    onClick={() => irAPagina(numeroPagina)}
                    aria-current={numeroPagina === pagina ? 'page' : undefined}
                    className={
                      numeroPagina === pagina
                        ? 'rounded bg-blue-600 px-2.5 py-1 font-semibold text-white'
                        : 'cursor-pointer rounded border border-slate-200 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-100'
                    }
                  >
                    {numeroPagina + 1}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={pagina === cantidadPaginas - 1}
                  onClick={() => irAPagina(pagina + 1)}
                  className={`${BOTON_CHICO_NEUTRO} cursor-pointer border border-slate-200 bg-white`}
                >
                  Siguiente
                </button>
              </nav>
            )}
            <BotonEnvio className={`cursor-pointer ${BOTON_CHICO_PRIMARIO}`}>Guardar distribución</BotonEnvio>
          </div>
        </div>
      </section>
    </>
  )
}
