// Borra de la base y del Storage todo lo que dejó el suite E2E, dejando
// intactos los datos DEMO con los que se le muestra la plataforma a Nicolás.
//
// Hace falta porque el suite crea datos de verdad contra el proyecto real
// (no hay entorno de test aparte): una corrida completa deja cientos de
// lotes "E2E ...", sus usuarios @sima-e2e.invalid y miles de comprobantes
// en el bucket. Correr esto después de `npm run test:e2e` devuelve el
// proyecto al estado presentable.
//
//   node scripts/limpiar-datos-de-prueba.mjs            (borra)
//   node scripts/limpiar-datos-de-prueba.mjs --dry-run  (solo informa)
//
// Qué considera "de prueba", y nada más que eso:
//   - lotes cuyo identificador CONTIENE "E2E" y loteos cuyo nombre empieza
//     con "E2E". Contiene y no empieza (09/09): el identificador del lote
//     ya no lo elige el test, lo arma la app con la manzana y el numero
//     ("Mza E2E - Lote E2E-1788..."), asi que ninguno empieza con E2E y
//     quedaban lotes huerfanos -- y con ellos usuarios que no se podian
//     borrar porque el lote seguia apuntandolos.
//   - cuentas externas cuyo nombre contiene "E2E"
//   - usuarios con email @sima-e2e.invalid
//   - archivos del bucket que ya no referencia ninguna fila
//
// Los datos DEMO no se tocan. Sí se reasignan al administrador las columnas
// de "quién hizo esto" que en datos DEMO habían quedado apuntando al admin
// de prueba: si no, la base no deja borrar ese usuario.
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BUCKET = 'comprobantes'
const DOMINIO_DE_PRUEBA = '@sima-e2e.invalid'
const PREFIJO = 'E2E'
const EMAIL_ADMIN = 'arga.optimation@gmail.com'

const soloInformar = process.argv.includes('--dry-run')

function cargarEnvLocal() {
  const ruta = resolve(RAIZ, '.env.local')
  if (!existsSync(ruta)) return
  for (const linea of readFileSync(ruta, 'utf-8').split(/\r?\n/)) {
    const m = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/.exec(linea)
    if (!m) continue
    let valor = m[2] ?? ''
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1)
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = valor
  }
}

cargarEnvLocal()

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (revisá .env.local).')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function reventarSi(error, contexto) {
  if (error) throw new Error(`${contexto}: ${error.message}`)
}

async function idsDe(tabla, columna, patron) {
  const { data, error } = await supabase.from(tabla).select('id').ilike(columna, patron)
  reventarSi(error, `${tabla}.${columna}`)
  return data.map((f) => f.id)
}

// PostgREST arma la lista de un `.in()` en la URL, así que una lista larga
// la hace explotar. Se parte en tandas.
async function enTandas(ids, tamanio, tarea) {
  for (let i = 0; i < ids.length; i += tamanio) {
    await tarea(ids.slice(i, i + tamanio))
  }
}

async function borrarPorIds(tabla, columna, ids, contexto) {
  if (ids.length === 0) return
  await enTandas(ids, 100, async (tanda) => {
    const { error } = await supabase.from(tabla).delete().in(columna, tanda)
    reventarSi(error, contexto)
  })
}

