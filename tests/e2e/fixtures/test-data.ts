import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hoyArgentina } from '../../../lib/fecha/hoy-argentina'

// -----------------------------------------------------------------------------
// Provisión de datos de prueba para el suite E2E.
//
// Este módulo NO es un test de Playwright: es un helper que usan los specs en
// su `beforeAll` para dejar la base en un estado conocido antes de manejar un
// browser real.
//
// Importante: las cuentas de prueba se crean con el Admin API de Supabase
// (`auth.admin.createUser` con `email_confirm: true`), que NO envía ningún
// email. Esto es deliberadamente distinto del flujo real de invitación
// (`inviteUserByEmail`, usado por `venderLote` / `crearUsuarioStaff` en
// producción) que sí manda un correo real y requiere que un humano haga clic
// en el magic link. No tocamos ese flujo real: esto es exclusivamente una
// técnica de testing para poder loguearnos como usuarios ya confirmados y
// ejercitar todo lo que pasa DESPUÉS del login.
// -----------------------------------------------------------------------------

export const TEST_PASSWORD = 'Sima123!'

// Dominio .invalid (RFC 2606): reservado para que nunca sea una dirección
// real ni resoluble. Cero riesgo de mandar un email a una persona real.
export const TEST_USERS = {
  administrador: {
    email: 'test-admin@sima-e2e.invalid',
    fullName: 'E2E Admin',
    role: 'administrador' as const,
  },
  acreedor: {
    email: 'test-acreedor@sima-e2e.invalid',
    fullName: 'E2E Acreedor',
    role: 'acreedor' as const,
  },
  cliente: {
    email: 'test-cliente@sima-e2e.invalid',
    fullName: 'E2E Cliente',
    role: 'cliente' as const,
  },
  acreedorConDatos: {
    email: 'test-acreedor-cobro@sima-e2e.invalid',
    fullName: 'E2E Acreedor Con Datos',
    role: 'acreedor' as const,
  },
  vendedorLoteA: {
    email: 'test-vendedor-a@sima-e2e.invalid',
    fullName: 'E2E Vendedor A',
    role: 'vendedor' as const,
  },
  vendedorLoteB: {
    email: 'test-vendedor-b@sima-e2e.invalid',
    fullName: 'E2E Vendedor B',
    role: 'vendedor' as const,
  },
  acreedorSecundario: {
    email: 'test-acreedor-secundario@sima-e2e.invalid',
    fullName: 'E2E Acreedor Secundario',
    role: 'acreedor' as const,
  },
  cobrador: {
    email: 'test-cobrador@sima-e2e.invalid',
    fullName: 'E2E Cobrador',
    role: 'cobrador' as const,
  },
  vendedorSinLotes: {
    email: 'test-vendedor-sin-lotes@sima-e2e.invalid',
    fullName: 'E2E Vendedor Sin Lotes',
    role: 'vendedor' as const,
  },
}

export interface TestFixtures {
  admin: { id: string; email: string }
  acreedor: { id: string; email: string }
  acreedorConDatos: { id: string; email: string }
  acreedorSecundario: { id: string; email: string }
  vendedorLoteA: { id: string; email: string }
  vendedorLoteB: { id: string; email: string }
  cobrador: { id: string; email: string }
  vendedorSinLotes: { id: string; email: string }
  cliente: { id: string; email: string }
  password: string
  loteId: string
  loteSecundarioId: string
  cuotaIds: string[]
}

/**
 * Carga `.env.local` (mismo archivo que usa Next.js) a `process.env` si las
 * variables todavía no están seteadas. El runner de Playwright es un proceso
 * Node aparte, no pasa por el loader de Next, así que no lo hace solo.
 * No pisa variables ya presentes en el entorno (mismo comportamiento que
 * dotenv). No se loguea ningún valor.
 */
function loadEnvLocal() {
  const envPath = resolve(__dirname, '../../../.env.local')
  if (!existsSync(envPath)) return

  const contenido = readFileSync(envPath, 'utf-8')

  for (const linea of contenido.split(/\r?\n/)) {
    const match = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/.exec(linea)
    if (!match) continue

    const clave = match[1]
    let valor = match[2] ?? ''

    // Saca comillas envolventes simples/dobles si las hay.
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1)
    }

    if (process.env[clave] === undefined) {
      process.env[clave] = valor
    }
  }
}

export function createAdminClient() {
  loadEnvLocal()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY

  if (!url || !secretKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY en el entorno (revisá .env.local).'
    )
  }

  return createSupabaseClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Busca un usuario de auth por email recorriendo listUsers paginado (el SDK
 * de supabase-js no expone un filtro por email directo en admin.listUsers).
 */
async function buscarUsuarioPorEmail(admin: AdminClient, email: string) {
  const emailLower = email.toLowerCase()
  const perPage = 200

  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error

    const encontrado = data.users.find((u) => u.email?.toLowerCase() === emailLower)
    if (encontrado) return encontrado

    if (data.users.length < perPage) break
  }

  return null
}

