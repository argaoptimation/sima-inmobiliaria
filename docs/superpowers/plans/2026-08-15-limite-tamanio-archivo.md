# Límite de tamaño de archivo en subidas — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para seguimiento.

**Goal:** Que ningún upload del sistema (comprobantes, fotos de DNI) acepte
un archivo de más de 15 MB, validado en el servidor con un mensaje de error
claro.

**Architecture:** Un helper compartido y genérico (`lib/storage/validar-
tamanio-archivo.ts`) con la constante del límite y una función booleana de
chequeo, aplicado en los 6 puntos de subida existentes del proyecto (5 en
`app/admin/lotes/[id]/reservar/actions.ts`, 1 en
`app/portal-cliente/pagos/[id]/comprobante/actions.ts`), usando el mismo
patrón de `redirect` + mensaje de error en español que cada archivo ya usa
para sus otras validaciones.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Vitest (unitarios),
Playwright (e2e), Supabase Storage.

## Global Constraints

- Límite: 15 MB por archivo (`15 * 1024 * 1024` bytes), igual para todos
  los campos — no hay límites distintos por tipo de campo.
- La validación es 100% server-side — no hay JavaScript de cliente en este
  proyecto (fuera del patrón ya establecido de confirm-dialog, que no
  aplica acá). Un archivo grande tarda en subir igual antes de ser
  rechazado; es una limitación aceptada.