async function limpiarBase() {
  const lotes = await idsDe('lotes', 'identificador', `%${PREFIJO}%`)
  const loteos = await idsDe('loteos', 'nombre', `${PREFIJO}%`)
  const cuentasExternas = await idsDe('cuentas_externas', 'nombre', `%${PREFIJO}%`)

  const { data: perfiles, error: errorPerfiles } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', `%${DOMINIO_DE_PRUEBA}`)
  reventarSi(errorPerfiles, 'profiles')
  const perfilesDePrueba = perfiles.map((f) => f.id)

  console.log(
    `Base: ${lotes.length} lotes, ${loteos.length} loteos, ` +
      `${cuentasExternas.length} cuentas externas, ${perfilesDePrueba.length} usuarios.`
  )
  if (soloInformar) return { lotes: lotes.length, perfiles: perfilesDePrueba.length }

  const { data: admin, error: errorAdmin } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', EMAIL_ADMIN)
    .maybeSingle()
  reventarSi(errorAdmin, 'profiles admin')
  if (!admin) throw new Error(`No existe el administrador ${EMAIL_ADMIN}`)

  // Cuotas de los lotes de prueba: hacen falta para desenganchar las
  // imputaciones, que no borran en cascada.
  const cuotas = []
  await enTandas(lotes, 100, async (tanda) => {
    const { data, error } = await supabase.from('cuotas').select('id').in('lote_id', tanda)
    reventarSi(error, 'cuotas')
    cuotas.push(...data.map((f) => f.id))
  })

  const pagos = []
  await enTandas(lotes, 100, async (tanda) => {
    const { data, error } = await supabase.from('pagos').select('id').in('lote_id', tanda)
    reventarSi(error, 'pagos')
    pagos.push(...data.map((f) => f.id))
  })

  await borrarPorIds('pago_imputaciones', 'cuota_id', cuotas, 'pago_imputaciones')
  await borrarPorIds('pago_imputaciones_mora', 'cuota_id', cuotas, 'pago_imputaciones_mora')
  await borrarPorIds('cuentas_externas_movimientos', 'pago_id', pagos, 'cem por pago')
  await borrarPorIds('cuentas_externas_movimientos', 'lote_id', lotes, 'cem por lote')
  await borrarPorIds(
    'cuentas_externas_movimientos',
    'cuenta_externa_id',
    cuentasExternas,
    'cem por cuenta'
  )
  await borrarPorIds(
    'cuentas_externas_movimientos',
    'cargado_por',
    perfilesDePrueba,
    'cem por usuario'
  )
  await borrarPorIds('pagos', 'lote_id', lotes, 'pagos')
  await borrarPorIds('lotes', 'id', lotes, 'lotes')
  await borrarPorIds('loteos', 'id', loteos, 'loteos')
  await borrarPorIds('cuentas_externas', 'id', cuentasExternas, 'cuentas_externas')
  await borrarPorIds(
    'movimientos_cuenta_corriente',
    'profile_id',
    perfilesDePrueba,
    'movimientos de usuarios de prueba'
  )
  await borrarPorIds(
    'cotizaciones_dolar_historial',
    'cargado_por',
    perfilesDePrueba,
    'historial de cotización'
  )

  // Lo que queda apuntando a un usuario de prueba ya no es dato de prueba:
  // son filas DEMO que el admin de test tocó en alguna corrida. Se les
  // cambia el autor al administrador real para poder borrar el usuario sin
  // perder la fila.
  const autorias = [
    ['reservas', 'recibido_por'],
    ['reservas', 'created_by'],
    ['reservas', 'cancelada_por'],
    ['lote_documentos', 'subido_por'],
    ['lote_historial_estados', 'cambiado_por'],
    ['movimientos_cuenta_corriente', 'cargado_por'],
    ['pagos', 'confirmado_admin_por'],
    ['pagos', 'confirmado_acreedor_por'],
    ['ajustes_indexacion', 'aplicado_por'],
    ['indices_valores', 'cargado_por'],
    ['cotizaciones_dolar', 'cargado_por'],
  ]
  for (const [tabla, columna] of autorias) {
    await enTandas(perfilesDePrueba, 100, async (tanda) => {
      const { error } = await supabase
        .from(tabla)
        .update({ [columna]: admin.id })
        .in(columna, tanda)
      reventarSi(error, `${tabla}.${columna}`)
    })
  }

  // Los usuarios se borran por el Admin API: borrar la fila de `profiles`
  // dejaría vivo el usuario de auth y el email seguiría ocupado.
  let borrados = 0
  for (const id of perfilesDePrueba) {
    const { error } = await supabase.auth.admin.deleteUser(id)
    if (error) throw new Error(`deleteUser ${id}: ${error.message}`)
    borrados++
    process.stdout.write(`\rUsuarios borrados ${borrados}/${perfilesDePrueba.length}`)
  }
  if (perfilesDePrueba.length) console.log('')

  // El suite crea usuarios de auth que a veces no llegan a tener perfil.
  let pagina = 1
  const huerfanos = []
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: pagina, perPage: 200 })
    reventarSi(error, 'listUsers')
    huerfanos.push(
      ...data.users.filter((u) => u.email?.toLowerCase().endsWith(DOMINIO_DE_PRUEBA)).map((u) => u.id)
    )
    if (data.users.length < 200) break
    pagina++
  }
  for (const id of huerfanos) {
    const { error } = await supabase.auth.admin.deleteUser(id)
    if (error) throw new Error(`deleteUser huérfano ${id}: ${error.message}`)
  }
  if (huerfanos.length) console.log(`Usuarios de auth sin perfil borrados: ${huerfanos.length}`)

  return { lotes: lotes.length, perfiles: perfilesDePrueba.length + huerfanos.length }
}

