# Monto editable al confirmar pago Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que acreedor/admin corrijan el monto de un pago al confirmarlo, con una guarda atómica que rechaza (en vez de pisar en silencio) un submit hecho contra un monto ya desactualizado, y que limpia la confirmación del otro rol cuando el monto realmente cambia.

**Architecture:** Un único cambio en `confirmarPago` (`app/admin/pagos/actions.ts`) que reemplaza el `UPDATE` de confirmación actual por uno atómico condicionado también a `.eq('monto', montoVisto)` y `.eq('estado', 'pendiente')`, más un input editable + un campo oculto nuevos en el formulario de `/admin/pagos`.

**Tech Stack:** Next.js 16 (Server Components + Server Actions), Supabase (Postgres), TypeScript.

## Global Constraints

- Sin JavaScript de cliente nuevo.
- La guarda de staleness es atómica (una sola `UPDATE ... WHERE monto = $montoVisto`), no un check-then-act de dos pasos.
- El claim final que dispara el FIFO (`estado: 'pendiente' → 'confirmado'`, `app/admin/pagos/actions.ts` líneas ~92-102) **no se toca** — sigue exactamente igual.
- `imputarPagoFIFO` no se modifica — sigue recibiendo `pagoClaimado.monto` tal cual.
- `monto_recibido`/`moneda_recibida` (bookkeeping de caja) no cambian de comportamiento.

---

### Task 1: Server Action + formulario

**Files:**
- Modify: `app/admin/pagos/actions.ts`
- Modify: `app/admin/pagos/page.tsx`
- Test: `tests/e2e/monto-editable-confirmacion.spec.ts` (nuevo)

**Interfaces:**
- Consumes: nada nuevo — `confirmarPago(pagoId: string, formData: FormData)` ya existe, se modifica su cuerpo, no su firma.
- Produces: nada que otra tarea consuma — es la única tarea de código de este plan.

- [ ] **Step 1: Escribir el test (falla porque el campo todavía no existe)**

