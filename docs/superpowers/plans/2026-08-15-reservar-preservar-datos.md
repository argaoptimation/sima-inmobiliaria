# Reservar — preservar datos tipeados si falta un campo obligatorio — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para seguimiento.

**Goal:** Que ningún dato tipeado en el formulario de reservar se pierda
cuando falta un campo obligatorio — hoy el formulario vuelve
completamente vacío tras cualquier error de validación.

**Architecture:** Todos los redirects de validación que ocurren ANTES del
claim atómico del lote (marcarlo `disponible` → `reservado`) pasan a armar
la URL de vuelta con un helper compartido que agrega, como query params,
los 12 campos de texto/select ya tipeados. La página los lee y los usa
como `defaultValue`, con precedencia sobre el precargado por el buscador
de DNI. Los redirects que ocurren DESPUÉS del claim (lote ya no
disponible, falla una subida, falla el insert) no se tocan.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Playwright (e2e).

## Global Constraints

- Campos preservados (12): `nombreCompleto`, `dni`, `domicilio`, `email`,
  `telefono`, `telefonoAlternativo`, `estadoCivil`, `instrumentacion`,
  `montoSena`, `monedaSena`, `recibidoPor`, `recibidoPorOtro`.
- El campo `dni` preservado usa el query param `dniPreservado` — el
  nombre `dni` ya está tomado por el buscador de cliente por DNI
  (`?dni=X`), y reusarlo dispararía el bloque de búsqueda por error.
  Todos los demás campos reusan el mismo nombre que su input de
  formulario (sin colisión).
- Los 5 campos de archivo (`comprobante`, `dniFrente`, `dniDorso`,
  `dniConyuge`, `sentenciaDivorcio`) NO se preservan — imposible sin
  JavaScript de cliente, limitación aceptada.
- Precedencia de cada `defaultValue`: valor preservado por error > valor
  precargado por el buscador de DNI (`clienteEncontrado`) > valor por
  defecto actual (vacío, `'USD'`, el usuario logueado, etc., según cada
  campo).
- Un campo se preserva aunque su valor tipeado sea una cadena vacía (ej.
  "recibido por" en blanco cuando se eligió "no está en la lista") — la
  distinción entre "no se tocó este campo" (sin error todavía) y "se
  tocó y quedó vacío" (tras un error) importa, así que el chequeo es
  `formData.has(campo)`, no si el valor es truthy.
- Nota de contexto: la pieza anterior de esta misma tanda (límite de
  tamaño de archivo) ya agregó 5 redirects nuevos en este mismo archivo
  (uno por cada campo de archivo que excede 15 MB). Estos 5 también son
  pre-claim y también tienen que preservar los 12 campos — el total de
  redirects pre-claim a modificar es 15, no 9 (el número que tenía la
  spec cuando se escribió, antes de que la pieza anterior se ejecutara).
  Los redirects post-claim (7 en total: lote ya no disponible, y las 5
  fallas de subida + la falla de insert de la reserva) no se tocan.

---

## Task 1: Preservar los 12 campos en todos los redirects de validación

**Files:**
- Modify: `app/admin/lotes/[id]/reservar/actions.ts` (reemplazo completo)
- Modify: `app/admin/lotes/[id]/reservar/page.tsx` (reemplazo completo)
- Test: `tests/e2e/preservar-datos-reserva.spec.ts` (nuevo)

**Interfaces:**
- Produces: `construirParamsPreservados(formData: FormData): URLSearchParams`
  y `redirectConError(loteId: string, formData: FormData, mensaje: string): never`,
  funciones internas de `actions.ts` (no exportadas, no las consume
  ningún otro archivo).

Esta tarea es una sola porque los 15 redirects de `actions.ts` y los 12
`defaultValue` de `page.tsx` están fuertemente acoplados — revisar la
mitad de los query params preservados sin la otra mitad dejaría el
archivo en un estado a medio camino que no tiene sentido probar por
separado.

- [ ] **Step 1: Escribir los tests e2e que fallan**

