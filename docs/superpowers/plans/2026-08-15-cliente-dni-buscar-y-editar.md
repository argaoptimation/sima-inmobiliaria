# DNI/domicilio/teléfono del cliente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar DNI, domicilio y teléfono del cliente en su perfil (no solo en la reserva de un lote puntual), para poder buscarlo por DNI al reservar un lote nuevo (con precarga automática) y poder corregir sus datos tanto desde Admin como desde su propio portal.

**Architecture:** Tres columnas nuevas y opcionales en `profiles` (`dni` con índice único parcial, `domicilio`, `telefono`), pobladas automáticamente al vender (nunca pisando un dato ya cargado) y editables a mano en dos pantallas existentes. Un buscador nuevo, sin JavaScript de cliente (`<form method="GET">`), en la página de reservar, que precarga el formulario grande ya existente si encuentra coincidencia por DNI.

**Tech Stack:** Next.js 16 (Server Components + Server Actions), Supabase (Postgres), TypeScript, Playwright (e2e).

## Global Constraints

- Los tres campos nuevos son opcionales (`null` permitido) — nunca se exige completarlos para poder vender, editar, ni reservar.
- `dni` tiene un índice único parcial (`where dni is not null`) — dos clientes distintos nunca pueden compartir el mismo DNI. Cualquier choque se maneja sin bloquear la acción de negocio en curso (vender, guardar), con un mensaje claro cuando corresponde.
- Al vender, un cliente existente NUNCA pierde un dato que ya tenía cargado — solo se completan campos que estén en `null`.
- El formulario de vender (`fullName`/`email`) no gana ningún campo nuevo — DNI/domicilio/teléfono se copian del lado del servidor, sin exponerlos como inputs ahí.
- Teléfono alternativo queda fuera de todo esto (decisión explícita de Gabriel).
- Sin JavaScript de cliente nuevo en ningún lado de este plan.

---

### Task 1: Migración — columnas nuevas + backfill de clientes ya cargados

**Files:**
- Create: `supabase/migrations/0019_clientes_dni_domicilio_telefono.sql`

**Interfaces:**
- Consumes: nada.
- Produces: columnas `public.profiles.dni` (con índice único parcial `profiles_dni_unique`), `public.profiles.domicilio`, `public.profiles.telefono`. Todas las tareas siguientes dependen de que existan con estos nombres exactos.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/0019_clientes_dni_domicilio_telefono.sql
alter table public.profiles
  add column dni text,
  add column domicilio text,
  add column telefono text;

create unique index profiles_dni_unique on public.profiles (dni) where dni is not null;
```

- [ ] **Step 2: Aplicar directamente contra la base (el controller, no un subagente)**

Antes de aplicar, verificar con `mcp__supabase__get_project_url` que coincide con `NEXT_PUBLIC_SUPABASE_URL` de `.env.local`. Aplicar con `mcp__supabase__apply_migration`. Verificar después con una consulta a `information_schema.columns` que las tres columnas existen, y a `pg_indexes` que `profiles_dni_unique` existe.

- [ ] **Step 3: Backfill de una sola vez (el controller, vía `mcp__supabase__execute_sql`, no un subagente, no se commitea como migración)**

Para cada cliente que ya exista y todavía no tenga estos datos, completar desde su reserva más reciente (por email):

```sql
update public.profiles p
set
  dni = coalesce(p.dni, r.dni),
  domicilio = coalesce(p.domicilio, r.domicilio),
  telefono = coalesce(p.telefono, r.telefono)
from (
  select distinct on (email) email, dni, domicilio, telefono
  from public.reservas
  order by email, created_at desc
) r
where p.role = 'cliente'
  and p.email = r.email
  and (p.dni is null or p.domicilio is null or p.telefono is null);
