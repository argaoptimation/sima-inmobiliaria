# Distribución manual por cuota — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para seguimiento.

**Goal:** Permitir cargar, cuota por cuota, cuánto le corresponde en $ a
cada participante (admin/acreedor/vendedor/cobrador o cuenta externa) de
un lote vendido, con un objetivo opcional por participante y un resumen
del lote que se actualiza en vivo mientras se tipea, cruzando todas las
cuotas.

**Architecture:** Dos tablas nuevas (`lote_distribucion_objetivos`,
`cuota_distribuciones`), una página nueva `/admin/lotes/[id]/distribucion`
con un componente de cliente (`DistribucionCuotas.tsx`) que mantiene en un
solo estado local TODAS las cuotas del lote (para poder recalcular el
resumen al instante sin red), y una única Server Action
(`guardarDistribucionLote`) que reemplaza por completo lo guardado de este
lote en cada envío.

**Tech Stack:** Next.js 16 (Server Actions + un Client Component acotado),
TypeScript, React `useState`, Supabase (Postgres), Playwright (e2e).

## Global Constraints

- Los beneficiarios NO requieren estar pre-registrados en
  `lote_participantes` — cualquier profile con rol `administrador`,
  `acreedor`, `vendedor` o `cobrador`, o cualquier `cuenta_externa` del
  sistema, puede recibir parte de una cuota.
- Ningún monto cargado bloquea el guardado — ni contra el total de la
  cuota, ni contra ningún objetivo. Todo es informativo.
- El resumen es POR LOTE, nunca consolidado entre varios lotes de un
  mismo participante.
- El guardado es un solo botón "Guardar distribución" para todo el lote —
  reemplazo completo (no diff) de lo que había guardado antes.
- El resumen se recalcula en el cliente, sin red, en cada cambio —
  cruzando todas las cuotas ya editadas en la sesión, no solo lo
  persistido.
- Exclusiva de administrador (`requireAdministrador`), accesible solo
  cuando `lote.estado === 'vendido'`.
- Ningún monto lleva columna de moneda propia — siempre es la moneda del
  lote (`lotes.moneda`), sin conversión.
- No se registra ningún movimiento de dinero real (eso queda fuera de
  alcance) ni se toca `lote_participantes`, comisión de vendedor o seña
  autodeclarada.

---

### Task 1: Migración — tablas `lote_distribucion_objetivos` y `cuota_distribuciones`

**Files:**
- Create: `supabase/migrations/0021_lote_distribucion_manual.sql`

**Interfaces:**
- Consumes: nada.
- Produces: tablas `public.lote_distribucion_objetivos` (columnas: `id`,
  `lote_id`, `profile_id`, `cuenta_externa_id`, `monto_objetivo`,
  `created_at`) y `public.cuota_distribuciones` (columnas: `id`,
  `cuota_id`, `profile_id`, `cuenta_externa_id`, `monto`, `created_at`).
  Todas las tareas siguientes dependen de que existan con estos nombres
  exactos.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/0021_lote_distribucion_manual.sql
create table public.lote_distribucion_objetivos (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes(id) on delete cascade,
  profile_id uuid references public.profiles(id),
  cuenta_externa_id uuid references public.cuentas_externas(id),
  monto_objetivo numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint lote_distribucion_objetivos_uno_u_otro check (
    (profile_id is not null and cuenta_externa_id is null)
    or (profile_id is null and cuenta_externa_id is not null)
  ),
  unique (lote_id, profile_id),
  unique (lote_id, cuenta_externa_id)
);

