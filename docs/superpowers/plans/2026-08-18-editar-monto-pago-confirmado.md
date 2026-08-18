# Editar el monto de un pago ya confirmado — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que un administrador corrija el monto de un pago ya confirmado (ej. tipeó $1.500 cuando el comprobante decía $1.600) sin reabrir el pago original ni recalcular a mano el saldo de las cuotas.

**Architecture:** La corrección se registra como un pago nuevo (`motivo = 'ajuste'`), nunca editando la fila original. Un delta positivo reusa `imputarPagoFIFO` tal cual (misma función que ya usan `confirmarPago` y `venderLote`) contra las cuotas con saldo pendiente actuales. Un delta negativo revierte específicamente las imputaciones que el pago ORIGINAL generó, de la más reciente a la más antigua, hasta cubrir el monto a devolver.

**Tech Stack:** Next.js 16 Server Actions, Supabase Postgres (RLS deshabilitado), Playwright e2e.

## Global Constraints

- Spec completa: `docs/superpowers/specs/2026-08-18-editar-monto-pago-confirmado-design.md` — leerla antes de implementar, este plan resume sus decisiones pero la spec tiene el razonamiento completo.
- Solo `administrador` puede ejecutar esta corrección (no acreedor, no vendedor).
- La corrección es un pago nuevo con `motivo = 'ajuste'`, `estado = 'confirmado'` desde el momento en que se crea — nunca pasa por el estado `'pendiente'` ni por confirmación cruzada.
- La fila del pago original NUNCA se edita (ni su `monto` ni sus `pago_imputaciones` existentes se tocan directamente) — toda corrección posterior vive en filas de ajuste nuevas.
- `imputarPagoFIFO` (`lib/pagos/imputar-fifo.ts`) es una función pura ya existente y no se modifica.
- El "monto efectivo" de un pago original es `monto` propio + suma de `monto` de todos los pagos `ajuste` con `corrige_pago_id` apuntando a él. Todo formulario/cálculo de delta parte de este valor, no del `monto` crudo de la fila original.
- Guarda optimista: un campo oculto `montoEfectivoVisto` viaja con el formulario de edición; si el monto efectivo recalculado en el servidor no coincide al momento de guardar, se rechaza (mismo criterio que ya usa `confirmarPago` con `montoVisto`).

---

### Task 1: Migración — motivo `'ajuste'` y columna `corrige_pago_id`

**Files:**
- Create: `supabase/migrations/0024_pagos_ajuste_correccion.sql`

**Interfaces:**
- Produces: valor `'ajuste'` en el enum `public.motivo_pago` (ya tiene `'cuota'`, `'sena'`); columna `public.pagos.corrige_pago_id uuid null references public.pagos(id)`.

**Esta tarea la ejecuta el controller directamente contra la base real vía el MCP de Supabase — no se dispatchea a un implementador.** Así se hicieron las 3 migraciones anteriores de este proyecto (`0021`/`0022`/`0023`, ver `.superpowers/sdd/progress.md`).

- [ ] **Paso 1: Verificar el proyecto Supabase correcto**

Antes de tocar nada: llamar a `mcp__supabase__get_project_url` y confirmar que coincide EXACTO con `NEXT_PUBLIC_SUPABASE_URL` de `.env.local` en la raíz del repo (`https://zcdjuxuvsfickymrhynx.supabase.co`). Si no coincide, parar y avisar — no aplicar nada.

- [ ] **Paso 2: Escribir la migración**

```sql
alter type public.motivo_pago add value 'ajuste';

alter table public.pagos
  add column corrige_pago_id uuid references public.pagos(id);
```

- [ ] **Paso 3: Aplicar contra la base real**

Usar `mcp__supabase__apply_migration` con `name: "pagos_ajuste_correccion"` y el contenido de arriba como `query`.

- [ ] **Paso 4: Verificar aplicada**

Correr vía `mcp__supabase__execute_sql`:

```sql
select enum_range(null::motivo_pago);
```

