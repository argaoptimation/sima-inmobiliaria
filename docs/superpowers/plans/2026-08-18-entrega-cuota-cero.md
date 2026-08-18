# "Entrega" (cuota cero / anticipo al boleto) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir cargar un monto de "entrega" (anticipo adicional a la seña, entregado al firmar
el boleto) al vender un lote, registrado como un pago propio sin imputación FIFO.

**Architecture:** Un campo nuevo en el formulario ya existente de `venderLote`, que fluye del
componente cliente `CuotasYDocumento.tsx` a la Server Action `venderLote`. Reusa `pagos` tal cual
(solo agrega un valor al enum `motivo_pago` ya existente). No toca `calcularMontoCuota` ni
`generarCuotas` en ningún modo.

**Tech Stack:** Next.js 16 App Router, Server Actions, Supabase (Postgres), Playwright e2e.

## Global Constraints

- Spec completa: `docs/superpowers/specs/2026-08-18-entrega-cuota-cero-design.md`.
- La entrega es opcional; vacío equivale a 0, sin ningún pago creado.
- La entrega se registra como `pagos` con `motivo: 'entrega'`, `estado: 'confirmado'`, **sin**
  filas en `pago_imputaciones` — a diferencia de la seña, nunca se reparte a ninguna cuota.
- El modo automático de cálculo de cuotas (`calcularMontoCuota`/`generarCuotas`) no se toca ni
  conoce la entrega — decisión explícita, fuera de alcance.
- El modo manual no cambia su lógica de guardado — Nicolás ya tipea los montos de cuota
  descontando la entrega él mismo. Solo cambia el panel informativo "Balance".

---

### Task 1: Migración — nuevo valor `'entrega'` en `motivo_pago`

**Files:**
- Create: `supabase/migrations/0026_pagos_entrega.sql`

**Interfaces:**
- Produces: valor `'entrega'` agregado al enum `public.motivo_pago` (ya tiene `'cuota'`, `'sena'`,
  `'ajuste'`).

**Esta tarea la ejecuta el controller directamente contra la base real vía el MCP de Supabase — no
se dispatchea a un implementador** (mismo patrón que las migraciones anteriores de esta sesión).

- [ ] **Paso 1: Verificar el proyecto Supabase correcto**

`mcp__supabase__get_project_url` y confirmar que coincide con `NEXT_PUBLIC_SUPABASE_URL` de
`.env.local` (`https://zcdjuxuvsfickymrhynx.supabase.co`).

- [ ] **Paso 2: Escribir y aplicar la migración**

```sql
alter type public.motivo_pago add value 'entrega';
```

Aplicar con `mcp__supabase__apply_migration` (`name: "pagos_entrega"`).

- [ ] **Paso 3: Verificar aplicada**

```sql
select unnest(enum_range(null::public.motivo_pago))::text as valor;
```

Esperado: 4 filas — `cuota`, `sena`, `ajuste`, `entrega`.

- [ ] **Paso 4: Commit**

```bash
git add supabase/migrations/0026_pagos_entrega.sql
git commit -m "feat: agrega motivo 'entrega' a pagos para el anticipo al boleto"
```

---

### Task 2: Campo "Entrega" en el formulario de venta + registro como pago propio