```

Correrlo, y verificar después con una consulta cuántos `profiles` con `role = 'cliente'` quedaron con `dni` no nulo (para tener un número de referencia en el reporte). Si el `update` fallara por un choque real de DNI entre dos clientes ya existentes (extremadamente improbable con datos reales — un DNI es un identificador único de una persona), revisar manualmente cuál de los dos registros es el correcto antes de reintentar; no forzar nada a ciegas.

- [ ] **Step 4: Commit del archivo de migración**

```bash
git add supabase/migrations/0019_clientes_dni_domicilio_telefono.sql
git commit -m "Migracion: columnas dni/domicilio/telefono en profiles"
```

---

### Task 2: Población automática de datos del cliente al vender

**Files:**
- Modify: `app/admin/lotes/[id]/vender/actions.ts`
- Modify: `app/admin/lotes/[id]/vender/page.tsx`
- Test: `tests/e2e/vender-datos-cliente.spec.ts` (nuevo)

**Interfaces:**
- Consumes: columnas de Task 1.
- Produces: nada que otra tarea de este plan consuma directamente — Task 4 (buscador) sí depende de que existan perfiles reales con `dni` cargado para poder probar la búsqueda end-to-end, pero construye sus propios datos de prueba directamente por API, sin depender de que este flujo esté terminado.

- [ ] **Step 1: Mover y ampliar la consulta de la reserva; ampliar la de `clienteExistente`**

En `app/admin/lotes/[id]/vender/actions.ts`, la consulta a `reservas` hoy está más abajo en la función (justo antes de la sección "Descuento de la seña"). Moverla arriba, justo antes del bloque `const { data: clienteExistente } = ...` (después del chequeo de `loteActual!.precio_total`), y ampliar su `select`:

```typescript
  const { data: reserva } = await admin
    .from('reservas')
    .select('monto_sena, moneda_sena, comprobante_sena_path, dni, domicilio, telefono')
    .eq('lote_id', loteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
```

Eliminar la consulta duplicada que quedaba más abajo (la que hoy sigue existiendo justo antes de "Descuento de la seña") — a partir de este cambio, la variable `reserva` de arriba se reusa en esa sección de abajo tal cual (ya trae `monto_sena`, `moneda_sena`, `comprobante_sena_path`, que es todo lo que esa sección necesita).

Ampliar el `select` de `clienteExistente`:

```typescript
  const { data: clienteExistente } = await admin
    .from('profiles')
    .select('id, full_name, dni, domicilio, telefono')
    .eq('email', email)
    .eq('role', 'cliente')
    .maybeSingle()
```

- [ ] **Step 2: Ampliar la rama de "cliente existente" — aviso de DNI que no coincide + completar solo lo que falte**

Reemplazar el bloque completo `if (clienteExistente) { ... } else { ... }` por:

```typescript
  let clienteId: string

  if (clienteExistente) {
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
```

- [ ] **Step 3: Eliminar la consulta duplicada de `reserva` que quedaba antes de "Descuento de la seña"**

Buscar, más abajo en el mismo archivo, el bloque que empieza con el comentario `// Descuento de la seña de la reserva...` — justo antes tenía su propia consulta a `reservas` (`const { data: reserva } = await admin.from('reservas').select('monto_sena, moneda_sena, comprobante_sena_path')...`). Esa consulta ya no existe ahí (se movió y amplió en el Step 1) — confirmar que el resto de esa sección (`if (reserva && reserva.monto_sena > 0 ...) { ... }`) sigue exactamente igual, usando la misma variable `reserva` de más arriba.

- [ ] **Step 4: Mostrar el aviso de DNI que no coincide en la pantalla de confirmación**

En `app/admin/lotes/[id]/vender/page.tsx`, ampliar el tipo de `searchParams`:

```typescript
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
  }>
```

Y en la destructuración de `searchParams`, agregar `dniReserva` y `dniPerfil`:

```typescript
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
  } = await searchParams
```

Dentro del bloque `{confirmarClienteId && (...)}` ya existente, después del último `<p>` (el que dice "Si confirmás, este lote se va a asociar..."), agregar:

```tsx
              {dniReserva && dniPerfil && (
                <p className="mt-2">
                  El DNI de esta reserva ({dniReserva}) no coincide con el que ya tenía guardado (
                  {dniPerfil}). Se mantiene el guardado; si es un error, corregilo después desde la
                  ficha del cliente.
                </p>
              )}
```

- [ ] **Step 5: Escribir los tests e2e**

```typescript
// tests/e2e/vender-datos-cliente.spec.ts
import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

const COMPROBANTE_PATH = path.join(__dirname, 'fixtures', 'comprobante-test.pdf')
const COMPROBANTE_BYTES = readFileSync(COMPROBANTE_PATH)

async function crearLoteDisponibleConPrecio(identificador: string, precioTotal: number) {
  const admin = createAdminClient()
  const { data: lote, error } = await admin
    .from('lotes')
    .insert({
      identificador,
      moneda: 'USD',
      estado: 'disponible',
      ubicacion: 'Ubicación E2E',
      precio_total: precioTotal,
    })
    .select('id')
    .single()

  if (error || !lote) {
    throw new Error(`No se pudo crear el lote de prueba: ${error?.message}`)
  }

  return lote.id as string
}

async function reservarLotePorUI(
  page: Page,
  loteId: string,
  datos: {
    nombreCompleto: string
    dni: string
    domicilio: string
    telefono: string
    email: string
    montoSena: string
  }
) {
  await page.goto(`/admin/lotes/${loteId}/reservar`)
  await page.getByPlaceholder('Nombre completo').fill(datos.nombreCompleto)
  await page.getByPlaceholder('DNI', { exact: true }).fill(datos.dni)
  await page.getByPlaceholder('Domicilio').fill(datos.domicilio)
  await page.getByPlaceholder('Email').fill(datos.email)
  await page.getByPlaceholder('Teléfono', { exact: true }).fill(datos.telefono)
  await page.selectOption('select[name="estadoCivil"]', 'soltero')
  await page.getByPlaceholder('Monto de la seña').fill(datos.montoSena)
  await page.selectOption('select[name="monedaSena"]', 'USD')
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
  await page.waitForURL('**/admin/lotes')
}

async function venderLotePorUI(page: Page, loteId: string, datos: { email: string; fullName: string }) {
  await page.goto(`/admin/lotes/${loteId}/vender`)
  await page.getByPlaceholder('Nombre completo del comprador').fill(datos.fullName)
  await page.getByPlaceholder('Email del comprador').fill(datos.email)
  await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('1')
  await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
  await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
  await page.waitForURL(
    (url) => url.pathname === '/admin/lotes' || url.searchParams.has('confirmarClienteId')
  )
}

test.describe('Datos del cliente al vender', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('cliente nuevo: DNI, domicilio y teléfono quedan copiados en su perfil', async ({ page }) => {
    const admin = createAdminClient()
    const loteId = await crearLoteDisponibleConPrecio(`E2E Vender DNI Nuevo ${Date.now()}`, 5000)
    const email = `sena.dni.nuevo.${Date.now()}@sima-e2e.invalid`
    const dni = `${Date.now()}`.slice(-8)

    await login(page, fixtures.admin.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Cliente DNI Nuevo',
      dni,
      domicilio: 'Domicilio E2E 123',
      telefono: '3511111111',
      email,
      montoSena: '100',
    })

    await venderLotePorUI(page, loteId, { email, fullName: 'Cliente DNI Nuevo' })
    await page.waitForURL('**/admin/lotes')

    const { data: lote } = await admin.from('lotes').select('cliente_id').eq('id', loteId).single()
    const { data: cliente } = await admin
      .from('profiles')
      .select('dni, domicilio, telefono')
      .eq('id', lote!.cliente_id)
      .single()

    expect(cliente?.dni).toBe(dni)
    expect(cliente?.domicilio).toBe('Domicilio E2E 123')
    expect(cliente?.telefono).toBe('3511111111')
  })

  test('cliente existente sin esos datos cargados: se completan con los de la nueva reserva', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const email = `cliente.sin.datos.${Date.now()}@sima-e2e.invalid`

    const { data: invited } = await admin.auth.admin.inviteUserByEmail(email)
    await admin.from('profiles').insert({
      id: invited!.user.id,
      role: 'cliente',
      full_name: 'Cliente Sin Datos',
      email,
    })

    const loteId = await crearLoteDisponibleConPrecio(`E2E Vender Completar Datos ${Date.now()}`, 5000)
    const dni = `${Date.now()}`.slice(-8)

    await login(page, fixtures.admin.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Cliente Sin Datos',
      dni,
      domicilio: 'Domicilio Completado 456',
      telefono: '3512222222',
      email,
      montoSena: '100',
    })

    await venderLotePorUI(page, loteId, { email, fullName: 'Cliente Sin Datos' })
    if (page.url().includes('confirmarClienteId')) {
      await page.getByRole('button', { name: 'Confirmar venta con esta cuenta existente' }).click()
    }
    await page.waitForURL('**/admin/lotes')

    const { data: cliente } = await admin
      .from('profiles')
      .select('dni, domicilio, telefono')
      .eq('id', invited!.user.id)
      .single()

    expect(cliente?.dni).toBe(dni)
    expect(cliente?.domicilio).toBe('Domicilio Completado 456')
    expect(cliente?.telefono).toBe('3512222222')
  })

  test('cliente existente con DNI ya cargado, distinto al de la nueva reserva: aviso visible, se mantiene el guardado', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const email = `cliente.dni.distinto.${Date.now()}@sima-e2e.invalid`
    const dniOriginal = `${Date.now()}`.slice(-8)
    const dniNuevo = `${Number(dniOriginal) + 1}`

    const { data: invited } = await admin.auth.admin.inviteUserByEmail(email)
    await admin.from('profiles').insert({
      id: invited!.user.id,
      role: 'cliente',
      full_name: 'Cliente DNI Distinto',
      email,
      dni: dniOriginal,
    })

    const loteId = await crearLoteDisponibleConPrecio(`E2E Vender DNI Distinto ${Date.now()}`, 5000)

    await login(page, fixtures.admin.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Cliente DNI Distinto',
      dni: dniNuevo,
      domicilio: 'Domicilio E2E 789',
      telefono: '3513333333',
      email,
      montoSena: '100',
    })

    await venderLotePorUI(page, loteId, { email, fullName: 'Cliente DNI Distinto' })
    await page.waitForURL((url) => url.searchParams.has('confirmarClienteId'))

    await expect(page.getByText(/no coincide con el que ya tenía guardado/)).toBeVisible()
    await expect(page.getByText(dniOriginal, { exact: false })).toBeVisible()

    await page.getByRole('button', { name: 'Confirmar venta con esta cuenta existente' }).click()
    await page.waitForURL('**/admin/lotes')

    const { data: cliente } = await admin.from('profiles').select('dni').eq('id', invited!.user.id).single()
    expect(cliente?.dni).toBe(dniOriginal)
  })

  test('cliente nuevo con DNI que ya pertenece a otro cliente: la venta se completa igual, DNI queda vacío', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const dniYaUsado = `${Date.now()}`.slice(-8)
    const emailDuenioOriginal = `dueno.dni.${Date.now()}@sima-e2e.invalid`

    const { data: invitedOriginal } = await admin.auth.admin.inviteUserByEmail(emailDuenioOriginal)
    await admin.from('profiles').insert({
      id: invitedOriginal!.user.id,
      role: 'cliente',
      full_name: 'Dueño DNI Original',
      email: emailDuenioOriginal,
      dni: dniYaUsado,
    })

    const loteId = await crearLoteDisponibleConPrecio(`E2E Vender DNI Choque ${Date.now()}`, 5000)
    const emailNuevo = `nuevo.con.dni.usado.${Date.now()}@sima-e2e.invalid`

    await login(page, fixtures.admin.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Nuevo Con DNI Usado',
      dni: dniYaUsado,
      domicilio: 'Domicilio E2E 999',
      telefono: '3514444444',
      email: emailNuevo,
      montoSena: '100',
    })

    await venderLotePorUI(page, loteId, { email: emailNuevo, fullName: 'Nuevo Con DNI Usado' })
    await page.waitForURL('**/admin/lotes')

    const { data: lote } = await admin.from('lotes').select('cliente_id, estado').eq('id', loteId).single()
    expect(lote?.estado).toBe('vendido')

    const { data: clienteNuevo } = await admin
      .from('profiles')
      .select('dni')
      .eq('id', lote!.cliente_id)
      .single()
    expect(clienteNuevo?.dni).toBeNull()
  })
})
```

- [ ] **Step 6: Correr los tests**

Run: `npx playwright test tests/e2e/vender-datos-cliente.spec.ts --project=chromium`
Expected: 4 passed

- [ ] **Step 7: Commit**

```bash
git add app/admin/lotes/\[id\]/vender/actions.ts app/admin/lotes/\[id\]/vender/page.tsx tests/e2e/vender-datos-cliente.spec.ts
git commit -m "Poblar DNI/domicilio/telefono del cliente al vender, con aviso de DNI que no coincide"
```

---

### Task 3: Editar datos del cliente — Admin y portal del cliente

**Files:**
- Modify: `app/portal-cliente/mi-perfil/actions.ts`
- Modify: `app/portal-cliente/mi-perfil/page.tsx`
- Modify: `app/admin/clientes/actions.ts`
- Modify: `app/admin/clientes/[id]/page.tsx`
- Test: `tests/e2e/editar-datos-cliente.spec.ts` (nuevo)

**Interfaces:**
- Consumes: columnas de Task 1.
- Produces: `actualizarMisDatosCliente(formData: FormData): Promise<void>` en `app/portal-cliente/mi-perfil/actions.ts` (reemplaza a `actualizarNombreCliente`, ya no existe con ese nombre). `actualizarDatosCliente(clienteId: string, formData: FormData): Promise<void>` en `app/admin/clientes/actions.ts` (nueva). Ninguna tarea posterior de este plan las consume.

- [ ] **Step 1: Portal del cliente — ampliar la Server Action**

En `app/portal-cliente/mi-perfil/actions.ts`, reemplazar `actualizarNombreCliente` completo por:

```typescript
export async function actualizarMisDatosCliente(formData: FormData) {
  const { supabase, userId } = await requireClienteLogueado()

  const fullName = (formData.get('fullName') as string)?.trim()
  const dni = ((formData.get('dni') as string) || '').trim() || null
  const domicilio = ((formData.get('domicilio') as string) || '').trim() || null
  const telefono = ((formData.get('telefono') as string) || '').trim() || null

  if (!fullName) {
    redirect(`/portal-cliente/mi-perfil?error=${encodeURIComponent('El nombre no puede estar vacío')}`)
  }

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName, dni, domicilio, telefono })
    .eq('id', userId)

  if (error) {
    const mensaje = error.code === '23505' ? 'Ese DNI ya pertenece a otro cliente' : error.message
    redirect(`/portal-cliente/mi-perfil?error=${encodeURIComponent(mensaje)}`)
  }

  redirect('/portal-cliente/mi-perfil?ok=1')
}
```

`requireClienteLogueado()` no se toca, sigue igual.

- [ ] **Step 2: Portal del cliente — ampliar el formulario**

En `app/portal-cliente/mi-perfil/page.tsx`, cambiar el import:

```typescript
import { actualizarMisDatosCliente } from './actions'
```

Ampliar la consulta del perfil:

```typescript
  const { data: perfil } = await supabase
    .from('profiles')
    .select('full_name, role, dni, domicilio, telefono')
    .eq('id', user!.id)
    .single()
```

Reemplazar el bloque `<h2>Nombre completo</h2>` + su `<form>` completo (todo el bloque que hoy solo tiene el input de `fullName`) por:

```tsx
      <h2 className="mb-2 text-lg font-semibold">Mis datos</h2>
      <form action={actualizarMisDatosCliente} className="mb-8 flex flex-col gap-3">
        <label className="text-sm">
          Nombre completo
          <input
            name="fullName"
            defaultValue={perfil!.full_name}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          DNI
          <input
            name="dni"
            defaultValue={perfil!.dni ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Domicilio
          <input
            name="domicilio"
            defaultValue={perfil!.domicilio ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Teléfono
          <input
            name="telefono"
            defaultValue={perfil!.telefono ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Guardar datos
        </button>
      </form>
```

- [ ] **Step 3: Admin — nueva Server Action**

Agregar al final de `app/admin/clientes/actions.ts`, y agregar el import de `createClient` junto al de `createAdminClient` que ya existe:

```typescript
import { createClient } from '@/lib/supabase/server'
```

```typescript
export async function actualizarDatosCliente(clienteId: string, formData: FormData) {
  await requireAdministrador()

  const fullName = (formData.get('fullName') as string)?.trim()
  const dni = ((formData.get('dni') as string) || '').trim() || null
  const domicilio = ((formData.get('domicilio') as string) || '').trim() || null
  const telefono = ((formData.get('telefono') as string) || '').trim() || null

  if (!fullName) {
    redirect(`/admin/clientes/${clienteId}?error=${encodeURIComponent('El nombre no puede estar vacío')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName, dni, domicilio, telefono })
    .eq('id', clienteId)

  if (error) {
    const mensaje = error.code === '23505' ? 'Ese DNI ya pertenece a otro cliente' : error.message
    redirect(`/admin/clientes/${clienteId}?error=${encodeURIComponent(mensaje)}`)
  }

  redirect(`/admin/clientes/${clienteId}?ok=${encodeURIComponent('Datos actualizados')}`)
}
```

- [ ] **Step 4: Admin — mostrar los datos y agregar el formulario de edición**

En `app/admin/clientes/[id]/page.tsx`, cambiar el import:

```typescript
import { resetearContrasenaCliente, eliminarCliente, actualizarDatosCliente } from '../actions'
```

Ampliar la consulta del cliente:

```typescript
  const { data: cliente } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, dni, domicilio, telefono')
    .eq('id', id)
    .maybeSingle()