create table public.cuota_distribuciones (
  id uuid primary key default gen_random_uuid(),
  cuota_id uuid not null references public.cuotas(id) on delete cascade,
  profile_id uuid references public.profiles(id),
  cuenta_externa_id uuid references public.cuentas_externas(id),
  monto numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint cuota_distribuciones_uno_u_otro check (
    (profile_id is not null and cuenta_externa_id is null)
    or (profile_id is null and cuenta_externa_id is not null)
  ),
  unique (cuota_id, profile_id),
  unique (cuota_id, cuenta_externa_id)
);
```

- [ ] **Step 2: Aplicar directamente contra la base (el controller, no un subagente)**

Antes de aplicar, verificar con `mcp__supabase__get_project_url` que
coincide con `NEXT_PUBLIC_SUPABASE_URL` de `.env.local`. Aplicar con
`mcp__supabase__apply_migration`. Verificar después con una consulta a
`information_schema.columns` que ambas tablas y sus columnas existen.

- [ ] **Step 3: Commit del archivo de migración**

```bash
git add supabase/migrations/0021_lote_distribucion_manual.sql
git commit -m "Migracion: tablas lote_distribucion_objetivos y cuota_distribuciones"
```

---

### Task 2: Página, componente de cliente, Server Action y tests

**Files:**
- Create: `app/admin/lotes/[id]/distribucion/page.tsx`
- Create: `app/admin/lotes/[id]/distribucion/DistribucionCuotas.tsx`
- Create: `app/admin/lotes/[id]/distribucion/actions.ts`
- Modify: `app/admin/lotes/[id]/page.tsx` (link nuevo + actualizar texto de
  "Participantes adicionales")
- Test: `tests/e2e/distribucion-manual-cuotas.spec.ts`

**Interfaces:**
- Consumes: tablas `lote_distribucion_objetivos` y `cuota_distribuciones`
  (Task 1); `requireAdministrador` de `@/lib/auth/require-admin`;
  `createClient` de `@/lib/supabase/server`.
- Produces: Server Action `guardarDistribucionLote(loteId: string,
  formData: FormData)`; componente `DistribucionCuotas` con props `{
  moneda: string; cuotas: { numero: number; montoBase: number }[];
  participantesElegibles: { key: string; nombre: string }[];
  objetivosIniciales: { participanteKey: string; monto: string }[];
  distribucionesIniciales: Record<number, { participanteKey: string;
  monto: string }[]> }`.

Una sola tarea porque la página, el componente y la Server Action solo
tienen sentido juntos: el formulario que arma el componente (nombres de
campo `objetivoParticipante`/`objetivoMonto` repetidos y
`cuota{N}Participante`/`cuota{N}Monto` repetidos por cuota) es el
contrato exacto que lee la Server Action — no hay una versión intermedia
útil sin JS, porque el resumen en vivo cruzando cuotas (el requisito
principal de Gabriel) no existe sin el estado compartido del componente.

- [ ] **Step 1: Escribir los tests e2e que fallan**

Crear `tests/e2e/distribucion-manual-cuotas.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Distribución manual por cuota', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test.afterEach(async () => {
    const admin = createAdminClient()
    await admin.from('cuota_distribuciones').delete().in('cuota_id', fixtures.cuotaIds)
    await admin.from('lote_distribucion_objetivos').delete().eq('lote_id', fixtures.loteId)
  })

  test('cargar distribución en una cuota (suma distinta al monto de la cuota) persiste al recargar', async ({
    page,
  }) => {
    const admin = createAdminClient()

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

    await page.getByRole('button', { name: '+ Agregar participante a esta cuota' }).nth(0).click()
    await page.locator('select[name="cuota1Participante"]').nth(0).selectOption({ label: 'E2E Vendedor A (vendedor)' })
    await page.locator('input[name="cuota1Monto"]').nth(0).fill('400')

    await page.getByRole('button', { name: '+ Agregar participante a esta cuota' }).nth(0).click()
    await page.locator('select[name="cuota1Participante"]').nth(1).selectOption({ label: 'E2E Acreedor Con Datos (acreedor)' })
    await page.locator('input[name="cuota1Monto"]').nth(1).fill('300')

    // Cuota 1 es de 1000 -- 400 + 300 = 700, suma distinta al monto de la
    // cuota, y el guardado tiene que funcionar igual sin ningún error.
    await page.getByRole('button', { name: 'Guardar distribución' }).click()
    await page.waitForURL(/ok=1/)

    await expect(page.getByText('Distribución guardada.')).toBeVisible()

    const { data: distribuciones } = await admin
      .from('cuota_distribuciones')
      .select('profile_id, monto')
      .eq('cuota_id', fixtures.cuotaIds[0])
      .order('monto', { ascending: false })

    expect(distribuciones).toEqual([
      { profile_id: fixtures.vendedorLoteA.id, monto: 400 },
      { profile_id: fixtures.acreedorConDatos.id, monto: 300 },
    ])

    // Ninguno de los dos tiene objetivo cargado -- el resumen tiene que
    // mostrar solo el acumulado, sin comparar contra nada ("—").
    const filaResumen = page.locator('tr', { hasText: 'E2E Vendedor A (vendedor)' })
    await expect(filaResumen.getByText('—')).toBeVisible()

    await page.reload()
    await expect(page.locator('select[name="cuota1Participante"]').nth(0)).toHaveValue(
      `profile:${fixtures.vendedorLoteA.id}`
    )
    await expect(page.locator('input[name="cuota1Monto"]').nth(0)).toHaveValue('400')
  })

  test('objetivo opcional: el resumen pasa a "Saldado" en vivo al cargar la segunda cuota, sin guardar', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

    await page.getByRole('button', { name: '+ Agregar objetivo' }).click()
    await page.locator('select[name="objetivoParticipante"]').nth(0).selectOption({ label: 'E2E Vendedor A (vendedor)' })
    await page.locator('input[name="objetivoMonto"]').nth(0).fill('1000')

    await page.getByRole('button', { name: '+ Agregar participante a esta cuota' }).nth(0).click()
    await page.locator('select[name="cuota1Participante"]').nth(0).selectOption({ label: 'E2E Vendedor A (vendedor)' })
    await page.locator('input[name="cuota1Monto"]').nth(0).fill('500')

    await expect(page.getByText('500 de 1000, faltan 500')).toBeVisible()

    await page.getByRole('button', { name: '+ Agregar participante a esta cuota' }).nth(1).click()
    await page.locator('select[name="cuota2Participante"]').nth(0).selectOption({ label: 'E2E Vendedor A (vendedor)' })
    await page.locator('input[name="cuota2Monto"]').nth(0).fill('500')

    // Todo esto pasó sin ningún guardado ni recarga -- el resumen cruzó
    // las dos cuotas al instante, del lado del cliente.
    await expect(page.getByText('Saldado')).toBeVisible()
  })

  test('modificar la distribución de una cuota puntual no toca las demás cuotas', async ({ page }) => {
    const admin = createAdminClient()

    await admin.from('cuota_distribuciones').insert([
      { cuota_id: fixtures.cuotaIds[0], profile_id: fixtures.vendedorLoteA.id, monto: 500 },
      { cuota_id: fixtures.cuotaIds[1], profile_id: fixtures.acreedorConDatos.id, monto: 700 },
    ])

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

    await expect(page.locator('input[name="cuota1Monto"]').nth(0)).toHaveValue('500')
    await expect(page.locator('input[name="cuota2Monto"]').nth(0)).toHaveValue('700')

    await page.locator('input[name="cuota1Monto"]').nth(0).fill('600')
    await page.getByRole('button', { name: 'Guardar distribución' }).click()
    await page.waitForURL(/ok=1/)

    const { data: distribucionCuota1 } = await admin
      .from('cuota_distribuciones')
      .select('monto')
      .eq('cuota_id', fixtures.cuotaIds[0])
      .single()
    expect(distribucionCuota1?.monto).toBe(600)

    const { data: distribucionCuota2 } = await admin
      .from('cuota_distribuciones')
      .select('monto')
      .eq('cuota_id', fixtures.cuotaIds[1])
      .single()
    expect(distribucionCuota2?.monto).toBe(700)
  })

  test('una cuenta externa y un profile pueden ser beneficiarios de la misma cuota, sin conflicto', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const nombreCuentaExterna = `E2E Distribución Externa ${Date.now()}`
    const { data: cuentaExterna } = await admin
      .from('cuentas_externas')
      .insert({
        nombre: nombreCuentaExterna,
        titular: 'Corralón Distribución',
        alias: 'corralon.distribucion',
        banco: 'Banco Test',
      })
      .select('id')
      .single()

    try {
      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto(`/admin/lotes/${fixtures.loteId}/distribucion`)

      // Fila 0 de la cuota 1: la cuenta externa.
      await page.getByRole('button', { name: '+ Agregar participante a esta cuota' }).nth(0).click()
      await page
        .locator('select[name="cuota1Participante"]')
        .nth(0)
        .selectOption({ label: `${nombreCuentaExterna} (cuenta externa)` })
      await page.locator('input[name="cuota1Monto"]').nth(0).fill('250')

      // Fila 1 de la MISMA cuota 1: un profile.
      await page.getByRole('button', { name: '+ Agregar participante a esta cuota' }).nth(0).click()
      await page.locator('select[name="cuota1Participante"]').nth(1).selectOption({ label: 'E2E Vendedor A (vendedor)' })
      await page.locator('input[name="cuota1Monto"]').nth(1).fill('150')

      await page.getByRole('button', { name: 'Guardar distribución' }).click()
      await page.waitForURL(/ok=1/)

      const { data: distribuciones } = await admin
        .from('cuota_distribuciones')
        .select('profile_id, cuenta_externa_id, monto')
        .eq('cuota_id', fixtures.cuotaIds[0])
        .order('monto', { ascending: false })

      expect(distribuciones).toEqual([
        { profile_id: null, cuenta_externa_id: cuentaExterna!.id, monto: 250 },
        { profile_id: fixtures.vendedorLoteA.id, cuenta_externa_id: null, monto: 150 },
      ])
    } finally {
      await admin.from('cuota_distribuciones').delete().eq('cuenta_externa_id', cuentaExterna!.id)
      await admin.from('cuentas_externas').delete().eq('id', cuentaExterna!.id)
    }
  })

  test('un lote que no está vendido muestra un aviso en vez del formulario de distribución', async ({
    page,
  }) => {
    const admin = createAdminClient()
    const { data: loteDisponible } = await admin
      .from('lotes')
      .insert({
        identificador: `E2E Distribución No Vendido ${Date.now()}`,
        moneda: 'USD',
        estado: 'disponible',
      })
      .select('id')
      .single()

    try {
      await login(page, fixtures.admin.email, fixtures.password)
      await page.goto(`/admin/lotes/${loteDisponible!.id}/distribucion`)

      await expect(page.getByText(/no está vendido/)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Guardar distribución' })).toHaveCount(0)
    } finally {
      await admin.from('lotes').delete().eq('id', loteDisponible!.id)
    }
  })
})
```

- [ ] **Step 2: Correr los tests para confirmar que fallan**

Run: `npx playwright test tests/e2e/distribucion-manual-cuotas.spec.ts --project=chromium`
Expected: FAIL — la ruta `/admin/lotes/[id]/distribucion` todavía no
existe (404).

- [ ] **Step 3: Crear `app/admin/lotes/[id]/distribucion/actions.ts`**

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'

interface FilaValida {
  profile_id: string | null
  cuenta_externa_id: string | null
  monto: number
}

function leerFilas(formData: FormData, nombreParticipante: string, nombreMonto: string) {
  const participantes = formData.getAll(nombreParticipante) as string[]
  const montos = formData.getAll(nombreMonto) as string[]
  return participantes.map((participanteKey, indice) => ({
    participanteKey,
    monto: montos[indice] ?? '',
  }))
}

function parseParticipanteKey(key: string): { profile_id: string | null; cuenta_externa_id: string | null } | null {
  if (key.startsWith('profile:')) {
    return { profile_id: key.slice('profile:'.length), cuenta_externa_id: null }
  }
  if (key.startsWith('externa:')) {
    return { profile_id: null, cuenta_externa_id: key.slice('externa:'.length) }
  }
  return null
}

// Filas sin participante elegido o con un monto invalido se descartan sin
// error -- son filas "en blanco" que el admin agrego y no llego a
// completar, no un error del usuario que haya que reportar.
function filasValidas(filas: { participanteKey: string; monto: string }[]): FilaValida[] {
  const resultado: FilaValida[] = []
  for (const fila of filas) {
    const participante = parseParticipanteKey(fila.participanteKey)
    const monto = Number(fila.monto)
    if (!participante || !Number.isFinite(monto) || monto < 0) continue
    resultado.push({ ...participante, monto })
  }
  return resultado
}

// Si el mismo participante aparece en mas de una fila dentro de la misma
// cuota (u objetivos), se suman en vez de mandar dos inserts con la misma
// clave unica -- evita un 23505 por algo que para el admin es un detalle
// menor de UI (agrego dos filas para la misma persona sin querer).
function combinarPorParticipante(filas: FilaValida[]): FilaValida[] {
  const mapa = new Map<string, FilaValida>()
  for (const fila of filas) {
    const clave = fila.profile_id ?? `externa:${fila.cuenta_externa_id}`
    const existente = mapa.get(clave)
    if (existente) {
      existente.monto = Math.round((existente.monto + fila.monto) * 100) / 100
    } else {
      mapa.set(clave, { ...fila })
    }
  }
  return Array.from(mapa.values())
}

export async function guardarDistribucionLote(loteId: string, formData: FormData) {
  await requireAdministrador()

  const supabase = await createClient()

  const { data: cuotas } = await supabase.from('cuotas').select('id, numero').eq('lote_id', loteId)

  if (!cuotas) {
    redirect(
      `/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent('No se encontraron las cuotas de este lote')}`
    )
  }

  // Reemplazo completo (no diff): se borra todo lo que había guardado
  // antes para este lote y se inserta de nuevo exactamente lo que llegó en
  // este envío -- coherente con el botón único "Guardar distribución" que
  // manda todo el estado del lote junto en cada submit.
  const objetivosValidos = combinarPorParticipante(
    filasValidas(leerFilas(formData, 'objetivoParticipante', 'objetivoMonto'))
  )

  const { error: errorBorrarObjetivos } = await supabase
    .from('lote_distribucion_objetivos')
    .delete()
    .eq('lote_id', loteId)

  if (errorBorrarObjetivos) {
    redirect(`/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent(errorBorrarObjetivos.message)}`)
  }

  if (objetivosValidos.length > 0) {
    const { error: errorInsertarObjetivos } = await supabase.from('lote_distribucion_objetivos').insert(
      objetivosValidos.map((fila) => ({
        lote_id: loteId,
        profile_id: fila.profile_id,
        cuenta_externa_id: fila.cuenta_externa_id,
        monto_objetivo: fila.monto,
      }))
    )

    if (errorInsertarObjetivos) {
      redirect(
        `/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent(errorInsertarObjetivos.message)}`
      )
    }
  }

  const cuotaIds = cuotas.map((cuota) => cuota.id)

  if (cuotaIds.length > 0) {
    const { error: errorBorrarDistribuciones } = await supabase
      .from('cuota_distribuciones')
      .delete()
      .in('cuota_id', cuotaIds)

    if (errorBorrarDistribuciones) {
      redirect(
        `/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent(errorBorrarDistribuciones.message)}`
      )
    }
  }

  const filasParaInsertar: (FilaValida & { cuota_id: string })[] = []

  for (const cuota of cuotas) {
    const filas = combinarPorParticipante(
      filasValidas(leerFilas(formData, `cuota${cuota.numero}Participante`, `cuota${cuota.numero}Monto`))
    )
    for (const fila of filas) {
      filasParaInsertar.push({ ...fila, cuota_id: cuota.id })
    }
  }

  if (filasParaInsertar.length > 0) {
    const { error: errorInsertarDistribuciones } = await supabase
      .from('cuota_distribuciones')
      .insert(filasParaInsertar)

    if (errorInsertarDistribuciones) {
      redirect(
        `/admin/lotes/${loteId}/distribucion?error=${encodeURIComponent(errorInsertarDistribuciones.message)}`
      )
    }
  }

  redirect(`/admin/lotes/${loteId}/distribucion?ok=1`)
}
```