Esperado: incluye `ajuste` además de `cuota` y `sena`.

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'pagos' and column_name = 'corrige_pago_id';
```

Esperado: una fila, `data_type = uuid`, `is_nullable = YES`.

- [ ] **Paso 5: Commit**

```bash
git add supabase/migrations/0024_pagos_ajuste_correccion.sql
git commit -m "feat: agrega motivo 'ajuste' y pagos.corrige_pago_id para corregir pagos confirmados"
```

---

### Task 2: Server Action, UI y tests e2e

**Files:**
- Modify: `app/admin/pagos/actions.ts` (agrega `editarMontoPago`)
- Modify: `app/admin/pagos/page.tsx` (columna Motivo + form de edición)
- Test: `tests/e2e/editar-monto-pago.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `imputarPagoFIFO(montoPago: number, cuotasOrdenadas: {id: string; saldoPendiente: number}[]): {imputaciones: {cuotaId: string; montoImputado: number}[]; saldoNoImputado: number}` de `lib/pagos/imputar-fifo.ts`. `requireAdministrador()` de `lib/auth/require-admin.ts`.
- Produces: Server Action `editarMontoPago(pagoId: string, formData: FormData): Promise<void>`, exportada de `app/admin/pagos/actions.ts` junto a `confirmarPago`.

#### Paso 1: Server Action `editarMontoPago`

- [ ] Modificar `app/admin/pagos/actions.ts`: agregar el import de `requireAdministrador` y la función nueva al final del archivo.

```ts
import { requireAdministrador } from '@/lib/auth/require-admin'
```

(agregar junto a los imports existentes, después de `import { redirect } from 'next/navigation'`)

```ts
export async function editarMontoPago(pagoId: string, formData: FormData) {
  await requireAdministrador()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: pago } = await supabase
    .from('pagos')
    .select('id, cliente_id, lote_id, moneda, comprobante_path, motivo, estado, monto')
    .eq('id', pagoId)
    .single()

  if (!pago || pago.estado !== 'confirmado' || pago.motivo === 'ajuste') {
    redirect(`/admin/pagos?error=${encodeURIComponent('Este pago no se puede editar.')}`)
  }

  const { data: ajustesPrevios } = await supabase
    .from('pagos')
    .select('monto')
    .eq('corrige_pago_id', pagoId)

  const montoEfectivoActual =
    pago!.monto + (ajustesPrevios ?? []).reduce((acc, ajuste) => acc + ajuste.monto, 0)

  const montoEfectivoVisto = Number(formData.get('montoEfectivoVisto'))
  const montoNuevo = Number(formData.get('montoNuevo'))

  if (!Number.isFinite(montoEfectivoVisto) || !Number.isFinite(montoNuevo) || montoNuevo < 0) {
    redirect(`/admin/pagos?error=${encodeURIComponent('Monto inválido')}`)
  }

  if (montoEfectivoVisto !== montoEfectivoActual) {
    redirect(
      `/admin/pagos?error=${encodeURIComponent(
        'El monto de este pago cambió desde que abriste esta pantalla. Revisalo antes de corregir.'
      )}`
    )
  }

  const delta = montoNuevo - montoEfectivoActual

  if (delta === 0) {
    redirect(`/admin/pagos?error=${encodeURIComponent('No hubo cambios en el monto.')}`)
  }

  const { data: pagoAjuste, error: errorAjuste } = await supabase
    .from('pagos')
    .insert({
      cliente_id: pago!.cliente_id,
      lote_id: pago!.lote_id,
      monto: delta,
      moneda: pago!.moneda,
      comprobante_path: pago!.comprobante_path,
      motivo: 'ajuste',
      estado: 'confirmado',
      confirmado_admin_por: user!.id,
      confirmado_admin_at: new Date().toISOString(),
      corrige_pago_id: pagoId,
    })
    .select('id')
    .single()

  if (errorAjuste || !pagoAjuste) {
    redirect(`/admin/pagos?error=${encodeURIComponent('No se pudo registrar la corrección.')}`)
  }

  if (delta > 0) {
    const { data: cuotas } = await supabase
      .from('cuotas')
      .select('id, saldo_pendiente')
      .eq('lote_id', pago!.lote_id)
      .gt('saldo_pendiente', 0)
      .order('numero', { ascending: true })

    const resultado = imputarPagoFIFO(
      delta,
      (cuotas ?? []).map((cuota) => ({ id: cuota.id, saldoPendiente: cuota.saldo_pendiente }))
    )

    for (const imputacion of resultado.imputaciones) {
      await supabase.from('pago_imputaciones').insert({
        pago_id: pagoAjuste!.id,
        cuota_id: imputacion.cuotaId,
        monto_imputado: imputacion.montoImputado,
      })

      const cuota = cuotas!.find((c) => c.id === imputacion.cuotaId)!
      await supabase
        .from('cuotas')
        .update({ saldo_pendiente: cuota.saldo_pendiente - imputacion.montoImputado })
        .eq('id', imputacion.cuotaId)
    }
  } else {
    const { data: imputacionesOriginales } = await supabase
      .from('pago_imputaciones')
      .select('id, cuota_id, monto_imputado')
      .eq('pago_id', pagoId)
      .order('created_at', { ascending: false })

    let restante = Math.abs(delta)

    for (const imputacion of imputacionesOriginales ?? []) {
      if (restante <= 0) break

      const aRevertir = Math.min(imputacion.monto_imputado, restante)

      const { data: cuota } = await supabase
        .from('cuotas')
        .select('saldo_pendiente')
        .eq('id', imputacion.cuota_id)
        .single()

      if (!cuota) continue

      await supabase
        .from('cuotas')
        .update({ saldo_pendiente: cuota.saldo_pendiente + aRevertir })
        .eq('id', imputacion.cuota_id)

      await supabase.from('pago_imputaciones').insert({
        pago_id: pagoAjuste!.id,
        cuota_id: imputacion.cuota_id,
        monto_imputado: -aRevertir,
      })

      restante -= aRevertir
    }
  }

  revalidatePath('/admin/pagos')
  revalidatePath('/portal-cliente')
}
```

