# Descuento de seña en la primera cuota Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al vender un lote, descontar automáticamente la seña ya cobrada en la reserva de las cuotas recién generadas (en vez de cobrar el precio total completo más la seña por separado).

**Architecture:** Todo el cambio vive dentro de `venderLote` (Server Action). Reusa `imputarPagoFIFO` (ya existente, sin tocar) para repartir la seña en cascada entre cuotas, siguiendo el mismo patrón de inserción de `pagos`/`pago_imputaciones`/actualización de `saldo_pendiente` que ya usa `confirmarPago`.

**Tech Stack:** Next.js 16, TypeScript, Supabase JS, Playwright (e2e).

## Global Constraints

- Spec de referencia: `docs/superpowers/specs/2026-08-12-descuento-sena-primera-cuota-design.md`.
- Cero JavaScript de cliente nuevo.
- Mensajes de error al usuario: siempre en español llano.
- No hay conversión automática de moneda en ningún lado del proyecto — si `moneda_sena` de la reserva difiere de `lotes.moneda`, no se descuenta nada.
- Working directory: `sima-inmobiliaria/`.

---

### Task 1: Descuento de la seña en `venderLote`

**Files:**
- Modify: `app/admin/lotes/[id]/vender/actions.ts`

**Interfaces:**
- Consumes: `imputarPagoFIFO(montoPago: number, cuotasOrdenadas: {id: string, saldoPendiente: number}[]): {imputaciones: {cuotaId: string, montoImputado: number}[], saldoNoImputado: number}` (de `lib/pagos/imputar-fifo.ts`, ya existente, sin cambios).
- No produce ninguna interfaz nueva para otras tareas (el cambio es autocontenido).

- [ ] **Step 1: Reescribir el archivo completo**