```typescript
// tests/e2e/monto-editable-confirmacion.spec.ts
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login, logout } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

async function crearPagoPendienteConComprobante(nombreArchivo: string, monto: number) {
  const admin = createAdminClient()
  const fixtures = await ensureTestFixtures()

  const bucketPath = `pagos/${fixtures.loteId}/${Date.now()}-${nombreArchivo}`
  const { error: errorUpload } = await admin.storage
    .from('comprobantes')
    .upload(bucketPath, COMPROBANTE_BYTES, { contentType: 'application/pdf' })
  if (errorUpload) {
    throw new Error(`No se pudo subir el comprobante de prueba: ${errorUpload.message}`)
  }

  const { data: pago, error } = await admin
    .from('pagos')
    .insert({
      cliente_id: fixtures.cliente.id,
      lote_id: fixtures.loteId,
      monto,
      moneda: 'USD',
      comprobante_path: bucketPath,
      estado: 'pendiente',
    })
    .select('id')
    .single()

  if (error || !pago) {
    throw new Error(`No se pudo crear el pago de prueba: ${error?.message}`)
  }

  return pago.id as string
}

test.describe('Monto editable al confirmar un pago', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('confirmar sin editar el monto se comporta igual que antes', async ({ page }) => {
    const pagoId = await crearPagoPendienteConComprobante(`e2e-sin-editar-${Date.now()}.pdf`, 1000)

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/pagos')

    const fila = page.locator('tr', { has: page.locator(`form[action*="${pagoId}"]`) })
    await expect(fila.getByLabel('Monto a confirmar')).toHaveValue('1000')
    await fila.getByRole('button', { name: 'Confirmar mi parte' }).click()
    await page.waitForURL(/\/admin\/pagos/)

    const admin = createAdminClient()
    const { data: pago } = await admin.from('pagos').select('monto').eq('id', pagoId).single()
    expect(pago?.monto).toBe(1000)
  })

  test('editar el monto lo actualiza y limpia la confirmación previa del otro rol', async ({
    page,
  }) => {
    const pagoId = await crearPagoPendienteConComprobante(`e2e-editar-${Date.now()}.pdf`, 50)

    // El admin confirma primero con el monto original (50, el "typo").
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')
    let fila = page.locator('tr', { has: page.locator(`form[action*="${pagoId}"]`) })
    await fila.getByRole('button', { name: 'Confirmar mi parte' }).click()
    await page.waitForURL(/\/admin\/pagos/)

    const admin = createAdminClient()
    const { data: tras1raConfirmacion } = await admin
      .from('pagos')
      .select('confirmado_admin_por')
      .eq('id', pagoId)
      .single()
    expect(tras1raConfirmacion?.confirmado_admin_por).toBeTruthy()

    // El acreedor entra, se da cuenta de que en realidad eran 500, lo corrige.
    await logout(page)
    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/pagos')
    fila = page.locator('tr', { has: page.locator(`form[action*="${pagoId}"]`) })
    await fila.getByLabel('Monto a confirmar').fill('500')
    await fila.getByRole('button', { name: 'Confirmar mi parte' }).click()
    await page.waitForURL(/\/admin\/pagos/)

    const { data: trasEdicion } = await admin
      .from('pagos')
      .select('monto, confirmado_acreedor_por, confirmado_admin_por')
      .eq('id', pagoId)
      .single()
    expect(trasEdicion?.monto).toBe(500)
    expect(trasEdicion?.confirmado_acreedor_por).toBeTruthy()
    expect(trasEdicion?.confirmado_admin_por).toBeNull()
  })

  test('confirmar con un monto ya desactualizado es rechazado, sin pisar la corrección ajena', async ({
    page,
    context,
  }) => {
    const pagoId = await crearPagoPendienteConComprobante(`e2e-obsoleto-${Date.now()}.pdf`, 50)

    // El admin abre la pantalla y ve 50 (todavía no la envía).
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')
    let fila = page.locator('tr', { has: page.locator(`form[action*="${pagoId}"]`) })
    await expect(fila.getByLabel('Monto a confirmar')).toHaveValue('50')

    // Mientras tanto, el acreedor (en otra pestaña) corrige a 500 y confirma.
    const paginaAcreedor = await context.newPage()
    await login(paginaAcreedor, fixtures.acreedorConDatos.email, fixtures.password)
    await paginaAcreedor.goto('/admin/pagos')
    const filaAcreedor = paginaAcreedor.locator('tr', {
      has: paginaAcreedor.locator(`form[action*="${pagoId}"]`),
    })
    await filaAcreedor.getByLabel('Monto a confirmar').fill('500')
    await filaAcreedor.getByRole('button', { name: 'Confirmar mi parte' }).click()
    await paginaAcreedor.waitForURL(/\/admin\/pagos/)
    await paginaAcreedor.close()

    // El admin, sin refrescar, intenta confirmar con el 50 viejo que sigue en su pantalla.
    await fila.getByRole('button', { name: 'Confirmar mi parte' }).click()
    await expect(
      page.getByText(/El monto cambió desde que abriste esta pantalla/)
    ).toBeVisible()

    const admin = createAdminClient()
    const { data: pago } = await admin
      .from('pagos')
      .select('monto, confirmado_admin_por')
      .eq('id', pagoId)
      .single()
    expect(pago?.monto).toBe(500)
    expect(pago?.confirmado_admin_por).toBeNull()
  })

  test('caso feliz: monto corregido y confirmado por ambos dispara el FIFO con el monto correcto', async ({
    page,
  }) => {
    const pagoId = await crearPagoPendienteConComprobante(`e2e-feliz-${Date.now()}.pdf`, 50)

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/pagos')
    let fila = page.locator('tr', { has: page.locator(`form[action*="${pagoId}"]`) })
    await fila.getByLabel('Monto a confirmar').fill('500')
    await fila.getByRole('button', { name: 'Confirmar mi parte' }).click()
    await page.waitForURL(/\/admin\/pagos/)

    await logout(page)
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')
    fila = page.locator('tr', { has: page.locator(`form[action*="${pagoId}"]`) })
    await expect(fila.getByLabel('Monto a confirmar')).toHaveValue('500')
    await fila.getByRole('button', { name: 'Confirmar mi parte' }).click()
    await page.waitForURL(/\/admin\/pagos/)

    const admin = createAdminClient()
    const { data: pago } = await admin
      .from('pagos')
      .select('estado, monto')
      .eq('id', pagoId)
      .single()
    expect(pago?.estado).toBe('confirmado')
    expect(pago?.monto).toBe(500)

    const { data: imputaciones } = await admin
      .from('pago_imputaciones')
      .select('monto_imputado')
      .eq('pago_id', pagoId)
    const totalImputado = (imputaciones ?? []).reduce((acc, i) => acc + i.monto_imputado, 0)
    expect(totalImputado).toBe(500)
  })
})
```

Nota para quien implemente: revisar `tests/e2e/fixtures/test-data.ts` para confirmar el nombre exacto de `TestFixtures.loteId` y `TestFixtures.cliente` — ya se usan así en otros specs de este mismo repo (`tests/e2e/pago-flujo-completo.spec.ts`), así que deberían coincidir tal cual.

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `npx playwright test tests/e2e/monto-editable-confirmacion.spec.ts`
Expected: FAIL — `getByLabel('Monto a confirmar')` todavía no existe.