Nota sobre la guarda optimista: es un chequeo SELECT-luego-comparar (no un UPDATE condicional atómico como el de `confirmarPago`, que compara `.eq('monto', montoVisto)` directo en la sentencia). No es posible expresar "insertar solo si una suma agregada en otras filas sigue igual" como una única sentencia atómica sin una función de Postgres. Dado que esta acción es exclusiva de administrador y es una corrección deliberada y poco frecuente (no una carrera entre dos roles distintos como la confirmación cruzada), este nivel de guarda es una decisión consciente, no un descuido — no agregar una función RPC para esto.

#### Paso 2: UI en `app/admin/pagos/page.tsx`

- [ ] Agregar el import de `editarMontoPago` junto al de `confirmarPago`:

```ts
import { confirmarPago, editarMontoPago } from './actions'
```

- [ ] Después de que `pagos` queda resuelto (después de los dos bloques `if (perfilPropio!.role === 'acreedor') {...} else {...}` y antes de `const admin = createAdminClient()`), agregar el cálculo del monto efectivo:

```ts
const idsPagos = pagos.map((pago) => pago.id)

const { data: ajustes } =
  idsPagos.length > 0
    ? await supabase.from('pagos').select('corrige_pago_id, monto').in('corrige_pago_id', idsPagos)
    : { data: [] }

const montoEfectivoPorId = new Map<string, number>(pagos.map((pago) => [pago.id, pago.monto]))

for (const ajuste of ajustes ?? []) {
  if (!ajuste.corrige_pago_id) continue
  montoEfectivoPorId.set(
    ajuste.corrige_pago_id,
    (montoEfectivoPorId.get(ajuste.corrige_pago_id) ?? 0) + ajuste.monto
  )
}
```

- [ ] Dentro de `pagosConLink`, en AMBOS `return` del `.map()` (el de `!pago.comprobante_path` y el de más abajo), agregar el campo `montoEfectivo: montoEfectivoPorId.get(pago.id) ?? pago.monto`. Por ejemplo, el segundo `return` queda:

```ts
      return {
        ...pago,
        comprobanteUrl: errorSignedUrl ? null : data?.signedUrl ?? null,
        sinAcreedorVinculado,
        identificadorLote,
        nombreCliente,
        cuentaCobroExterna: Boolean(lote?.cuenta_cobro_externa_id),
        montoEfectivo: montoEfectivoPorId.get(pago.id) ?? pago.monto,
      }
```