- [ ] **Step 4: Crear `app/admin/lotes/[id]/distribucion/DistribucionCuotas.tsx`**

```tsx
'use client'

import { useState } from 'react'

interface Fila {
  participanteKey: string
  monto: string
}

interface Participante {
  key: string
  nombre: string
}

interface Props {
  moneda: string
  cuotas: { numero: number; montoBase: number }[]
  participantesElegibles: Participante[]
  objetivosIniciales: Fila[]
  distribucionesIniciales: Record<number, Fila[]>
}

function filaVacia(): Fila {
  return { participanteKey: '', monto: '' }
}

function SelectorParticipante({
  name,
  valor,
  onChange,
  opciones,
}: {
  name: string
  valor: string
  onChange: (valor: string) => void
  opciones: Participante[]
}) {
  return (
    <select
      name={name}
      value={valor}
      onChange={(evento) => onChange(evento.target.value)}
      className="rounded border px-2 py-1 text-sm"
    >
      <option value="">— elegir participante —</option>
      {opciones.map((participante) => (
        <option key={participante.key} value={participante.key}>
          {participante.nombre}
        </option>
      ))}
    </select>
  )
}

export function DistribucionCuotas({
  moneda,
  cuotas,
  participantesElegibles,
  objetivosIniciales,
  distribucionesIniciales,
}: Props) {
  const [objetivos, setObjetivos] = useState<Fila[]>(objetivosIniciales)
  const [distribuciones, setDistribuciones] = useState<Record<number, Fila[]>>(distribucionesIniciales)

  function nombrePorClave(clave: string) {
    return participantesElegibles.find((participante) => participante.key === clave)?.nombre ?? clave
  }

  function agregarObjetivo() {
    setObjetivos((anteriores) => [...anteriores, filaVacia()])
  }

  function quitarObjetivo(indice: number) {
    setObjetivos((anteriores) => anteriores.filter((_, i) => i !== indice))
  }

  function modificarObjetivo(indice: number, campo: keyof Fila, valor: string) {
    setObjetivos((anteriores) => anteriores.map((fila, i) => (i === indice ? { ...fila, [campo]: valor } : fila)))
  }

  function agregarFilaCuota(numero: number) {
    setDistribuciones((anteriores) => ({
      ...anteriores,
      [numero]: [...(anteriores[numero] ?? []), filaVacia()],
    }))
  }

  function quitarFilaCuota(numero: number, indice: number) {
    setDistribuciones((anteriores) => ({
      ...anteriores,
      [numero]: (anteriores[numero] ?? []).filter((_, i) => i !== indice),
    }))
  }

  function modificarFilaCuota(numero: number, indice: number, campo: keyof Fila, valor: string) {
    setDistribuciones((anteriores) => ({
      ...anteriores,
      [numero]: (anteriores[numero] ?? []).map((fila, i) => (i === indice ? { ...fila, [campo]: valor } : fila)),
    }))
  }

  // Resumen recalculado en cada render a partir del estado local -- cruza
  // TODAS las cuotas ya editadas en esta sesión (no solo lo persistido),
  // sin ninguna llamada de red. Es lo que le permite a Nicolás ver bajar
  // el saldo pendiente de un participante mientras carga cuota tras cuota.
  const resumen = (() => {
    const acumulados = new Map<string, number>()
    for (const filas of Object.values(distribuciones)) {
      for (const fila of filas) {
        if (!fila.participanteKey) continue
        const monto = Number(fila.monto) || 0
        acumulados.set(fila.participanteKey, (acumulados.get(fila.participanteKey) ?? 0) + monto)
      }
    }

    const objetivosPorClave = new Map<string, number>()
    for (const fila of objetivos) {
      if (!fila.participanteKey) continue
      objetivosPorClave.set(fila.participanteKey, Number(fila.monto) || 0)
    }

    const claves = new Set<string>([...acumulados.keys(), ...objetivosPorClave.keys()])

    return Array.from(claves).map((clave) => {
      const acumulado = Math.round((acumulados.get(clave) ?? 0) * 100) / 100
      const objetivo = objetivosPorClave.has(clave) ? (objetivosPorClave.get(clave) as number) : null
      return { clave, nombre: nombrePorClave(clave), acumulado, objetivo }
    })
  })()

  return (
    <>
      <h2 className="mb-2 mt-6 text-lg font-semibold">Objetivos (opcional)</h2>
      <p className="mb-3 text-sm text-gray-600">
        Cuánto le corresponde en total a cada participante de este lote. Sin objetivo cargado, el
        resumen de abajo solo muestra lo acumulado, sin comparar contra nada.
      </p>
      <div className="mb-6 flex flex-col gap-2">
        {objetivos.map((fila, indice) => (
          <div key={indice} className="flex items-center gap-2">
            <SelectorParticipante
              name="objetivoParticipante"
              valor={fila.participanteKey}
              onChange={(valor) => modificarObjetivo(indice, 'participanteKey', valor)}
              opciones={participantesElegibles}
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Monto objetivo"
              value={fila.monto}
              onChange={(evento) => modificarObjetivo(indice, 'monto', evento.target.value)}
              name="objetivoMonto"
              className="w-40 rounded border px-2 py-1 text-sm"
            />
            <button type="button" onClick={() => quitarObjetivo(indice)} className="text-sm text-red-700 underline">
              Quitar
            </button>
          </div>
        ))}
        <button type="button" onClick={agregarObjetivo} className="self-start text-sm underline">
          + Agregar objetivo
        </button>
      </div>

      <h2 className="mb-2 text-lg font-semibold">Cuotas — distribución</h2>
      <div className="mb-6 flex flex-col gap-4">
        {cuotas.map((cuota) => (
          <div key={cuota.numero} className="rounded border p-3">
            <p className="mb-2 text-sm font-medium">
              Cuota {cuota.numero} — {cuota.montoBase} {moneda}
            </p>
            <div className="flex flex-col gap-2">
              {(distribuciones[cuota.numero] ?? []).map((fila, indice) => (
                <div key={indice} className="flex items-center gap-2">
                  <SelectorParticipante
                    name={`cuota${cuota.numero}Participante`}
                    valor={fila.participanteKey}
                    onChange={(valor) => modificarFilaCuota(cuota.numero, indice, 'participanteKey', valor)}
                    opciones={participantesElegibles}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Monto"
                    value={fila.monto}
                    onChange={(evento) =>
                      modificarFilaCuota(cuota.numero, indice, 'monto', evento.target.value)
                    }
                    name={`cuota${cuota.numero}Monto`}
                    className="w-40 rounded border px-2 py-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => quitarFilaCuota(cuota.numero, indice)}
                    className="text-sm text-red-700 underline"
                  >
                    Quitar
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => agregarFilaCuota(cuota.numero)}
                className="self-start text-sm underline"
              >
                + Agregar participante a esta cuota
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-2 text-lg font-semibold">Resumen del lote</h2>
      {resumen.length === 0 ? (
        <p className="mb-6 text-sm text-gray-600">Sin distribución cargada todavía.</p>
      ) : (
        <table className="mb-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Participante</th>
              <th>Acumulado</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {resumen.map((fila) => (
              <tr key={fila.clave} className="border-b">
                <td className="py-2">{fila.nombre}</td>
                <td>
                  {fila.acumulado} {moneda}
                </td>
                <td>
                  {fila.objetivo === null
                    ? '—'
                    : fila.acumulado >= fila.objetivo
                      ? 'Saldado'
                      : `${fila.acumulado} de ${fila.objetivo}, faltan ${
                          Math.round((fila.objetivo - fila.acumulado) * 100) / 100
                        }`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">
        Guardar distribución
      </button>
    </>
  )
}
```

