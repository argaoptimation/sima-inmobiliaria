# Vender — cuota manual con balance + documento firmado obligatorio — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para seguimiento.

**Goal:** Al vender un lote, exigir un documento firmado (boleto o
escritura) siempre, y permitir cargar el monto de cada cuota a mano (en
vez del cálculo automático) mostrando el balance contra el precio de
lista antes de confirmar.

**Architecture:** El formulario de vender gana un selector Automático/
Manual. Automático sigue siendo un único submit (más el documento, ahora
obligatorio). Manual necesita 2 pasos adicionales por redirect —cargar
los montos + subir el documento, después confirmar viendo el balance—
reusando el mismo mecanismo de preservar datos vía query params que ya
usa esta página para "cliente existente". Los dos mecanismos de redirect
(cliente existente / pasos del modo manual) conviven sin pisarse.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Supabase
(Postgres + Storage), Vitest (unitarios), Playwright (e2e).

## Global Constraints

- El documento firmado es SIEMPRE obligatorio para vender, sea modo
  automático o manual. Un solo campo genérico ("Documento firmado (boleto
  de compraventa o escritura)"), sin selector de tipo.
- El input de archivo del documento NO lleva `required` en el HTML — su
  exigencia real depende del paso (100% validado en el servidor).
- Modo manual no exige que la suma de las cuotas coincida con el precio
  de lista — se muestra la diferencia para que Nicolás la vea, pero no
  bloquea la venta.
- `lotes.monto_cuota_base` se guarda `null` cuando el modo es manual (no
  hay un "monto base" único que tenga sentido ahí).
- El documento se sube UNA sola vez (en el paso de carga de montos, modo
  manual; en el único submit, modo automático) — nunca se vuelve a pedir
  en el paso de confirmación de balance.
- Depende de `lib/storage/validar-tamanio-archivo.ts` (`excedeTamanioMaximo`,
  `MAX_ARCHIVO_MB`), ya construido en una pieza anterior de esta misma
  tanda — el nuevo upload lo usa desde el primer momento.
- El chequeo de "cliente existente por email" sigue exactamente en el
  mismo lugar y con la misma lógica que hoy — solo se le agrega `modo` a
  los datos que preserva en su redirect.

---

## Task 1: Migración + `generarCuotasManual`

**Files:**
- Create: `supabase/migrations/0020_lotes_documento_firmado.sql`
- Modify: `lib/lotes/generar-cuotas.ts`
- Test: `lib/lotes/generar-cuotas.test.ts`

**Interfaces:**
- Produces: `generarCuotasManual(montos: number[], fechaPrimeraCuota: string): CuotaGenerada[]`,
  exportada desde `lib/lotes/generar-cuotas.ts` junto a la ya existente
  `generarCuotas`. Consumida por la Task 2.

- [ ] **Step 1: Aplicar la migración**

Crear `supabase/migrations/0020_lotes_documento_firmado.sql`:

```sql
alter table public.lotes
  add column documento_firmado_path text;
```

Aplicar con `mcp__supabase__apply_migration` (nombre `lotes_documento_firmado`,
mismo contenido de arriba) contra el proyecto del `.env.local` del repo —
verificar primero con `mcp__supabase__get_project_url` que coincide con
`NEXT_PUBLIC_SUPABASE_URL` de `.env.local` antes de aplicar nada.

- [ ] **Step 2: Escribir el test que falla**

```ts
// lib/lotes/generar-cuotas.test.ts — agregar al final del describe existente,
// o en un describe nuevo en el mismo archivo:
describe('generarCuotasManual', () => {
  it('arma las cuotas con los montos dados, una por mes, sin ajustar nada', () => {
    const cuotas = generarCuotasManual([1200, 1200, 1000, 1000, 800], '2026-08-01')

    expect(cuotas).toEqual([
      { numero: 1, montoBase: 1200, fechaVencimiento: '2026-08-01' },
      { numero: 2, montoBase: 1200, fechaVencimiento: '2026-09-01' },
      { numero: 3, montoBase: 1000, fechaVencimiento: '2026-10-01' },
      { numero: 4, montoBase: 1000, fechaVencimiento: '2026-11-01' },
      { numero: 5, montoBase: 800, fechaVencimiento: '2026-12-01' },
    ])
  })

  it('la suma de los montos no tiene por qué coincidir con nada -- se usan tal cual', () => {
    const cuotas = generarCuotasManual([500, 500], '2026-01-01')
    const suma = cuotas.reduce((acc, c) => acc + c.montoBase, 0)
    expect(suma).toBe(1000)
  })

  it('devuelve un array vacío si no hay montos', () => {
    expect(generarCuotasManual([], '2026-08-01')).toEqual([])
  })
})
```

Agregar el import correspondiente arriba del archivo de test:
`import { generarCuotas, generarCuotasManual } from './generar-cuotas'`
(reemplazando el import existente de solo `generarCuotas`).

- [ ] **Step 3: Correr el test para confirmar que falla**

Run: `npx vitest run lib/lotes/generar-cuotas.test.ts`
Expected: FAIL — `generarCuotasManual` no existe todavía.

- [ ] **Step 4: Implementar `generarCuotasManual`**

En `lib/lotes/generar-cuotas.ts`, agregar al final del archivo (reusa la
función `sumarMeses` ya definida arriba en el mismo archivo, sin
exportarla — sigue siendo privada del módulo):

```ts
export function generarCuotasManual(montos: number[], fechaPrimeraCuota: string): CuotaGenerada[] {
  return montos.map((monto, indice) => ({
    numero: indice + 1,
    montoBase: monto,
    fechaVencimiento: sumarMeses(fechaPrimeraCuota, indice),
  }))
}
```

- [ ] **Step 5: Correr el test para confirmar que pasa**

Run: `npx vitest run lib/lotes/generar-cuotas.test.ts`
Expected: PASS — todos los tests del archivo en verde.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0020_lotes_documento_firmado.sql lib/lotes/generar-cuotas.ts lib/lotes/generar-cuotas.test.ts
git commit -m "feat: columna documento_firmado_path + generarCuotasManual"
```

---

## Task 2: Documento firmado obligatorio + modo manual con balance (vender)

**Files:**
- Modify: `app/admin/lotes/[id]/vender/actions.ts` (reemplazo completo)
- Modify: `app/admin/lotes/[id]/vender/page.tsx` (reemplazo completo)
- Modify: `tests/e2e/pase-a-vendido.spec.ts`
- Modify: `tests/e2e/vender-datos-cliente.spec.ts`
- Modify: `tests/e2e/cliente-varios-lotes.spec.ts`
- Test: `tests/e2e/vender-cuota-manual-documento.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `excedeTamanioMaximo`, `MAX_ARCHIVO_MB` de
  `lib/storage/validar-tamanio-archivo.ts` (pieza anterior de esta
  tanda). `generarCuotasManual`, `generarCuotas`, `CuotaGenerada` de
  `lib/lotes/generar-cuotas.ts` (Task 1).
- Produces: nada que otra tarea de este plan consuma (la Task 3 solo lee
  la columna `documento_firmado_path`, ya creada en Task 1).