/**
 * Errores transitorios de la infraestructura de Supabase (no de nuestro
 * código) que aparecen en la PRIMERA llamada a PostgREST de un proceso
 * "frío", después de un rato sin usar el proyecto.
 *
 * Caso observado: "JWT issued at future". Con las API keys nuevas
 * (`sb_secret_...`), el gateway de Supabase cambia la key por un JWT
 * interno de vida corta; si el nodo que lo emite tiene el reloj unos
 * milisegundos adelantado respecto del nodo que lo valida, el `iat` cae
 * "en el futuro" y la request se rechaza. Nada de esto lo controla este
 * repo: el reloj local está en hora (verificado contra la fecha HTTP que
 * devuelve el propio Supabase) y la llamada siguiente funciona siempre.
 *
 * Se reintenta SOLO esta familia de errores, y pocas veces: cualquier
 * otro error se propaga tal cual, para no tapar fallas reales.
 */
const ERRORES_TRANSITORIOS = ['JWT issued at future']

async function conReintentoTransitorio<T extends { error: { message: string } | null }>(
  operacion: () => PromiseLike<T>,
  intentos = 3
): Promise<T> {
  let resultado = await operacion()

  for (let intento = 1; intento < intentos; intento++) {
    const mensaje = resultado.error?.message
    if (!mensaje || !ERRORES_TRANSITORIOS.some((t) => mensaje.includes(t))) {
      return resultado
    }

    await new Promise((r) => setTimeout(r, 500 * intento))
    resultado = await operacion()
  }

  return resultado
}

/**
 * Crea (o reutiliza) un usuario de auth ya confirmado, sin enviar ningún
 * email, y sincroniza su fila en `profiles`.
 */
async function ensureTestUser(
  admin: AdminClient,
  config: {
    email: string
    fullName: string
    role: 'administrador' | 'acreedor' | 'vendedor' | 'cliente' | 'cobrador'
    datosTransferencia?: { alias: string; banco: string; titular: string; cbu?: string }
  }
) {
  let userId: string

  const existente = await buscarUsuarioPorEmail(admin, config.email)

  if (existente) {
    userId = existente.id
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: config.email,
      password: TEST_PASSWORD,
      email_confirm: true,
    })

    if (error || !data.user) {
      throw new Error(`No se pudo crear el usuario de prueba ${config.email}: ${error?.message}`)
    }

    userId = data.user.id
  }

  const { error: errorProfile } = await conReintentoTransitorio(() =>
    admin.from('profiles').upsert({
      id: userId,
      role: config.role,
      full_name: config.fullName,
      email: config.email,
      alias: config.datosTransferencia?.alias ?? null,
      banco: config.datosTransferencia?.banco ?? null,
      cbu: config.datosTransferencia?.cbu ?? null,
      titular: config.datosTransferencia?.titular ?? null,
    })
  )

  if (errorProfile) {
    throw new Error(`No se pudo upsertear el profile de ${config.email}: ${errorProfile.message}`)
  }

  return { id: userId, email: config.email }
}

/** Suma `meses` meses a una fecha ISO (YYYY-MM-DD), en UTC. */
function sumarMeses(fechaISO: string, meses: number): string {
  const [anio, mes, dia] = fechaISO.split('-').map(Number)
  const fecha = new Date(Date.UTC(anio, mes - 1 + meses, dia))
  return fecha.toISOString().slice(0, 10)
}

/**
 * Deja la base en un estado limpio y conocido para el suite E2E:
 * - Garantiza que existan los 3 usuarios de prueba (idempotente).
 * - Borra cualquier lote/cuota/pago previo del cliente de prueba.
 * - Inserta un lote de prueba fresco con 3 cuotas de 1000 USD cada una.
 *
 * Seguro de llamar múltiples veces (cada corrida vuelve a dejar todo limpio).
 */
