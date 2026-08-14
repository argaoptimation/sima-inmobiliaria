# Nombre de cliente + búsqueda en Pagos y Lotes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar el nombre del cliente en `/admin/pagos`, y agregar búsqueda por texto (cliente o lote) en `/admin/pagos` y por identificador en `/admin/lotes`, ambas server-side vía el mismo patrón de formulario GET ya usado en `/admin/lotes`.

**Architecture:** Sin JS de cliente nuevo. `/admin/pagos` gana un `<form method="get">` (no tenía ninguno) con un input de texto; `/admin/lotes` amplía su `<form method="get">` ya existente con el mismo tipo de input. La búsqueda de `/admin/pagos` resuelve primero los `lote_id`/`cliente_id` que matchean el texto, después filtra `pagos` por esos ids.

**Tech Stack:** Next.js 16 (Server Components), Supabase (Postgres, `ilike`), TypeScript.

## Global Constraints

- Sin JavaScript de cliente — búsqueda por formulario GET + recarga, mismo patrón que Moneda/Acreedor ya usan hoy en `/admin/lotes`.
- El filtro por texto se combina siempre con AND sobre el scoping por rol ya existente (nunca amplía lo que un rol puede ver).
- Agregar la columna "Cliente" en `/admin/pagos` (segunda columna, después de "Lote") desplaza en +1 TODOS los índices de columna que ya usan los tests existentes de esa tabla — hay que actualizarlos todos, no solo agregar el feature.

---

### Task 1: `/admin/lotes` — búsqueda por identificador

**Files:**
- Modify: `app/admin/lotes/page.tsx`
- Test: `tests/e2e/busqueda-lotes.spec.ts` (nuevo)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada que otra tarea consuma — independiente de Task 2/3.

- [ ] **Step 1: Escribir el test**