- Cada mensaje de error debe nombrar qué campo pesa de más (ej. "El
  comprobante de la seña pesa más de 15 MB — subí uno más liviano."), en
  español, siguiendo el estilo ya usado en cada archivo.
- El helper (`MAX_ARCHIVO_BYTES`, `excedeTamanioMaximo`) es genérico y sin
  dependencias del dominio (no importa nada de `reservar` ni de `pagos`) —
  otra pieza en curso en paralelo (documento firmado al vender) lo va a
  reusar directamente para su propio upload nuevo.

---

## Task 1: Helper compartido de límite de tamaño

**Files:**
- Create: `lib/storage/validar-tamanio-archivo.ts`
- Test: `lib/storage/validar-tamanio-archivo.test.ts`

**Interfaces:**
- Produces: `MAX_ARCHIVO_BYTES: number` (constante, `15 * 1024 * 1024`),
  `excedeTamanioMaximo(archivo: File): boolean`. Ambos exportados desde
  `lib/storage/validar-tamanio-archivo.ts`, consumidos por las Tasks 2 y 3
  de este plan (y, en otra pieza aparte, por el upload de "documento
  firmado" al vender).

- [ ] **Step 1: Escribir el test que falla**

```ts
// lib/storage/validar-tamanio-archivo.test.ts
import { describe, expect, it } from 'vitest'
import { MAX_ARCHIVO_BYTES, excedeTamanioMaximo } from './validar-tamanio-archivo'

function archivoDeTamanio(bytes: number): File {
  return new File([new Uint8Array(bytes)], 'archivo-test.pdf', { type: 'application/pdf' })
}

describe('excedeTamanioMaximo', () => {
  it('un archivo de exactamente el límite no excede', () => {
    expect(excedeTamanioMaximo(archivoDeTamanio(MAX_ARCHIVO_BYTES))).toBe(false)
  })

  it('un archivo de un byte más que el límite excede', () => {
    expect(excedeTamanioMaximo(archivoDeTamanio(MAX_ARCHIVO_BYTES + 1))).toBe(true)
  })

  it('un archivo chico no excede', () => {
    expect(excedeTamanioMaximo(archivoDeTamanio(1024))).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `npx vitest run lib/storage/validar-tamanio-archivo.test.ts`
Expected: FAIL — no existe el módulo `./validar-tamanio-archivo`.

- [ ] **Step 3: Implementación mínima**

```ts
// lib/storage/validar-tamanio-archivo.ts
export const MAX_ARCHIVO_BYTES = 15 * 1024 * 1024

export function excedeTamanioMaximo(archivo: File): boolean {
  return archivo.size > MAX_ARCHIVO_BYTES
}
```

- [ ] **Step 4: Correr el test para confirmar que pasa**

Run: `npx vitest run lib/storage/validar-tamanio-archivo.test.ts`
Expected: PASS — 3 tests en verde.

- [ ] **Step 5: Commit**

```bash
git add lib/storage/validar-tamanio-archivo.ts lib/storage/validar-tamanio-archivo.test.ts
git commit -m "feat: agregar helper de límite de tamaño de archivo (15 MB)"
```

---

## Task 2: Aplicar el límite en la reserva de lote

**Files:**
- Modify: `app/admin/lotes/[id]/reservar/actions.ts`
- Test: `tests/e2e/limite-tamanio-archivo.spec.ts`

**Interfaces:**
- Consumes: `MAX_ARCHIVO_BYTES`, `excedeTamanioMaximo` de
  `lib/storage/validar-tamanio-archivo.ts` (Task 1, ya mergeada).

Este archivo tiene 5 campos de archivo: `comprobante`, `dniFrente`,
`dniDorso` (los 3 obligatorios), `dniConyuge`, `sentenciaDivorcio` (los 2
opcionales, solo obligatorios según `estadoCivil`). Se agrega el chequeo
de tamaño inmediatamente después de cada validación de presencia ya
existente, con el mismo patrón de `redirect`.

- [ ] **Step 1: Escribir el test e2e que falla**

Crear `tests/e2e/limite-tamanio-archivo.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const ARCHIVO_GRANDE = Buffer.alloc(16 * 1024 * 1024)
const ARCHIVO_CHICO = Buffer.from('contenido de prueba chico')

async function crearLoteDisponible(identificador: string) {
  const admin = createAdminClient()
  const { data: lote, error } = await admin
    .from('lotes')
    .insert({
      identificador,
      moneda: 'USD',
      estado: 'disponible',
      cantidad_cuotas: 1,
      monto_cuota_base: 1,
    })
    .select('id')
    .single()

  if (error || !lote) {
    throw new Error(`No se pudo crear el lote disponible de prueba: ${error?.message}`)
  }

  return lote.id as string
}

test.describe('Límite de tamaño de archivo en subidas', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('un comprobante de seña de más de 15 MB se rechaza al reservar', async ({ page }) => {
    const loteId = await crearLoteDisponible(`E2E Lote Archivo Grande ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)

    await page.getByPlaceholder('Nombre completo').fill('Comprador E2E')
    await page.getByPlaceholder('DNI', { exact: true }).fill('30111222')
    await page.getByPlaceholder('Domicilio').fill('Calle Falsa 123')
    await page.getByPlaceholder('Email').fill('comprador.archivo.grande@sima-demo.invalid')
    await page.getByPlaceholder('Teléfono', { exact: true }).fill('3511234567')
    await page.selectOption('select[name="estadoCivil"]', 'soltero')
    await page.getByPlaceholder('Monto de la seña').fill('500')
    await page.setInputFiles('input[name="comprobante"]', {
      name: 'comprobante-grande.pdf',
      mimeType: 'application/pdf',
      buffer: ARCHIVO_GRANDE,
    })
    await page.setInputFiles('input[name="dniFrente"]', {
      name: 'dni-frente.pdf',
      mimeType: 'application/pdf',
      buffer: ARCHIVO_CHICO,
    })
    await page.setInputFiles('input[name="dniDorso"]', {
      name: 'dni-dorso.pdf',
      mimeType: 'application/pdf',
      buffer: ARCHIVO_CHICO,
    })
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()

    await expect(page.getByText(/pesa más de 15 MB/)).toBeVisible()

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()
    expect(lote?.estado).toBe('disponible')
  })
})
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `npx playwright test tests/e2e/limite-tamanio-archivo.spec.ts --project=chromium`
Expected: FAIL — el lote queda "reservado" (no se rechaza el archivo
grande) y no aparece el texto "pesa más de 15 MB" en ningún lado.

- [ ] **Step 3: Agregar el import del helper**

En `app/admin/lotes/[id]/reservar/actions.ts`, junto al resto de los
imports:

```ts
import { excedeTamanioMaximo } from '@/lib/storage/validar-tamanio-archivo'
```

- [ ] **Step 4: Agregar el chequeo para el comprobante de la seña**

Ubicar este bloque existente:

```ts
  if (!comprobante || comprobante.size === 0) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('Subí el comprobante de la seña')}`
    )
  }
```

Agregar inmediatamente después:

```ts
  if (excedeTamanioMaximo(comprobante)) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent(
        'El comprobante de la seña pesa más de 15 MB — subí uno más liviano.'
      )}`
    )
  }
```

- [ ] **Step 5: Agregar el chequeo para las fotos de DNI (frente y dorso)**

Ubicar este bloque existente:

```ts
  if (!dniFrente || dniFrente.size === 0 || !dniDorso || dniDorso.size === 0) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('Subí las fotos del DNI (frente y dorso)')}`
    )
  }
```

Agregar inmediatamente después:

```ts
  if (excedeTamanioMaximo(dniFrente)) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent(
        'La foto del DNI (frente) pesa más de 15 MB — subí una más liviana.'
      )}`
    )
  }

  if (excedeTamanioMaximo(dniDorso)) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent(
        'La foto del DNI (dorso) pesa más de 15 MB — subí una más liviana.'
      )}`
    )
  }
```

- [ ] **Step 6: Agregar el chequeo para el DNI del cónyuge (opcional)**

Ubicar este bloque existente:

```ts
  if (estadoCivil === 'casado' && (!dniConyuge || dniConyuge.size === 0)) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent(
        'Subí el DNI del cónyuge (elegiste "Casado/a")'
      )}`
    )
  }
```

Agregar inmediatamente después:

```ts
  if (dniConyuge && dniConyuge.size > 0 && excedeTamanioMaximo(dniConyuge)) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent(
        'La foto del DNI del cónyuge pesa más de 15 MB — subí una más liviana.'
      )}`
    )
  }
```

- [ ] **Step 7: Agregar el chequeo para la sentencia de divorcio (opcional)**

Ubicar este bloque existente:

