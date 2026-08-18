# Editar una reserva ya cargada — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para seguimiento.

**Goal:** Permitir que un administrador corrija una reserva ya cargada
(texto y/o archivos) mientras el lote sigue "reservado", sin tener que
cancelarla y cargarla de nuevo.

**Architecture:** Server Action nueva `actualizarReserva` (junto a
`reservarLote`, reusando sus helpers de validación) + página nueva que
reusa la estructura de campos de `reservar/page.tsx` pero precargada y
con los 5 campos de archivo opcionales (si no se elige uno nuevo, se
mantiene el path ya guardado).

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase,
Playwright (e2e).

## Global Constraints

- Exclusivo de administrador, exclusivo mientras `lote.estado ===
  'reservado'` — mismo límite que "Cancelar reserva".
- Los 5 campos de archivo son opcionales en esta pantalla (a diferencia
  de `reservar`): sin archivo nuevo, se mantiene el path ya guardado.
- Las condiciones de cónyuge/divorcio se validan contra el path
  RESULTANTE (nuevo o heredado), no contra si se subió algo en este
  envío puntual.
- UPDATE in place sobre la fila existente de `reservas` — sin historial.
- No se borra ningún archivo reemplazado del Storage (queda huérfano,
  mismo criterio ya vigente en el resto del proyecto).

---

### Task 1: Server Action, página, link y tests

**Files:**
- Modify: `app/admin/lotes/[id]/reservar/actions.ts` (agrega
  `actualizarReserva`, extrae 3 constantes a nivel de módulo)
- Create: `app/admin/lotes/[id]/reservar/editar/page.tsx`
- Modify: `app/admin/lotes/[id]/page.tsx` (link nuevo)
- Test: `tests/e2e/editar-reserva.spec.ts`

**Interfaces:**
- Produces: `actualizarReserva(loteId: string, formData: FormData)`,
  Server Action vinculada en la página nueva como
  `actualizarReserva.bind(null, id)`.
- Consumes: `tieneRecibidoPorValido` de
  `@/lib/reservas/validar-recibido-por`, `excedeTamanioMaximo`/
  `MAX_ARCHIVO_MB` de `@/lib/storage/validar-tamanio-archivo`,
  `construirParamsPreservados` (ya definida en el mismo archivo),
  `requireAdministrador` de `@/lib/auth/require-admin`.

Una sola tarea: la Server Action y la página comparten el mismo contrato
de campos que ya define `reservarLote`/`reservar/page.tsx` — no tiene
sentido dividirlas.

- [ ] **Step 1: Escribir el test e2e que falla**