- [ ] **Step 5: Crear `app/admin/lotes/[id]/distribucion/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { guardarDistribucionLote } from './actions'
import { DistribucionCuotas } from './DistribucionCuotas'

export default async function DistribucionLotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; ok?: string }>
}) {
  const { id } = await params
  const { error, ok } = await searchParams

  await requireAdministrador()

  const supabase = await createClient()

  const { data: lote } = await supabase.from('lotes').select('id, identificador, moneda, estado').eq('id', id).single()

  if (!lote) {
    notFound()
  }

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, numero, monto_base')
    .eq('lote_id', id)
    .order('numero', { ascending: true })

  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['administrador', 'acreedor', 'vendedor', 'cobrador'])
    .order('full_name')

  const { data: cuentasExternas } = await supabase.from('cuentas_externas').select('id, nombre').order('nombre')

  const participantesElegibles = [
    ...(staff ?? []).map((persona) => ({
      key: `profile:${persona.id}`,
      nombre: `${persona.full_name} (${persona.role})`,
    })),
    ...(cuentasExternas ?? []).map((cuentaExterna) => ({
      key: `externa:${cuentaExterna.id}`,
      nombre: `${cuentaExterna.nombre} (cuenta externa)`,
    })),
  ]

  const { data: objetivos } = await supabase
    .from('lote_distribucion_objetivos')
    .select('profile_id, cuenta_externa_id, monto_objetivo')
    .eq('lote_id', id)

  const objetivosIniciales = (objetivos ?? []).map((objetivo) => ({
    participanteKey: objetivo.profile_id
      ? `profile:${objetivo.profile_id}`
      : `externa:${objetivo.cuenta_externa_id}`,
    monto: String(objetivo.monto_objetivo),
  }))

  const cuotaIds = (cuotas ?? []).map((cuota) => cuota.id)
  const { data: distribuciones } =
    cuotaIds.length > 0
      ? await supabase
          .from('cuota_distribuciones')
          .select('cuota_id, profile_id, cuenta_externa_id, monto')
          .in('cuota_id', cuotaIds)
      : { data: [] }

  const distribucionesIniciales: Record<number, { participanteKey: string; monto: string }[]> = {}
  for (const cuota of cuotas ?? []) {
    distribucionesIniciales[cuota.numero] = (distribuciones ?? [])
      .filter((distribucion) => distribucion.cuota_id === cuota.id)
      .map((distribucion) => ({
        participanteKey: distribucion.profile_id
          ? `profile:${distribucion.profile_id}`
          : `externa:${distribucion.cuenta_externa_id}`,
        monto: String(distribucion.monto),
      }))
  }

  const guardarDistribucionConId = guardarDistribucionLote.bind(null, id)

  return (
    <main className="max-w-4xl">
      <div className="mb-4 flex gap-4">
        <a href="/admin/lotes" className="text-sm underline">
          ← Volver a Lotes
        </a>
        <a href={`/admin/lotes/${id}`} className="text-sm underline">
          ← Volver al lote
        </a>
      </div>
      <h1 className="mb-6 text-xl font-semibold">Distribución de cuotas — {lote!.identificador}</h1>

      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      {ok && <p className="mb-4 rounded bg-green-100 p-2 text-sm text-green-700">Distribución guardada.</p>}

      {lote!.estado !== 'vendido' ? (
        <p className="mb-4 rounded bg-amber-100 p-2 text-sm text-amber-800">
          Este lote no está vendido (estado actual: {lote!.estado}), todavía no tiene cuotas para
          distribuir.
        </p>
      ) : (
        <form action={guardarDistribucionConId}>
          <DistribucionCuotas
            moneda={lote!.moneda}
            cuotas={(cuotas ?? []).map((cuota) => ({ numero: cuota.numero, montoBase: cuota.monto_base }))}
            participantesElegibles={participantesElegibles}
            objetivosIniciales={objetivosIniciales}
            distribucionesIniciales={distribucionesIniciales}
          />
        </form>
      )}
    </main>
  )
}
```