Esta es la tarea grande de este plan: `actions.ts` y `page.tsx` están
fuertemente acoplados (los mismos query params que arma uno los lee el
otro para decidir qué paso mostrar), así que van en la misma tarea. Se
actualizan también los 3 specs e2e existentes que pasan por vender,
porque el documento pasa a ser obligatorio y sin tocarlos se romperían.

- [ ] **Step 1: Escribir el test e2e que falla**

Crear `tests/e2e/vender-cuota-manual-documento.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

async function crearLoteReservadoListoParaVender(
  identificador: string,
  precioTotal: number,
  acreedorId: string
) {
  const admin = createAdminClient()
  const { data: lote, error } = await admin
    .from('lotes')
    .insert({
      identificador,
      moneda: 'USD',
      estado: 'reservado',
      precio_total: precioTotal,
      acreedor_id: acreedorId,
    })
    .select('id')
    .single()

  if (error || !lote) {
    throw new Error(`No se pudo crear el lote de prueba: ${error?.message}`)
  }

  return lote.id as string
}

function adjuntarDocumentoFirmado(page: import('@playwright/test').Page) {
  return page.setInputFiles('input[name="documentoFirmado"]', {
    name: `e2e-documento-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
}

test.describe('Vender — documento firmado y cuota manual', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('modo automático: vender con documento firmado adjunto crea las cuotas iguales', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Vender Auto Doc ${Date.now()}`,
      9000,
      fixtures.acreedorConDatos.id
    )
    const email = `comprador.auto.doc.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Nombre completo del comprador').fill('Comprador Auto Doc')
    await page.getByPlaceholder('Email del comprador').fill(email)
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('3')
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await adjuntarDocumentoFirmado(page)
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL('**/admin/lotes')

    const { data: lote } = await admin
      .from('lotes')
      .select('estado, documento_firmado_path, monto_cuota_base')
      .eq('id', loteId)
      .single()
    expect(lote?.estado).toBe('vendido')
    expect(lote?.documento_firmado_path).toBeTruthy()
    expect(lote?.monto_cuota_base).toBe(3000)

    const { data: cuotas } = await admin
      .from('cuotas')
      .select('monto_base')
      .eq('lote_id', loteId)
    expect(cuotas).toHaveLength(3)
  })

  test('modo automático: vender sin documento firmado es rechazado', async ({ page }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Vender Sin Doc ${Date.now()}`,
      5000,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Nombre completo del comprador').fill('Comprador Sin Doc')
    await page.getByPlaceholder('Email del comprador').fill(`sin.doc.${Date.now()}@sima-e2e.invalid`)
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('1')
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()

    await expect(page.getByText('Subí el documento firmado (boleto o escritura)')).toBeVisible()

    const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()
    expect(lote?.estado).toBe('reservado')
  })

  test('modo manual: montos distintos, pantalla de balance, confirmación crea cuotas exactas', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Vender Manual ${Date.now()}`,
      10000,
      fixtures.acreedorConDatos.id
    )
    const email = `comprador.manual.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Nombre completo del comprador').fill('Comprador Manual')
    await page.getByPlaceholder('Email del comprador').fill(email)
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('3')
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.locator('input[name="modo"][value="manual"]').check()
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()

    // Paso 2: cargar los montos + el documento.
    await page.waitForURL((url) => url.searchParams.get('modo') === 'manual')
    await page.locator('input[name="cuotaMonto1"]').fill('4000')
    await page.locator('input[name="cuotaMonto2"]').fill('4000')
    await page.locator('input[name="cuotaMonto3"]').fill('3000')
    await adjuntarDocumentoFirmado(page)
    await page.getByRole('button', { name: 'Continuar' }).click()

    // Paso 3: balance antes de confirmar.
    await page.waitForURL((url) => url.searchParams.has('documentoFirmadoPath'))
    await expect(page.getByText('Revisá el balance antes de confirmar')).toBeVisible()
    await expect(page.getByText('Suma total de las cuotas cargadas: 11000')).toBeVisible()
    await expect(page.getByText(/Diferencia respecto al precio de lista: \+1000/)).toBeVisible()
    await page.getByRole('button', { name: 'Confirmar venta' }).click()
    await page.waitForURL('**/admin/lotes')

    const { data: lote } = await admin
      .from('lotes')
      .select('monto_cuota_base, documento_firmado_path')
      .eq('id', loteId)
      .single()
    expect(lote?.monto_cuota_base).toBeNull()
    expect(lote?.documento_firmado_path).toBeTruthy()

    const { data: cuotas } = await admin
      .from('cuotas')
      .select('numero, monto_base')
      .eq('lote_id', loteId)
      .order('numero', { ascending: true })
    expect(cuotas).toEqual([
      { numero: 1, monto_base: 4000 },
      { numero: 2, monto_base: 4000 },
      { numero: 3, monto_base: 3000 },
    ])
  })

  test('modo manual encadenado con cliente existente: ambos mecanismos conservan todo', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const email = `cliente.manual.existente.${Date.now()}@sima-e2e.invalid`
    const { data: invited } = await admin.auth.admin.inviteUserByEmail(email)
    await admin.from('profiles').insert({
      id: invited!.user.id,
      role: 'cliente',
      full_name: 'Cliente Manual Existente',
      email,
    })

    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Vender Manual Existente ${Date.now()}`,
      4000,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Nombre completo del comprador').fill('Cliente Manual Existente')
    await page.getByPlaceholder('Email del comprador').fill(email)
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('2')
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.locator('input[name="modo"][value="manual"]').check()
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()

    // El primer redirect ya trae modo=manual + cantidadCuotas, así que esta
    // pantalla muestra a la vez el aviso de cliente existente Y los campos
    // de monto por cuota -- ambos mecanismos conviven sin pisarse.
    await page.waitForURL((url) => url.searchParams.has('confirmarClienteId'))
    await expect(page.getByText('Ya existe una cuenta de cliente con ese email')).toBeVisible()
    await page.locator('input[name="cuotaMonto1"]').fill('2500')
    await page.locator('input[name="cuotaMonto2"]').fill('1500')
    await adjuntarDocumentoFirmado(page)
    await page.getByRole('button', { name: 'Continuar' }).click()

    await page.waitForURL((url) => url.searchParams.has('documentoFirmadoPath'))
    await expect(page.getByText('Ya existe una cuenta de cliente con ese email')).toBeVisible()
    await expect(page.getByText('Revisá el balance antes de confirmar')).toBeVisible()
    await page.getByRole('button', { name: 'Confirmar venta' }).click()
    await page.waitForURL('**/admin/lotes')

    const { data: lote } = await admin.from('lotes').select('cliente_id').eq('id', loteId).single()
    expect(lote?.cliente_id).toBe(invited!.user.id)

    const { data: cuotas } = await admin
      .from('cuotas')
      .select('numero, monto_base')
      .eq('lote_id', loteId)
      .order('numero', { ascending: true })
    expect(cuotas?.map((c) => c.monto_base)).toEqual([2500, 1500])
  })
})
```

- [ ] **Step 2: Correr los tests para confirmar que fallan**

Run: `npx playwright test tests/e2e/vender-cuota-manual-documento.spec.ts --project=chromium`
Expected: FAIL — hoy no existe el campo `documentoFirmado`, ni el
selector `modo`, ni los pasos 2/3.

- [ ] **Step 3: Reemplazar `app/admin/lotes/[id]/vender/actions.ts` completo**

```ts
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { calcularMontoCuota } from '@/lib/lotes/calcular-monto-cuota'
import { generarCuotas, generarCuotasManual, CuotaGenerada } from '@/lib/lotes/generar-cuotas'
import { imputarPagoFIFO } from '@/lib/pagos/imputar-fifo'
import { excedeTamanioMaximo, MAX_ARCHIVO_MB } from '@/lib/storage/validar-tamanio-archivo'