// --- Storage ---------------------------------------------------------------

const COLUMNAS_CON_ARCHIVO = [
  ['lote_documentos', 'path'],
  ['loteos', 'plantilla_contrato_path'],
  ['lotes', 'documento_firmado_path'],
  ['pagos', 'comprobante_path'],
  ['reservas', 'comprobante_sena_path'],
  ['reservas', 'dni_conyuge_path'],
  ['reservas', 'dni_dorso_path'],
  ['reservas', 'dni_frente_path'],
  ['reservas', 'sentencia_divorcio_path'],
]

async function archivosReferenciados() {
  const usados = new Set()
  for (const [tabla, columna] of COLUMNAS_CON_ARCHIVO) {
    const { data, error } = await supabase.from(tabla).select(columna).not(columna, 'is', null)
    reventarSi(error, `${tabla}.${columna}`)
    for (const fila of data) if (fila[columna]) usados.add(fila[columna])
  }
  return usados
}

async function listarCarpeta(prefijo) {
  const archivos = []
  const carpetas = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefijo, { limit: 1000, offset })
    reventarSi(error, `list ${prefijo || '/'}`)
    if (data.length === 0) break
    for (const entrada of data) {
      const ruta = prefijo ? `${prefijo}/${entrada.name}` : entrada.name
      // Sin `id` es una carpeta, no un archivo.
      if (entrada.id == null) carpetas.push(ruta)
      else archivos.push(ruta)
    }
    if (data.length < 1000) break
    offset += data.length
  }
  return { archivos, carpetas }
}

// Listar carpeta por carpeta en serie tardaba minutos (hay cientos). Se
// recorren de a tandas en paralelo.
async function listarTodo() {
  const archivos = []
  let pendientes = ['']
  while (pendientes.length > 0) {
    const tanda = pendientes.splice(0, 20)
    const resultados = await Promise.all(tanda.map((p) => listarCarpeta(p)))
    for (const r of resultados) {
      archivos.push(...r.archivos)
      pendientes.push(...r.carpetas)
    }
  }
  return archivos
}

async function limpiarStorage() {
  const usados = await archivosReferenciados()
  const todos = await listarTodo()
  const huerfanos = todos.filter((ruta) => !usados.has(ruta))

  console.log(
    `Storage: ${todos.length} archivos, ${usados.size} en uso, ${huerfanos.length} huérfanos.`
  )
  if (soloInformar || huerfanos.length === 0) return huerfanos.length

  let borrados = 0
  for (let i = 0; i < huerfanos.length; i += 100) {
    const tanda = huerfanos.slice(i, i + 100)
    const { error } = await supabase.storage.from(BUCKET).remove(tanda)
    reventarSi(error, 'remove')
    borrados += tanda.length
    process.stdout.write(`\rArchivos borrados ${borrados}/${huerfanos.length}`)
  }
  console.log('')
  return huerfanos.length
}

const resumen = await limpiarBase()
const archivos = await limpiarStorage()

console.log(
  soloInformar
    ? 'Nada se borró (--dry-run).'
    : `Listo: ${resumen.lotes} lotes, ${resumen.perfiles} usuarios y ${archivos} archivos de prueba borrados.`
)