- [ ] **Step 6: Agregar el link nuevo y actualizar el texto en `app/admin/lotes/[id]/page.tsx`**

Modificar la sección "Cuotas" (alrededor de la línea 346) para agregar el
link cuando el lote está vendido y el usuario es administrador. Ubicar
este bloque:

```tsx
      <h2 className="mb-2 mt-6 text-lg font-semibold">Cuotas</h2>
      {lote!.estado !== 'vendido' && (
```

Y reemplazarlo por:

```tsx
      <h2 className="mb-2 mt-6 text-lg font-semibold">Cuotas</h2>
      {perfilPropio!.role === 'administrador' && lote!.estado === 'vendido' && (
        <p className="mb-2 text-sm">
          <a href={`/admin/lotes/${id}/distribucion`} className="underline">
            Ver / editar distribución de cuotas →
          </a>
        </p>
      )}
      {lote!.estado !== 'vendido' && (
```

Después, ubicar este párrafo dentro de la sección "Participantes
adicionales":

```tsx
          <p className="mb-3 text-sm text-gray-600">
            Gente que comparte la comisión de este lote sin ser el admin, el acreedor ni el vendedor
            principal (ej. un segundo vendedor). Todavía no se cargan montos acá — eso es una pantalla
            aparte que viene después.
          </p>
```

