# Vender — cuotas/documento con JS acotado + reordenar creación de cuenta — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para seguimiento.

**Goal:** Reemplazar el flujo de venta multi-paso por redirect (modo
automático/manual + montos + documento) por una sola pantalla con un
componente de cliente chico, y mover la creación de la cuenta del
comprador al final de `venderLote`, eliminando `clienteNuevoId`.

**Architecture:** Un nuevo client component (`CuotasYDocumento.tsx`)
maneja cantidad de cuotas, el selector automático/manual, los montos por
cuota y el documento firmado, todo dentro del mismo `<form>` que ya
existe — sin ningún `fetch` propio, un solo submit real. `venderLote` se
reordena: valida todo (montos, documento) ANTES de resolver/crear la
cuenta del comprador, que pasa a ser el último paso antes de vender.

**Tech Stack:** Next.js 16 (Server Actions + un Client Component acotado),
TypeScript, React `useState`, Playwright (e2e).

## Global Constraints

- El componente de cliente sigue el único precedente ya existente en el
  proyecto (`app/admin/lotes/[id]/BotonEliminarLote.tsx`): archivo chico,
  vive junto a la página que lo usa, sin lógica de red propia.
- El documento firmado lleva `required` nativo del navegador, sin ninguna
  excepción condicional — siempre obligatorio, en cualquier modo.
- Modo manual no exige que la suma de las cuotas coincida con el precio
  de lista — el balance es informativo, nunca bloqueante (sin cambios
  respecto a la spec anterior).
- El mecanismo de "cliente existente por email" (búsqueda + cartel de
  confirmación + redirect) no cambia su lógica interna — solo se mueve de
  posición en `venderLote` según el nuevo orden.
- La creación de la cuenta del comprador (invitación + insert en
  `profiles`) pasa a ocurrir DESPUÉS de validar montos y documento —
  nunca antes. Con esto, `clienteNuevoId`, `esClienteNuevo`,
  `confirmadoPorRecienCreado` y la validación de que
  `documentoFirmadoPath` apunte al lote correcto dejan de existir.
- No se toca la subida del documento en sí (`subirDocumentoFirmado`,
  bucket `comprobantes`, límite de 15 MB vía `excedeTamanioMaximo`) ni el
  descuento de seña vía FIFO al final de la función.

---

## Task 1: Componente de cliente + reordenar `venderLote` + tests

**Files:**
- Create: `app/admin/lotes/[id]/vender/CuotasYDocumento.tsx`
- Modify: `app/admin/lotes/[id]/vender/page.tsx` (reemplazo completo)
- Modify: `app/admin/lotes/[id]/vender/actions.ts` (reemplazo completo)
- Modify: `tests/e2e/vender-cuota-manual-documento.spec.ts`

**Interfaces:**
- Produces: componente `CuotasYDocumento` con props
  `{ precioTotal: number | null; montoSenaRegistrada: number | null;
  monedaSena: string | null; cantidadCuotasInicial: string; modoInicial:
  'automatico' | 'manual'; montosInicial: string[] }`. Renderiza los
  inputs `cantidadCuotas`, `modo` (radio), `cuotaMonto{1..N}` (solo en
  modo manual) y `documentoFirmado` — todos con los mismos `name` que ya
  usa `venderLote` para leerlos del `FormData`.
- Consumes: `calcularMontoCuota` de `@/lib/lotes/calcular-monto-cuota`
  (función pura, sin dependencias de servidor, segura de importar en un
  Client Component).

Una sola tarea porque el componente de cliente y el reordenamiento del
Server Action solo tienen sentido juntos — el componente asume que el
servidor ya no depende del viejo mecanismo multi-paso, y viceversa.

- [ ] **Step 1: Escribir los tests e2e que fallan**