export async function ensureTestFixtures(): Promise<TestFixtures> {
  const admin = createAdminClient()

  const [
    administrador,
    acreedor,
    cliente,
    acreedorConDatos,
    acreedorSecundario,
    vendedorLoteA,
    vendedorLoteB,
    cobrador,
    vendedorSinLotes,
  ] = await Promise.all([
    ensureTestUser(admin, TEST_USERS.administrador),
    ensureTestUser(admin, TEST_USERS.acreedor),
    ensureTestUser(admin, TEST_USERS.cliente),
    ensureTestUser(admin, {
      ...TEST_USERS.acreedorConDatos,
      datosTransferencia: {
        alias: 'acreedor.cobro',
        banco: 'Test Bank',
        titular: 'E2E Acreedor Con Datos SA',
        cbu: '0000003100000000000001',
      },
    }),
    ensureTestUser(admin, TEST_USERS.acreedorSecundario),
    ensureTestUser(admin, {
      ...TEST_USERS.vendedorLoteA,
      datosTransferencia: { alias: 'vendedor.a', banco: 'Banco A', titular: 'E2E Vendedor A SA' },
    }),
    ensureTestUser(admin, {
      ...TEST_USERS.vendedorLoteB,
      datosTransferencia: { alias: 'vendedor.b', banco: 'Banco B', titular: 'E2E Vendedor B SA' },
    }),
    ensureTestUser(admin, TEST_USERS.cobrador),
    ensureTestUser(admin, TEST_USERS.vendedorSinLotes),
  ])

  // --- Limpieza: borramos cualquier lote previo del cliente de prueba y todo
  // lo que cuelgue de él, respetando el orden que exigen las FK sin cascade
  // (pago_imputaciones.cuota_id no tiene "on delete cascade").
  const { data: lotesPrevios } = await admin
    .from('lotes')
    .select('id')
    .eq('cliente_id', cliente.id)

  const loteIdsPrevios = (lotesPrevios ?? []).map((l) => l.id)

  if (loteIdsPrevios.length > 0) {
    const { data: cuotasPrevias } = await admin
      .from('cuotas')
      .select('id')
      .in('lote_id', loteIdsPrevios)

    const cuotaIdsPrevias = (cuotasPrevias ?? []).map((c) => c.id)

    if (cuotaIdsPrevias.length > 0) {
      await admin.from('pago_imputaciones').delete().in('cuota_id', cuotaIdsPrevias)
    }
  }

  // Los pagos del cliente no cuelgan del lote (cuelgan de cliente_id), así
  // que se borran aparte. El cascade de pago_id se encarga de sus
  // pago_imputaciones restantes.
  await admin.from('pagos').delete().eq('cliente_id', cliente.id)

  if (loteIdsPrevios.length > 0) {
    await admin.from('lotes').delete().in('id', loteIdsPrevios)
  }

  // --- Lote de prueba fresco.
  const hoy = hoyArgentina()

  const { data: lote, error: errorLote } = await admin
    .from('lotes')
    .insert({
      identificador: 'E2E Test Lote',
      moneda: 'USD',
      estado: 'vendido',
      cliente_id: cliente.id,
      cantidad_cuotas: 3,
      monto_cuota_base: 1000,
      fecha_primera_cuota: hoy,
    })
    .select('id')
    .single()

  if (errorLote || !lote) {
    throw new Error(`No se pudo crear el lote de prueba: ${errorLote?.message}`)
  }

  const cuotasAInsertar = [1, 2, 3].map((numero) => ({
    lote_id: lote.id,
    numero,
    monto_base: 1000,
    saldo_pendiente: 1000,
    fecha_vencimiento: sumarMeses(hoy, numero - 1),
  }))

  const { data: cuotas, error: errorCuotas } = await admin
    .from('cuotas')
    .insert(cuotasAInsertar)
    .select('id, numero')
    .order('numero', { ascending: true })

  if (errorCuotas || !cuotas) {
    throw new Error(`No se pudieron crear las cuotas de prueba: ${errorCuotas?.message}`)
  }

  await admin
    .from('lotes')
    .update({ acreedor_id: acreedorConDatos.id, vendedor_id: vendedorLoteA.id })
    .eq('id', lote.id)

  // Limpieza + creación de un segundo lote, sin cliente, solo para la
  // relación acreedor-vendedor (no participa del flujo de pagos).
  // Nota: el identificador deliberadamente NO empieza con "E2E Test Lote"
  // (a diferencia del lote principal) porque `cuenta-cobro.spec.ts` ubica
  // "el" lote de prueba con `getByRole('row', { name: /E2E Test Lote/ })`,
  // un regex sin anclar que matchearía por substring y rompería ese test
  // por ambigüedad (2 filas) si el nombre empezara igual.
  await admin.from('lotes').delete().eq('identificador', 'E2E Lote Secundario')

  const { data: loteSecundario, error: errorLoteSecundario } = await admin
    .from('lotes')
    .insert({
      identificador: 'E2E Lote Secundario',
      moneda: 'USD',
      estado: 'disponible',
      cantidad_cuotas: 1,
      monto_cuota_base: 1,
      acreedor_id: acreedorSecundario.id,
      vendedor_id: vendedorLoteB.id,
    })
    .select('id')
    .single()

  if (errorLoteSecundario || !loteSecundario) {
    throw new Error(`No se pudo crear el lote secundario de prueba: ${errorLoteSecundario?.message}`)
  }

  return {
    admin: administrador,
    acreedor,
    acreedorConDatos,
    acreedorSecundario,
    vendedorLoteA,
    vendedorLoteB,
    cobrador,
    vendedorSinLotes,
    cliente,
    password: TEST_PASSWORD,
    loteId: lote.id,
    loteSecundarioId: loteSecundario.id,
    cuotaIds: cuotas.map((c) => c.id),
  }
}