Y reemplazarlo por:

```tsx
          <p className="mb-3 text-sm text-gray-600">
            Gente que comparte la comisión de este lote sin ser el admin, el acreedor ni el vendedor
            principal (ej. un segundo vendedor). Los montos que cobra cada uno se cargan cuota por
            cuota en{' '}
            {lote!.estado === 'vendido' ? (
              <a href={`/admin/lotes/${id}/distribucion`} className="underline">
                la distribución de cuotas
              </a>
            ) : (
              'la distribución de cuotas'
            )}
            .
          </p>
```

- [ ] **Step 7: Correr los tests nuevos para confirmar que pasan**

Run: `npx playwright test tests/e2e/distribucion-manual-cuotas.spec.ts --project=chromium`
Expected: PASS — 5/5.

- [ ] **Step 8: Correr la regresión de lotes/participantes**

Run: `npx playwright test tests/e2e/lote-participantes.spec.ts tests/e2e/pase-a-vendido.spec.ts --project=chromium`
Expected: PASS. Estos specs ejercitan el detalle del lote que se modificó
en el Step 6 (link nuevo + texto actualizado) — no deberían romperse.

- [ ] **Step 9: `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 10: Commit**

```bash
git add "app/admin/lotes/[id]/distribucion/page.tsx" "app/admin/lotes/[id]/distribucion/DistribucionCuotas.tsx" "app/admin/lotes/[id]/distribucion/actions.ts" "app/admin/lotes/[id]/page.tsx" tests/e2e/distribucion-manual-cuotas.spec.ts
git commit -m "feat: distribución manual por cuota, con objetivo opcional y resumen en vivo"
```