- [ ] **Step 3: Agregar el input editable + el campo oculto al formulario**

En `app/admin/pagos/page.tsx`, dentro del `<form action={confirmarEstePago} ...>`, ANTES del label de "Monto recibido (opcional, para cierre de caja)" ya existente, agregar:

```tsx
                        <input type="hidden" name="montoVisto" value={pago.monto} />
                        <label className="text-xs text-gray-500">
                          Monto a confirmar
                          <input
                            name="monto"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={pago.monto}
                            required
                            className="mt-1 block rounded border px-2 py-1"
                          />
                        </label>
```

No tocar nada más de ese formulario (los campos de `montoRecibido`/`monedaRecibida` y el botón "Confirmar mi parte" siguen igual).

- [ ] **Step 4: Reescribir el bloque de confirmación en `confirmarPago`**

En `app/admin/pagos/actions.ts`, reemplazar el bloque completo desde `const campoPor = ...` hasta el `if (errorConfirmacion) { ... }` (ambos inclusive, justo antes del comentario `// Claim atomico: solo un llamador puede ganar este UPDATE...`) por:

```typescript
  const campoPor = perfil.role === 'acreedor' ? 'confirmado_acreedor_por' : 'confirmado_admin_por'
  const campoAt = perfil.role === 'acreedor' ? 'confirmado_acreedor_at' : 'confirmado_admin_at'
  const campoOtroPor =
    perfil.role === 'acreedor' ? 'confirmado_admin_por' : 'confirmado_acreedor_por'
  const campoOtroAt = perfil.role === 'acreedor' ? 'confirmado_admin_at' : 'confirmado_acreedor_at'

  const montoVisto = Number(formData.get('montoVisto'))
  const montoIngresado = Number(formData.get('monto'))

  if (!Number.isFinite(montoVisto) || !Number.isFinite(montoIngresado) || montoIngresado < 0) {
    redirect(`/admin/pagos?error=${encodeURIComponent('Monto inválido')}`)
  }

  // Si el monto que se envía difiere del que esta misma pantalla mostraba al
  // cargar, hubo una edicion real (no solo un submit sin tocar el campo): se
  // actualiza pago.monto y se limpia la confirmacion del OTRO rol, si ya
  // estaba cargada -- nadie puede quedar "confirmando" un numero que en
  // realidad nunca vio ni acepto.
  const huboEdicion = montoIngresado !== montoVisto

  // Bookkeeping opcional para el cierre de caja del acreedor/admin: el monto
  // realmente recibido (a menudo en pesos) puede diferir del monto imputado
  // (en la moneda del lote). Si se deja en blanco, no tocamos estas columnas
  // para no pisar un valor que ya haya cargado otro confirmador.
  const montoRecibido = formData.get('montoRecibido')
  const monedaRecibida = formData.get('monedaRecibida')
  const montoRecibidoNumero = montoRecibido ? Number(montoRecibido) : NaN
  const montoRecibidoValido =
    Number.isFinite(montoRecibidoNumero) && montoRecibidoNumero >= 0

  // Guarda atomica: el UPDATE solo pega si el pago SIGUE pendiente y el
  // monto SIGUE siendo el que esta pantalla vio al cargar. Si otro
  // confirmador ya lo cambio (o ya se termino de confirmar) mientras tanto,
  // esto no afecta ninguna fila -- se rechaza en vez de pisar en silencio lo
  // que el otro rol ya cargo.
  const { data: pagoActualizado, error: errorConfirmacion } = await supabase
    .from('pagos')
    .update({
      monto: montoIngresado,
      [campoPor]: user.id,
      [campoAt]: new Date().toISOString(),
      ...(huboEdicion ? { [campoOtroPor]: null, [campoOtroAt]: null } : {}),
      ...(montoRecibidoValido
        ? { monto_recibido: montoRecibidoNumero, moneda_recibida: monedaRecibida }
        : {}),
    })
    .eq('id', pagoId)
    .eq('estado', 'pendiente')
    .eq('monto', montoVisto)
    .select('id')
    .maybeSingle()

  if (errorConfirmacion) {
    revalidatePath('/admin/pagos')
    return
  }

  if (!pagoActualizado) {
    redirect(
      `/admin/pagos?error=${encodeURIComponent(
        'El monto cambió desde que abriste esta pantalla (ahora figura un valor distinto) o el pago ya se terminó de confirmar. Revisalo antes de confirmar.'
      )}`
    )
  }
```