Reemplazar el contenido completo de
`tests/e2e/vender-cuota-manual-documento.spec.ts`:

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
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('3')
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

  test('modo manual: montos distintos, balance en vivo, confirmación crea cuotas exactas', async ({
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
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('3')
    await page.locator('input[name="modo"][value="manual"]').check()

    await page.locator('input[name="cuotaMonto1"]').fill('4000')
    await page.locator('input[name="cuotaMonto2"]').fill('4000')
    await page.locator('input[name="cuotaMonto3"]').fill('3000')

    await expect(page.getByText('Suma total de las cuotas cargadas: 11000')).toBeVisible()
    await expect(page.getByText(/Diferencia respecto al precio de lista: \+1000/)).toBeVisible()

    await adjuntarDocumentoFirmado(page)
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
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

  test('modo manual + cliente existente: los montos ya tipeados se recuperan al volver de la confirmación', async ({
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
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('2')
    await page.locator('input[name="modo"][value="manual"]').check()
    await page.locator('input[name="cuotaMonto1"]').fill('2500')
    await page.locator('input[name="cuotaMonto2"]').fill('1500')
    await adjuntarDocumentoFirmado(page)
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()

    // El email ya tiene cuenta -- vuelve mostrando el aviso, con los montos
    // manuales ya tipeados recuperados solos (el documento hay que
    // reponerlo, limitación del navegador con los inputs de archivo).
    await page.waitForURL((url) => url.searchParams.has('confirmarClienteId'))
    await expect(page.getByText('Ya existe una cuenta de cliente con ese email')).toBeVisible()
    await expect(page.locator('input[name="cuotaMonto1"]')).toHaveValue('2500')
    await expect(page.locator('input[name="cuotaMonto2"]')).toHaveValue('1500')

    await adjuntarDocumentoFirmado(page)
    await page.getByRole('button', { name: 'Confirmar venta con esta cuenta existente' }).click()
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

  test('volver de Manual a Automático recalcula los montos sin perder nombre/email', async ({
    page,
  }) => {
    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Vender Cambiar Modo ${Date.now()}`,
      9000,
      fixtures.acreedorConDatos.id
    )
    const email = `comprador.cambiar.modo.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Nombre completo del comprador').fill('Comprador Cambiar Modo')
    await page.getByPlaceholder('Email del comprador').fill(email)
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('3')
    await page.locator('input[name="modo"][value="manual"]').check()
    await page.locator('input[name="cuotaMonto1"]').fill('5000')

    await page.locator('input[name="modo"][value="automatico"]').check()

    await expect(page.getByPlaceholder('Nombre completo del comprador')).toHaveValue(
      'Comprador Cambiar Modo'
    )
    await expect(page.getByPlaceholder('Email del comprador')).toHaveValue(email)
    await expect(page.locator('input[name="cuotaMonto1"]')).toHaveCount(0)

    await page.locator('input[name="modo"][value="manual"]').check()
    await expect(page.locator('input[name="cuotaMonto1"]')).toHaveValue('3000')
    await expect(page.locator('input[name="cuotaMonto2"]')).toHaveValue('3000')
    await expect(page.locator('input[name="cuotaMonto3"]')).toHaveValue('3000')
  })

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
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('1')
    await adjuntarDocumentoFirmado(page)
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL('**/admin/lotes')

    await page.goto(`/admin/lotes/${loteId}`)
    await expect(page.getByRole('link', { name: 'Ver documento firmado' })).toBeVisible()
  })
})
```

Nota: se eliminó el test "modo automático: vender sin documento firmado es
rechazado" del archivo anterior — con `required` nativo sin excepciones,
el navegador bloquea el envío antes de llegar al servidor, no hay forma
de alcanzar ese rechazo desde un test e2e real (ver sección de Testing de
la spec).

- [ ] **Step 2: Correr los tests para confirmar que fallan**

Run: `npx playwright test tests/e2e/vender-cuota-manual-documento.spec.ts --project=chromium`
Expected: FAIL — hoy no existe `CuotasYDocumento`, el flujo sigue siendo
multi-paso, y los selectores/textos nuevos no existen todavía.

- [ ] **Step 3: Crear `app/admin/lotes/[id]/vender/CuotasYDocumento.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { calcularMontoCuota } from '@/lib/lotes/calcular-monto-cuota'

interface Props {
  precioTotal: number | null
  montoSenaRegistrada: number | null
  monedaSena: string | null
  cantidadCuotasInicial: string
  modoInicial: 'automatico' | 'manual'
  montosInicial: string[]
}

function calcularMontosAutomaticos(precioTotal: number, cantidadCuotas: number): string[] {
  const base = calcularMontoCuota(precioTotal, cantidadCuotas)
  return Array.from({ length: cantidadCuotas }, (_, indice) => {
    const esUltima = indice === cantidadCuotas - 1
    const monto = esUltima ? Math.round((precioTotal - base * (cantidadCuotas - 1)) * 100) / 100 : base
    return String(monto)
  })
}

export function CuotasYDocumento({
  precioTotal,
  montoSenaRegistrada,
  monedaSena,
  cantidadCuotasInicial,
  modoInicial,
  montosInicial,
}: Props) {
  const [cantidadCuotasTexto, setCantidadCuotasTexto] = useState(cantidadCuotasInicial)
  const [modo, setModo] = useState<'automatico' | 'manual'>(modoInicial)
  const [montos, setMontos] = useState<string[]>(montosInicial)

  const cantidadCuotas = Number(cantidadCuotasTexto) || 0

  function recalcularMontos(nuevaCantidad: number, modoActual: 'automatico' | 'manual') {
    if (modoActual === 'automatico' && precioTotal !== null && nuevaCantidad > 0) {
      setMontos(calcularMontosAutomaticos(precioTotal, nuevaCantidad))
      return
    }
    setMontos((anteriores) => Array.from({ length: nuevaCantidad }, (_, i) => anteriores[i] ?? ''))
  }

  function manejarCambioCantidadCuotas(valor: string) {
    setCantidadCuotasTexto(valor)
    recalcularMontos(Number(valor) || 0, modo)
  }

  function manejarCambioModo(nuevoModo: 'automatico' | 'manual') {
    setModo(nuevoModo)
    recalcularMontos(cantidadCuotas, nuevoModo)
  }

  function manejarCambioMonto(indice: number, valor: string) {
    setMontos((anteriores) => {
      const nuevos = [...anteriores]
      nuevos[indice] = valor
      return nuevos
    })
  }

  const sumaManual = montos.reduce((acc, valor) => acc + (Number(valor) || 0), 0)
  const diferencia =
    modo === 'manual' && precioTotal !== null ? Math.round((sumaManual - precioTotal) * 100) / 100 : null

  return (
    <>
      <input
        name="cantidadCuotas"
        type="number"
        min="1"
        step="1"
        placeholder="Cantidad de cuotas (1 para venta al contado)"
        value={cantidadCuotasTexto}
        onChange={(evento) => manejarCambioCantidadCuotas(evento.target.value)}
        required
        className="rounded border px-3 py-2"
      />

      <fieldset className="rounded border px-3 py-2">
        <legend className="text-sm font-medium">Cómo cargar las cuotas</legend>
        <label className="mr-4 text-sm">
          <input
            type="radio"
            name="modo"
            value="automatico"
            checked={modo === 'automatico'}
            onChange={() => manejarCambioModo('automatico')}
            className="mr-1"
          />
          Automático
        </label>
        <label className="text-sm">
          <input
            type="radio"
            name="modo"
            value="manual"
            checked={modo === 'manual'}
            onChange={() => manejarCambioModo('manual')}
            className="mr-1"
          />
          Manual
        </label>
      </fieldset>

      {modo === 'manual' && cantidadCuotas > 0 && (
        <>
          {precioTotal !== null && (
            <p className="text-sm text-gray-600">Precio de lista del lote: {precioTotal}</p>
          )}
          {Array.from({ length: cantidadCuotas }, (_, indice) => (
            <input
              key={indice}
              name={`cuotaMonto${indice + 1}`}
              type="number"
              step="0.01"
              min="0"
              placeholder={`Cuota ${indice + 1}`}
              value={montos[indice] ?? ''}
              onChange={(evento) => manejarCambioMonto(indice, evento.target.value)}
              required
              className="rounded border px-3 py-2"
            />
          ))}
          <div className="rounded border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
            <p className="font-medium">Balance</p>
            <p className="mt-1">Suma total de las cuotas cargadas: {sumaManual}</p>
            {precioTotal !== null && <p>Precio de lista del lote: {precioTotal}</p>}
            {montoSenaRegistrada !== null && montoSenaRegistrada > 0 && (
              <p>
                Seña ya registrada: {montoSenaRegistrada} {monedaSena} (se descuenta de la cuota 1
                al confirmar)
              </p>
            )}
            {diferencia !== null && (
              <p className="mt-1 font-medium">
                Diferencia respecto al precio de lista: {diferencia > 0 ? '+' : ''}
                {diferencia}
              </p>
            )}
          </div>
        </>
      )}

      <label className="text-sm">
        Documento firmado (boleto de compraventa o escritura)
        <input
          name="documentoFirmado"
          type="file"
          required
          className="mt-1 block w-full rounded border px-3 py-2"
        />
      </label>
    </>
  )
}
```

- [ ] **Step 4: Reemplazar `app/admin/lotes/[id]/vender/page.tsx` completo**

```tsx
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { venderLote } from './actions'
import { CuotasYDocumento } from './CuotasYDocumento'

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

  const modoInicial: 'automatico' | 'manual' = modoPreservado === 'manual' ? 'manual' : 'automatico'
  const cantidadCuotasInicialNum = cantidadCuotasPreservada ? Number(cantidadCuotasPreservada) : 0
  const montosInicial: string[] = Array.from(
    { length: cantidadCuotasInicialNum },
    (_, i) => sp[`cuotaMonto${i + 1}`] ?? ''
  )

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
          {reserva && (
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
                confirmar. Volvé a adjuntar el documento firmado, ya que no se conserva al volver
                a esta pantalla.
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

          <form action={venderLoteConId} className="flex flex-col gap-3">
            {confirmarClienteId && (
              <input type="hidden" name="confirmarClienteExistente" value={confirmarClienteId} />
            )}

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

            <CuotasYDocumento
              precioTotal={lote!.precio_total}
              montoSenaRegistrada={reserva?.monto_sena ?? null}
              monedaSena={reserva?.moneda_sena ?? null}
              cantidadCuotasInicial={cantidadCuotasPreservada ?? ''}
              modoInicial={modoInicial}
              montosInicial={montosInicial}
            />

            <button type="submit" className="rounded bg-black px-3 py-2 text-white">
              {confirmarClienteId
                ? 'Confirmar venta con esta cuenta existente'
                : 'Confirmar venta y enviar invitación'}
            </button>
          </form>
        </>
      )}
    </main>
  )
}
```

- [ ] **Step 5: Reemplazar `app/admin/lotes/[id]/vender/actions.ts` completo**

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

function construirParamsPreservados(formData: FormData): URLSearchParams {
  const params = new URLSearchParams({
    fullName: (formData.get('fullName') as string) || '',
    email: (formData.get('email') as string) || '',
    cantidadCuotas: (formData.get('cantidadCuotas') as string) || '',
    fechaPrimeraCuota: (formData.get('fechaPrimeraCuota') as string) || '',
    modo: (formData.get('modo') as string) || 'automatico',
  })

  const cantidadCuotas = Number(formData.get('cantidadCuotas')) || 0
  for (let i = 1; i <= cantidadCuotas; i++) {
    const valor = formData.get(`cuotaMonto${i}`)
    if (valor !== null) {
      params.set(`cuotaMonto${i}`, valor as string)
    }
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

  // Cliente existente por email: chequeo de solo lectura, sin efectos
  // secundarios -- se hace ANTES de tocar montos/documento porque, si hace
  // falta confirmación explícita del admin, no tiene sentido haber subido
  // ya el documento (quedaría huérfano en el storage).
  const { data: clienteExistente } = await admin
    .from('profiles')
    .select('id, full_name, dni, domicilio, telefono')
    .eq('email', email)
    .eq('role', 'cliente')
    .maybeSingle()

  if (clienteExistente) {
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

      const params = construirParamsPreservados(formData)
      params.set('confirmarClienteId', clienteExistente.id)
      params.set('nombreEncontrado', clienteExistente.full_name ?? '')
      if (dniNoCoincide) {
        params.set('dniReserva', reserva!.dni as string)
        params.set('dniPerfil', clienteExistente.dni as string)
      }
      redirect(`/admin/lotes/${loteId}/vender?${params.toString()}`)
    }
  }

  // Montos manuales: se validan antes de tocar el documento (chequeo
  // barato, sin I/O) o la cuenta del comprador.
  let montosManuales: number[] = []

  if (modo === 'manual') {
    const montosManualesRaw: string[] = []
    for (let i = 1; i <= cantidadCuotas; i++) {
      montosManualesRaw.push(((formData.get(`cuotaMonto${i}`) as string) || '').trim())
    }

    if (montosManualesRaw.some((valor) => valor === '')) {
      redirectVenderConError(loteId, 'Completá el monto de todas las cuotas', construirParamsPreservados(formData))
    }

    montosManuales = montosManualesRaw.map((valor) => Number(valor))
    if (!montosManuales.every((monto) => Number.isFinite(monto) && monto >= 0)) {
      redirectVenderConError(
        loteId,
        'Los montos de las cuotas tienen que ser números válidos, no negativos',
        construirParamsPreservados(formData)
      )
    }
  }

  // Documento firmado: siempre obligatorio, se sube una sola vez acá --
  // recién ahora, con todo lo demás ya validado.
  const documentoFirmado = formData.get('documentoFirmado') as File

  if (!documentoFirmado || documentoFirmado.size === 0) {
    redirectVenderConError(
      loteId,
      'Subí el documento firmado (boleto o escritura)',
      construirParamsPreservados(formData)
    )
  }

  if (excedeTamanioMaximo(documentoFirmado)) {
    redirectVenderConError(
      loteId,
      `El documento firmado pesa más de ${MAX_ARCHIVO_MB} MB — subí uno más liviano.`,
      construirParamsPreservados(formData)
    )
  }

  const { filePath: documentoFirmadoPath, error: errorSubidaDocumento } = await subirDocumentoFirmado(
    documentoFirmado
  )

  if (errorSubidaDocumento) {
    console.error('Error al subir el documento firmado:', errorSubidaDocumento)
    redirectVenderConError(
      loteId,
      'No se pudo subir el documento firmado. Probá de nuevo.',
      construirParamsPreservados(formData)
    )
  }

  // Recién acá, con documento y montos ya validados, se resuelve la cuenta
  // del comprador -- si es nueva, se crea en este mismo paso, nunca antes.
  let clienteId: string

  if (clienteExistente) {
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

  let montoCuotaBase: number | null
  let cuotas: CuotaGenerada[]

  if (modo === 'manual') {
    montoCuotaBase = null
    cuotas = generarCuotasManual(montosManuales, fechaPrimeraCuota)
  } else {
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

- [ ] **Step 6: Correr los tests nuevos para confirmar que pasan**

Run: `npx playwright test tests/e2e/vender-cuota-manual-documento.spec.ts --project=chromium`
Expected: PASS — 5/5.

- [ ] **Step 7: Correr la regresión completa de vender**

Run: `npx playwright test tests/e2e/pase-a-vendido.spec.ts tests/e2e/vender-datos-cliente.spec.ts tests/e2e/cliente-varios-lotes.spec.ts tests/e2e/vender-cuota-manual-documento.spec.ts --project=chromium`
Expected: PASS. Estos 3 specs existentes usan modo automático de punta a
punta (single submit) — no deberían necesitar ningún cambio, son la red
de seguridad principal de esta tarea.

- [ ] **Step 8: `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 9: Commit**

```bash
git add "app/admin/lotes/[id]/vender/CuotasYDocumento.tsx" "app/admin/lotes/[id]/vender/page.tsx" "app/admin/lotes/[id]/vender/actions.ts" tests/e2e/vender-cuota-manual-documento.spec.ts
git commit -m "feat: JS acotado para cuotas/documento al vender, cuenta se crea al final"
```