**Files:**
- Modify: `app/admin/lotes/[id]/vender/CuotasYDocumento.tsx`
- Modify: `app/admin/lotes/[id]/vender/page.tsx`
- Modify: `app/admin/lotes/[id]/vender/actions.ts`
- Modify: `app/admin/pagos/page.tsx`
- Test: `tests/e2e/vender-entrega.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `CuotasYDocumento` ya recibe `precioTotal`, `montoSenaRegistrada`, `monedaSena`,
  `cantidadCuotasInicial`, `modoInicial`, `montosInicial` (sin cambios de tipo en estas).
  `construirParamsPreservados(formData: FormData): URLSearchParams` y
  `redirectVenderConError(loteId, mensaje, paramsPreservados): never` ya existen en `actions.ts`.
- Produces: `CuotasYDocumento` gana una prop nueva `entregaInicial: string`. El formulario de venta
  envía un campo `entregaMonto` (string, puede venir vacío). `venderLote` sigue con la misma firma
  `venderLote(loteId: string, formData: FormData): Promise<void>`.

Este proyecto tiene la convención ya establecida de implementar y verificar con Playwright al
final del cambio (no TDD estricto con e2e fallando primero, dado el costo de levantar el
navegador por cada paso) — seguí ese mismo orden: implementación completa, después tests.

#### Paso 1: `CuotasYDocumento.tsx` — input de entrega + balance actualizado

- [ ] Modificar la interfaz `Props` agregando `entregaInicial: string`:

```ts
interface Props {
  precioTotal: number | null
  montoSenaRegistrada: number | null
  monedaSena: string | null
  cantidadCuotasInicial: string
  modoInicial: 'automatico' | 'manual'
  montosInicial: string[]
  entregaInicial: string
}
```

- [ ] Agregar `entregaInicial` a la desestructuración de props y el estado nuevo, junto al resto
  de los `useState` ya existentes:

```ts
export function CuotasYDocumento({
  precioTotal,
  montoSenaRegistrada,
  monedaSena,
  cantidadCuotasInicial,
  modoInicial,
  montosInicial,
  entregaInicial,
}: Props) {
  const [cantidadCuotasTexto, setCantidadCuotasTexto] = useState(cantidadCuotasInicial)
  const [modo, setModo] = useState<'automatico' | 'manual'>(modoInicial)
  const [entregaTexto, setEntregaTexto] = useState(entregaInicial)
  const [montos, setMontos] = useState<string[]>(() => {
```

(el resto del cuerpo de ese `useState` de `montos` queda igual, sin cambios)

- [ ] Modificar el cálculo de `sumaManual`/`diferencia` para incorporar la entrega:

```ts
  const entrega = Number(entregaTexto) || 0
  const sumaManual = Math.round(montos.reduce((acc, valor) => acc + (Number(valor) || 0), 0) * 100) / 100
  const diferencia =
    modo === 'manual' && precioTotal !== null
      ? Math.round((sumaManual + entrega - precioTotal) * 100) / 100
      : null
```

- [ ] Agregar el input de entrega en el JSX, después del `fieldset` de "Cómo cargar las cuotas" y
  antes del bloque `{modo === 'manual' && ...}` que renderiza los inputs de cuota:

```tsx
      <label className="text-sm">
        Entrega (opcional — monto entregado al firmar el boleto, además de la seña)
        <input
          name="entregaMonto"
          type="number"
          step="0.01"
          min="0"
          placeholder="Entrega"
          value={entregaTexto}
          onChange={(evento) => setEntregaTexto(evento.target.value)}
          className="mt-1 block w-full rounded border px-3 py-2"
        />
      </label>
```

- [ ] Agregar la línea "Entrega ingresada" en el panel "Balance", junto a la línea de "Seña ya
  registrada" que ya existe:

```tsx
          {montoSenaRegistrada !== null && montoSenaRegistrada > 0 && (
            <p>
              Seña ya registrada: {montoSenaRegistrada} {monedaSena} (se descuenta de las primeras
              cuotas al confirmar)
            </p>
          )}
          {entrega > 0 && (
            <p>
              Entrega ingresada: {entrega} (no se descuenta de ninguna cuota, reduce el total
              financiado)
            </p>
          )}
```

#### Paso 2: `page.tsx` — pasar y preservar `entregaMonto`

- [ ] Agregar `entregaMonto?: string` a la interfaz de `searchParams`:

```ts
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
    entregaMonto?: string
    [cuotaMontoKey: string]: string | undefined
  }>
```

- [ ] Agregar `entregaMonto: entregaMontoPreservado` a la desestructuración de `sp`:

```ts
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
    entregaMonto: entregaMontoPreservado,
  } = sp
```

- [ ] Pasar la prop nueva a `CuotasYDocumento`:

```tsx
            <CuotasYDocumento
              precioTotal={lote!.precio_total}
              montoSenaRegistrada={reserva?.monto_sena ?? null}
              monedaSena={reserva?.moneda_sena ?? null}
              cantidadCuotasInicial={cantidadCuotasPreservada ?? ''}
              modoInicial={modoInicial}
              montosInicial={montosInicial}
              entregaInicial={entregaMontoPreservado ?? ''}
            />
```

#### Paso 3: `actions.ts` — validar y registrar la entrega

- [ ] Agregar `entregaMonto` a `construirParamsPreservados`:

```ts
function construirParamsPreservados(formData: FormData): URLSearchParams {
  const params = new URLSearchParams({
    fullName: (formData.get('fullName') as string) || '',
    email: (formData.get('email') as string) || '',
    cantidadCuotas: (formData.get('cantidadCuotas') as string) || '',
    fechaPrimeraCuota: (formData.get('fechaPrimeraCuota') as string) || '',
    modo: (formData.get('modo') as string) || 'automatico',
    entregaMonto: (formData.get('entregaMonto') as string) || '',
  })
```

(el resto de la función, el loop de `cuotaMonto${i}`, queda igual sin cambios)

- [ ] Leer y validar `entregaMonto`, inmediatamente después del bloque que valida
  `montosManuales` (después de la línea que cierra el `if (modo === 'manual') { ... }` de
  validación, antes del comentario `// Documento firmado: siempre obligatorio...`):

```ts
  const entregaMontoRaw = ((formData.get('entregaMonto') as string) || '').trim()
  let entregaMonto = 0
  if (entregaMontoRaw !== '') {
    entregaMonto = Number(entregaMontoRaw)
    if (!Number.isFinite(entregaMonto) || entregaMonto < 0) {
      redirectVenderConError(
        loteId,
        'El monto de la entrega tiene que ser un número válido, no negativo',
        construirParamsPreservados(formData)
      )
    }
  }
```

- [ ] Registrar el pago de entrega, después del bloque que ya registra la seña y sus
  imputaciones (justo antes del `redirect('/admin/lotes')` final de la función):

```ts
  if (entregaMonto > 0) {
    const { error: errorPagoEntrega } = await admin.from('pagos').insert({
      cliente_id: clienteId,
      lote_id: loteId,
      monto: entregaMonto,
      moneda: loteActual!.moneda,
      motivo: 'entrega',
      estado: 'confirmado',
      confirmado_admin_por: adminUser!.id,
      confirmado_admin_at: new Date().toISOString(),
    })

    if (errorPagoEntrega) {
      redirect(
        `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(
          `La venta se completó pero no se pudo registrar la entrega como pago: ${errorPagoEntrega.message}`
        )}`
      )
    }
  }

  redirect('/admin/lotes')
}
```

(el `redirect('/admin/lotes')` ya existente al final de la función se reemplaza por este bloque —
no queda duplicado)

#### Paso 4: `app/admin/pagos/page.tsx` — etiqueta "Entrega"

- [ ] Modificar la línea que mapea `motivo` a texto legible:

```tsx
                <td>
                  {pago.motivo === 'sena'
                    ? 'Seña'
                    : pago.motivo === 'ajuste'
                      ? 'Ajuste'
                      : pago.motivo === 'entrega'
                        ? 'Entrega'
                        : 'Cuota'}
                </td>
```

#### Paso 5: Tests e2e

- [ ] Crear `tests/e2e/vender-entrega.spec.ts`:

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

async function crearReservaConSena(loteId: string, montoSena: number, adminId: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('reservas').insert({
    lote_id: loteId,
    nombre_completo: 'Comprador Con Seña',
    dni: `${Date.now()}`.slice(-8),
    domicilio: 'Domicilio E2E',
    email: `sena.${Date.now()}@sima-e2e.invalid`,
    telefono: '3510000000',
    estado_civil: 'soltero',
    monto_sena: montoSena,
    moneda_sena: 'USD',
    recibido_por: adminId,
    comprobante_sena_path: 'reservas/e2e-comprobante-fake.pdf',
    created_by: adminId,
  })

  if (error) {
    throw new Error(`No se pudo crear la reserva de prueba: ${error.message}`)
  }
}

function adjuntarDocumentoFirmado(page: import('@playwright/test').Page) {
  return page.setInputFiles('input[name="documentoFirmado"]', {
    name: `e2e-documento-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
}

async function venderConEntrega(
  page: import('@playwright/test').Page,
  loteId: string,
  datos: { email: string; fullName: string; entregaMonto?: string }
) {
  await page.goto(`/admin/lotes/${loteId}/vender`)
  await page.getByPlaceholder('Nombre completo del comprador').fill(datos.fullName)
  await page.getByPlaceholder('Email del comprador').fill(datos.email)
  await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
  await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('1')
  if (datos.entregaMonto !== undefined) {
    await page.getByPlaceholder('Entrega').fill(datos.entregaMonto)
  }
  await adjuntarDocumentoFirmado(page)
  await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
}

test.describe('Vender — entrega (anticipo al boleto)', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('venta con entrega en modo manual: se crea el pago sin imputaciones', async ({ page }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Vender Entrega ${Date.now()}`,
      10000,
      fixtures.acreedorConDatos.id
    )
    const email = `comprador.entrega.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.admin.email, fixtures.password)
    await venderConEntrega(page, loteId, { email, fullName: 'Comprador Con Entrega', entregaMonto: '2000' })
    await page.waitForURL('**/admin/lotes')

    const { data: lote } = await admin.from('lotes').select('cliente_id').eq('id', loteId).single()
    const { data: pagos } = await admin
      .from('pagos')
      .select('id, monto, motivo, estado')
      .eq('lote_id', loteId)
      .eq('motivo', 'entrega')

    expect(pagos).toHaveLength(1)
    expect(pagos![0].monto).toBe(2000)
    expect(pagos![0].estado).toBe('confirmado')

    const { data: imputaciones } = await admin
      .from('pago_imputaciones')
      .select('id')
      .eq('pago_id', pagos![0].id)
    expect(imputaciones).toHaveLength(0)
  })

  test('venta sin entrega: no se crea ningún pago con motivo entrega', async ({ page }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Vender Sin Entrega ${Date.now()}`,
      5000,
      fixtures.acreedorConDatos.id
    )
    const email = `comprador.sin.entrega.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.admin.email, fixtures.password)
    await venderConEntrega(page, loteId, { email, fullName: 'Comprador Sin Entrega' })
    await page.waitForURL('**/admin/lotes')

    const { data: pagos } = await admin
      .from('pagos')
      .select('id')
      .eq('lote_id', loteId)
      .eq('motivo', 'entrega')
    expect(pagos).toHaveLength(0)
  })

  test('venta con entrega + seña ya registrada: quedan como dos pagos separados', async ({ page }) => {
    const admin = createAdminClient()
    const { data: adminProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', fixtures.admin.email)
      .single()
    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Vender Entrega Y Sena ${Date.now()}`,
      10000,
      fixtures.acreedorConDatos.id
    )
    await crearReservaConSena(loteId, 100, adminProfile!.id)
    const email = `comprador.entrega.sena.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.admin.email, fixtures.password)
    await venderConEntrega(page, loteId, { email, fullName: 'Comprador Entrega Y Seña', entregaMonto: '1900' })
    await page.waitForURL('**/admin/lotes')

    const { data: pagoSena } = await admin
      .from('pagos')
      .select('id, monto')
      .eq('lote_id', loteId)
      .eq('motivo', 'sena')
      .single()
    const { data: pagoEntrega } = await admin
      .from('pagos')
      .select('id, monto')
      .eq('lote_id', loteId)
      .eq('motivo', 'entrega')
      .single()

    expect(pagoSena!.monto).toBe(100)
    expect(pagoEntrega!.monto).toBe(1900)

    const { data: imputacionesSena } = await admin
      .from('pago_imputaciones')
      .select('id')
      .eq('pago_id', pagoSena!.id)
    expect(imputacionesSena!.length).toBeGreaterThan(0)

    const { data: imputacionesEntrega } = await admin
      .from('pago_imputaciones')
      .select('id')
      .eq('pago_id', pagoEntrega!.id)
    expect(imputacionesEntrega).toHaveLength(0)
  })

  test('entrega inválida (negativa) corta sin completar la venta, preservando el resto del formulario', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteReservadoListoParaVender(
      `E2E Vender Entrega Invalida ${Date.now()}`,
      5000,
      fixtures.acreedorConDatos.id
    )
    const email = `comprador.entrega.invalida.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.admin.email, fixtures.password)
    await venderConEntrega(page, loteId, { email, fullName: 'Comprador Entrega Inválida', entregaMonto: '-50' })

    await expect(page.getByText(/monto de la entrega tiene que ser un número válido/)).toBeVisible()
    await expect(page.getByPlaceholder('Nombre completo del comprador')).toHaveValue(
      'Comprador Entrega Inválida'
    )
    await expect(page.getByPlaceholder('Email del comprador')).toHaveValue(email)

    const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()
    expect(lote?.estado).toBe('reservado')
  })
})
```

- [ ] **Paso 6: Correr los tests nuevos**

Run: `npx playwright test tests/e2e/vender-entrega.spec.ts`
Expected: 4/4 passing.

- [ ] **Paso 7: Correr la suite existente de vender, para descartar regresión en el balance**

Run: `npx playwright test tests/e2e/vender-cuota-manual-documento.spec.ts tests/e2e/vender-datos-cliente.spec.ts tests/e2e/pase-a-vendido.spec.ts`
Expected: todos passing (en particular, el test `modo manual: montos distintos, balance en vivo,
confirmación crea cuotas exactas` de `vender-cuota-manual-documento.spec.ts` sigue esperando
`Diferencia respecto al precio de lista: +1000` sin cambios, ya que no carga ninguna entrega).

- [ ] **Paso 8: Commit**

```bash
git add app/admin/lotes/[id]/vender/CuotasYDocumento.tsx app/admin/lotes/[id]/vender/page.tsx app/admin/lotes/[id]/vender/actions.ts app/admin/pagos/page.tsx tests/e2e/vender-entrega.spec.ts
git commit -m "feat: agrega campo de entrega al vender un lote, registrado como pago propio sin FIFO"
```