Crear `tests/e2e/editar-reserva.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

async function crearLoteReservado(identificador: string, acreedorId: string) {
  const admin = createAdminClient()
  const { data: lote, error } = await admin
    .from('lotes')
    .insert({ identificador, moneda: 'USD', estado: 'disponible', acreedor_id: acreedorId })
    .select('id')
    .single()
  if (error || !lote) throw new Error(`No se pudo crear el lote: ${error?.message}`)

  const { error: errorReserva } = await admin.from('reservas').insert({
    lote_id: lote.id,
    nombre_completo: 'Comprador Original',
    dni: '11111111',
    domicilio: 'Calle Falsa 123',
    email: 'original@sima-e2e.invalid',
    telefono: '3511111111',
    estado_civil: 'soltero',
    monto_sena: 500,
    moneda_sena: 'USD',
    comprobante_sena_path: 'reservas/seed/comprobante-original.pdf',
    dni_frente_path: 'reservas/seed/dni-frente-original.pdf',
    dni_dorso_path: 'reservas/seed/dni-dorso-original.pdf',
  })
  if (errorReserva) throw new Error(`No se pudo crear la reserva: ${errorReserva.message}`)

  await admin.from('lotes').update({ estado: 'reservado' }).eq('id', lote.id)

  return lote.id as string
}

test.describe('Editar reserva ya cargada', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('editar campos de texto persiste y no toca los archivos originales', async ({ page }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservado(`E2E Editar Reserva Texto ${Date.now()}`, fixtures.acreedorConDatos.id)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar/editar`)

    await expect(page.getByPlaceholder('Nombre completo')).toHaveValue('Comprador Original')
    await page.getByPlaceholder('Teléfono').fill('3512222222')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await page.waitForURL(`**/admin/lotes/${loteId}`)

    const { data: reserva } = await admin
      .from('reservas')
      .select('telefono, comprobante_sena_path, dni_frente_path')
      .eq('lote_id', loteId)
      .is('cancelada_at', null)
      .single()

    expect(reserva?.telefono).toBe('3512222222')
    expect(reserva?.comprobante_sena_path).toBe('reservas/seed/comprobante-original.pdf')
    expect(reserva?.dni_frente_path).toBe('reservas/seed/dni-frente-original.pdf')
  })

  test('reemplazar el comprobante sube uno nuevo y cambia el path guardado', async ({ page }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservado(`E2E Editar Reserva Archivo ${Date.now()}`, fixtures.acreedorConDatos.id)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar/editar`)

    await page.setInputFiles('input[name="comprobante"]', {
      name: `comprobante-nuevo-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await page.waitForURL(`**/admin/lotes/${loteId}`)

    const { data: reserva } = await admin
      .from('reservas')
      .select('comprobante_sena_path')
      .eq('lote_id', loteId)
      .is('cancelada_at', null)
      .single()

    expect(reserva?.comprobante_sena_path).not.toBe('reservas/seed/comprobante-original.pdf')
    expect(reserva?.comprobante_sena_path).toBeTruthy()

    await page.goto(`/admin/lotes/${loteId}`)
    await expect(page.getByRole('link', { name: 'Ver comprobante de la seña' })).toBeVisible()
  })

  test('cambiar a "casado" sin DNI del cónyuge (nuevo ni existente) es rechazado', async ({ page }) => {
    const loteId = await crearLoteReservado(`E2E Editar Reserva Casado Rechazo ${Date.now()}`, fixtures.acreedorConDatos.id)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar/editar`)

    await page.selectOption('select[name="estadoCivil"]', 'casado')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()

    await expect(page.getByText('Subí el DNI del cónyuge')).toBeVisible()
  })

  test('cambiar a "casado" cuando ya había un DNI del cónyuge guardado no exige uno nuevo', async ({ page }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservado(`E2E Editar Reserva Casado OK ${Date.now()}`, fixtures.acreedorConDatos.id)
    await admin
      .from('reservas')
      .update({ dni_conyuge_path: 'reservas/seed/dni-conyuge-original.pdf' })
      .eq('lote_id', loteId)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar/editar`)

    await page.selectOption('select[name="estadoCivil"]', 'casado')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await page.waitForURL(`**/admin/lotes/${loteId}`)

    const { data: reserva } = await admin
      .from('reservas')
      .select('estado_civil, dni_conyuge_path')
      .eq('lote_id', loteId)
      .is('cancelada_at', null)
      .single()

    expect(reserva?.estado_civil).toBe('casado')
    expect(reserva?.dni_conyuge_path).toBe('reservas/seed/dni-conyuge-original.pdf')
  })

  test('un lote que no está reservado muestra un aviso en vez del formulario', async ({ page }) => {
    const admin = createAdminClient()
    const { data: loteDisponible } = await admin
      .from('lotes')
      .insert({ identificador: `E2E Editar Reserva No Reservado ${Date.now()}`, moneda: 'USD', estado: 'disponible' })
      .select('id')
      .single()

    try {
      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto(`/admin/lotes/${loteDisponible!.id}/reservar/editar`)

      await expect(page.getByText(/no está disponible para editar|no está reservado/)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0)
    } finally {
      await admin.from('lotes').delete().eq('id', loteDisponible!.id)
    }
  })

  test('un acreedor no puede acceder a editar reserva', async ({ page }) => {
    const loteId = await crearLoteReservado(`E2E Editar Reserva Sin Acceso ${Date.now()}`, fixtures.acreedorConDatos.id)

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar/editar`)

    await expect(page).not.toHaveURL(`**/admin/lotes/${loteId}/reservar/editar`)
  })

  test('los datos de texto se preservan si falla la validación', async ({ page }) => {
    const loteId = await crearLoteReservado(`E2E Editar Reserva Preservar ${Date.now()}`, fixtures.acreedorConDatos.id)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar/editar`)

    await page.getByPlaceholder('Nombre completo').fill('Nombre Corregido')
    await page.selectOption('select[name="estadoCivil"]', 'casado')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()

    await expect(page.getByText('Subí el DNI del cónyuge')).toBeVisible()
    await expect(page.getByPlaceholder('Nombre completo')).toHaveValue('Nombre Corregido')
  })
})
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `npx playwright test tests/e2e/editar-reserva.spec.ts --project=chromium`
Expected: FAIL — la ruta `/admin/lotes/[id]/reservar/editar` todavía no
existe (404), y `actualizarReserva` no existe.