Crear `tests/e2e/preservar-datos-reserva.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

async function crearLoteDisponible(identificador: string) {
  const admin = createAdminClient()
  const { data: lote, error } = await admin
    .from('lotes')
    .insert({ identificador, moneda: 'USD', estado: 'disponible' })
    .select('id')
    .single()

  if (error || !lote) {
    throw new Error(`No se pudo crear el lote de prueba: ${error?.message}`)
  }

  return lote.id as string
}

test.describe('Preservar datos tipeados si falta un campo obligatorio al reservar', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('si falta un campo obligatorio, los demás campos tipeados no se pierden', async ({ page }) => {
    const loteId = await crearLoteDisponible(`E2E Preservar Datos ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)

    await page.getByPlaceholder('Nombre completo').fill('Comprador Preservado')
    await page.getByPlaceholder('DNI', { exact: true }).fill('30222333')
    await page.getByPlaceholder('Domicilio').fill('Calle Preservada 456')
    // Deliberadamente sin completar el email -- falta un campo obligatorio.
    await page.getByPlaceholder('Teléfono', { exact: true }).fill('3511112222')
    await page.selectOption('select[name="estadoCivil"]', 'soltero')
    await page.getByPlaceholder('Monto de la seña').fill('750')
    await page.setInputFiles('input[name="comprobante"]', {
      name: `e2e-comprobante-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    await page.setInputFiles('input[name="dniFrente"]', {
      name: `e2e-dni-frente-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    await page.setInputFiles('input[name="dniDorso"]', {
      name: `e2e-dni-dorso-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })

    await page.getByRole('button', { name: 'Confirmar reserva' }).click()

    await expect(page.getByText('Completá todos los campos obligatorios')).toBeVisible()
    await expect(page.getByPlaceholder('Nombre completo')).toHaveValue('Comprador Preservado')
    await expect(page.getByPlaceholder('DNI', { exact: true })).toHaveValue('30222333')
    await expect(page.getByPlaceholder('Domicilio')).toHaveValue('Calle Preservada 456')
    await expect(page.getByPlaceholder('Teléfono', { exact: true })).toHaveValue('3511112222')
    await expect(page.getByPlaceholder('Monto de la seña')).toHaveValue('750')
  })

  test('los datos precargados por el buscador de DNI se preservan si después falta un campo obligatorio', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const dni = `${Date.now()}`.slice(-8)
    const email = `cliente.preservar.${Date.now()}@sima-e2e.invalid`

    const { data: invited } = await admin.auth.admin.inviteUserByEmail(email)
    await admin.from('profiles').insert({
      id: invited!.user.id,
      role: 'cliente',
      full_name: 'Cliente Preservado',
      email,
      dni,
      domicilio: 'Domicilio Precargado 999',
      telefono: '3518888888',
    })

    const loteId = await crearLoteDisponible(`E2E Preservar Con Buscador ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await page.getByPlaceholder('Buscar cliente por DNI').fill(dni)
    await page.getByRole('button', { name: 'Buscar' }).click()

    await expect(page.getByPlaceholder('Nombre completo')).toHaveValue('Cliente Preservado')

    // Sin subir el comprobante -- dispara el primer error real del
    // formulario sin haber tocado ningún otro campo.
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()

    await expect(page.getByText('Subí el comprobante de la seña')).toBeVisible()
    await expect(page.getByPlaceholder('Nombre completo')).toHaveValue('Cliente Preservado')
    await expect(page.getByPlaceholder('DNI', { exact: true })).toHaveValue(dni)
    await expect(page.getByPlaceholder('Domicilio')).toHaveValue('Domicilio Precargado 999')
    await expect(page.getByPlaceholder('Email')).toHaveValue(email)
    await expect(page.getByPlaceholder('Teléfono', { exact: true })).toHaveValue('3518888888')
  })
})
```

- [ ] **Step 2: Correr los tests para confirmar que fallan**

Run: `npx playwright test tests/e2e/preservar-datos-reserva.spec.ts --project=chromium`
Expected: FAIL — hoy, tras cualquier error, todos los inputs de texto
vuelven vacíos (`toHaveValue('Comprador Preservado')` etc. fallan).

- [ ] **Step 3: Reemplazar `app/admin/lotes/[id]/reservar/actions.ts` completo**

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAccesoParaReservar } from '@/lib/auth/require-admin'
import { tieneRecibidoPorValido } from '@/lib/reservas/validar-recibido-por'
import { vendedorIdAlReservar } from '@/lib/lotes/asignar-vendedor-al-reservar'
import { excedeTamanioMaximo, MAX_ARCHIVO_MB } from '@/lib/storage/validar-tamanio-archivo'

const CAMPOS_PRESERVABLES: Array<[string, string]> = [
  ['nombreCompleto', 'nombreCompleto'],
  ['dniPreservado', 'dni'],
  ['domicilio', 'domicilio'],
  ['email', 'email'],
  ['telefono', 'telefono'],
  ['telefonoAlternativo', 'telefonoAlternativo'],
  ['estadoCivil', 'estadoCivil'],
  ['instrumentacion', 'instrumentacion'],
  ['montoSena', 'montoSena'],
  ['monedaSena', 'monedaSena'],
  ['recibidoPor', 'recibidoPor'],
  ['recibidoPorOtro', 'recibidoPorOtro'],
]

function construirParamsPreservados(formData: FormData): URLSearchParams {
  const params = new URLSearchParams()

  for (const [nombreParam, nombreCampo] of CAMPOS_PRESERVABLES) {
    if (formData.has(nombreCampo)) {
      params.set(nombreParam, (formData.get(nombreCampo) as string) || '')
    }
  }

  return params
}

function redirectConError(loteId: string, formData: FormData, mensaje: string): never {
  const params = construirParamsPreservados(formData)
  params.set('error', mensaje)
  redirect(`/admin/lotes/${loteId}/reservar?${params.toString()}`)
}

export async function reservarLote(loteId: string, formData: FormData) {
  await requireAccesoParaReservar(loteId)

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: perfilPropio } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

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
  const comprobante = formData.get('comprobante') as File
  const dniFrente = formData.get('dniFrente') as File
  const dniDorso = formData.get('dniDorso') as File
  const dniConyuge = formData.get('dniConyuge') as File | null
  const sentenciaDivorcio = formData.get('sentenciaDivorcio') as File | null

  if (!tieneRecibidoPorValido({ recibidoPor, recibidoPorOtro })) {
    redirectConError(loteId, formData, 'Indicá quién recibió la seña, de la lista o escribiendo el nombre')
  }

  if (!comprobante || comprobante.size === 0) {
    redirectConError(loteId, formData, 'Subí el comprobante de la seña')
  }

  if (excedeTamanioMaximo(comprobante)) {
    redirectConError(
      loteId,
      formData,
      `El comprobante de la seña pesa más de ${MAX_ARCHIVO_MB} MB — subí uno más liviano.`
    )
  }

  if (!dniFrente || dniFrente.size === 0 || !dniDorso || dniDorso.size === 0) {
    redirectConError(loteId, formData, 'Subí las fotos del DNI (frente y dorso)')
  }

  if (excedeTamanioMaximo(dniFrente)) {
    redirectConError(
      loteId,
      formData,
      `La foto del DNI (frente) pesa más de ${MAX_ARCHIVO_MB} MB — subí una más liviana.`
    )
  }

  if (excedeTamanioMaximo(dniDorso)) {
    redirectConError(
      loteId,
      formData,
      `La foto del DNI (dorso) pesa más de ${MAX_ARCHIVO_MB} MB — subí una más liviana.`
    )
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
    redirectConError(loteId, formData, 'Completá todos los campos obligatorios')
  }

  if (!Number.isFinite(montoSena) || montoSena < 0 || montoSena > 999999999999.99) {
    redirectConError(loteId, formData, 'El monto de la seña no puede ser negativo')
  }

  const ESTADOS_CIVILES_VALIDOS = ['soltero', 'casado', 'divorciado', 'viudo']
  const MONEDAS_VALIDAS = ['USD', 'ARS']
  const INSTRUMENTACIONES_VALIDAS = ['boleto', 'escritura']

  if (!ESTADOS_CIVILES_VALIDOS.includes(estadoCivil)) {
    redirectConError(loteId, formData, 'Estado civil inválido')
  }

  if (estadoCivil === 'casado' && (!dniConyuge || dniConyuge.size === 0)) {
    redirectConError(loteId, formData, 'Subí el DNI del cónyuge (elegiste "Casado/a")')
  }

  if (dniConyuge && dniConyuge.size > 0 && excedeTamanioMaximo(dniConyuge)) {
    redirectConError(
      loteId,
      formData,
      `La foto del DNI del cónyuge pesa más de ${MAX_ARCHIVO_MB} MB — subí una más liviana.`
    )
  }

  if (estadoCivil === 'divorciado' && (!sentenciaDivorcio || sentenciaDivorcio.size === 0)) {
    redirectConError(loteId, formData, 'Subí la sentencia de divorcio (elegiste "Divorciado/a")')
  }

  if (sentenciaDivorcio && sentenciaDivorcio.size > 0 && excedeTamanioMaximo(sentenciaDivorcio)) {
    redirectConError(
      loteId,
      formData,
      `La sentencia de divorcio pesa más de ${MAX_ARCHIVO_MB} MB — subí una más liviana.`
    )
  }

  if (!MONEDAS_VALIDAS.includes(monedaSena)) {
    redirectConError(loteId, formData, 'Moneda de la seña inválida')
  }

  if (instrumentacion && !INSTRUMENTACIONES_VALIDAS.includes(instrumentacion)) {
    redirectConError(loteId, formData, 'Instrumentación inválida')
  }

  const admin = createAdminClient()

  const nuevoVendedorId = vendedorIdAlReservar(perfilPropio!.role, user!.id)

  // Claim atomico: el update solo pega si el lote SIGUE disponible en este
  // instante (mismo patron que el claim de pagos en confirmarPago /
  // subirComprobante). Si alguien lo reservo un segundo antes, esto no
  // afecta ninguna fila y lo tratamos como "ya no disponible".
  const { data: loteReservado, error: errorLote } = await admin
    .from('lotes')
    .update({
      estado: 'reservado',
      ...(nuevoVendedorId ? { vendedor_id: nuevoVendedorId } : {}),
    })
    .eq('id', loteId)
    .eq('estado', 'disponible')
    .select('id, admin_id, acreedor_id, cuenta_cobro_id')
    .single()

  if (errorLote || !loteReservado) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent(
        'Este lote ya no está disponible para reservar'
      )}`
    )
  }

  // Si se reasignó vendedor_id y la cuenta de cobro apuntaba al vendedor que
  // acabamos de reemplazar (no al admin ni al acreedor), queda apuntando a
  // alguien ya no asociado al lote. La limpiamos best-effort: la reserva ya
  // quedó tomada, esto no debe hacer fallar el flujo principal.
  if (
    nuevoVendedorId &&
    loteReservado.cuenta_cobro_id &&
    loteReservado.cuenta_cobro_id !== loteReservado.admin_id &&
    loteReservado.cuenta_cobro_id !== loteReservado.acreedor_id
  ) {
    const { error: errorLimpiarCuentaCobro } = await admin
      .from('lotes')
      .update({ cuenta_cobro_id: null })
      .eq('id', loteId)

    if (errorLimpiarCuentaCobro) {
      console.error(
        'No se pudo limpiar cuenta_cobro_id tras reasignar vendedor:',
        errorLimpiarCuentaCobro
      )
    }
  }

  const nombreArchivoSeguro = comprobante.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const comprobantePath = `reservas/${loteId}/${Date.now()}-${nombreArchivoSeguro}`

  const { error: errorUpload } = await admin.storage
    .from('comprobantes')
    .upload(comprobantePath, comprobante)

  if (errorUpload) {
    console.error('Error al subir el comprobante de la seña:', errorUpload)
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('No se pudo subir el comprobante. Probá de nuevo.')}`
    )
  }

  async function subirArchivoReserva(archivo: File, tipo: string) {
    const nombreSeguro = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `reservas/${loteId}/${tipo}-${Date.now()}-${nombreSeguro}`
    const { error } = await admin.storage.from('comprobantes').upload(filePath, archivo)
    return { filePath, error }
  }

  const { filePath: dniFrentePath, error: errorDniFrente } = await subirArchivoReserva(
    dniFrente,
    'dni-frente'
  )
  if (errorDniFrente) {
    console.error('Error al subir el DNI frente:', errorDniFrente)
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('No se pudo subir el DNI (frente). Probá de nuevo.')}`
    )
  }

  const { filePath: dniDorsoPath, error: errorDniDorso } = await subirArchivoReserva(
    dniDorso,
    'dni-dorso'
  )
  if (errorDniDorso) {
    console.error('Error al subir el DNI dorso:', errorDniDorso)
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('No se pudo subir el DNI (dorso). Probá de nuevo.')}`
    )
  }

  let dniConyugePath: string | null = null
  if (dniConyuge && dniConyuge.size > 0) {
    const { filePath, error: errorDniConyuge } = await subirArchivoReserva(dniConyuge, 'dni-conyuge')
    if (errorDniConyuge) {
      console.error('Error al subir el DNI del cónyuge:', errorDniConyuge)
      redirect(
        `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('No se pudo subir el DNI del cónyuge. Probá de nuevo.')}`
      )
    }
    dniConyugePath = filePath
  }

  let sentenciaDivorcioPath: string | null = null
  if (sentenciaDivorcio && sentenciaDivorcio.size > 0) {
    const { filePath, error: errorSentencia } = await subirArchivoReserva(
      sentenciaDivorcio,
      'sentencia-divorcio'
    )
    if (errorSentencia) {
      console.error('Error al subir la sentencia de divorcio:', errorSentencia)
      redirect(
        `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('No se pudo subir la sentencia de divorcio. Probá de nuevo.')}`
      )
    }
    sentenciaDivorcioPath = filePath
  }

  const { error: errorReserva } = await admin.from('reservas').insert({
    lote_id: loteId,
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
    created_by: user!.id,
  })

  if (errorReserva) {
    console.error('Error al guardar la reserva:', errorReserva)
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('No se pudo guardar la reserva. Probá de nuevo.')}`
    )
  }

  redirect('/admin/lotes')
}
```

- [ ] **Step 4: Reemplazar `app/admin/lotes/[id]/reservar/page.tsx` completo**

```tsx
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { requireAccesoParaReservar } from '@/lib/auth/require-admin'
import { reservarLote } from './actions'

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
    dni: dniBuscado,
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
    telefono: string | null
    email: string | null
  } | null = null

  if (dniBuscado) {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, dni, domicilio, telefono, email')
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

  return (
    <main className="max-w-md">
      <a href="/admin/lotes" className="mb-4 inline-block text-sm underline">
        ← Volver a Lotes
      </a>
      <h1 className="mb-6 text-xl font-semibold">Reservar {lote!.identificador}</h1>

      {lote!.estado !== 'disponible' ? (
        <p className="mb-4 rounded bg-amber-100 p-2 text-sm text-amber-800">
          Este lote ya no está disponible para reservar (estado actual: {lote!.estado}).
        </p>
      ) : (
        <>
        <form method="GET" className="mb-4 flex gap-2">
          <input
            name="dni"
            placeholder="Buscar cliente por DNI"
            defaultValue={dniBuscado ?? ''}
            className="flex-1 rounded border px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded border px-3 py-2 text-sm">
            Buscar
          </button>
        </form>

        {dniBuscado &&
          (clienteEncontrado ? (
            <p className="mb-4 rounded bg-green-100 p-2 text-sm text-green-800">
              Encontramos a {clienteEncontrado.full_name} con este DNI. Sus datos se precargaron abajo
              — revisalos antes de confirmar.
            </p>
          ) : (
            <p className="mb-4 rounded bg-gray-100 p-2 text-sm text-gray-700">
              No encontramos ningún cliente con ese DNI — completá los datos manualmente.
            </p>
          ))}

        <form action={reservarLoteConId} className="flex flex-col gap-3">
          {error && <p className="rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}

          <input
            name="nombreCompleto"
            placeholder="Nombre completo"
            defaultValue={nombreCompletoPreservado ?? clienteEncontrado?.full_name ?? ''}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="dni"
            placeholder="DNI"
            defaultValue={dniPreservado ?? clienteEncontrado?.dni ?? dniBuscado ?? ''}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="domicilio"
            placeholder="Domicilio"
            defaultValue={domicilioPreservado ?? clienteEncontrado?.domicilio ?? ''}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="email"
            type="email"
            placeholder="Email"
            defaultValue={emailPreservado ?? clienteEncontrado?.email ?? ''}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="telefono"
            placeholder="Teléfono"
            defaultValue={telefonoPreservado ?? clienteEncontrado?.telefono ?? ''}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="telefonoAlternativo"
            placeholder="Teléfono alternativo (opcional)"
            defaultValue={telefonoAlternativoPreservado ?? ''}
            className="rounded border px-3 py-2"
          />

          <label className="text-sm">
            Estado civil
            <select
              name="estadoCivil"
              required
              defaultValue={estadoCivilPreservado}
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
              defaultValue={instrumentacionPreservado ?? ''}
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
            defaultValue={montoSenaPreservado ?? ''}
            required
            className="rounded border px-3 py-2"
          />
          <label className="text-sm">
            Moneda de la seña
            <select
              name="monedaSena"
              required
              defaultValue={monedaSenaPreservado ?? 'USD'}
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
              defaultValue={recibidoPorPreservado ?? user!.id}
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
            defaultValue={recibidoPorOtroPreservado ?? ''}
            className="rounded border px-3 py-2"
          />

          <label className="text-sm">
            Comprobante de la seña
            <input
              name="comprobante"
              type="file"
              required
              className="mt-1 block w-full rounded border px-3 py-2"
            />
          </label>

          <label className="text-sm">
            DNI - frente
            <input
              name="dniFrente"
              type="file"
              className="mt-1 block w-full rounded border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            DNI - dorso
            <input
              name="dniDorso"
              type="file"
              className="mt-1 block w-full rounded border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            DNI del cónyuge (solo si elegiste &quot;Casado/a&quot; arriba)
            <input
              name="dniConyuge"
              type="file"
              className="mt-1 block w-full rounded border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Sentencia de divorcio (solo si elegiste &quot;Divorciado/a&quot; arriba)
            <input
              name="sentenciaDivorcio"
              type="file"
              className="mt-1 block w-full rounded border px-3 py-2"
            />
          </label>

          <button type="submit" className="rounded bg-black px-3 py-2 text-white">
            Confirmar reserva
          </button>
        </form>
        </>
      )}
    </main>
  )
}
```

- [ ] **Step 5: Correr los tests nuevos para confirmar que pasan**

Run: `npx playwright test tests/e2e/preservar-datos-reserva.spec.ts --project=chromium`
Expected: PASS — 2/2.

- [ ] **Step 6: Correr los tests e2e existentes de reserva para confirmar que no se rompió nada**

Run: `npx playwright test tests/e2e/reserva-lote.spec.ts tests/e2e/fotos-reserva.spec.ts tests/e2e/buscar-cliente-dni.spec.ts tests/e2e/pase-a-vendido.spec.ts tests/e2e/limite-tamanio-archivo.spec.ts --project=chromium`
Expected: PASS — sin cambios de comportamiento no buscados. Estos specs
ejercitan la misma página y el mismo archivo de acciones, así que son la
red de seguridad principal de esta tarea.

- [ ] **Step 7: `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add "app/admin/lotes/[id]/reservar/actions.ts" "app/admin/lotes/[id]/reservar/page.tsx" tests/e2e/preservar-datos-reserva.spec.ts
git commit -m "feat: preservar datos tipeados al reservar si falta un campo obligatorio"
```