```typescript
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { calcularMontoCuota } from '@/lib/lotes/calcular-monto-cuota'
import { generarCuotas } from '@/lib/lotes/generar-cuotas'
import { imputarPagoFIFO } from '@/lib/pagos/imputar-fifo'

export async function venderLote(loteId: string, formData: FormData) {
  await requireAdministrador()

  const email = ((formData.get('email') as string) || '').trim()
  const fullName = ((formData.get('fullName') as string) || '').trim()
  const cantidadCuotas = Number(formData.get('cantidadCuotas'))
  const fechaPrimeraCuota = formData.get('fechaPrimeraCuota') as string

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
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent('Ingresá la fecha de la primera cuota')}`
    )
  }

  const supabase = await createClient()
  const {
    data: { user: adminUser },
  } = await supabase.auth.getUser()

  const admin = createAdminClient()

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

  const { data: invited, error: errorInvite } = await admin.auth.admin.inviteUserByEmail(email)

  if (errorInvite || !invited.user) {
    redirect(
      `/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorInvite?.message ?? 'error desconocido')}`
    )
  }

  const { error: errorProfile } = await admin.from('profiles').insert({
    id: invited.user.id,
    role: 'cliente',
    full_name: fullName,
  })

  if (errorProfile) {
    redirect(`/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorProfile.message)}`)
  }

  const precioTotal = loteActual!.precio_total as number
  const montoCuotaBase = calcularMontoCuota(precioTotal, cantidadCuotas)
  const cuotas = generarCuotas(cantidadCuotas, montoCuotaBase, fechaPrimeraCuota, precioTotal)

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
      cliente_id: invited.user.id,
      cantidad_cuotas: cantidadCuotas,
      monto_cuota_base: montoCuotaBase,
      fecha_primera_cuota: fechaPrimeraCuota,
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
  const { data: reserva } = await admin
    .from('reservas')
    .select('monto_sena, moneda_sena, comprobante_sena_path')
    .eq('lote_id', loteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (reserva && reserva.monto_sena > 0 && reserva.moneda_sena === loteActual!.moneda) {
    const { data: pagoSena, error: errorPagoSena } = await admin
      .from('pagos')
      .insert({
        cliente_id: invited.user.id,
        monto: reserva.monto_sena,
        moneda: reserva.moneda_sena,
        comprobante_path: reserva.comprobante_sena_path,
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

    const cuotasOrdenadas = [...cuotasCreadas].sort((a, b) => a.numero - b.numero)
    const resultado = imputarPagoFIFO(
      reserva.monto_sena,
      cuotasOrdenadas.map((cuota) => ({ id: cuota.id, saldoPendiente: cuota.saldo_pendiente }))
    )

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

Nota: en el loop, `cuota.saldoPendiente` (no `cuota.saldo_pendiente`) porque `cuotasOrdenadas` se mapea con la forma `{id, saldoPendiente}` que espera `imputarPagoFIFO` — a `cuotasOrdenadas.find(...)` le llega ese mismo objeto mapeado, no la fila cruda de `cuotasCreadas`. Revisar con cuidado esta línea al transcribir: es una fuente común de bugs por nombre de campo (snake_case vs camelCase) en este archivo.

- [ ] **Step 2: Verificar con build**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add app/admin/lotes/[id]/vender/actions.ts
git commit -m "feat: descontar la seña de la reserva en las cuotas al vender"
```

---

### Task 2: Tests e2e del descuento de seña

**Files:**
- Modify: `tests/e2e/pase-a-vendido.spec.ts`

**Interfaces:**
- Consumes: `crearLoteDisponibleConPrecio(identificador, precioTotal)` y `reservarLotePorUI(page, loteId, datos)`, ambos ya definidos en este archivo.

- [ ] **Step 1: Extender `reservarLotePorUI` para aceptar moneda de la seña opcional**

Localizar la función `reservarLotePorUI` en `tests/e2e/pase-a-vendido.spec.ts` y reemplazar su firma y su cuerpo (agregar el `selectOption` de moneda, sin tocar el resto):

```typescript
async function reservarLotePorUI(
  page: Page,
  loteId: string,
  datos: { nombreCompleto: string; email: string; montoSena: string; monedaSena?: string }
) {
  await page.goto(`/admin/lotes/${loteId}/reservar`)
  await page.getByPlaceholder('Nombre completo').fill(datos.nombreCompleto)
  await page.getByPlaceholder('DNI').fill('30111222')
  await page.getByPlaceholder('Domicilio').fill('Calle Falsa 123')
  await page.getByPlaceholder('Email').fill(datos.email)
  await page.getByPlaceholder('Teléfono', { exact: true }).fill('3511234567')
  await page.selectOption('select[name="estadoCivil"]', 'soltero')
  await page.getByPlaceholder('Monto de la seña').fill(datos.montoSena)
  await page.selectOption('select[name="monedaSena"]', datos.monedaSena ?? 'USD')
  await page.setInputFiles('input[name="comprobante"]', {
    name: `e2e-vender-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
  await page.getByRole('button', { name: 'Confirmar reserva' }).click()
  await page.waitForURL('**/admin/lotes')
}
```

(Las llamadas existentes que no pasan `monedaSena` siguen funcionando igual, por el default `?? 'USD'`.)

- [ ] **Step 2: Agregar los 4 tests nuevos, al final del `test.describe`, antes del cierre `})`**

```typescript
  test('vender con seña menor a la primera cuota: se descuenta del saldo_pendiente', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponibleConPrecio(`E2E Seña Menor ${Date.now()}`, 10000)

    await login(page, fixtures.admin.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Comprador Seña Menor',
      email: `sena.menor.${Date.now()}@sima-e2e.invalid`,
      montoSena: '500',
    })

    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('10')
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('cliente_id').eq('id', loteId).single()
    const { data: cuotas } = await admin
      .from('cuotas')
      .select('id, numero, monto_base, saldo_pendiente')
      .eq('lote_id', loteId)
      .order('numero', { ascending: true })

    expect(cuotas?.[0].monto_base).toBe(1000)
    expect(cuotas?.[0].saldo_pendiente).toBe(500)
    expect(cuotas?.[1].saldo_pendiente).toBe(1000)

    const { data: pagos } = await admin
      .from('pagos')
      .select('id, monto, estado')
      .eq('cliente_id', lote!.cliente_id)
    expect(pagos).toHaveLength(1)
    expect(pagos![0].monto).toBe(500)
    expect(pagos![0].estado).toBe('confirmado')

    const { data: imputaciones } = await admin
      .from('pago_imputaciones')
      .select('cuota_id, monto_imputado')
      .eq('pago_id', pagos![0].id)
    expect(imputaciones).toHaveLength(1)
    expect(imputaciones?.[0].cuota_id).toBe(cuotas![0].id)
    expect(imputaciones?.[0].monto_imputado).toBe(500)
  })

  test('vender con seña mayor a la primera cuota: cascadea a la segunda', async ({ page }) => {
    const loteId = await crearLoteDisponibleConPrecio(`E2E Seña Cascada ${Date.now()}`, 10000)

    await login(page, fixtures.admin.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Comprador Seña Cascada',
      email: `sena.cascada.${Date.now()}@sima-e2e.invalid`,
      montoSena: '1500',
    })

    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('10')
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: cuotas } = await admin
      .from('cuotas')
      .select('numero, saldo_pendiente')
      .eq('lote_id', loteId)
      .order('numero', { ascending: true })

    expect(cuotas?.[0].saldo_pendiente).toBe(0)
    expect(cuotas?.[1].saldo_pendiente).toBe(500)
    expect(cuotas?.[2].saldo_pendiente).toBe(1000)
  })

  test('vender con seña en moneda distinta a la del lote: no se descuenta nada', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponibleConPrecio(`E2E Seña Moneda Distinta ${Date.now()}`, 10000)

    await login(page, fixtures.admin.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Comprador Seña Moneda Distinta',
      email: `sena.moneda.${Date.now()}@sima-e2e.invalid`,
      montoSena: '500',
      monedaSena: 'ARS',
    })

    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('10')
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('cliente_id').eq('id', loteId).single()
    const { data: cuotas } = await admin
      .from('cuotas')
      .select('monto_base, saldo_pendiente')
      .eq('lote_id', loteId)

    for (const cuota of cuotas ?? []) {
      expect(cuota.saldo_pendiente).toBe(cuota.monto_base)
    }

    const { data: pagos } = await admin.from('pagos').select('id').eq('cliente_id', lote!.cliente_id)
    expect(pagos).toHaveLength(0)
  })

  test('venta al contado (seña $0): no se crea ningún pago', async ({ page }) => {
    const loteId = await crearLoteDisponibleConPrecio(`E2E Seña Cero Vendido ${Date.now()}`, 5000)

    await login(page, fixtures.admin.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Comprador Contado Vendido',
      email: `contado.vendido.${Date.now()}@sima-e2e.invalid`,
      montoSena: '0',
    })

    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('1')
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('cliente_id').eq('id', loteId).single()
    const { data: pagos } = await admin.from('pagos').select('id').eq('cliente_id', lote!.cliente_id)
    expect(pagos).toHaveLength(0)

    const { data: cuotas } = await admin
      .from('cuotas')
      .select('monto_base, saldo_pendiente')
      .eq('lote_id', loteId)
    expect(cuotas?.[0].saldo_pendiente).toBe(cuotas?.[0].monto_base)
  })
```

- [ ] **Step 3: Correr toda la suite nueva del archivo**

Run: `npx playwright test pase-a-vendido`
Expected: PASS (11 tests: los 7 ya existentes + los 4 nuevos). Si algún locator no matchea, ajustarlo para que coincida con lo realmente renderizado — no cambiar el criterio del test.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/pase-a-vendido.spec.ts
git commit -m "test: cobertura e2e del descuento de seña al vender"
```

---

### Task 3: Regresión final + limpieza de datos de prueba

**Files:** ninguno (solo comandos y, si hace falta, limpieza vía SQL).

- [ ] **Step 1: Build limpio**

Run: `npm run build`
Expected: build exitoso, cero errores de tipos.

- [ ] **Step 2: Suite unitaria completa**

Run: `npm test`
Expected: todo en verde (no debería haber cambiado nada de lo unitario en esta tanda, pero se corre igual por costumbre).

- [ ] **Step 3: Suite e2e completa, dos corridas**

Run: `npx playwright test`
Expected: todo en verde, corrido dos veces para descartar flakes.

- [ ] **Step 4: Limpiar datos de prueba**

Con `mcp__supabase__execute_sql` (verificar antes que `get_project_url` coincide con `.env.local`):

```sql
with lotes_e2e as (
  select id, cliente_id from public.lotes
  where identificador like 'E2E %'
    and identificador not in ('E2E Test Lote', 'E2E Lote Secundario')
),
del_pago_imputaciones as (
  delete from public.pago_imputaciones
  where cuota_id in (select id from public.cuotas where lote_id in (select id from lotes_e2e))
  returning id
),
del_pagos as (
  delete from public.pagos where cliente_id in (select cliente_id from lotes_e2e where cliente_id is not null)
  returning id
),
del_cuotas as (
  delete from public.cuotas where lote_id in (select id from lotes_e2e) returning id
),
del_lotes as (
  delete from public.lotes where id in (select id from lotes_e2e) returning id
),
del_profiles as (
  delete from public.profiles where id in (select cliente_id from lotes_e2e where cliente_id is not null) returning id
)
select
  (select count(*) from del_pago_imputaciones) as imputaciones_borradas,
  (select count(*) from del_pagos) as pagos_borrados,
  (select count(*) from del_cuotas) as cuotas_borradas,
  (select count(*) from del_lotes) as lotes_borrados,
  (select count(*) from del_profiles) as profiles_borrados;
```

(Esta vez la limpieza incluye `pago_imputaciones`/`pagos`, que la tanda anterior no generaba — esta sí, por el descuento de seña.)

## Self-Review (completado antes de entregar este plan)

- **Cobertura de la spec:** el descuento de seña, la cascada FIFO, el caso de moneda distinta y el caso sin seña están todos cubiertos (Task 1 implementa los 4 casos, Task 2 los prueba uno por uno).
- **Placeholders:** ninguno.
- **Consistencia de tipos:** `imputarPagoFIFO` se usa con la firma exacta que ya tiene (`(montoPago, cuotasOrdenadas: {id, saldoPendiente}[])`); el mapeo `cuotasCreadas` (snake_case de Supabase: `saldo_pendiente`) → `{id, saldoPendiente}` (camelCase que espera la función) se hace explícito en el Step 1 de la Task 1, con una nota aparte llamando la atención sobre esa fuente común de bugs.