**No tocar nada más de la función** — el bloque del "Claim atomico" que sigue después (`estado: 'pendiente' → 'confirmado'`, condicionado a que ambas confirmaciones estén cargadas) y todo el resto de la imputación FIFO quedan exactamente igual.

- [ ] **Step 5: Mostrar el error en la página**

`app/admin/pagos/page.tsx` ya tiene `{error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}` al inicio del `<main>` — no hace falta ningún cambio ahí, el mensaje nuevo ya va a aparecer solo porque usa el mismo mecanismo `?error=`.

- [ ] **Step 6: Correr el test de nuevo para confirmar que pasa**

Run: `npx playwright test tests/e2e/monto-editable-confirmacion.spec.ts`
Expected: 4 passed

- [ ] **Step 7: Correr también el spec existente que ya ejercita `confirmarPago`, para descartar una regresión**

Run: `npx playwright test tests/e2e/pago-flujo-completo.spec.ts tests/e2e/pagos-acotados-por-acreedor.spec.ts`
Expected: todos en verde. Si algo falla, revisar si el nuevo input "Monto a confirmar" (con `required`) interfiere con algún flujo de esos specs que antes no llenaba ese campo — el `defaultValue={pago.monto}` debería cubrir el submit sin tocar nada, pero confirmarlo de verdad, no asumir.

- [ ] **Step 8: Commit**

```bash
git add app/admin/pagos/actions.ts app/admin/pagos/page.tsx tests/e2e/monto-editable-confirmacion.spec.ts
git commit -m "Monto editable al confirmar un pago, con guarda atomica contra sobrescritura"
```

---

### Task 2: Regresión + docs

**Files:**
- Modify: `Pruebas_Manuales_Pendientes.txt` (fuera del repo git)
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada — última tarea.

- [ ] **Step 1: Build limpio**

Run: `npm run build` (si vuelve a fallar por falta de memoria como pasó antes en esta sesión, reintentar con `NODE_OPTIONS="--max-old-space-size=4096" npm run build` antes de asumir que es un error real de código).
Expected: sin errores.

- [ ] **Step 2: Unitarios**

Run: `npx vitest run`
Expected: todos en verde.

- [ ] **Step 3: E2E completo**

Run: `npx playwright test`
Expected: todos en verde. Si aparecen fallos aislados con "email rate limit exceeded" en el mensaje (límite de Supabase Auth por correr la suite muchas veces en el día), no tratarlos como regresión de esta tanda sin confirmar la causa real primero — es un patrón ya documentado varias veces en `.superpowers/sdd/progress.md` de esta misma sesión.

- [ ] **Step 4: Limpieza de datos de prueba**

Verificar `mcp__supabase__get_project_url` antes de cualquier `execute_sql`. Los pagos de prueba de este plan se crean sobre `fixtures.loteId` (el fixture protegido "E2E Test Lote") — verificar que al final de la limpieza ese lote sigue con sus 3 cuotas originales intactas (mismo estado que antes de esta tanda), y borrar únicamente los `pagos`/`pago_imputaciones` de prueba creados por `monto-editable-confirmacion.spec.ts` (identificables por su `comprobante_path` con el prefijo `pagos/${fixtures.loteId}/...-e2e-...`).

- [ ] **Step 5: Actualizar `Pruebas_Manuales_Pendientes.txt`**

Agregar una sección nueva describiendo para Gabriel cómo probar a mano: confirmar un pago sin tocar el monto (funciona igual que siempre); editar el monto al confirmar y ver que la confirmación del otro rol se limpia; el caso del monto desactualizado (abrir en dos pestañas/navegadores distintos). Mismo estilo que las secciones anteriores.

- [ ] **Step 6: Cerrar el ledger**

Agregar una línea a `.superpowers/sdd/progress.md`.

---

## Self-Review

**Cobertura de la spec:** monto editable con precarga del valor actual (Task 1) ✓, guarda atómica `.eq('monto', montoVisto)` + `.eq('estado', 'pendiente')` (Task 1) ✓, limpieza de la confirmación del otro rol cuando hay edición real (Task 1) ✓, mensaje de error específico sin aplicar cambios cuando está desactualizado (Task 1) ✓, el claim final y `imputarPagoFIFO` sin tocar (explícito en el Step 4, verificado por no estar en el rango de código reemplazado) ✓, testing (4 casos exactos de la spec) ✓.

**Placeholders:** ninguno.

**Consistencia de tipos:** `confirmarPago(pagoId: string, formData: FormData)` no cambia de firma. Nombres de campo de formulario (`monto`, `montoVisto`) usados idénticos en `page.tsx` (Step 3) y `actions.ts` (Step 4) y en los tests (Task 1, Step 1).