```ts
  if (estadoCivil === 'divorciado' && (!sentenciaDivorcio || sentenciaDivorcio.size === 0)) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent(
        'Subí la sentencia de divorcio (elegiste "Divorciado/a")'
      )}`
    )
  }
```

Agregar inmediatamente después:

```ts
  if (sentenciaDivorcio && sentenciaDivorcio.size > 0 && excedeTamanioMaximo(sentenciaDivorcio)) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent(
        'La sentencia de divorcio pesa más de 15 MB — subí una más liviana.'
      )}`
    )
  }
```

- [ ] **Step 8: Correr el test para confirmar que pasa**

Run: `npx playwright test tests/e2e/limite-tamanio-archivo.spec.ts --project=chromium`
Expected: PASS.

- [ ] **Step 9: Correr los tests e2e existentes de reserva para confirmar que no se rompió nada**

Run: `npx playwright test tests/e2e/reserva-lote.spec.ts tests/e2e/fotos-reserva.spec.ts tests/e2e/buscar-cliente-dni.spec.ts --project=chromium`
Expected: PASS — todos los tests que ya subían archivos chicos siguen
pasando sin cambios de comportamiento.

- [ ] **Step 10: Commit**

```bash
git add app/admin/lotes/[id]/reservar/actions.ts tests/e2e/limite-tamanio-archivo.spec.ts
git commit -m "feat: rechazar archivos de más de 15 MB al reservar un lote"
```

---

## Task 3: Aplicar el límite al comprobante de pago del portal del cliente

**Files:**
- Modify: `app/portal-cliente/pagos/[id]/comprobante/actions.ts`
- Test: `tests/e2e/limite-tamanio-archivo.spec.ts` (agrega un test al
  archivo creado en la Task 2)

**Interfaces:**
- Consumes: `excedeTamanioMaximo` de `lib/storage/validar-tamanio-archivo.ts`
  (Task 1, ya mergeada).
- Consumes: `TestFixtures.cliente` (`{ id, email }`) y
  `TestFixtures.cuotaIds` (`string[]`, 3 cuotas pendientes de 1000 USD
  cada una, ya cargadas por `ensureTestFixtures()`) de
  `tests/e2e/fixtures/test-data.ts` — ya existen, no hace falta crear
  ningún fixture nuevo.

- [ ] **Step 1: Escribir el test e2e que falla**

Agregar al final de `tests/e2e/limite-tamanio-archivo.spec.ts`, dentro del
mismo `test.describe`:

```ts
  test('un comprobante de pago de más de 15 MB se rechaza en el portal del cliente', async ({
    page,
  }) => {
    await login(page, fixtures.cliente.email, fixtures.password)

    const cuotaId = fixtures.cuotaIds[0]
    await page.goto(`/portal-cliente/pagar/${cuotaId}`)
    await page.getByPlaceholder('Monto transferido').fill('1000')
    await page.getByRole('button', { name: 'Ya transferí' }).click()
    await page.waitForURL('**/portal-cliente/pagos/**/comprobante')

    await page.setInputFiles('input[name="comprobante"]', {
      name: 'comprobante-pago-grande.pdf',
      mimeType: 'application/pdf',
      buffer: ARCHIVO_GRANDE,
    })
    await page.getByRole('button', { name: 'Finalizar' }).click()

    await expect(page.getByText(/pesa más de 15 MB/)).toBeVisible()
  })
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `npx playwright test tests/e2e/limite-tamanio-archivo.spec.ts --project=chromium -g "comprobante de pago"`
Expected: FAIL — el comprobante grande se acepta, no aparece el mensaje
de error.

- [ ] **Step 3: Agregar el import y el chequeo en la acción**

En `app/portal-cliente/pagos/[id]/comprobante/actions.ts`, agregar el
import junto al resto:

```ts
import { excedeTamanioMaximo } from '@/lib/storage/validar-tamanio-archivo'
```

Ubicar este bloque existente:

```ts
  if (!comprobante || comprobante.size === 0) {
    redirect(
      `/portal-cliente/pagos/${pagoId}/comprobante?error=${encodeURIComponent('Seleccioná un archivo')}`
    )
  }
```

Agregar inmediatamente después:

```ts
  if (excedeTamanioMaximo(comprobante)) {
    redirect(
      `/portal-cliente/pagos/${pagoId}/comprobante?error=${encodeURIComponent(
        'El comprobante pesa más de 15 MB — subí uno más liviano.'
      )}`
    )
  }
```

- [ ] **Step 4: Correr el test para confirmar que pasa**

Run: `npx playwright test tests/e2e/limite-tamanio-archivo.spec.ts --project=chromium`
Expected: PASS — los 2 tests del archivo en verde.

- [ ] **Step 5: Correr los tests e2e existentes de pagos del portal para confirmar que no se rompió nada**

Run: `npx playwright test tests/e2e/cliente-varios-lotes.spec.ts --project=chromium`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/portal-cliente/pagos/[id]/comprobante/actions.ts tests/e2e/limite-tamanio-archivo.spec.ts
git commit -m "feat: rechazar comprobantes de pago de más de 15 MB en el portal del cliente"
```