function construirParamsVenderPreservados(
  formData: FormData,
  clienteExistenteConfirmado: { id: string; nombre: string } | null
): URLSearchParams {
  const params = new URLSearchParams({
    fullName: (formData.get('fullName') as string) || '',
    email: (formData.get('email') as string) || '',
    cantidadCuotas: (formData.get('cantidadCuotas') as string) || '',
    fechaPrimeraCuota: (formData.get('fechaPrimeraCuota') as string) || '',
  })

  const modoFormulario = (formData.get('modo') as string) || ''
  if (modoFormulario) {
    params.set('modo', modoFormulario)
  }

  if (clienteExistenteConfirmado) {
    params.set('confirmarClienteId', clienteExistenteConfirmado.id)
    params.set('nombreEncontrado', clienteExistenteConfirmado.nombre)
  }

  return params
}

function redirectVenderConError(
  loteId: string,
  mensaje: string,
  paramsPreservados: URLSearchParams
): never {
  paramsPreservados.set('error', mensaje)
  redirect(`/admin/lotes/${loteId}/vender?${paramsPreservados.toString()}`)
}

export async function venderLote(loteId: string, formData: FormData) {
  await requireAdministrador()

  const email = ((formData.get('email') as string) || '').trim()
  const fullName = ((formData.get('fullName') as string) || '').trim()
  const cantidadCuotas = Number(formData.get('cantidadCuotas'))
  const fechaPrimeraCuota = formData.get('fechaPrimeraCuota') as string
  const modo = ((formData.get('modo') as string) || 'automatico').trim()

  if (!email || !fullName) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent('Completá nombre y email del comprador')}`
    )
  }

  if (!Number.isInteger(cantidadCuotas) || cantidadCuotas < 1) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
        'La cantidad de cuotas tiene que ser un número entero, mínimo 1'
      )}`
    )
  }

  if (!fechaPrimeraCuota) {
    redirect(`/admin/lotes/${loteId}/vender?error=${encodeURIComponent('Ingresá la fecha de la primera cuota')}`)
  }

  const supabase = await createClient()
  const {
    data: { user: adminUser },
  } = await supabase.auth.getUser()

  const admin = createAdminClient()

  async function subirDocumentoFirmado(archivo: File): Promise<{ filePath: string; error: unknown }> {
    const nombreSeguro = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `ventas/${loteId}/documento-${Date.now()}-${nombreSeguro}`
    const { error } = await admin.storage.from('comprobantes').upload(filePath, archivo)
    return { filePath, error }
  }

  const { data: loteActual, error: errorLoteActual } = await admin
    .from('lotes')
    .select('estado, precio_total, moneda')
    .eq('id', loteId)
    .single()

  if (errorLoteActual || !loteActual) {
    redirect(`/admin/lotes/${loteId}/vender?error=${encodeURIComponent('Lote no encontrado')}`)
  }

  if (loteActual!.estado !== 'reservado') {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
        `Este lote no está en estado reservado (estado actual: ${loteActual!.estado}), no se puede vender`
      )}`
    )
  }

  if (!loteActual!.precio_total) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
        'El lote no tiene precio total cargado, no se puede vender'
      )}`
    )
  }

  // Reserva más reciente de este lote: se usa tanto para completar/copiar
  // los datos del cliente (dni, domicilio, telefono) más abajo como para el
  // descuento de la seña en las cuotas, al final de la función.
  const { data: reserva } = await admin
    .from('reservas')
    .select('monto_sena, moneda_sena, comprobante_sena_path, dni, domicilio, telefono')
    .eq('lote_id', loteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: clienteExistente } = await admin
    .from('profiles')
    .select('id, full_name, dni, domicilio, telefono')
    .eq('email', email)
    .eq('role', 'cliente')
    .maybeSingle()

  let clienteId: string

  if (clienteExistente) {
    // El comprador ya tiene cuenta (compró otro lote antes) -- se reusa la
    // misma cuenta en vez de invitar de nuevo (rompería con "duplicate key"
    // contra profiles_pkey) o crear una segunda cuenta para la misma
    // persona. No se toca su full_name existente para no pisarlo si el
    // nombre tipeado esta vez difiere levemente.
    //
    // Antes de asociar el lote, se exige una confirmación explícita del
    // admin: si tipeó mal el email, este chequeo podría enganchar el lote a
    // la cuenta de OTRA persona real sin que nadie lo note. El primer
    // submit nunca trae `confirmarClienteExistente` todavía, así que
    // siempre se corta acá la primera vez y se le muestra al admin el
    // nombre real de la cuenta encontrada antes de completar la venta.
    const confirmado = (formData.get('confirmarClienteExistente') as string) === clienteExistente.id

    if (!confirmado) {
      const dniNoCoincide = Boolean(
        reserva?.dni && clienteExistente.dni && reserva.dni !== clienteExistente.dni
      )

      const params = new URLSearchParams({
        confirmarClienteId: clienteExistente.id,
        nombreEncontrado: clienteExistente.full_name ?? '',
        fullName,
        email,
        cantidadCuotas: String(cantidadCuotas),
        fechaPrimeraCuota,
        modo,
        ...(dniNoCoincide
          ? { dniReserva: reserva!.dni as string, dniPerfil: clienteExistente.dni as string }
          : {}),
      })
      redirect(`/admin/lotes/${loteId}/vender?${params.toString()}`)
    }

    clienteId = clienteExistente.id

    // Solo se completan los campos que el perfil todavia no tenga cargados
    // -- nunca se pisa un valor ya guardado, podria ser una correccion
    // manual posterior a un error de tipeo en una reserva vieja.
    const datosFaltantes: Record<string, string> = {}
    if (!clienteExistente.dni && reserva?.dni) datosFaltantes.dni = reserva.dni
    if (!clienteExistente.domicilio && reserva?.domicilio) datosFaltantes.domicilio = reserva.domicilio
    if (!clienteExistente.telefono && reserva?.telefono) datosFaltantes.telefono = reserva.telefono

    if (Object.keys(datosFaltantes).length > 0) {
      const { error: errorCompletarDatos } = await admin
        .from('profiles')
        .update(datosFaltantes)
        .eq('id', clienteExistente.id)

      if (errorCompletarDatos) {
        // No bloquea la venta -- ni siquiera un choque de DNI con otro
        // cliente (23505). Queda para completar a mano despues desde la
        // ficha del cliente si hace falta.
        console.error('No se pudieron completar datos del cliente existente:', errorCompletarDatos)
      }
    }
  } else {
    let dniParaNuevoCliente = reserva?.dni ?? null

    if (dniParaNuevoCliente) {
      const { data: dniYaUsado } = await admin
        .from('profiles')
        .select('id')
        .eq('dni', dniParaNuevoCliente)
        .maybeSingle()

      if (dniYaUsado) {
        // El DNI de la reserva ya pertenece a otro cliente (typo o
        // coincidencia) -- no bloquea el alta, se guarda sin DNI y se
        // puede completar despues a mano desde la ficha del cliente.
        dniParaNuevoCliente = null
      }
    }

    const { data: invited, error: errorInvite } = await admin.auth.admin.inviteUserByEmail(email)

    if (errorInvite || !invited.user) {
      redirect(
        `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorInvite?.message ?? 'error desconocido')}`
      )
    }

    const nuevoPerfil = {
      id: invited!.user.id,
      role: 'cliente' as const,
      full_name: fullName,
      email,
      dni: dniParaNuevoCliente,
      domicilio: reserva?.domicilio ?? null,
      telefono: reserva?.telefono ?? null,
    }

    const { error: errorProfile } = await admin.from('profiles').insert(nuevoPerfil)

    if (errorProfile) {
      if (errorProfile.code === '23505' && nuevoPerfil.dni) {
        // Choque de DNI justo en este instante (otro alta simultanea) --
        // reintenta sin DNI en vez de bloquear la venta.
        const { error: errorProfileSinDni } = await admin
          .from('profiles')
          .insert({ ...nuevoPerfil, dni: null })

        if (errorProfileSinDni) {
          redirect(`/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorProfileSinDni.message)}`)
        }
      } else {
        redirect(`/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorProfile.message)}`)
      }
    }

    clienteId = invited!.user.id
  }

  const clienteExistenteParaPreservar = clienteExistente
    ? { id: clienteExistente.id, nombre: clienteExistente.full_name ?? '' }
    : null

  let montoCuotaBase: number | null
  let cuotas: CuotaGenerada[]
  let documentoFirmadoPath: string

  if (modo === 'manual') {
    const montosManualesRaw: string[] = []
    for (let i = 1; i <= cantidadCuotas; i++) {
      const valor = formData.get(`cuotaMonto${i}`)
      if (valor === null) break
      montosManualesRaw.push(valor as string)
    }

    if (montosManualesRaw.length !== cantidadCuotas) {
      // Todavía no cargó los montos -- redirige agregando modo=manual (y
      // lo ya preservado) para que la página muestre el campo por cuota.
      const params = construirParamsVenderPreservados(formData, clienteExistenteParaPreservar)
      redirect(`/admin/lotes/${loteId}/vender?${params.toString()}`)
    }

    const montosManuales = montosManualesRaw.map((valor) => Number(valor))
    if (!montosManuales.every((monto) => Number.isFinite(monto) && monto >= 0)) {
      redirectVenderConError(
        loteId,
        'Los montos de las cuotas tienen que ser números válidos, no negativos',
        construirParamsVenderPreservados(formData, clienteExistenteParaPreservar)
      )
    }

    const confirmado = (formData.get('confirmarMontosManual') as string) === 'true'

    if (!confirmado) {
      // Paso de carga de montos: acá se sube el documento (una sola vez) y
      // se redirige a la pantalla de balance para que confirme.
      const documentoFirmado = formData.get('documentoFirmado') as File

      if (!documentoFirmado || documentoFirmado.size === 0) {
        redirectVenderConError(
          loteId,
          'Subí el documento firmado (boleto o escritura)',
          construirParamsVenderPreservados(formData, clienteExistenteParaPreservar)
        )
      }

      if (excedeTamanioMaximo(documentoFirmado)) {
        redirectVenderConError(
          loteId,
          `El documento firmado pesa más de ${MAX_ARCHIVO_MB} MB — subí uno más liviano.`,
          construirParamsVenderPreservados(formData, clienteExistenteParaPreservar)
        )
      }

      const { filePath, error: errorSubidaDocumento } = await subirDocumentoFirmado(documentoFirmado)

      if (errorSubidaDocumento) {
        console.error('Error al subir el documento firmado:', errorSubidaDocumento)
        redirectVenderConError(
          loteId,
          'No se pudo subir el documento firmado. Probá de nuevo.',
          construirParamsVenderPreservados(formData, clienteExistenteParaPreservar)
        )
      }

      const params = construirParamsVenderPreservados(formData, clienteExistenteParaPreservar)
      montosManuales.forEach((monto, indice) => params.set(`cuotaMonto${indice + 1}`, String(monto)))
      params.set('documentoFirmadoPath', filePath)
      redirect(`/admin/lotes/${loteId}/vender?${params.toString()}`)
    }

    // Confirmado: el documento ya se subió en el paso anterior, viene como
    // input oculto -- no se vuelve a pedir.
    const documentoFirmadoPathConfirmado = ((formData.get('documentoFirmadoPath') as string) || '').trim()

    if (!documentoFirmadoPathConfirmado) {
      redirectVenderConError(
        loteId,
        'Falta el documento firmado, volvé a intentarlo desde el principio',
        construirParamsVenderPreservados(formData, clienteExistenteParaPreservar)
      )
    }

    documentoFirmadoPath = documentoFirmadoPathConfirmado
    montoCuotaBase = null
    cuotas = generarCuotasManual(montosManuales, fechaPrimeraCuota)
  } else {
    const documentoFirmado = formData.get('documentoFirmado') as File

    if (!documentoFirmado || documentoFirmado.size === 0) {
      redirectVenderConError(
        loteId,
        'Subí el documento firmado (boleto o escritura)',
        construirParamsVenderPreservados(formData, clienteExistenteParaPreservar)
      )
    }

    if (excedeTamanioMaximo(documentoFirmado)) {
      redirectVenderConError(
        loteId,
        `El documento firmado pesa más de ${MAX_ARCHIVO_MB} MB — subí uno más liviano.`,
        construirParamsVenderPreservados(formData, clienteExistenteParaPreservar)
      )
    }

    const { filePath, error: errorSubidaDocumento } = await subirDocumentoFirmado(documentoFirmado)

    if (errorSubidaDocumento) {
      console.error('Error al subir el documento firmado:', errorSubidaDocumento)
      redirectVenderConError(
        loteId,
        'No se pudo subir el documento firmado. Probá de nuevo.',
        construirParamsVenderPreservados(formData, clienteExistenteParaPreservar)
      )
    }

    documentoFirmadoPath = filePath

    const precioTotal = loteActual!.precio_total as number
    montoCuotaBase = calcularMontoCuota(precioTotal, cantidadCuotas)
    cuotas = generarCuotas(cantidadCuotas, montoCuotaBase, fechaPrimeraCuota, precioTotal)
  }

  // Claim atomico: solo vende si el lote SIGUE reservado en este instante
  // (mismo patron que reservarLote / cancelarReserva). Si esto no pega, ya
  // se invito y se creo el profile del cliente igual — caso raro (alguien
  // mas cancelo la reserva en el instante exacto entre el chequeo de arriba
  // y este update); se reporta como error y queda para revision manual del
  // admin, no se intenta revertir la invitacion ya enviada.
  const { data: loteActualizado, error: errorVenta } = await admin
    .from('lotes')
    .update({
      estado: 'vendido',
      cliente_id: clienteId,
      cantidad_cuotas: cantidadCuotas,
      monto_cuota_base: montoCuotaBase,
      fecha_primera_cuota: fechaPrimeraCuota,
      documento_firmado_path: documentoFirmadoPath,
    })
    .eq('id', loteId)
    .eq('estado', 'reservado')
    .select('id')
    .single()

  if (errorVenta || !loteActualizado) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
        'Este lote dejó de estar reservado justo antes de confirmar la venta. Ya se invitó al cliente — revisalo manualmente antes de reintentar.'
      )}`
    )
  }

  const { data: cuotasCreadas, error: errorCuotas } = await admin
    .from('cuotas')
    .insert(
      cuotas.map((cuota) => ({
        lote_id: loteId,
        numero: cuota.numero,
        monto_base: cuota.montoBase,
        saldo_pendiente: cuota.montoBase,
        fecha_vencimiento: cuota.fechaVencimiento,
      }))
    )
    .select('id, numero, saldo_pendiente')

  if (errorCuotas || !cuotasCreadas) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
        errorCuotas?.message ?? 'error desconocido'
      )}`
    )
  }

  // Descuento de la seña de la reserva en las cuotas recien generadas: si
  // hay una reserva activa con seña > 0 en la misma moneda del lote, se
  // registra como un pago ya confirmado (la seña ya se verifico al
  // reservar, con su propio comprobante) y se reparte en cascada con el
  // mismo FIFO que un pago normal. Si la moneda de la seña difiere de la
  // del lote, no se descuenta nada automatico -- mismo criterio de "sin
  // conversion de moneda" que el resto del proyecto.
  if (reserva && reserva.monto_sena > 0 && reserva.moneda_sena === loteActual!.moneda) {
    const { data: pagoSena, error: errorPagoSena } = await admin
      .from('pagos')
      .insert({
        cliente_id: clienteId,
        lote_id: loteId,
        monto: reserva.monto_sena,
        moneda: reserva.moneda_sena,
        comprobante_path: reserva.comprobante_sena_path,
        motivo: 'sena',
        estado: 'confirmado',
        confirmado_admin_por: adminUser!.id,
        confirmado_admin_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (errorPagoSena || !pagoSena) {
      redirect(
        `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
          `La venta se completó pero no se pudo registrar la seña como pago: ${errorPagoSena?.message ?? 'error desconocido'}`
        )}`
      )
    }

    const cuotasOrdenadas = [...cuotasCreadas]
      .sort((a, b) => a.numero - b.numero)
      .map((cuota) => ({ id: cuota.id, saldoPendiente: cuota.saldo_pendiente }))
    const resultado = imputarPagoFIFO(reserva.monto_sena, cuotasOrdenadas)

    for (const imputacion of resultado.imputaciones) {
      const { error: errorImputacion } = await admin.from('pago_imputaciones').insert({
        pago_id: pagoSena!.id,
        cuota_id: imputacion.cuotaId,
        monto_imputado: imputacion.montoImputado,
      })

      if (errorImputacion) {
        redirect(
          `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
            `La venta y la seña se registraron, pero falló aplicar el descuento a una cuota: ${errorImputacion.message}`
          )}`
        )
      }

      const cuota = cuotasOrdenadas.find((c) => c.id === imputacion.cuotaId)!
      const { error: errorSaldo } = await admin
        .from('cuotas')
        .update({ saldo_pendiente: cuota.saldoPendiente - imputacion.montoImputado })
        .eq('id', imputacion.cuotaId)

      if (errorSaldo) {
        redirect(
          `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
            `La venta y la seña se registraron, pero falló actualizar el saldo de una cuota: ${errorSaldo.message}`
          )}`
        )
      }
    }
  }

  redirect('/admin/lotes')
}
```

- [ ] **Step 4: Reemplazar `app/admin/lotes/[id]/vender/page.tsx` completo**

```tsx
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { venderLote } from './actions'

export default async function VenderLotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    error?: string
    confirmarClienteId?: string
    nombreEncontrado?: string
    fullName?: string
    email?: string
    cantidadCuotas?: string
    fechaPrimeraCuota?: string
    dniReserva?: string
    dniPerfil?: string
    modo?: string
    documentoFirmadoPath?: string
    [cuotaMontoKey: string]: string | undefined
  }>
}) {
  const { id } = await params
  const sp = await searchParams
  const {
    error,
    confirmarClienteId,
    nombreEncontrado,
    fullName: fullNamePreservado,
    email: emailPreservado,
    cantidadCuotas: cantidadCuotasPreservada,
    fechaPrimeraCuota: fechaPrimeraCuotaPreservada,
    dniReserva,
    dniPerfil,
    modo: modoPreservado,
    documentoFirmadoPath,
  } = sp

  await requireAdministrador()

  const supabase = await createClient()

  const { data: lote } = await supabase
    .from('lotes')
    .select('id, identificador, estado, precio_total')
    .eq('id', id)
    .single()

  if (!lote) {
    notFound()
  }

  const { data: reserva } = await supabase
    .from('reservas')
    .select('nombre_completo, dni, domicilio, telefono, email, monto_sena, moneda_sena')
    .eq('lote_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const venderLoteConId = venderLote.bind(null, id)

  const modo = modoPreservado === 'manual' ? 'manual' : 'automatico'
  const cantidadCuotasNum = cantidadCuotasPreservada ? Number(cantidadCuotasPreservada) : null

  const mostrarPasoMontos = modo === 'manual' && !!cantidadCuotasNum && !documentoFirmadoPath
  const mostrarPasoConfirmarMontos = modo === 'manual' && !!documentoFirmadoPath

  const montosManuales: string[] =
    cantidadCuotasNum && (mostrarPasoMontos || mostrarPasoConfirmarMontos)
      ? Array.from({ length: cantidadCuotasNum }, (_, i) => sp[`cuotaMonto${i + 1}`] ?? '')
      : []

  const sumaManual = montosManuales.reduce((acc, valor) => acc + (Number(valor) || 0), 0)
  const diferenciaManual =
    mostrarPasoConfirmarMontos && lote!.precio_total ? sumaManual - lote!.precio_total : null

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
      <h1 className="mb-6 text-xl font-semibold">Vender lote y dar de alta al cliente</h1>

      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}

      {lote!.estado !== 'reservado' ? (
        <p className="mb-4 rounded bg-amber-100 p-2 text-sm text-amber-800">
          Este lote no está en estado reservado (estado actual: {lote!.estado}), no se puede
          vender. Primero hay que reservarlo.
        </p>
      ) : (
        <>
          {reserva && !mostrarPasoMontos && !mostrarPasoConfirmarMontos && (
            <div className="mb-4 rounded border border-gray-200 bg-gray-50 p-3 text-sm">
              <p className="mb-1 font-medium">Datos de la reserva</p>
              <p>Persona que reservó: {reserva.nombre_completo}</p>
              <p>DNI: {reserva.dni}</p>
              <p>Domicilio: {reserva.domicilio}</p>
              <p>Teléfono: {reserva.telefono}</p>
              <p>
                Seña: {reserva.monto_sena} {reserva.moneda_sena}
              </p>
              <p className="mt-2 text-gray-600">
                Los campos de comprador de abajo ya vienen completados con estos datos. Si el
                comprador final es otra persona (por ejemplo, alguien reservó en representación
                de otra persona), simplemente sobrescribilos: el usuario que se crea abajo es
                siempre el comprador, no necesariamente quien reservó.
              </p>
            </div>
          )}

          {confirmarClienteId && (
            <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Ya existe una cuenta de cliente con ese email</p>
              <p className="mt-1">
                Nombre en esa cuenta: <span className="font-medium">{nombreEncontrado}</span>
              </p>
              <p className="mt-1">
                Si confirmás, este lote se va a asociar a esa cuenta ya existente (no se manda
                ningún mail de invitación nuevo). Revisá que sea la persona correcta antes de
                confirmar.
              </p>
              {dniReserva && dniPerfil && (
                <p className="mt-2">
                  El DNI de esta reserva ({dniReserva}) no coincide con el que ya tenía guardado (
                  {dniPerfil}). Se mantiene el guardado; si es un error, corregilo después desde la
                  ficha del cliente.
                </p>
              )}
            </div>
          )}

          {mostrarPasoConfirmarMontos && (
            <div className="mb-4 rounded border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
              <p className="font-medium">Revisá el balance antes de confirmar</p>
              <p className="mt-1">Suma total de las cuotas cargadas: {sumaManual}</p>
              {lote!.precio_total && <p>Precio de lista del lote: {lote!.precio_total}</p>}
              {diferenciaManual !== null && (
                <p className="mt-1 font-medium">
                  Diferencia respecto al precio de lista: {diferenciaManual > 0 ? '+' : ''}
                  {diferenciaManual}
                </p>
              )}
            </div>
          )}

          <form action={venderLoteConId} className="flex flex-col gap-3">
            {confirmarClienteId && (
              <input type="hidden" name="confirmarClienteExistente" value={confirmarClienteId} />
            )}

            {mostrarPasoConfirmarMontos ? (
              <>
                <input type="hidden" name="modo" value="manual" />
                <input type="hidden" name="fullName" value={fullNamePreservado ?? ''} />
                <input type="hidden" name="email" value={emailPreservado ?? ''} />
                <input type="hidden" name="cantidadCuotas" value={cantidadCuotasPreservada ?? ''} />
                <input
                  type="hidden"
                  name="fechaPrimeraCuota"
                  value={fechaPrimeraCuotaPreservada ?? ''}
                />
                <input type="hidden" name="documentoFirmadoPath" value={documentoFirmadoPath ?? ''} />
                {montosManuales.map((monto, indice) => (
                  <input key={indice} type="hidden" name={`cuotaMonto${indice + 1}`} value={monto} />
                ))}
                <input type="hidden" name="confirmarMontosManual" value="true" />
                <button type="submit" className="rounded bg-black px-3 py-2 text-white">
                  Confirmar venta
                </button>
              </>
            ) : mostrarPasoMontos ? (
              <>
                <input type="hidden" name="modo" value="manual" />
                <input type="hidden" name="fullName" value={fullNamePreservado ?? ''} />
                <input type="hidden" name="email" value={emailPreservado ?? ''} />
                <input type="hidden" name="cantidadCuotas" value={cantidadCuotasPreservada ?? ''} />
                <input
                  type="hidden"
                  name="fechaPrimeraCuota"
                  value={fechaPrimeraCuotaPreservada ?? ''}
                />
                {lote!.precio_total && (
                  <p className="text-sm text-gray-600">
                    Precio de lista del lote: {lote!.precio_total} — cargá el monto de cada cuota.
                  </p>
                )}
                {Array.from({ length: cantidadCuotasNum ?? 0 }, (_, indice) => (
                  <input
                    key={indice}
                    name={`cuotaMonto${indice + 1}`}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={`Cuota ${indice + 1}`}
                    required
                    className="rounded border px-3 py-2"
                  />
                ))}
                <label className="text-sm">
                  Documento firmado (boleto de compraventa o escritura)
                  <input
                    name="documentoFirmado"
                    type="file"
                    className="mt-1 block w-full rounded border px-3 py-2"
                  />
                </label>
                <button type="submit" className="rounded bg-black px-3 py-2 text-white">
                  Continuar
                </button>
              </>
            ) : (
              <>
                <input
                  name="fullName"
                  placeholder="Nombre completo del comprador"
                  defaultValue={fullNamePreservado ?? reserva?.nombre_completo ?? ''}
                  required
                  className="rounded border px-3 py-2"
                />
                <input
                  name="email"
                  type="email"
                  placeholder="Email del comprador"
                  defaultValue={emailPreservado ?? reserva?.email ?? ''}
                  required
                  className="rounded border px-3 py-2"
                />
                <input
                  name="cantidadCuotas"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Cantidad de cuotas (1 para venta al contado)"
                  defaultValue={cantidadCuotasPreservada ?? ''}
                  required
                  className="rounded border px-3 py-2"
                />
                <label className="text-sm">
                  Fecha de la primera cuota
                  <input
                    name="fechaPrimeraCuota"
                    type="date"
                    defaultValue={fechaPrimeraCuotaPreservada ?? ''}
                    required
                    className="mt-1 block w-full rounded border px-3 py-2"
                  />
                </label>

                <fieldset className="rounded border px-3 py-2">
                  <legend className="text-sm font-medium">Cómo cargar las cuotas</legend>
                  <label className="mr-4 text-sm">
                    <input type="radio" name="modo" value="automatico" defaultChecked className="mr-1" />
                    Automático
                  </label>
                  <label className="text-sm">
                    <input type="radio" name="modo" value="manual" className="mr-1" />
                    Manual
                  </label>
                </fieldset>

                <label className="text-sm">
                  Documento firmado (boleto de compraventa o escritura)
                  <input
                    name="documentoFirmado"
                    type="file"
                    className="mt-1 block w-full rounded border px-3 py-2"
                  />
                </label>

                <button type="submit" className="rounded bg-black px-3 py-2 text-white">
                  {confirmarClienteId
                    ? 'Confirmar venta con esta cuenta existente'
                    : 'Confirmar venta y enviar invitación'}
                </button>
              </>
            )}
          </form>
        </>
      )}
    </main>
  )
}
```

- [ ] **Step 5: Correr los tests nuevos para confirmar que pasan**

Run: `npx playwright test tests/e2e/vender-cuota-manual-documento.spec.ts --project=chromium`
Expected: PASS — 4/4.

- [ ] **Step 6: Actualizar `tests/e2e/pase-a-vendido.spec.ts` para adjuntar el documento**

Este archivo tiene 6 lugares donde se hace click en el botón
`'Confirmar venta y enviar invitación'` (ninguno pasa por
`'Confirmar venta con esta cuenta existente'`). En CADA uno de esos 6
lugares, agregar la siguiente línea INMEDIATAMENTE ANTES del
`.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()`
correspondiente:

```ts
    await page.setInputFiles('input[name="documentoFirmado"]', {
      name: `e2e-documento-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
```

(El archivo ya tiene `COMPROBANTE_BYTES` importado arriba — reusarlo, no
crear un fixture nuevo.) Los 6 lugares son las líneas (número actual,
puede correrse un poco tras la primera edición):

1. Dentro del test `'vender tras reservar: formulario precargado, cuotas
   generadas con monto calculado'`, justo antes de
   `await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')`
   ya fue completado — insertar el `setInputFiles` DESPUÉS de esa línea y
   ANTES del click a `'Confirmar venta y enviar invitación'`.
2. Dentro de `'comprador distinto de quien reservó: se puede sobrescribir
   nombre y email'`, mismo patrón (después de completar
   `fechaPrimeraCuota`, antes del click).
3. Dentro de `'vender con seña menor a la primera cuota: se descuenta del
   saldo_pendiente'`, mismo patrón.
4. Dentro de `'vender con seña mayor a la primera cuota: cascadea a la
   segunda'`, mismo patrón.
5. Dentro de `'vender con seña en moneda distinta a la del lote: no se
   descuenta nada'`, mismo patrón.
6. Dentro de `'venta al contado (seña $0): no se crea ningún pago'`,
   mismo patrón.

En los 6 casos, la línea nueva va inmediatamente antes de
`await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()`.

- [ ] **Step 7: Actualizar `tests/e2e/vender-datos-cliente.spec.ts` para adjuntar el documento**

Este archivo tiene un helper compartido `venderLotePorUI` (líneas 71-81)
que NO hace el segundo click de "cliente existente" — cada test lo hace
por su cuenta si hace falta. Reemplazar el helper completo:

```ts
async function venderLotePorUI(page: Page, loteId: string, datos: { email: string; fullName: string }) {
  await page.goto(`/admin/lotes/${loteId}/vender`)
  await page.getByPlaceholder('Nombre completo del comprador').fill(datos.fullName)
  await page.getByPlaceholder('Email del comprador').fill(datos.email)
  await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('1')
  await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
  await page.setInputFiles('input[name="documentoFirmado"]', {
    name: `e2e-documento-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
  await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
  await page.waitForURL(
    (url) => url.pathname === '/admin/lotes' || url.searchParams.has('confirmarClienteId')
  )
}
```

Después, en el test `'cliente existente sin esos datos cargados: se
completan con los de la nueva reserva'` (alrededor de la línea 148-151),
el bloque:

```ts
    await venderLotePorUI(page, loteId, { email, fullName: 'Cliente Sin Datos' })
    if (page.url().includes('confirmarClienteId')) {
      await page.getByRole('button', { name: 'Confirmar venta con esta cuenta existente' }).click()
    }
    await page.waitForURL('**/admin/lotes')
```

pasa a ser:

```ts
    await venderLotePorUI(page, loteId, { email, fullName: 'Cliente Sin Datos' })
    if (page.url().includes('confirmarClienteId')) {
      await page.setInputFiles('input[name="documentoFirmado"]', {
        name: `e2e-documento-${Date.now()}.pdf`,
        mimeType: 'application/pdf',
        buffer: COMPROBANTE_BYTES,
      })
      await page.getByRole('button', { name: 'Confirmar venta con esta cuenta existente' }).click()
    }
    await page.waitForURL('**/admin/lotes')
```

Y en el test `'cliente existente con DNI ya cargado, distinto al de la
nueva reserva: aviso visible, se mantiene el guardado'` (alrededor de la
línea 194-201), el bloque:

```ts
    await venderLotePorUI(page, loteId, { email, fullName: 'Cliente DNI Distinto' })
    await page.waitForURL((url) => url.searchParams.has('confirmarClienteId'))

    await expect(page.getByText(/no coincide con el que ya tenía guardado/)).toBeVisible()
    await expect(page.getByText(dniOriginal, { exact: false })).toBeVisible()

    await page.getByRole('button', { name: 'Confirmar venta con esta cuenta existente' }).click()
    await page.waitForURL('**/admin/lotes')
```

pasa a ser:

```ts
    await venderLotePorUI(page, loteId, { email, fullName: 'Cliente DNI Distinto' })
    await page.waitForURL((url) => url.searchParams.has('confirmarClienteId'))

    await expect(page.getByText(/no coincide con el que ya tenía guardado/)).toBeVisible()
    await expect(page.getByText(dniOriginal, { exact: false })).toBeVisible()

    await page.setInputFiles('input[name="documentoFirmado"]', {
      name: `e2e-documento-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    await page.getByRole('button', { name: 'Confirmar venta con esta cuenta existente' }).click()
    await page.waitForURL('**/admin/lotes')
```

Los otros 2 tests de este archivo (`'cliente nuevo: DNI, domicilio y
teléfono...'` y `'cliente nuevo con DNI que ya pertenece a otro
cliente...'`) solo llaman una vez a `venderLotePorUI` y nunca entran a la
rama de cliente existente — quedan cubiertos con el cambio del helper,
sin tocar nada más en esos tests.

- [ ] **Step 8: Actualizar `tests/e2e/cliente-varios-lotes.spec.ts` para adjuntar el documento**

Este archivo hoy NO importa `readFileSync`/`path`/`COMPROBANTE_BYTES` —
agregarlo arriba del archivo, justo después del import existente:

```ts
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)
```

El helper compartido `venderLotePorUI` (líneas 31-53) SÍ hace los 2
posibles clicks (el primero, y el de "cliente existente" si hace falta)
dentro de la misma función. Reemplazarlo completo:

```ts
async function venderLotePorUI(
  page: import('@playwright/test').Page,
  loteId: string,
  datos: { email: string; fullName: string }
) {
  await page.goto(`/admin/lotes/${loteId}/vender`)
  await page.getByPlaceholder('Nombre completo del comprador').fill(datos.fullName)
  await page.getByPlaceholder('Email del comprador').fill(datos.email)
  await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('1')
  await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
  await page.setInputFiles('input[name="documentoFirmado"]', {
    name: `e2e-documento-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
  await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()

  // Si el email ya es de un cliente existente, el primer submit NO completa
  // la venta: vuelve a esta misma pantalla con el cartel de confirmación
  // (para que el admin vea el nombre real de la cuenta encontrada antes de
  // asociar el lote) y hace falta un segundo click para confirmar.
  await page.waitForURL((url) => url.pathname === '/admin/lotes' || url.searchParams.has('confirmarClienteId'))

  if (page.url().includes('confirmarClienteId')) {
    await page.setInputFiles('input[name="documentoFirmado"]', {
      name: `e2e-documento-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    await page.getByRole('button', { name: 'Confirmar venta con esta cuenta existente' }).click()
    await page.waitForURL('**/admin/lotes')
  }
}
```

Además, el test `'vender a un email de cliente existente muestra el
nombre real antes de asociar el lote, y no lo asocia hasta confirmar'`
tiene una SEGUNDA venta armada a mano, sin pasar por el helper (líneas
139-161 aprox). El bloque:

```ts
    await page.goto(`/admin/lotes/${loteBId}/vender`)
    await page.getByPlaceholder('Nombre completo del comprador').fill('Nombre Tipeado Distinto')
    await page.getByPlaceholder('Email del comprador').fill(emailComprador)
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('1')
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL((url) => url.searchParams.has('confirmarClienteId'))

    await expect(page.getByText('Ya existe una cuenta de cliente con ese email')).toBeVisible()
    await expect(page.getByText(nombreReal)).toBeVisible()

    // Todavía no confirmó -- el lote B NO tiene que quedar asociado.
    const admin = createAdminClient()
    const { data: loteBAntes } = await admin
      .from('lotes')
      .select('cliente_id, estado')
      .eq('id', loteBId)
      .single()
    expect(loteBAntes?.cliente_id).toBeNull()
    expect(loteBAntes?.estado).toBe('reservado')

    // Ahora sí confirma -- recién ahí se asocia.
    await page.getByRole('button', { name: 'Confirmar venta con esta cuenta existente' }).click()
    await page.waitForURL('**/admin/lotes')
```

pasa a ser (agrega el `setInputFiles` antes de cada uno de los 2 clicks):

```ts
    await page.goto(`/admin/lotes/${loteBId}/vender`)
    await page.getByPlaceholder('Nombre completo del comprador').fill('Nombre Tipeado Distinto')
    await page.getByPlaceholder('Email del comprador').fill(emailComprador)
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('1')
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.setInputFiles('input[name="documentoFirmado"]', {
      name: `e2e-documento-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL((url) => url.searchParams.has('confirmarClienteId'))

    await expect(page.getByText('Ya existe una cuenta de cliente con ese email')).toBeVisible()
    await expect(page.getByText(nombreReal)).toBeVisible()

    // Todavía no confirmó -- el lote B NO tiene que quedar asociado.
    const admin = createAdminClient()
    const { data: loteBAntes } = await admin
      .from('lotes')
      .select('cliente_id, estado')
      .eq('id', loteBId)
      .single()
    expect(loteBAntes?.cliente_id).toBeNull()
    expect(loteBAntes?.estado).toBe('reservado')

    // Ahora sí confirma -- recién ahí se asocia.
    await page.setInputFiles('input[name="documentoFirmado"]', {
      name: `e2e-documento-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: COMPROBANTE_BYTES,
    })
    await page.getByRole('button', { name: 'Confirmar venta con esta cuenta existente' }).click()
    await page.waitForURL('**/admin/lotes')
```

Todos los demás tests de este archivo llaman a `venderLotePorUI` (ya
corregido arriba) y no necesitan ningún cambio adicional.

- [ ] **Step 9: Correr toda la regresión de vender**

Run: `npx playwright test tests/e2e/pase-a-vendido.spec.ts tests/e2e/vender-datos-cliente.spec.ts tests/e2e/cliente-varios-lotes.spec.ts tests/e2e/vender-cuota-manual-documento.spec.ts --project=chromium`
Expected: PASS — todos los tests de estos 4 archivos en verde.

- [ ] **Step 10: `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 11: Commit**

```bash
git add "app/admin/lotes/[id]/vender/actions.ts" "app/admin/lotes/[id]/vender/page.tsx" tests/e2e/vender-cuota-manual-documento.spec.ts tests/e2e/pase-a-vendido.spec.ts tests/e2e/vender-datos-cliente.spec.ts tests/e2e/cliente-varios-lotes.spec.ts
git commit -m "feat: documento firmado obligatorio + cuota manual con balance al vender"
```

---

## Task 3: "Ver documento firmado" en el detalle del lote

**Files:**
- Modify: `app/admin/lotes/[id]/page.tsx`

**Interfaces:**
- Consumes: `lotes.documento_firmado_path` (Task 1), mismo patrón de URL
  firmada que ya usa este archivo para `dni_frente_path`/`dni_dorso_path`.

- [ ] **Step 1: Escribir el test e2e que falla**

Agregar al final de `tests/e2e/vender-cuota-manual-documento.spec.ts`,
dentro del mismo `test.describe`:

```ts
  test('el detalle del lote muestra un link para ver el documento firmado', async ({ page }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Ver Documento ${Date.now()}`,
      5000,
      fixtures.acreedorConDatos.id
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Nombre completo del comprador').fill('Comprador Ver Documento')
    await page.getByPlaceholder('Email del comprador').fill(`ver.documento.${Date.now()}@sima-e2e.invalid`)
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('1')
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await adjuntarDocumentoFirmado(page)
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL('**/admin/lotes')

    await page.goto(`/admin/lotes/${loteId}`)
    await expect(page.getByRole('link', { name: 'Ver documento firmado' })).toBeVisible()
  })
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `npx playwright test tests/e2e/vender-cuota-manual-documento.spec.ts --project=chromium -g "Ver documento firmado"`
Expected: FAIL — el link no existe todavía.

- [ ] **Step 3: Agregar la columna al select del lote**

En `app/admin/lotes/[id]/page.tsx`, ubicar:

```tsx
  const { data: lote } = await supabase
    .from('lotes')
    .select(
      'id, identificador, moneda, estado, cliente_id, admin_id, acreedor_id, vendedor_id, cuenta_cobro_id, cuenta_cobro_externa_id, ubicacion, precio_total'
    )
    .eq('id', id)
    .single()
```

Reemplazar por (agrega `documento_firmado_path` al final de la lista):

```tsx
  const { data: lote } = await supabase
    .from('lotes')
    .select(
      'id, identificador, moneda, estado, cliente_id, admin_id, acreedor_id, vendedor_id, cuenta_cobro_id, cuenta_cobro_externa_id, ubicacion, precio_total, documento_firmado_path'
    )
    .eq('id', id)
    .single()
```

- [ ] **Step 4: Calcular la URL firmada**

Ubicar el bloque que empieza con `if (perfilPropio!.role === 'acreedor' ...`
y termina justo antes de `const { data: cuotas } = ...`. Inmediatamente
después de ese bloque (antes de la consulta de `cuotas`), agregar:

```tsx
  let documentoFirmadoUrl: string | null = null
  if (lote!.documento_firmado_path) {
    const admin = createAdminClient()
    const { data: documentoSigned } = await admin.storage
      .from('comprobantes')
      .createSignedUrl(lote!.documento_firmado_path, 300)
    documentoFirmadoUrl = documentoSigned?.signedUrl ?? null
  }
```

- [ ] **Step 5: Renderizar el link**

Ubicar el cierre del bloque `{reserva && (<> ... </>)}` (justo antes de
`<h2 className="mb-2 mt-6 text-lg font-semibold">Cuotas</h2>`). Agregar
inmediatamente después de ese cierre y antes del `<h2>` de "Cuotas":

```tsx
      {lote!.estado === 'vendido' && (
        <p className="mb-4 text-sm">
          {documentoFirmadoUrl ? (
            <a href={documentoFirmadoUrl} target="_blank" className="underline">
              Ver documento firmado
            </a>
          ) : (
            <span className="text-gray-500">Documento firmado no disponible</span>
          )}
        </p>
      )}
```

- [ ] **Step 6: Correr el test para confirmar que pasa**

Run: `npx playwright test tests/e2e/vender-cuota-manual-documento.spec.ts --project=chromium`
Expected: PASS — 5/5 (los 4 tests de la Task 2 más este).

- [ ] **Step 7: Correr la regresión del detalle del lote**

Run: `npx playwright test tests/e2e/reserva-lote.spec.ts tests/e2e/cliente-varios-lotes.spec.ts --project=chromium`
Expected: PASS — estos specs también navegan al detalle del lote, buena
red de seguridad para confirmar que no se rompió nada visible ahí.

- [ ] **Step 8: `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 9: Commit**

```bash
git add "app/admin/lotes/[id]/page.tsx" tests/e2e/vender-cuota-manual-documento.spec.ts
git commit -m "feat: ver documento firmado desde el detalle del lote"
```