(y análogo en el primer `return`, el que corre cuando `!pago.comprobante_path`).

- [ ] Reemplazar la celda de Motivo:

```tsx
<td>{pago.motivo === 'sena' ? 'Seña' : 'Cuota'}</td>
```

por:

```tsx
<td>{pago.motivo === 'sena' ? 'Seña' : pago.motivo === 'ajuste' ? 'Ajuste' : 'Cuota'}</td>
```

- [ ] Justo antes de `return (` dentro del `.map((pago) => {...})` que renderiza las filas, junto a `const confirmarEstePago = confirmarPago.bind(null, pago.id)`, agregar:

```ts
const editarMontoEstePago = editarMontoPago.bind(null, pago.id)
```

- [ ] Dentro de la última `<td>` (la de acciones), después del bloque `{pago.estado === 'pendiente' && (...)}` ya existente (sin tocarlo), agregar:

```tsx
{pago.estado === 'confirmado' &&
  pago.motivo !== 'ajuste' &&
  perfilPropio!.role === 'administrador' && (
    <form action={editarMontoEstePago} className="flex flex-col gap-2">
      <input type="hidden" name="montoEfectivoVisto" value={pago.montoEfectivo} />
      <label className="text-xs text-gray-500">
        Corregir monto (actual: {pago.montoEfectivo} {pago.moneda})
        <input
          name="montoNuevo"
          type="number"
          step="0.01"
          min="0"
          defaultValue={pago.montoEfectivo}
          required
          className="mt-1 block rounded border px-2 py-1"
        />
      </label>
      <button type="submit" className="self-start underline">
        Editar monto
      </button>
    </form>
  )}
```

#### Paso 3: Tests e2e

- [ ] Crear `tests/e2e/editar-monto-pago.spec.ts`:

```ts
import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { imputarPagoFIFO } from '@/lib/pagos/imputar-fifo'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login, logout } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

function filaPorComprobante(page: Page, nombreArchivo: string) {
  return page
    .locator('main table tbody tr')
    .filter({ has: page.locator(`a[href*="${nombreArchivo}"]`) })
}

/**
 * Crea un pago YA confirmado (ambos lados) e imputado vía FIFO, igual que
 * dejaría `confirmarPago` en producción -- pero sin pasar por el browser,
 * para que cada test arranque de un estado conocido sin gastar pasos en
 * repetir el flujo de confirmación cruzada (ya cubierto por
 * pago-flujo-completo.spec.ts).
 */
async function crearPagoConfirmado(fixtures: TestFixtures, nombreArchivo: string, monto: number) {
  const admin = createAdminClient()

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
      motivo: 'cuota',
      estado: 'confirmado',
      confirmado_admin_por: fixtures.admin.id,
      confirmado_admin_at: new Date().toISOString(),
      confirmado_acreedor_por: fixtures.acreedorConDatos.id,
      confirmado_acreedor_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !pago) {
    throw new Error(`No se pudo crear el pago de prueba: ${error?.message}`)
  }

  const { data: cuotas } = await admin
    .from('cuotas')
    .select('id, saldo_pendiente')
    .eq('lote_id', fixtures.loteId)
    .gt('saldo_pendiente', 0)
    .order('numero', { ascending: true })

  const resultado = imputarPagoFIFO(
    monto,
    (cuotas ?? []).map((cuota) => ({ id: cuota.id, saldoPendiente: cuota.saldo_pendiente }))
  )

  for (const imputacion of resultado.imputaciones) {
    await admin.from('pago_imputaciones').insert({
      pago_id: pago.id,
      cuota_id: imputacion.cuotaId,
      monto_imputado: imputacion.montoImputado,
    })

    const cuota = cuotas!.find((c) => c.id === imputacion.cuotaId)!
    await admin
      .from('cuotas')
      .update({ saldo_pendiente: cuota.saldo_pendiente - imputacion.montoImputado })
      .eq('id', imputacion.cuotaId)
  }

  return pago.id as string
}

test.describe('Editar el monto de un pago ya confirmado', () => {
  let fixtures: TestFixtures

  test.beforeEach(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('corrección hacia arriba: la diferencia se imputa a la próxima cuota pendiente', async ({
    page,
  }) => {
    const nombreArchivo = `e2e-ajuste-arriba-${Date.now()}.pdf`
    const pagoId = await crearPagoConfirmado(fixtures, nombreArchivo, 1000) // cubre cuota 1 entera

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')

    const fila = filaPorComprobante(page, nombreArchivo)
    await fila.locator('input[name="montoNuevo"]').fill('1100')
    await fila.getByRole('button', { name: 'Editar monto' }).click()
    await page.waitForURL(/\/admin\/pagos/)

    const admin = createAdminClient()

    const { data: ajuste } = await admin
      .from('pagos')
      .select('monto, motivo, estado, corrige_pago_id')
      .eq('corrige_pago_id', pagoId)
      .single()
    expect(ajuste?.monto).toBe(100)
    expect(ajuste?.motivo).toBe('ajuste')
    expect(ajuste?.estado).toBe('confirmado')

    const { data: pagoOriginal } = await admin.from('pagos').select('monto').eq('id', pagoId).single()
    expect(pagoOriginal?.monto).toBe(1000) // el original nunca se toca

    const { data: cuotas } = await admin
      .from('cuotas')
      .select('numero, saldo_pendiente')
      .eq('lote_id', fixtures.loteId)
      .order('numero', { ascending: true })
    expect(cuotas?.[0].saldo_pendiente).toBe(0) // cuota 1, ya estaba en 0
    expect(cuotas?.[1].saldo_pendiente).toBe(900) // cuota 2, absorbe los 100 extra
    expect(cuotas?.[2].saldo_pendiente).toBe(1000) // cuota 3, intacta
  })

  test('corrección hacia abajo con una sola cuota afectada: se revierte esa cuota', async ({
    page,
  }) => {
    const nombreArchivo = `e2e-ajuste-abajo-simple-${Date.now()}.pdf`
    const pagoId = await crearPagoConfirmado(fixtures, nombreArchivo, 800) // cuota 1: saldo 1000 -> 200

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')

    const fila = filaPorComprobante(page, nombreArchivo)
    await fila.locator('input[name="montoNuevo"]').fill('700')
    await fila.getByRole('button', { name: 'Editar monto' }).click()
    await page.waitForURL(/\/admin\/pagos/)

    const admin = createAdminClient()

    const { data: ajuste } = await admin
      .from('pagos')
      .select('monto')
      .eq('corrige_pago_id', pagoId)
      .single()
    expect(ajuste?.monto).toBe(-100)

    const { data: cuotas } = await admin
      .from('cuotas')
      .select('numero, saldo_pendiente')
      .eq('lote_id', fixtures.loteId)
      .order('numero', { ascending: true })
    expect(cuotas?.[0].saldo_pendiente).toBe(300) // 200 + 100 revertidos
  })

  test('corrección hacia abajo en cascada: revierte primero la cuota más reciente', async ({
    page,
  }) => {
    const nombreArchivo = `e2e-ajuste-abajo-cascada-${Date.now()}.pdf`
    // 1500 sobre cuotas de 1000: cuota 1 llena (1000), cuota 2 recibe 500.
    const pagoId = await crearPagoConfirmado(fixtures, nombreArchivo, 1500)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')

    const fila = filaPorComprobante(page, nombreArchivo)
    await fila.locator('input[name="montoNuevo"]').fill('800') // delta -700
    await fila.getByRole('button', { name: 'Editar monto' }).click()
    await page.waitForURL(/\/admin\/pagos/)

    const admin = createAdminClient()

    const { data: cuotas } = await admin
      .from('cuotas')
      .select('numero, saldo_pendiente')
      .eq('lote_id', fixtures.loteId)
      .order('numero', { ascending: true })
    // Se revierten primero los 500 de cuota 2 (la imputación más reciente),
    // y con los 200 que faltan se toca recién cuota 1.
    expect(cuotas?.[1].saldo_pendiente).toBe(1000) // cuota 2: 500 + 500 revertidos
    expect(cuotas?.[0].saldo_pendiente).toBe(200) // cuota 1: 0 + 200 revertidos

    const { data: ajuste } = await admin
      .from('pagos')
      .select('id')
      .eq('corrige_pago_id', pagoId)
      .single()
    const { data: imputacionesAjuste } = await admin
      .from('pago_imputaciones')
      .select('cuota_id, monto_imputado')
      .eq('pago_id', ajuste!.id)
    expect(imputacionesAjuste).toHaveLength(2)
    expect(imputacionesAjuste?.reduce((acc, i) => acc + i.monto_imputado, 0)).toBe(-700)
  })

  test('segunda corrección sobre el mismo pago parte del monto efectivo, no del original', async ({
    page,
  }) => {
    const nombreArchivo = `e2e-ajuste-doble-${Date.now()}.pdf`
    const pagoId = await crearPagoConfirmado(fixtures, nombreArchivo, 1000)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')

    let fila = filaPorComprobante(page, nombreArchivo)
    await fila.locator('input[name="montoNuevo"]').fill('1100')
    await fila.getByRole('button', { name: 'Editar monto' }).click()
    await page.waitForURL(/\/admin\/pagos/)

    await page.goto('/admin/pagos')
    fila = filaPorComprobante(page, nombreArchivo)
    // El input tiene que precargar el monto EFECTIVO (1100), no el original (1000).
    await expect(fila.locator('input[name="montoNuevo"]')).toHaveValue('1100')

    await fila.locator('input[name="montoNuevo"]').fill('1150')
    await fila.getByRole('button', { name: 'Editar monto' }).click()
    await page.waitForURL(/\/admin\/pagos/)

    const admin = createAdminClient()
    const { data: ajustes } = await admin
      .from('pagos')
      .select('monto')
      .eq('corrige_pago_id', pagoId)
      .order('created_at', { ascending: true })
    expect(ajustes).toHaveLength(2)
    expect(ajustes?.[0].monto).toBe(100)
    expect(ajustes?.[1].monto).toBe(50) // 1150 - 1100, no 1150 - 1000
  })

  test('el rechazo por estado ya no confirmado ocurre en el servidor', async ({ page }) => {
    const nombreArchivo = `e2e-ajuste-rechazo-estado-${Date.now()}.pdf`
    const pagoId = await crearPagoConfirmado(fixtures, nombreArchivo, 1000)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')

    const fila = filaPorComprobante(page, nombreArchivo)
    await fila.locator('input[name="montoNuevo"]').fill('1200')

    // El formulario ya está renderizado en el browser cuando el pago deja
    // de estar confirmado por fuera -- el filtro de render inicial ya no
    // protege nada en este punto.
    const admin = createAdminClient()
    await admin.from('pagos').update({ estado: 'pendiente' }).eq('id', pagoId)

    await fila.getByRole('button', { name: 'Editar monto' }).click()
    await page.waitForURL(/\/admin\/pagos/)
    await expect(page.getByText(/no se puede editar/)).toBeVisible()

    const { data: ajuste } = await admin
      .from('pagos')
      .select('id')
      .eq('corrige_pago_id', pagoId)
    expect(ajuste).toHaveLength(0)
  })

  test('el rechazo por ya-ser-un-ajuste ocurre en el servidor', async ({ page }) => {
    const nombreArchivo = `e2e-ajuste-rechazo-motivo-${Date.now()}.pdf`
    const pagoId = await crearPagoConfirmado(fixtures, nombreArchivo, 1000)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')

    const fila = filaPorComprobante(page, nombreArchivo)
    await fila.locator('input[name="montoNuevo"]').fill('1200')

    const admin = createAdminClient()
    await admin.from('pagos').update({ motivo: 'ajuste' }).eq('id', pagoId)

    await fila.getByRole('button', { name: 'Editar monto' }).click()
    await page.waitForURL(/\/admin\/pagos/)
    await expect(page.getByText(/no se puede editar/)).toBeVisible()

    const { data: ajuste } = await admin
      .from('pagos')
      .select('id')
      .eq('corrige_pago_id', pagoId)
    expect(ajuste).toHaveLength(0)
  })

  test('un acreedor no ve el control de "Editar monto"', async ({ page }) => {
    const nombreArchivo = `e2e-ajuste-acreedor-${Date.now()}.pdf`
    await crearPagoConfirmado(fixtures, nombreArchivo, 1000)

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto('/admin/pagos')

    const fila = filaPorComprobante(page, nombreArchivo)
    await expect(fila).toBeVisible()
    await expect(fila.getByRole('button', { name: 'Editar monto' })).toHaveCount(0)
  })

  test('la guarda optimista rechaza una corrección basada en un monto efectivo desactualizado', async ({
    page,
  }) => {
    const nombreArchivo = `e2e-ajuste-carrera-${Date.now()}.pdf`
    const pagoId = await crearPagoConfirmado(fixtures, nombreArchivo, 1000)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/pagos')

    const fila = filaPorComprobante(page, nombreArchivo)
    await expect(fila.locator('input[name="montoNuevo"]')).toHaveValue('1000')
    await fila.locator('input[name="montoNuevo"]').fill('1200')

    // Otra corrección se cuela por fuera del browser DESPUÉS de que esta
    // pantalla ya cargó con el monto efectivo viejo (1000).
    const admin = createAdminClient()
    await admin
      .from('pagos')
      .insert({
        cliente_id: fixtures.cliente.id,
        lote_id: fixtures.loteId,
        monto: 50,
        moneda: 'USD',
        motivo: 'ajuste',
        estado: 'confirmado',
        confirmado_admin_por: fixtures.admin.id,
        confirmado_admin_at: new Date().toISOString(),
        corrige_pago_id: pagoId,
      })

    await fila.getByRole('button', { name: 'Editar monto' }).click()
    await page.waitForURL(/\/admin\/pagos/)
    await expect(page.getByText(/cambió desde que abriste esta pantalla/)).toBeVisible()

    // Solo debe existir el ajuste de 50 colado por fuera -- el submit
    // obsoleto (que hubiera creado uno de 200) no se aplicó.
    const { data: ajustes } = await admin.from('pagos').select('monto').eq('corrige_pago_id', pagoId)
    expect(ajustes).toHaveLength(1)
    expect(ajustes?.[0].monto).toBe(50)
  })
})
```