- [ ] **Step 3: Extraer las 3 constantes de validación en `reservar/actions.ts`**

Ubicar, dentro de `reservarLote`, este bloque:

```ts
  const ESTADOS_CIVILES_VALIDOS = ['soltero', 'casado', 'divorciado', 'viudo']
  const MONEDAS_VALIDAS = ['USD', 'ARS']
  const INSTRUMENTACIONES_VALIDAS = ['boleto', 'escritura']
```

Sacarlo de adentro de la función y ponerlo a nivel de módulo, justo debajo
de la declaración de `CAMPOS_PRESERVABLES` (arriba del archivo, antes de
`construirParamsPreservados`):

```ts
const ESTADOS_CIVILES_VALIDOS = ['soltero', 'casado', 'divorciado', 'viudo']
const MONEDAS_VALIDAS = ['USD', 'ARS']
const INSTRUMENTACIONES_VALIDAS = ['boleto', 'escritura']
```

`reservarLote` sigue usando los mismos 3 nombres sin ningún otro cambio —
ahora resueltos desde el ámbito del módulo en vez de locales a la
función.

- [ ] **Step 4: Agregar `redirectEditarConError` en `reservar/actions.ts`**

Justo debajo de la función `redirectConError` ya existente:

```ts
function redirectEditarConError(
  loteId: string,
  formData: FormData,
  mensaje: string
): never {
  const params = construirParamsPreservados(formData)
  params.set('error', mensaje)
  redirect(`/admin/lotes/${loteId}/reservar/editar?${params.toString()}`)
}
```

- [ ] **Step 5: Agregar `actualizarReserva` en `reservar/actions.ts`**

Al final del archivo, después de `reservarLote`. Importar
`requireAdministrador` además de `requireAccesoParaReservar` que ya está
importado (agregar al import existente de `@/lib/auth/require-admin`):