```

Reemplazar las dos líneas del encabezado (`<h1>` + el `<p>` del email) por:

```tsx
      <div className="mb-6">
        <h1 className="mb-1 text-xl font-semibold">{cliente!.full_name}</h1>
        <p className="text-sm text-gray-600">{cliente!.email}</p>
        {cliente!.dni && <p className="text-sm text-gray-600">DNI: {cliente!.dni}</p>}
        {cliente!.domicilio && <p className="text-sm text-gray-600">Domicilio: {cliente!.domicilio}</p>}
        {cliente!.telefono && <p className="text-sm text-gray-600">Teléfono: {cliente!.telefono}</p>}
      </div>
```

Agregar la sección de edición justo después de la tabla de "Lotes" (antes del `<h2>Resetear contraseña</h2>`):

```tsx
      <h2 className="mb-2 text-lg font-semibold">Editar datos</h2>
      <form
        action={actualizarDatosCliente.bind(null, cliente!.id)}
        className="mb-8 flex max-w-sm flex-col gap-3"
      >
        <label className="text-sm">
          Nombre completo
          <input
            name="fullName"
            defaultValue={cliente!.full_name}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          DNI
          <input
            name="dni"
            defaultValue={cliente!.dni ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Domicilio
          <input
            name="domicilio"
            defaultValue={cliente!.domicilio ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Teléfono
          <input
            name="telefono"
            defaultValue={cliente!.telefono ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
          Guardar datos
        </button>
      </form>
```

- [ ] **Step 5: Escribir los tests e2e**

```typescript
// tests/e2e/editar-datos-cliente.spec.ts
import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures, TEST_USERS } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Editar datos del cliente', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('admin edita nombre, DNI, domicilio y teléfono de un cliente', async ({ page }) => {
    const admin = createAdminClient()
    const dni = `${Date.now()}`.slice(-8)

    try {
      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto(`/admin/clientes/${fixtures.cliente.id}`)

      await page.getByLabel('Nombre completo').fill('E2E Cliente Editado')
      await page.getByLabel('DNI').fill(dni)
      await page.getByLabel('Domicilio').fill('Domicilio Editado 111')
      await page.getByLabel('Teléfono').fill('3515555555')
      await page.getByRole('button', { name: 'Guardar datos' }).click()

      await expect(page.getByText('Datos actualizados')).toBeVisible()
      await expect(page.getByText(`DNI: ${dni}`)).toBeVisible()

      const { data: cliente } = await admin
        .from('profiles')
        .select('full_name, dni, domicilio, telefono')
        .eq('id', fixtures.cliente.id)
        .single()
      expect(cliente?.full_name).toBe('E2E Cliente Editado')
      expect(cliente?.dni).toBe(dni)
      expect(cliente?.domicilio).toBe('Domicilio Editado 111')
      expect(cliente?.telefono).toBe('3515555555')
    } finally {
      await admin
        .from('profiles')
        .update({ full_name: TEST_USERS.cliente.fullName, dni: null, domicilio: null, telefono: null })
        .eq('id', fixtures.cliente.id)
    }
  })

  test('admin: guardar un DNI que ya pertenece a otro cliente es rechazado', async ({ page }) => {
    const admin = createAdminClient()
    const dniOcupado = `${Date.now()}`.slice(-8)
    const emailOtro = `otro.cliente.dni.${Date.now()}@sima-e2e.invalid`

    const { data: invited } = await admin.auth.admin.inviteUserByEmail(emailOtro)
    await admin.from('profiles').insert({
      id: invited!.user.id,
      role: 'cliente',
      full_name: 'Otro Cliente Con DNI',
      email: emailOtro,
      dni: dniOcupado,
    })

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/clientes/${fixtures.cliente.id}`)
    await page.getByLabel('DNI').fill(dniOcupado)
    await page.getByRole('button', { name: 'Guardar datos' }).click()

    await expect(page.getByText('Ese DNI ya pertenece a otro cliente')).toBeVisible()
  })

  test('el cliente edita sus propios datos desde Mi perfil', async ({ page }) => {
    const admin = createAdminClient()
    const dni = `${Date.now()}`.slice(-8)

    try {
      await login(page, fixtures.cliente.email, fixtures.password)
      await page.goto('/portal-cliente/mi-perfil')

      await page.getByLabel('Nombre completo').fill('E2E Cliente Autoeditado')
      await page.getByLabel('DNI').fill(dni)
      await page.getByLabel('Domicilio').fill('Mi Domicilio 222')
      await page.getByLabel('Teléfono').fill('3516666666')
      await page.getByRole('button', { name: 'Guardar datos' }).click()

      await expect(page.getByText('Guardado.')).toBeVisible()

      const { data: cliente } = await admin
        .from('profiles')
        .select('full_name, dni, domicilio, telefono')
        .eq('id', fixtures.cliente.id)
        .single()
      expect(cliente?.full_name).toBe('E2E Cliente Autoeditado')
      expect(cliente?.dni).toBe(dni)
    } finally {
      await admin
        .from('profiles')
        .update({ full_name: TEST_USERS.cliente.fullName, dni: null, domicilio: null, telefono: null })
        .eq('id', fixtures.cliente.id)
    }
  })

  test('el cliente: guardar un DNI que ya pertenece a otro cliente es rechazado', async ({ page }) => {
    const admin = createAdminClient()
    const dniOcupado = `${Date.now()}`.slice(-8)
    const emailOtro = `otro.cliente.autoedit.${Date.now()}@sima-e2e.invalid`

    const { data: invited } = await admin.auth.admin.inviteUserByEmail(emailOtro)
    await admin.from('profiles').insert({
      id: invited!.user.id,
      role: 'cliente',
      full_name: 'Otro Cliente Autoedit',
      email: emailOtro,
      dni: dniOcupado,
    })

    await login(page, fixtures.cliente.email, fixtures.password)
    await page.goto('/portal-cliente/mi-perfil')
    await page.getByLabel('DNI').fill(dniOcupado)
    await page.getByRole('button', { name: 'Guardar datos' }).click()

    await expect(page.getByText('Ese DNI ya pertenece a otro cliente')).toBeVisible()
  })
})
```

Nota: `TEST_USERS` ya se exporta desde `tests/e2e/fixtures/test-data.ts` (`export const TEST_USERS = {...}`) — se usa acá solo para leer `TEST_USERS.cliente.fullName` al restaurar el fixture, no para crear usuarios nuevos.

- [ ] **Step 6: Correr los tests**

Run: `npx playwright test tests/e2e/editar-datos-cliente.spec.ts --project=chromium`
Expected: 4 passed

- [ ] **Step 7: Commit**

```bash
git add app/portal-cliente/mi-perfil/actions.ts app/portal-cliente/mi-perfil/page.tsx app/admin/clientes/actions.ts app/admin/clientes/\[id\]/page.tsx tests/e2e/editar-datos-cliente.spec.ts
git commit -m "Editar DNI/domicilio/telefono del cliente desde Admin y desde su portal"
```

---

### Task 4: Buscar cliente por DNI al reservar

**Files:**
- Modify: `app/admin/lotes/[id]/reservar/page.tsx`
- Modify: `tests/e2e/fotos-reserva.spec.ts:40`, `tests/e2e/pase-a-vendido.spec.ts:38`, `tests/e2e/reserva-lote.spec.ts:34`
- Test: `tests/e2e/buscar-cliente-dni.spec.ts` (nuevo)

**Interfaces:**
- Consumes: columnas de Task 1. No depende funcionalmente de Tasks 2/3 — construye sus propios datos de cliente de prueba directamente por API en el test, no a través del flujo de vender.
- Produces: nada que otra tarea de este plan consuma — última pieza funcional.

- [ ] **Step 1: Buscar cliente por DNI y precargar el formulario**

En `app/admin/lotes/[id]/reservar/page.tsx`, ampliar el tipo de `searchParams`:

```typescript
  searchParams: Promise<{ error?: string; dni?: string }>
```

Y su destructuración:

```typescript
  const { error, dni: dniBuscado } = await searchParams
```

Después de la consulta de `lote` (y su chequeo de `notFound()`), antes de la consulta de `staff`, agregar la búsqueda:

```typescript
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
```

Dentro del bloque `{lote!.estado === 'disponible' ? (...)}`, justo antes del `<form action={reservarLoteConId} ...>` existente, agregar el buscador y sus avisos:

```tsx
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
```

- [ ] **Step 2: Precargar los campos del formulario grande**

En el mismo archivo, dentro del `<form action={reservarLoteConId} ...>` ya existente, agregar `defaultValue` a los cuatro inputs correspondientes (nombre, DNI, domicilio, email, teléfono) — reemplazar cada uno:

```tsx
          <input
            name="nombreCompleto"
            placeholder="Nombre completo"
            defaultValue={clienteEncontrado?.full_name ?? ''}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="dni"
            placeholder="DNI"
            defaultValue={clienteEncontrado?.dni ?? dniBuscado ?? ''}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="domicilio"
            placeholder="Domicilio"
            defaultValue={clienteEncontrado?.domicilio ?? ''}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="email"
            type="email"
            placeholder="Email"
            defaultValue={clienteEncontrado?.email ?? ''}
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="telefono"
            placeholder="Teléfono"
            defaultValue={clienteEncontrado?.telefono ?? ''}
            required
            className="rounded border px-3 py-2"
          />
```

El resto del formulario (`telefonoAlternativo`, `estadoCivil`, `instrumentacion`, `montoSena`, `monedaSena`, `recibidoPor`, `recibidoPorOtro`, los inputs de archivo) no cambia — no hay de dónde precargarlos (no son datos del cliente, son de esta reserva puntual).

- [ ] **Step 3: Arreglar 3 tests preexistentes que este cambio rompe**

El campo nuevo del buscador tiene el placeholder "Buscar cliente por DNI", que contiene la palabra "DNI" — por default, `getByPlaceholder('DNI')` (sin `exact: true`) hace un match por substring, así que a partir de este cambio matchea DOS elementos en la misma página (el campo del buscador y el campo `DNI` del formulario grande), rompiendo con "strict mode violation" a cualquier test que ya use `getByPlaceholder('DNI')` sin `exact: true` en esta pantalla. Hay exactamente 3 (verificado con `grep -rn "getByPlaceholder('DNI'" tests/e2e/*.ts` antes de escribir este plan) — ninguno de los tres pertenece a este plan, pero el cambio de este task es lo que los rompe, así que se arreglan acá mismo, no se dejan para que alguien los descubra rotos después.

En cada uno de estos tres archivos, cambiar la línea indicada de `page.getByPlaceholder('DNI').fill('30111222')` a `page.getByPlaceholder('DNI', { exact: true }).fill('30111222')`:

- `tests/e2e/fotos-reserva.spec.ts:40`
- `tests/e2e/pase-a-vendido.spec.ts:38`
- `tests/e2e/reserva-lote.spec.ts:34`

- [ ] **Step 4: Escribir los tests e2e**

```typescript
// tests/e2e/buscar-cliente-dni.spec.ts
import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

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

test.describe('Buscar cliente por DNI al reservar', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('buscar un DNI que coincide con un cliente existente precarga sus datos', async ({ page }) => {
    const admin = createAdminClient()
    const dni = `${Date.now()}`.slice(-8)
    const email = `cliente.buscar.dni.${Date.now()}@sima-e2e.invalid`

    const { data: invited } = await admin.auth.admin.inviteUserByEmail(email)
    await admin.from('profiles').insert({
      id: invited!.user.id,
      role: 'cliente',
      full_name: 'Juan Encontrado',
      email,
      dni,
      domicilio: 'Domicilio Encontrado 333',
      telefono: '3517777777',
    })

    const loteId = await crearLoteDisponible(`E2E Buscar DNI Match ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await page.getByPlaceholder('Buscar cliente por DNI').fill(dni)
    await page.getByRole('button', { name: 'Buscar' }).click()

    await expect(page.getByText(/Encontramos a Juan Encontrado con este DNI/)).toBeVisible()
    await expect(page.getByPlaceholder('Nombre completo')).toHaveValue('Juan Encontrado')
    await expect(page.getByPlaceholder('DNI', { exact: true })).toHaveValue(dni)
    await expect(page.getByPlaceholder('Domicilio')).toHaveValue('Domicilio Encontrado 333')
    await expect(page.getByPlaceholder('Email')).toHaveValue(email)
    await expect(page.getByPlaceholder('Teléfono', { exact: true })).toHaveValue('3517777777')
  })

  test('buscar un DNI que no coincide con nadie muestra el aviso y deja el formulario vacío', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponible(`E2E Buscar DNI Sin Match ${Date.now()}`)
    const dniInexistente = `${Date.now()}`.slice(-8)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)
    await page.getByPlaceholder('Buscar cliente por DNI').fill(dniInexistente)
    await page.getByRole('button', { name: 'Buscar' }).click()

    await expect(page.getByText('No encontramos ningún cliente con ese DNI')).toBeVisible()
    await expect(page.getByPlaceholder('Nombre completo')).toHaveValue('')
  })

  test('sin usar el buscador, el formulario de reservar se comporta igual que siempre', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponible(`E2E Sin Buscador ${Date.now()}`)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/reservar`)

    await expect(page.getByPlaceholder('Nombre completo')).toHaveValue('')
    await expect(page.getByText(/Encontramos a/)).toHaveCount(0)
    await expect(page.getByText('No encontramos ningún cliente')).toHaveCount(0)
  })
})
```

- [ ] **Step 5: Correr los tests**

Run: `npx playwright test tests/e2e/buscar-cliente-dni.spec.ts tests/e2e/fotos-reserva.spec.ts tests/e2e/pase-a-vendido.spec.ts tests/e2e/reserva-lote.spec.ts --project=chromium`
Expected: todos en verde (3 nuevos del buscador + los tests preexistentes de los 3 archivos arreglados en el Step 3, confirmando que el fix realmente los destrabó).

- [ ] **Step 6: Commit**

```bash
git add app/admin/lotes/\[id\]/reservar/page.tsx tests/e2e/buscar-cliente-dni.spec.ts tests/e2e/fotos-reserva.spec.ts tests/e2e/pase-a-vendido.spec.ts tests/e2e/reserva-lote.spec.ts
git commit -m "Buscar cliente existente por DNI al reservar, con precarga editable"
```

---

### Task 5: Regresión completa, limpieza y documentación

**Files:**
- Modify: `Pruebas_Manuales_Pendientes.txt` (fuera del repo git)
- Modify: `Notas_Decisiones_SIMA.txt` (fuera del repo git)
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: todo lo de Tasks 1-4.
- Produces: nada — última tarea del plan.

- [ ] **Step 1: Build limpio**

Run: `npm run build` (con `NODE_OPTIONS="--max-old-space-size=4096"` si falla por memoria, reintentar).
Expected: sin errores.

- [ ] **Step 2: Unitarios**

Run: `npx vitest run`
Expected: todos en verde (sin cambios de este plan, correr igual para descartar regresión).

- [ ] **Step 3: E2E completo, dos corridas**

Run: `npx playwright test`
Expected: todos en verde. Repetir una segunda vez completa para descartar flakes. Si aparece un fallo aislado claramente no relacionado (rate limit de Supabase, datos de prueba acumulados de corridas anteriores), investigar la causa real antes de asumir una regresión — no alcanza con volver a correr y esperar que pase.

- [ ] **Step 4: Limpieza de datos de prueba**

Antes de cualquier `execute_sql`, verificar con `mcp__supabase__get_project_url` que apunta al proyecto de SIMA. Limpieza estándar de lotes/cuotas/pagos/reservas/pago_imputaciones con `identificador ilike 'E2E %'`, y de profiles/auth.users con `email ilike '%sima-e2e.invalid'` que no sean ninguno de los 9 fixtures fijos ni estén referenciados por ningún lote/reserva/movimiento real. Confirmar que los 5 lotes reales de Gabriel (`Prueba 1`, `Prueba 2`, `Prueba 3`, `Lote1`, `Lote2`) y sus clientes reales no se tocan.

- [ ] **Step 5: Actualizar `Pruebas_Manuales_Pendientes.txt`**

Agregar una sección nueva (siguiente número disponible) explicando cómo probar a mano: entrar a "Clientes" en Admin y ver que ahora se muestra DNI/domicilio/teléfono si están cargados; editar esos datos desde ahí y desde `/portal-cliente/mi-perfil` como el cliente; ir a reservar un lote nuevo, buscar por el DNI de un cliente ya existente y verificar que se precargan sus datos; vender ese lote y verificar que, si el DNI de la reserva no coincidía con el ya guardado, aparece el aviso en la pantalla de confirmación.

- [ ] **Step 6: Actualizar `Notas_Decisiones_SIMA.txt`**

Marcar el punto 41a ("buscar cliente por DNI al reservar") como YA CONSTRUIDO, y el punto 37 ("editar cliente desde admin") también, con fecha de hoy y referencia a este plan. Actualizar la lista consolidada de preguntas pendientes si alguno de esos puntos aparecía ahí. Aclarar que teléfono alternativo quedó fuera a propósito.

- [ ] **Step 7: Cerrar el ledger**

Agregar una línea a `.superpowers/sdd/progress.md` resumiendo las 5 tareas y el resultado de la regresión/limpieza.

---

## Self-Review

**Cobertura de la spec:** columnas + índice único parcial + backfill de una sola vez (Task 1) ✓, población automática al vender sin pisar datos ya cargados (Task 2) ✓, aviso de DNI que no coincide en la pantalla de confirmación existente (Task 2) ✓, choque de DNI con otro cliente sin bloquear la venta, tanto para cliente nuevo como para cliente existente (Task 2) ✓, edición de los 4 campos en portal del cliente y en Admin, con rechazo prolijo de DNI duplicado (Task 3) ✓, mostrar DNI/domicilio/teléfono en la ficha de cliente de Admin (Task 3) ✓, buscador por DNI sin JavaScript en la reserva, con precarga editable y mensaje de nombre encontrado / sin match (Task 4) ✓, fuera de alcance explícitamente no tocado (teléfono alternativo, cambios al formulario de vender, validación de formato de DNI, búsqueda entre gente que solo reservó sin comprar) ✓.

**Riesgo de regresión detectado y resuelto en el propio plan:** el placeholder nuevo "Buscar cliente por DNI" (Task 4) contiene la palabra "DNI", lo que rompe por ambigüedad a 3 tests e2e preexistentes que ya usaban `getByPlaceholder('DNI')` sin `exact: true` en la misma página (`fotos-reserva.spec.ts`, `pase-a-vendido.spec.ts`, `reserva-lote.spec.ts` — verificado con grep antes de escribir el plan, ninguno pertenece a este plan). El Step 3 de Task 4 los arregla explícitamente como parte de la misma tarea que los rompe, en vez de dejarlos para que aparezcan como fallos "misteriosos" recién en la regresión de Task 5.

**Placeholders:** ninguno — cada step tiene código completo, o comando + resultado esperado.

**Consistencia de tipos:** `actualizarMisDatosCliente(formData: FormData): Promise<void>` (Task 3, portal) y `actualizarDatosCliente(clienteId: string, formData: FormData): Promise<void>` (Task 3, admin) tienen nombres deliberadamente distintos para no confundirlos pese a hacer algo similar — usados consistentes entre el archivo de actions y el de page en cada caso. Columnas (`profiles.dni/domicilio/telefono`) usadas idénticas en Task 1 (migración), Task 2 (`vender/actions.ts`), Task 3 (ambas actions y ambas pages) y Task 4 (`reservar/page.tsx`). El mensaje de error "Ese DNI ya pertenece a otro cliente" para el código `23505` aparece igual en las dos Server Actions de Task 3. La variable `reserva` en `vender/actions.ts` (Task 2) se mueve y amplía una sola vez, eliminando la consulta duplicada que existía más abajo — verificado que la sección de descuento de seña sigue usando exactamente los mismos tres campos que ya tenía (`monto_sena`, `moneda_sena`, `comprobante_sena_path`), ahora presentes en el `select` ampliado.