- [ ] Correr los tests: `npx playwright test tests/e2e/editar-monto-pago.spec.ts`
Expected: 8/8 PASS.

- [ ] Correr `tsc --noEmit` (o el script de typecheck del proyecto) y confirmar que no hay errores nuevos.

- [ ] Correr una regresión amplia que toque `/admin/pagos` y el resto de pagos: `npx playwright test tests/e2e/editar-monto-pago.spec.ts tests/e2e/pago-flujo-completo.spec.ts tests/e2e/motivo-pago.spec.ts tests/e2e/pagos-acotados-por-acreedor.spec.ts tests/e2e/busqueda-pagos.spec.ts tests/e2e/monto-editable-confirmacion.spec.ts`
Expected: todo en verde.

- [ ] Commit:

```bash
git add app/admin/pagos/actions.ts app/admin/pagos/page.tsx tests/e2e/editar-monto-pago.spec.ts
git commit -m "feat: permite al admin corregir el monto de un pago ya confirmado"
```

---

## Self-Review

**Cobertura de la spec:** Quién (admin) → Task 2 Paso 1 (`requireAdministrador`). Dónde (`/admin/pagos`) → Task 2 Paso 2. Mecánica de pago de ajuste (delta > 0 / < 0 / == 0) → Task 2 Paso 1. Migración (enum + columna) → Task 1. Guarda optimista → Task 2 Paso 1, documentada como best-effort deliberado. Los 8 casos de testing de la spec → los 8 tests de Task 2 Paso 3 (mapeo 1 a 1: arriba, abajo simple, abajo cascada, segunda corrección, pendiente rechazado, ajuste rechazado, acreedor sin acceso, carrera).

**Placeholders:** ninguno — todo el código de cada paso está completo, sin TBD ni "similar a...".

**Consistencia de tipos:** `editarMontoPago(pagoId: string, formData: FormData)` se define una sola vez (Task 2) y se consume una sola vez (`.bind(null, pago.id)` en `page.tsx`, misma tarea) — sin discrepancia entre tareas.