```ts
export async function actualizarReserva(loteId: string, formData: FormData) {
  await requireAdministrador()

  const admin = createAdminClient()

  const { data: loteActual } = await admin
    .from('lotes')
    .select('estado')
    .eq('id', loteId)
    .single()

  if (!loteActual || loteActual.estado !== 'reservado') {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent(
        'Este lote no está reservado, no se puede editar la reserva'
      )}`
    )
  }

  const { data: reservaActual } = await admin
    .from('reservas')
    .select(
      'id, comprobante_sena_path, dni_frente_path, dni_dorso_path, dni_conyuge_path, sentencia_divorcio_path'
    )
    .eq('lote_id', loteId)
    .is('cancelada_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!reservaActual) {
    redirect(
      `/admin/lotes/${loteId}?error=${encodeURIComponent('No se encontró la reserva de este lote')}`
    )
  }

  const nombreCompleto = ((formData.get('nombreCompleto') as string) || '').trim()
  const dni = ((formData.get('dni') as string) || '').trim()
  const domicilio = ((formData.get('domicilio') as string) || '').trim()
  const email = ((formData.get('email') as string) || '').trim()
  const telefono = ((formData.get('telefono') as string) || '').trim()
  const telefonoAlternativo = ((formData.get('telefonoAlternativo') as string) || '').trim() || null
  const estadoCivil = ((formData.get('estadoCivil') as string) || '').trim()
  const instrumentacion = ((formData.get('instrumentacion') as string) || '').trim() || null
  const montoSena = Number(formData.get('montoSena'))
  const monedaSena = ((formData.get('monedaSena') as string) || '').trim()
  const recibidoPor = ((formData.get('recibidoPor') as string) || '').trim() || null
  const recibidoPorOtro = ((formData.get('recibidoPorOtro') as string) || '').trim() || null

  if (!tieneRecibidoPorValido({ recibidoPor, recibidoPorOtro })) {
    redirectEditarConError(loteId, formData, 'Indicá quién recibió la seña, de la lista o escribiendo el nombre')
  }

  const camposObligatoriosCompletos =
    nombreCompleto.trim() &&
    dni.trim() &&
    domicilio.trim() &&
    email.trim() &&
    telefono.trim() &&
    estadoCivil.trim() &&
    monedaSena.trim()

  if (!camposObligatoriosCompletos) {
    redirectEditarConError(loteId, formData, 'Completá todos los campos obligatorios')
  }

  if (!Number.isFinite(montoSena) || montoSena < 0 || montoSena > 999999999999.99) {
    redirectEditarConError(loteId, formData, 'El monto de la seña no puede ser negativo')
  }

  if (!ESTADOS_CIVILES_VALIDOS.includes(estadoCivil)) {
    redirectEditarConError(loteId, formData, 'Estado civil inválido')
  }

  if (!MONEDAS_VALIDAS.includes(monedaSena)) {
    redirectEditarConError(loteId, formData, 'Moneda de la seña inválida')
  }

  if (instrumentacion && !INSTRUMENTACIONES_VALIDAS.includes(instrumentacion)) {
    redirectEditarConError(loteId, formData, 'Instrumentación inválida')
  }

  async function subirArchivoSiCorresponde(
    campo: string,
    tipo: string,
    pathActual: string | null
  ): Promise<string | null> {
    const archivo = formData.get(campo) as File | null

    if (!archivo || archivo.size === 0) {
      return pathActual
    }

    if (excedeTamanioMaximo(archivo)) {
      redirectEditarConError(
        loteId,
        formData,
        `El archivo de "${tipo}" pesa más de ${MAX_ARCHIVO_MB} MB — subí uno más liviano.`
      )
    }

    const nombreSeguro = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `reservas/${loteId}/${tipo}-${Date.now()}-${nombreSeguro}`
    const { error } = await admin.storage.from('comprobantes').upload(filePath, archivo)

    if (error) {
      console.error(`Error al subir "${tipo}" al editar la reserva:`, error)
      redirectEditarConError(loteId, formData, `No se pudo subir el archivo de "${tipo}". Probá de nuevo.`)
    }

    return filePath
  }

  const comprobantePath = await subirArchivoSiCorresponde(
    'comprobante',
    'comprobante',
    reservaActual!.comprobante_sena_path
  )
  const dniFrentePath = await subirArchivoSiCorresponde(
    'dniFrente',
    'dni-frente',
    reservaActual!.dni_frente_path
  )
  const dniDorsoPath = await subirArchivoSiCorresponde('dniDorso', 'dni-dorso', reservaActual!.dni_dorso_path)
  const dniConyugePath = await subirArchivoSiCorresponde(
    'dniConyuge',
    'dni-conyuge',
    reservaActual!.dni_conyuge_path
  )
  const sentenciaDivorcioPath = await subirArchivoSiCorresponde(
    'sentenciaDivorcio',
    'sentencia-divorcio',
    reservaActual!.sentencia_divorcio_path
  )

  if (estadoCivil === 'casado' && !dniConyugePath) {
    redirectEditarConError(loteId, formData, 'Subí el DNI del cónyuge (elegiste "Casado/a")')
  }

  if (estadoCivil === 'divorciado' && !sentenciaDivorcioPath) {
    redirectEditarConError(loteId, formData, 'Subí la sentencia de divorcio (elegiste "Divorciado/a")')
  }

  const { error: errorUpdate } = await admin
    .from('reservas')
    .update({
      nombre_completo: nombreCompleto,
      dni,
      domicilio,
      email,
      telefono,
      telefono_alternativo: telefonoAlternativo,
      estado_civil: estadoCivil,
      instrumentacion,
      monto_sena: montoSena,
      moneda_sena: monedaSena,
      recibido_por: recibidoPor,
      recibido_por_otro: recibidoPorOtro,
      comprobante_sena_path: comprobantePath,
      dni_frente_path: dniFrentePath,
      dni_dorso_path: dniDorsoPath,
      dni_conyuge_path: dniConyugePath,
      sentencia_divorcio_path: sentenciaDivorcioPath,
    })
    .eq('id', reservaActual!.id)

  if (errorUpdate) {
    console.error('Error al actualizar la reserva:', errorUpdate)
    redirectEditarConError(loteId, formData, 'No se pudo guardar la reserva. Probá de nuevo.')
  }

  redirect(`/admin/lotes/${loteId}`)
}
```

Actualizar el import de `@/lib/auth/require-admin` al principio del
archivo para incluir `requireAdministrador`:

```ts
import { requireAccesoParaReservar, requireAdministrador } from '@/lib/auth/require-admin'
```

- [ ] **Step 6: Crear `app/admin/lotes/[id]/reservar/editar/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { actualizarReserva } from '../actions'

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
    telefono?: string
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
    nombreCompleto: nombreCompletoPreservado,
    dniPreservado,
    domicilio: domicilioPreservado,
    email: emailPreservado,
    telefono: telefonoPreservado,
    telefonoAlternativo: telefonoAlternativoPreservado,
    estadoCivil: estadoCivilPreservado,
    instrumentacion: instrumentacionPreservado,
    montoSena: montoSenaPreservado,
    monedaSena: monedaSenaPreservado,
    recibidoPor: recibidoPorPreservado,
    recibidoPorOtro: recibidoPorOtroPreservado,
  } = await searchParams

  await requireAdministrador()

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

  const { data: reserva } = await supabase
    .from('reservas')
    .select(
      'nombre_completo, dni, domicilio, email, telefono, telefono_alternativo, estado_civil, instrumentacion, monto_sena, moneda_sena, recibido_por, recibido_por_otro'
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

  const actualizarReservaConId = actualizarReserva.bind(null, id)

  return (
    <main className="max-w-md">
      <div className="mb-4 flex gap-4">
        <a href="/admin/lotes" className="text-sm underline">
          ← Volver a Lotes
        </a>
        <a href={`/admin/lotes/${id}`} className="text-sm underline">
          ← Volver al lote
        </a>
      </div>
      <h1 className="mb-6 text-xl font-semibold">Editar reserva — {lote!.identificador}</h1>

      {lote!.estado !== 'reservado' || !reserva ? (
        <p className="mb-4 rounded bg-amber-100 p-2 text-sm text-amber-800">
          Este lote no está reservado, no se puede editar la reserva (estado actual: {lote!.estado}).
        </p>
      ) : (
        <form action={actualizarReservaConId} className="flex flex-col gap-3">
          {error && <p className="rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}

          <input
            name="nombreCompleto"
            placeholder="Nombre completo"
            defaultValue={nombreCompletoPreservado ?? reserva.nombre_completo}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="dni"
            placeholder="DNI"
            defaultValue={dniPreservado ?? reserva.dni}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="domicilio"
            placeholder="Domicilio"
            defaultValue={domicilioPreservado ?? reserva.domicilio}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="email"
            type="email"
            placeholder="Email"
            defaultValue={emailPreservado ?? reserva.email}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="telefono"
            placeholder="Teléfono"
            defaultValue={telefonoPreservado ?? reserva.telefono}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="telefonoAlternativo"
            placeholder="Teléfono alternativo (opcional)"
            defaultValue={telefonoAlternativoPreservado ?? reserva.telefono_alternativo ?? ''}
            className="rounded border px-3 py-2"
          />

          <label className="text-sm">
            Estado civil
            <select
              name="estadoCivil"
              required
              defaultValue={estadoCivilPreservado ?? reserva.estado_civil}
              className="mt-1 block w-full rounded border px-3 py-2"
            >
              <option value="soltero">Soltero/a</option>
              <option value="casado">Casado/a</option>
              <option value="divorciado">Divorciado/a</option>
              <option value="viudo">Viudo/a</option>
            </select>
          </label>

          <label className="text-sm">
            Instrumentación prevista (opcional)
            <select
              name="instrumentacion"
              defaultValue={instrumentacionPreservado ?? reserva.instrumentacion ?? ''}
              className="mt-1 block w-full rounded border px-3 py-2"
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
            defaultValue={montoSenaPreservado ?? reserva.monto_sena}
            required
            className="rounded border px-3 py-2"
          />
          <label className="text-sm">
            Moneda de la seña
            <select
              name="monedaSena"
              required
              defaultValue={monedaSenaPreservado ?? reserva.moneda_sena}
              className="mt-1 block w-full rounded border px-3 py-2"
            >
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
            </select>
          </label>

          <label className="text-sm">
            Quién recibió la seña
            <select
              name="recibidoPor"
              defaultValue={recibidoPorPreservado ?? reserva.recibido_por ?? user!.id}
              className="mt-1 block w-full rounded border px-3 py-2"
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
            defaultValue={recibidoPorOtroPreservado ?? reserva.recibido_por_otro ?? ''}
            className="rounded border px-3 py-2"
          />

          <p className="text-sm text-gray-600">
            Los siguientes archivos solo se reemplazan si elegís uno nuevo — si dejás el campo vacío, se
            mantiene el que ya estaba subido.
          </p>

          <label className="text-sm">
            Comprobante de la seña (opcional, reemplaza el actual)
            <input name="comprobante" type="file" className="mt-1 block w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">
            DNI - frente (opcional, reemplaza el actual)
            <input name="dniFrente" type="file" className="mt-1 block w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">
            DNI - dorso (opcional, reemplaza el actual)
            <input name="dniDorso" type="file" className="mt-1 block w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">
            DNI del cónyuge (opcional, reemplaza el actual — obligatorio si el estado civil queda en
            &quot;Casado/a&quot; y todavía no había uno guardado)
            <input name="dniConyuge" type="file" className="mt-1 block w-full rounded border px-3 py-2" />
          </label>
          <label className="text-sm">
            Sentencia de divorcio (opcional, reemplaza el actual — obligatoria si el estado civil queda en
            &quot;Divorciado/a&quot; y todavía no había una guardada)
            <input name="sentenciaDivorcio" type="file" className="mt-1 block w-full rounded border px-3 py-2" />
          </label>

          <button type="submit" className="rounded bg-black px-3 py-2 text-white">
            Guardar cambios
          </button>
        </form>
      )}
    </main>
  )
}
```

- [ ] **Step 7: Agregar el link en `app/admin/lotes/[id]/page.tsx`**

Ubicar este bloque (dentro del `<div className="flex gap-2">` del header):

```tsx
          {perfilPropio!.role === 'administrador' && lote!.estado === 'reservado' && (
            <BotonCancelarReserva cancelarReservaAction={cancelarReservaConId} />
          )}
```

Reemplazarlo por:

```tsx
          {perfilPropio!.role === 'administrador' && lote!.estado === 'reservado' && (
            <>
              <a
                href={`/admin/lotes/${id}/reservar/editar`}
                className="rounded border px-3 py-2 text-sm underline"
              >
                Editar reserva →
              </a>
              <BotonCancelarReserva cancelarReservaAction={cancelarReservaConId} />
            </>
          )}
```

- [ ] **Step 8: Correr el test nuevo para confirmar que pasa**

Run: `npx playwright test tests/e2e/editar-reserva.spec.ts --project=chromium`
Expected: PASS — 7/7.

- [ ] **Step 9: Correr la regresión de reservar/lote**

Run: `npx playwright test tests/e2e/preservar-datos-reserva.spec.ts tests/e2e/pase-a-vendido.spec.ts tests/e2e/lote-participantes.spec.ts --project=chromium`
Expected: PASS. Estos specs ejercitan `reservar/actions.ts` (compartido)
y el header del detalle del lote modificado en el Step 7 — no deberían
romperse.

- [ ] **Step 10: `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 11: Commit**

```bash
git add "app/admin/lotes/[id]/reservar/actions.ts" "app/admin/lotes/[id]/reservar/editar/page.tsx" "app/admin/lotes/[id]/page.tsx" tests/e2e/editar-reserva.spec.ts
git commit -m "feat: editar una reserva ya cargada (texto y archivos opcionales)"
```