```typescript
// tests/e2e/busqueda-lotes.spec.ts
import { test, expect } from '@playwright/test'
import { createAdminClient, ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Búsqueda por identificador en /admin/lotes', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('buscar por identificador filtra la lista', async ({ page }) => {
    const admin = createAdminClient()
    const identificadorUnico = `E2E Busqueda ${Date.now()}`
    const { error } = await admin.from('lotes').insert({
      identificador: identificadorUnico,
      moneda: 'USD',
      estado: 'disponible',
      ubicacion: 'Ubicación E2E',
      precio_total: 5000,
      acreedor_id: fixtures.acreedorConDatos.id,
    })
    if (error) throw new Error(`No se pudo crear el lote de prueba: ${error.message}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')

    await expect(page.getByRole('row', { name: identificadorUnico })).toHaveCount(0)

    await page.getByPlaceholder('Buscar identificador').fill('E2E Busqueda')
    await page.getByRole('button', { name: 'Filtrar' }).click()

    await expect(page.getByRole('row', { name: identificadorUnico })).toBeVisible()
    // "E2E Test Lote" no matchea el texto buscado -- confirma que sí filtra,
    // no que muestra todo igual.
    await expect(page.getByRole('row', { name: 'E2E Test Lote' })).toHaveCount(0)
  })

  test('combinado con el filtro de Moneda ya existente', async ({ page }) => {
    const admin = createAdminClient()
    const identificadorUnico = `E2E Busqueda ARS ${Date.now()}`
    const { error } = await admin.from('lotes').insert({
      identificador: identificadorUnico,
      moneda: 'ARS',
      estado: 'disponible',
      ubicacion: 'Ubicación E2E',
      precio_total: 5000,
      acreedor_id: fixtures.acreedorConDatos.id,
    })
    if (error) throw new Error(`No se pudo crear el lote de prueba: ${error.message}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')

    await page.getByPlaceholder('Buscar identificador').fill('E2E Busqueda ARS')
    await page.selectOption('select[name="moneda"]', 'USD')
    await page.getByRole('button', { name: 'Filtrar' }).click()

    // El lote es ARS, se buscó texto que matchea pero moneda USD -- no aparece.
    await expect(page.getByRole('row', { name: identificadorUnico })).toHaveCount(0)
  })
})
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `npx playwright test tests/e2e/busqueda-lotes.spec.ts`
Expected: FAIL — `getByPlaceholder('Buscar identificador')` no existe todavía.

- [ ] **Step 3: Agregar el campo al formulario existente**

En `app/admin/lotes/page.tsx`, agregar `q` al tipo de `searchParams` y leerlo:

```typescript
  searchParams: Promise<{ sort?: string; dir?: string; moneda?: string; acreedor?: string; q?: string }>
```

```typescript
  const { sort, dir, moneda: filtroMoneda, acreedor: filtroAcreedorId, q: filtroTexto } = await searchParams
```

Aplicar el filtro a la query, junto a los que ya existen (después del bloque `if (filtroAcreedorId && ...)`):

```typescript
  if (filtroTexto) {
    queryLotes = queryLotes.ilike('identificador', `%${filtroTexto}%`)
  }
```

Agregar el input al `<form>` ya existente, ANTES del select de Moneda:

```tsx
        <label className="text-sm">
          Buscar
          <input
            type="text"
            name="q"
            placeholder="Buscar identificador"
            defaultValue={filtroTexto ?? ''}
            className="mt-1 block rounded border px-3 py-2"
          />
        </label>
```

Actualizar `urlOrden` (usado por los links de ordenar columnas) para que no pierda el filtro de texto al cambiar de orden:

```typescript
  function urlOrden(columna: ColumnaOrdenable) {
    const params = new URLSearchParams()
    if (filtroMoneda) params.set('moneda', filtroMoneda)
    if (filtroAcreedorId) params.set('acreedor', filtroAcreedorId)
    if (filtroTexto) params.set('q', filtroTexto)
    params.set('sort', columna)
    params.set('dir', columnaOrden === columna && ordenAscendente ? 'desc' : 'asc')
    return `/admin/lotes?${params.toString()}`
  }
```

Y actualizar la condición que muestra "Limpiar filtros y orden" para que también aparezca cuando hay texto buscado:

```tsx
        {(filtroMoneda || filtroAcreedorId || filtroTexto || sort || dir) && (
```

- [ ] **Step 4: Correr el test de nuevo**

Run: `npx playwright test tests/e2e/busqueda-lotes.spec.ts`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add app/admin/lotes/page.tsx tests/e2e/busqueda-lotes.spec.ts
git commit -m "Busqueda por identificador en /admin/lotes"
```

---

### Task 2: `/admin/pagos` — columna "Cliente" + búsqueda por cliente o lote

**Files:**
- Modify: `app/admin/pagos/page.tsx`
- Test: `tests/e2e/busqueda-pagos.spec.ts` (nuevo)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada — Task 3 solo actualiza tests preexistentes que ya asumían la tabla vieja, no depende de ninguna interfaz nueva de esta tarea más allá de "la tabla ahora tiene una columna más".

**Nota sobre el orden final de columnas** (para quien implemente Task 3): Lote(0), **Cliente(1)**, Motivo(2), Monto(3), Comprobante(4), Estado(5), Confirmado acreedor(6), Confirmado admin(7), acciones(8). Todo lo que hoy es índice N pasa a ser N+1.

- [ ] **Step 1: Escribir el test**

```typescript
// tests/e2e/busqueda-pagos.spec.ts
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createAdminClient, ensureTestFixtures, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

async function crearLoteYPagoDeCliente(
  identificadorLote: string,
  acreedorId: string,
  clienteId: string,
  nombreArchivoComprobante: string
) {
  const admin = createAdminClient()

  const { data: lote, error: errorLote } = await admin
    .from('lotes')
    .insert({
      identificador: identificadorLote,
      moneda: 'USD',
      estado: 'vendido',
      ubicacion: 'Ubicación E2E',
      precio_total: 3000,
      acreedor_id: acreedorId,
      cliente_id: clienteId,
    })
    .select('id')
    .single()
  if (errorLote || !lote) throw new Error(`No se pudo crear el lote: ${errorLote?.message}`)

  const bucketPath = `pagos/${lote.id}/${Date.now()}-${nombreArchivoComprobante}`
  const { error: errorUpload } = await admin.storage
    .from('comprobantes')
    .upload(bucketPath, COMPROBANTE_BYTES, { contentType: 'application/pdf' })
  if (errorUpload) throw new Error(`No se pudo subir el comprobante: ${errorUpload.message}`)

  const { error: errorPago } = await admin.from('pagos').insert({
    cliente_id: clienteId,
    lote_id: lote.id,
    monto: 100,
    moneda: 'USD',
    comprobante_path: bucketPath,
    estado: 'pendiente',
  })
  if (errorPago) throw new Error(`No se pudo crear el pago: ${errorPago.message}`)

  return lote.id as string
}

async function crearClienteDescartable(nombre: string) {
  const admin = createAdminClient()
  const email = `${nombre.toLowerCase().replace(/\s+/g, '.')}.${Date.now()}@sima-e2e.invalid`

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'Sima123!',
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`No se pudo crear el cliente: ${error?.message}`)

  const { error: errorProfile } = await admin
    .from('profiles')
    .insert({ id: data.user.id, role: 'cliente', full_name: nombre, email })
  if (errorProfile) throw new Error(`No se pudo crear el profile: ${errorProfile.message}`)

  return { id: data.user.id, email }
}

test.describe('Nombre de cliente y búsqueda en /admin/pagos', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('la columna Cliente muestra el nombre correcto', async ({ page }) => {
    const nombreArchivo = `e2e-columna-cliente-${Date.now()}.pdf`
    const cliente = await crearClienteDescartable(`E2E Cliente Columna ${Date.now()}`)
    await crearLoteYPagoDeCliente(
      `E2E Lote Columna ${Date.now()}`,
      fixtures.acreedorConDatos.id,
      cliente.id,
      nombreArchivo
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')

    const fila = page
      .locator('main table tbody tr')
      .filter({ has: page.locator(`a[href*="${nombreArchivo}"]`) })
    await expect(fila.locator('td').nth(1)).toHaveText(cliente.id ? (await (async () => {
      const admin = createAdminClient()
      const { data } = await admin.from('profiles').select('full_name').eq('id', cliente.id).single()
      return data!.full_name as string
    })()) : '')
  })

  test('buscar por nombre de cliente encuentra su pago', async ({ page }) => {
    const nombreArchivo = `e2e-buscar-cliente-${Date.now()}.pdf`
    const nombreCliente = `E2E Cliente Buscar ${Date.now()}`
    const cliente = await crearClienteDescartable(nombreCliente)
    await crearLoteYPagoDeCliente(
      `E2E Lote Buscar Cliente ${Date.now()}`,
      fixtures.acreedorConDatos.id,
      cliente.id,
      nombreArchivo
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')
    await page.getByPlaceholder('Buscar cliente o lote').fill(nombreCliente)
    await page.getByRole('button', { name: 'Filtrar' }).click()

    await expect(page.locator(`a[href*="${nombreArchivo}"]`)).toBeVisible()
  })

  test('buscar por identificador de lote encuentra el pago', async ({ page }) => {
    const nombreArchivo = `e2e-buscar-lote-${Date.now()}.pdf`
    const identificadorLote = `E2E Lote Buscar Identificador ${Date.now()}`
    const cliente = await crearClienteDescartable(`E2E Cliente Para Lote ${Date.now()}`)
    await crearLoteYPagoDeCliente(
      identificadorLote,
      fixtures.acreedorConDatos.id,
      cliente.id,
      nombreArchivo
    )

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')
    await page.getByPlaceholder('Buscar cliente o lote').fill(identificadorLote)
    await page.getByRole('button', { name: 'Filtrar' }).click()

    await expect(page.locator(`a[href*="${nombreArchivo}"]`)).toBeVisible()
  })

  test('buscar algo que no matchea nada da lista vacía sin error', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')
    await page.getByPlaceholder('Buscar cliente o lote').fill(`Texto Que No Existe ${Date.now()}`)
    await page.getByRole('button', { name: 'Filtrar' }).click()

    await expect(page.locator('main table tbody tr')).toHaveCount(0)
  })

  test('un acreedor buscando un cliente con lotes de OTRO acreedor no lo ve', async ({ page }) => {
    const nombreArchivo = `e2e-scoping-${Date.now()}.pdf`
    const nombreCliente = `E2E Cliente Scoping ${Date.now()}`
    const cliente = await crearClienteDescartable(nombreCliente)
    // El lote es de acreedorSecundario, no de acreedorConDatos.
    await crearLoteYPagoDeCliente(
      `E2E Lote Scoping ${Date.now()}`,
      fixtures.acreedorSecundario.id,
      cliente.id,
      nombreArchivo
    )

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/pagos')
    await page.getByPlaceholder('Buscar cliente o lote').fill(nombreCliente)
    await page.getByRole('button', { name: 'Filtrar' }).click()

    await expect(page.locator(`a[href*="${nombreArchivo}"]`)).toHaveCount(0)
  })
})
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `npx playwright test tests/e2e/busqueda-pagos.spec.ts`
Expected: FAIL — ni la columna "Cliente" ni el campo de búsqueda existen todavía.

- [ ] **Step 3: Agregar `searchParams`, resolver lotes que matchean, y filtrar**

En `app/admin/pagos/page.tsx`, cambiar la firma:

```typescript
  searchParams,
}: {
  searchParams: Promise<{ error?: string; q?: string }>
}) {
  const { error, q: filtroTexto } = await searchParams
```

Clave de diseño que simplifica todo lo demás: en vez de armar un OR sobre la tabla `pagos` (que obligaría a combinarlo con el scoping por rol de forma manual), se resuelve el texto buscado a una lista de `lote_id` candidatos ANTES de tocar `pagos` — un lote matchea si su `identificador` matchea, O si pertenece a un cliente cuyo `full_name` matchea. Con eso resuelto, el resto del archivo sigue exactamente la misma forma que ya tiene hoy (`loteIds` + `.in('lote_id', loteIds)`), solo intersectando con `loteIdsBusqueda` cuando hay texto.

Después de resolver `perfilPropio` y ANTES de armar `columnasPago`, agregar:

```typescript
  let loteIdsBusqueda: string[] | null = null

  if (filtroTexto) {
    const { data: lotesPorIdentificador } = await supabase
      .from('lotes')
      .select('id')
      .ilike('identificador', `%${filtroTexto}%`)

    const { data: clientesPorNombre } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'cliente')
      .ilike('full_name', `%${filtroTexto}%`)

    const clienteIds = (clientesPorNombre ?? []).map((cliente) => cliente.id)

    const { data: lotesPorCliente } =
      clienteIds.length > 0
        ? await supabase.from('lotes').select('id').in('cliente_id', clienteIds)
        : { data: [] }

    loteIdsBusqueda = [
      ...new Set([
        ...(lotesPorIdentificador ?? []).map((lote) => lote.id),
        ...(lotesPorCliente ?? []).map((lote) => lote.id),
      ]),
    ]
  }
```

Modificar las dos ramas ya existentes (`acreedor` / resto) intersectando `loteIds` con `loteIdsBusqueda` cuando corresponda. Reemplazar el bloque completo desde `let pagos: Pago[] = []` hasta el `else { ... }` final por:

```typescript
  let pagos: Pago[] = []

  if (perfilPropio!.role === 'acreedor') {
    const { data: misLotes } = await supabase
      .from('lotes')
      .select('id')
      .eq('acreedor_id', user!.id)

    let loteIds = (misLotes ?? []).map((lote) => lote.id)

    if (loteIdsBusqueda !== null) {
      const busquedaSet = new Set(loteIdsBusqueda)
      loteIds = loteIds.filter((id) => busquedaSet.has(id))
    }

    if (loteIds.length > 0) {
      const { data } = await supabase
        .from('pagos')
        .select(columnasPago)
        .in('lote_id', loteIds)
        .order('created_at', { ascending: false })
      pagos = data ?? []
    }
  } else {
    if (loteIdsBusqueda !== null) {
      if (loteIdsBusqueda.length > 0) {
        const { data } = await supabase
          .from('pagos')
          .select(columnasPago)
          .in('lote_id', loteIdsBusqueda)
          .order('created_at', { ascending: false })
        pagos = data ?? []
      }
    } else {
      const { data } = await supabase
        .from('pagos')
        .select(columnasPago)
        .order('created_at', { ascending: false })
      pagos = data ?? []
    }
  }
```

Esto es deliberadamente casi idéntico a la estructura que el archivo ya tenía antes de esta tarea — la única adición real es la intersección con `loteIdsBusqueda` cuando hay texto buscado. No usar `.or()` en ningún lado.

- [ ] **Step 4: Resolver los nombres de cliente y agregar la columna**

Después del bloque que arma `lotePorId` (que ya resuelve lotes por `loteIdsConPago`), agregar la resolución de clientes:

```typescript
  const clienteIdsConPago = [...new Set(pagos.map((pago) => pago.cliente_id))]

  const { data: clientesConPago } =
    clienteIdsConPago.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', clienteIdsConPago)
      : { data: [] }

  const nombreClientePorId = new Map(
    (clientesConPago ?? []).map((cliente) => [cliente.id, cliente.full_name])
  )
```

En el `.map()` que arma `pagosConLink`, agregar `nombreCliente` al objeto devuelto en ambos `return` (el de "sin comprobante" y el final):

```typescript
      const nombreCliente = nombreClientePorId.get(pago.cliente_id) ?? '—'

      if (!pago.comprobante_path) {
        return { ...pago, comprobanteUrl: null, sinAcreedorVinculado, identificadorLote, nombreCliente }
      }

      // ...

      return {
        ...pago,
        comprobanteUrl: errorSignedUrl ? null : data?.signedUrl ?? null,
        sinAcreedorVinculado,
        identificadorLote,
        nombreCliente,
      }
```

Agregar la columna al `<thead>`, después de "Lote":

```tsx
            <th className="py-2">Lote</th>
            <th>Cliente</th>
            <th>Motivo</th>
```

Y al `<tbody>`, después de la celda de `identificadorLote`:

```tsx
                <td className="py-2">{pago.identificadorLote}</td>
                <td>{pago.nombreCliente}</td>
                <td>{pago.motivo === 'sena' ? 'Seña' : 'Cuota'}</td>
```

- [ ] **Step 5: Agregar el formulario de búsqueda**

Agregar, justo antes de `<table className="w-full text-sm">`:

```tsx
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Buscar
          <input
            type="text"
            name="q"
            placeholder="Buscar cliente o lote"
            defaultValue={filtroTexto ?? ''}
            className="mt-1 block rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded border px-3 py-2 text-sm">
          Filtrar
        </button>
        {filtroTexto && (
          <a href="/admin/pagos" className="text-sm underline">
            Limpiar búsqueda
          </a>
        )}
      </form>
```

- [ ] **Step 6: Correr el test de nuevo**

Run: `npx playwright test tests/e2e/busqueda-pagos.spec.ts`
Expected: 5 passed

- [ ] **Step 7: Commit**

```bash
git add app/admin/pagos/page.tsx tests/e2e/busqueda-pagos.spec.ts
git commit -m "Columna Cliente + busqueda por cliente o lote en /admin/pagos"
```

---

### Task 3: Actualizar los tests existentes rotos por la columna nueva + regresión + docs

**Files:**
- Modify: `tests/e2e/pagos-acotados-por-acreedor.spec.ts`
- Modify: `tests/e2e/motivo-pago.spec.ts`
- Modify: `tests/e2e/monto-editable-confirmacion.spec.ts`
- Modify: `tests/e2e/pago-flujo-completo.spec.ts`
- Modify: `tests/e2e/contador-notificaciones.spec.ts`
- Modify: `Pruebas_Manuales_Pendientes.txt` (fuera del repo git)
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: la tabla de `/admin/pagos` con "Cliente" como columna 1 (Task 2).
- Produces: nada — última tarea.

Agregar "Cliente" como columna 1 desplaza en +1 todos los índices `td().nth(N)` que ya apuntaban a columnas de `/admin/pagos` en estos archivos (verificado exacto contra el código real al momento de escribir este plan — volvé a confirmar con un grep antes de tocar nada, por si algo cambió entre tanto):

- `tests/e2e/pagos-acotados-por-acreedor.spec.ts:195` — `nth(5)` → `nth(6)`
- `tests/e2e/motivo-pago.spec.ts:60` — `nth(1)` → `nth(2)`
- `tests/e2e/motivo-pago.spec.ts:73` — `nth(1)` → `nth(2)`
- `tests/e2e/monto-editable-confirmacion.spec.ts:79` — `nth(5)` → `nth(6)`
- `tests/e2e/monto-editable-confirmacion.spec.ts:99` — `nth(6)` → `nth(7)`
- `tests/e2e/monto-editable-confirmacion.spec.ts:116` — `nth(2)` → `nth(3)`
- `tests/e2e/monto-editable-confirmacion.spec.ts:153` — `nth(2)` → `nth(3)`
- `tests/e2e/monto-editable-confirmacion.spec.ts:187` — `nth(2)` → `nth(3)`
- `tests/e2e/monto-editable-confirmacion.spec.ts:195` — `nth(4)` → `nth(5)`
- `tests/e2e/pago-flujo-completo.spec.ts:106` — `nth(5)` → `nth(6)`
- `tests/e2e/pago-flujo-completo.spec.ts:117` — `nth(5)` → `nth(6)`
- `tests/e2e/pago-flujo-completo.spec.ts:122` — `nth(4)` → `nth(5)`
- `tests/e2e/contador-notificaciones.spec.ts:90` — `nth(5)` → `nth(6)`

NO tocar `pago-flujo-completo.spec.ts:50,51,133,134,135` (tabla de cuotas del portal-cliente, no de `/admin/pagos`) ni `clientes-admin.spec.ts:44` (tabla de `/admin/clientes`, no relacionada).

- [ ] **Step 1: Confirmar la lista de arriba con un grep fresco**

Run: `grep -rn "\.locator('td')\.nth(" tests/e2e/` (o el equivalente con el Grep tool) y comparar contra la lista de arriba antes de editar nada — si algo cambió desde que se escribió este plan, investigar por qué antes de aplicar los cambios a ciegas.

- [ ] **Step 2: Aplicar los 13 cambios de índice listados arriba**

- [ ] **Step 3: Build limpio**

Run: `npm run build` (usar `NODE_OPTIONS="--max-old-space-size=4096" npm run build` si hace falta).
Expected: sin errores.

- [ ] **Step 4: Unitarios**

Run: `npx vitest run`
Expected: todos en verde.

- [ ] **Step 5: E2E completo**

Run: `npx playwright test`
Expected: todos en verde, salvo fallos aislados ya conocidos (rate limit de emails, flakes de red transitorios) — no asumir que son regresión de esta tanda sin confirmar la causa real primero.

- [ ] **Step 6: Limpieza de datos de prueba**

Verificar `mcp__supabase__get_project_url` antes de cualquier `execute_sql`. Mismo criterio de siempre (`identificador like 'E2E %'` excluyendo los 2 fixtures protegidos, profiles `@sima-e2e.invalid` excluyendo los 9 fijos).

- [ ] **Step 7: Actualizar `Pruebas_Manuales_Pendientes.txt`**

Agregar una sección nueva describiendo para Gabriel cómo probar: columna Cliente en Pagos, buscar por nombre de cliente, buscar por identificador de lote, buscar algo que no existe (lista vacía), y la búsqueda por identificador en Lotes combinada con Moneda/Acreedor.

- [ ] **Step 8: Cerrar el ledger**

Agregar una línea a `.superpowers/sdd/progress.md`.

---

## Self-Review

**Cobertura de la spec:** mecanismo de búsqueda server-side vía GET, sin JS nuevo (Task 1 y 2) ✓, columna Cliente en Pagos (Task 2) ✓, búsqueda por cliente O lote combinada con scoping por rol (Task 2, test de scoping dedicado) ✓, búsqueda por identificador en Lotes combinada con Moneda (Task 1, test dedicado) ✓, testing (7 tests nuevos + 13 índices corregidos) ✓.

**Placeholders:** ninguno.

**Consistencia de tipos:** `nombreCliente` usado igual en el `.map()` (Task 2 Step 4) y en el JSX (mismo step). Los 13 índices de Task 3 están enumerados exactos contra el código real al momento de escribir este plan, con instrucción explícita de re-confirmar antes de aplicarlos por si el código cambió mientras tanto.
