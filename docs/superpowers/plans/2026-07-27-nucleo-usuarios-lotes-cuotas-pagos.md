# Núcleo Usuarios, Lotes, Cuotas y Pagos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the SIMA Inmobiliaria Next.js app, wire it to the existing (empty) Supabase project, and implement the core data model + flows from the design spec (auth by role, alta automática de cliente al vender un lote, generación de cuotas, imputación FIFO de pagos con confirmación cruzada, e indexación de cuotas en pesos) so the whole thing can run locally for a visual review.

**Architecture:** Next.js 15 (App Router, TypeScript) with Server Actions doing all writes; Supabase Postgres as the only datastore, accessed exclusively server-side (browser never talks to Supabase tables directly — RLS stays disabled per the spec, so no sensitive query may run client-side). Business rules that are pure computation (FIFO imputation, indexación, cobranza state, cuota generation) live in framework-free TypeScript functions under `lib/`, unit-tested with Vitest — everything else (routes, forms, Supabase I/O) is thin glue around those functions.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind CSS, `@supabase/ssr` + `@supabase/supabase-js`, Vitest for unit tests, Supabase Postgres + Auth + Storage (via the already-connected project `zcdjuxuvsfickymrhynx`).

## Global Constraints

- Spec source of truth: `docs/superpowers/specs/2026-07-27-nucleo-usuarios-lotes-cuotas-pagos-design.md`.
- RLS stays **disabled** on every table created here — do not add `enable row level security` to any migration in this plan.
- The Supabase **secret key** (`SUPABASE_SECRET_KEY` in `.env.local`) must only ever be imported from a file with no `'use client'` directive, and only from Server Actions / Route Handlers / Server Components.
- All monetary columns are `numeric(14,2)`. All dates that represent a cuota due date are stored and compared as ISO `YYYY-MM-DD` strings (Postgres `date` type serializes this way over the JS client) — never `Date` objects — so lexical string comparison (`<`, `>=`) is valid for ordering.
- No feature listed under "Fuera de alcance" in the spec (distribution engine, cuentas corrientes de acreedores, flujo completo de cobranza con plantillas, backup a Cloudflare R2, Mercado Pago) gets built in this plan.
- Language: all UI copy, code comments (when unavoidable), variable/function names, and commit messages are in Spanish, matching the rest of the project's naming (`lotes`, `cuotas`, `pagos`).
- No CSS framework beyond Tailwind's utility classes — no shadcn/ui or other component library (never confirmed with the user, don't introduce it silently).

---

### Task 1: Scaffold del proyecto Next.js

**Files:**
- Create: entire Next.js app skeleton at project root (merged in from a temp scaffold — see steps)
- Create: `vitest.config.ts`
- Create: `lib/smoke.test.ts`
- Modify: `.gitignore` (merge Next.js defaults into the existing one)
- Modify: `package.json` (add `"test": "vitest run"` script)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a working `npm run dev`, `npm run build`, `npm test` in the project root for every later task to build on

- [ ] **Step 1: Scaffold into a temp sibling directory**

The project directory already has `.env.local`, `.gitignore`, `docs/`, and `.git/` in it, so `create-next-app` will refuse to run in place. Scaffold next to it, then merge.

```bash
cd "e:/WHAPIGEN/1. Clientes y Posibles Clientes/9. Nico_Saieg (Inmobiliaria)/0. Plataforma_Rentas_Nico"
npx create-next-app@latest sima-inmobiliaria-scaffold-tmp --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes
```

- [ ] **Step 2: Merge the scaffold into the real project directory**

```bash
cd "e:/WHAPIGEN/1. Clientes y Posibles Clientes/9. Nico_Saieg (Inmobiliaria)/0. Plataforma_Rentas_Nico"
cp -r sima-inmobiliaria-scaffold-tmp/. sima-inmobiliaria/ --no-clobber
cp sima-inmobiliaria-scaffold-tmp/.gitignore sima-inmobiliaria/.gitignore.nextjs
rm -rf sima-inmobiliaria-scaffold-tmp
```

`--no-clobber` skips `.env.local`/`.gitignore`/`docs/` since those already exist in the target. Confirm nothing important was skipped that shouldn't have been:

```bash
cd "e:/WHAPIGEN/1. Clientes y Posibles Clientes/9. Nico_Saieg (Inmobiliaria)/0. Plataforma_Rentas_Nico/sima-inmobiliaria"
ls
```

Expected: `app/`, `public/`, `package.json`, `tsconfig.json`, `next.config.ts` (or `.js`), `tailwind.config.ts` (if v3) or no config file (if Tailwind v4 default), `.env.local`, `.gitignore`, `.gitignore.nextjs`, `docs/`.

- [ ] **Step 3: Merge `.gitignore`**

Read `.gitignore.nextjs`, append any line not already present in `.gitignore` (typically `/node_modules`, `/.next/`, `/out/`, `.vercel`, `next-env.d.ts`, `*.tsbuildinfo`) to the existing `.gitignore`, then delete `.gitignore.nextjs`.

- [ ] **Step 4: Reinstall dependencies cleanly and add project deps**

```bash
cd "e:/WHAPIGEN/1. Clientes y Posibles Clientes/9. Nico_Saieg (Inmobiliaria)/0. Plataforma_Rentas_Nico/sima-inmobiliaria"
npm install
npm install @supabase/supabase-js @supabase/ssr
npm install -D vitest
```

- [ ] **Step 5: Add Vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
  },
})
```

- [ ] **Step 6: Add the canary test**

Create `lib/smoke.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'

describe('smoke', () => {
  it('el test runner esta andando', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 7: Add the `test` script**

In `package.json`, inside `"scripts"`, add:

```json
"test": "vitest run"
```

- [ ] **Step 8: Verify everything runs**

```bash
npm test
```
Expected: `1 passed`.

```bash
npm run build
```
Expected: build succeeds with no type errors (default Next.js starter page compiles as-is).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + TypeScript + Tailwind + Vitest"
```

---

### Task 2: Esquema de datos en Supabase

**Files:**
- Create: `supabase/migrations/0001_core_schema.sql`

**Interfaces:**
- Consumes: nothing
- Produces: tables `profiles`, `lotes`, `cuotas`, `ajustes_indexacion`, `pagos`, `pago_imputaciones`, enums `user_role`, `moneda`, `lote_estado`, `pago_estado`, and a private storage bucket `comprobantes` — every later task's DB access relies on these exact names and columns.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0001_core_schema.sql`:

```sql
create type public.user_role as enum ('administrador', 'acreedor', 'vendedor', 'cliente', 'cobrador');
create type public.moneda as enum ('USD', 'ARS');
create type public.lote_estado as enum ('disponible', 'reservado', 'vendido');
create type public.pago_estado as enum ('pendiente', 'confirmado');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null,
  full_name text not null,
  created_at timestamptz not null default now()
);

create table public.lotes (
  id uuid primary key default gen_random_uuid(),
  identificador text not null,
  moneda public.moneda not null,
  estado public.lote_estado not null default 'disponible',
  cliente_id uuid references public.profiles(id),
  cantidad_cuotas int not null,
  monto_cuota_base numeric(14,2) not null,
  fecha_primera_cuota date,
  created_at timestamptz not null default now()
);

create table public.cuotas (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes(id) on delete cascade,
  numero int not null,
  monto_base numeric(14,2) not null,
  saldo_pendiente numeric(14,2) not null,
  fecha_vencimiento date not null,
  created_at timestamptz not null default now(),
  unique (lote_id, numero)
);

create table public.ajustes_indexacion (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes(id) on delete cascade,
  porcentaje numeric(6,3) not null,
  fecha_desde date not null,
  aplicado_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.profiles(id),
  monto numeric(14,2) not null,
  moneda public.moneda not null,
  comprobante_path text,
  estado public.pago_estado not null default 'pendiente',
  confirmado_acreedor_por uuid references public.profiles(id),
  confirmado_acreedor_at timestamptz,
  confirmado_admin_por uuid references public.profiles(id),
  confirmado_admin_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.pago_imputaciones (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null references public.pagos(id) on delete cascade,
  cuota_id uuid not null references public.cuotas(id),
  monto_imputado numeric(14,2) not null,
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', false);
```

- [ ] **Step 2: Apply the migration**

Use the `mcp__supabase__apply_migration` tool with `name: "core_schema"` and the SQL above as `query`.

- [ ] **Step 3: Verify**

Use the `mcp__supabase__list_tables` tool. Expected: `profiles`, `lotes`, `cuotas`, `ajustes_indexacion`, `pagos`, `pago_imputaciones` all present, none with RLS enabled.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_core_schema.sql
git commit -m "feat: esquema de datos nucleo (usuarios, lotes, cuotas, pagos)"
```

---

### Task 3: Función pura de imputación FIFO

**Files:**
- Create: `lib/pagos/imputar-fifo.ts`
- Test: `lib/pagos/imputar-fifo.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `imputarPagoFIFO(montoPago: number, cuotasOrdenadas: CuotaPendiente[]): ResultadoImputacion`, types `CuotaPendiente { id: string; saldoPendiente: number }`, `Imputacion { cuotaId: string; montoImputado: number }`, `ResultadoImputacion { imputaciones: Imputacion[]; saldoNoImputado: number }` — Task 14 calls this directly against real cuota rows (already ordered oldest-first by `numero`).

- [ ] **Step 1: Write the failing tests**

Create `lib/pagos/imputar-fifo.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { imputarPagoFIFO } from './imputar-fifo'

describe('imputarPagoFIFO', () => {
  it('imputa el pago exacto a una sola cuota', () => {
    const resultado = imputarPagoFIFO(60000, [{ id: 'c1', saldoPendiente: 60000 }])

    expect(resultado.imputaciones).toEqual([{ cuotaId: 'c1', montoImputado: 60000 }])
    expect(resultado.saldoNoImputado).toBe(0)
  })

  it('derrama el sobrante a las cuotas siguientes en orden', () => {
    const resultado = imputarPagoFIFO(150000, [
      { id: 'c1', saldoPendiente: 60000 },
      { id: 'c2', saldoPendiente: 60000 },
    ])

    expect(resultado.imputaciones).toEqual([
      { cuotaId: 'c1', montoImputado: 60000 },
      { cuotaId: 'c2', montoImputado: 60000 },
    ])
    expect(resultado.saldoNoImputado).toBe(30000)
  })

  it('deja la cuota con saldo parcial cuando el pago no la cubre', () => {
    const resultado = imputarPagoFIFO(40000, [{ id: 'c1', saldoPendiente: 60000 }])

    expect(resultado.imputaciones).toEqual([{ cuotaId: 'c1', montoImputado: 40000 }])
    expect(resultado.saldoNoImputado).toBe(0)
  })

  it('saltea cuotas ya saldadas', () => {
    const resultado = imputarPagoFIFO(60000, [
      { id: 'c1', saldoPendiente: 0 },
      { id: 'c2', saldoPendiente: 60000 },
    ])

    expect(resultado.imputaciones).toEqual([{ cuotaId: 'c2', montoImputado: 60000 }])
  })

  it('no imputa nada si el pago es 0', () => {
    const resultado = imputarPagoFIFO(0, [{ id: 'c1', saldoPendiente: 60000 }])

    expect(resultado.imputaciones).toEqual([])
    expect(resultado.saldoNoImputado).toBe(0)
  })

  it('deja todo el monto como no imputado si no hay cuotas', () => {
    const resultado = imputarPagoFIFO(50000, [])

    expect(resultado.imputaciones).toEqual([])
    expect(resultado.saldoNoImputado).toBe(50000)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- imputar-fifo
```
Expected: FAIL — `Cannot find module './imputar-fifo'`.

- [ ] **Step 3: Implement**

Create `lib/pagos/imputar-fifo.ts`:

```typescript
export interface CuotaPendiente {
  id: string
  saldoPendiente: number
}

export interface Imputacion {
  cuotaId: string
  montoImputado: number
}

export interface ResultadoImputacion {
  imputaciones: Imputacion[]
  saldoNoImputado: number
}

export function imputarPagoFIFO(
  montoPago: number,
  cuotasOrdenadas: CuotaPendiente[]
): ResultadoImputacion {
  let restante = montoPago
  const imputaciones: Imputacion[] = []

  for (const cuota of cuotasOrdenadas) {
    if (restante <= 0) break
    if (cuota.saldoPendiente <= 0) continue

    const montoImputado = Math.min(restante, cuota.saldoPendiente)
    imputaciones.push({ cuotaId: cuota.id, montoImputado })
    restante -= montoImputado
  }

  return { imputaciones, saldoNoImputado: restante }
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- imputar-fifo
```
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/pagos/imputar-fifo.ts lib/pagos/imputar-fifo.test.ts
git commit -m "feat: imputacion FIFO de pagos"
```

---

### Task 4: Función pura de indexación de cuotas en pesos

**Files:**
- Create: `lib/lotes/aplicar-indexacion.ts`
- Test: `lib/lotes/aplicar-indexacion.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `calcularAjusteIndexacion(porcentaje: number, fechaDesde: string, cuotas: CuotaIndexable[]): AjusteResultado[]`, types `CuotaIndexable { id: string; saldoPendiente: number; fechaVencimiento: string }`, `AjusteResultado { cuotaId: string; saldoPendienteNuevo: number }` — Task 15 calls this against real cuota rows of a lote.

- [ ] **Step 1: Write the failing tests**

Create `lib/lotes/aplicar-indexacion.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { calcularAjusteIndexacion } from './aplicar-indexacion'

describe('calcularAjusteIndexacion', () => {
  it('ajusta el saldo pendiente de las cuotas desde la fecha indicada', () => {
    const resultado = calcularAjusteIndexacion(10, '2026-08-01', [
      { id: 'c1', saldoPendiente: 100000, fechaVencimiento: '2026-08-01' },
    ])

    expect(resultado).toEqual([{ cuotaId: 'c1', saldoPendienteNuevo: 110000 }])
  })

  it('no toca cuotas con vencimiento anterior a la fecha del ajuste', () => {
    const resultado = calcularAjusteIndexacion(10, '2026-08-01', [
      { id: 'c1', saldoPendiente: 100000, fechaVencimiento: '2026-07-01' },
    ])

    expect(resultado).toEqual([])
  })

  it('no toca cuotas ya saldadas aunque la fecha califique', () => {
    const resultado = calcularAjusteIndexacion(10, '2026-08-01', [
      { id: 'c1', saldoPendiente: 0, fechaVencimiento: '2026-08-01' },
    ])

    expect(resultado).toEqual([])
  })

  it('redondea a 2 decimales', () => {
    const resultado = calcularAjusteIndexacion(8.5, '2026-08-01', [
      { id: 'c1', saldoPendiente: 33333, fechaVencimiento: '2026-08-01' },
    ])

    expect(resultado).toEqual([{ cuotaId: 'c1', saldoPendienteNuevo: 36166.31 }])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- aplicar-indexacion
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/lotes/aplicar-indexacion.ts`:

```typescript
export interface CuotaIndexable {
  id: string
  saldoPendiente: number
  fechaVencimiento: string
}

export interface AjusteResultado {
  cuotaId: string
  saldoPendienteNuevo: number
}

export function calcularAjusteIndexacion(
  porcentaje: number,
  fechaDesde: string,
  cuotas: CuotaIndexable[]
): AjusteResultado[] {
  return cuotas
    .filter((cuota) => cuota.saldoPendiente > 0 && cuota.fechaVencimiento >= fechaDesde)
    .map((cuota) => ({
      cuotaId: cuota.id,
      saldoPendienteNuevo: Math.round(cuota.saldoPendiente * (1 + porcentaje / 100) * 100) / 100,
    }))
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- aplicar-indexacion
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/lotes/aplicar-indexacion.ts lib/lotes/aplicar-indexacion.test.ts
git commit -m "feat: calculo de ajuste por indexacion de cuotas en pesos"
```

---

### Task 5: Función pura de estado de cobranza

**Files:**
- Create: `lib/cobranza/estado-cliente.ts`
- Test: `lib/cobranza/estado-cliente.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `calcularEstadoCobranza(cuotas: CuotaEstado[], hoy: string): EstadoCobranza`, type `CuotaEstado { saldoPendiente: number; fechaVencimiento: string }`, type `EstadoCobranza = 'normal' | 'moroso' | 'prejudicial'` — Task 12 (portal cliente) calls this to show the client's current state.

- [ ] **Step 1: Write the failing tests**

Create `lib/cobranza/estado-cliente.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { calcularEstadoCobranza } from './estado-cliente'

describe('calcularEstadoCobranza', () => {
  it('normal cuando no hay cuotas vencidas', () => {
    const estado = calcularEstadoCobranza(
      [{ saldoPendiente: 60000, fechaVencimiento: '2026-09-01' }],
      '2026-08-01'
    )
    expect(estado).toBe('normal')
  })

  it('moroso con 1 o 2 cuotas vencidas', () => {
    const estado = calcularEstadoCobranza(
      [
        { saldoPendiente: 60000, fechaVencimiento: '2026-06-01' },
        { saldoPendiente: 60000, fechaVencimiento: '2026-07-01' },
      ],
      '2026-08-01'
    )
    expect(estado).toBe('moroso')
  })

  it('prejudicial con mas de 2 cuotas vencidas', () => {
    const estado = calcularEstadoCobranza(
      [
        { saldoPendiente: 60000, fechaVencimiento: '2026-05-01' },
        { saldoPendiente: 60000, fechaVencimiento: '2026-06-01' },
        { saldoPendiente: 60000, fechaVencimiento: '2026-07-01' },
      ],
      '2026-08-01'
    )
    expect(estado).toBe('prejudicial')
  })

  it('una cuota que vence hoy todavia no cuenta como vencida', () => {
    const estado = calcularEstadoCobranza(
      [{ saldoPendiente: 60000, fechaVencimiento: '2026-08-01' }],
      '2026-08-01'
    )
    expect(estado).toBe('normal')
  })

  it('una cuota que vencio ayer ya cuenta como vencida (sin dia de gracia)', () => {
    const estado = calcularEstadoCobranza(
      [{ saldoPendiente: 60000, fechaVencimiento: '2026-07-31' }],
      '2026-08-01'
    )
    expect(estado).toBe('moroso')
  })

  it('una cuota pagada no cuenta como vencida aunque la fecha haya pasado', () => {
    const estado = calcularEstadoCobranza(
      [{ saldoPendiente: 0, fechaVencimiento: '2026-06-01' }],
      '2026-08-01'
    )
    expect(estado).toBe('normal')
  })

  it('una cuota con pago parcial sigue contando como vencida', () => {
    const estado = calcularEstadoCobranza(
      [
        { saldoPendiente: 20000, fechaVencimiento: '2026-05-01' },
        { saldoPendiente: 60000, fechaVencimiento: '2026-06-01' },
        { saldoPendiente: 60000, fechaVencimiento: '2026-07-01' },
      ],
      '2026-08-01'
    )
    expect(estado).toBe('prejudicial')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- estado-cliente
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/cobranza/estado-cliente.ts`:

```typescript
export type EstadoCobranza = 'normal' | 'moroso' | 'prejudicial'

export interface CuotaEstado {
  saldoPendiente: number
  fechaVencimiento: string
}

export function calcularEstadoCobranza(cuotas: CuotaEstado[], hoy: string): EstadoCobranza {
  const vencidas = cuotas.filter(
    (cuota) => cuota.saldoPendiente > 0 && cuota.fechaVencimiento < hoy
  ).length

  if (vencidas === 0) return 'normal'
  if (vencidas <= 2) return 'moroso'
  return 'prejudicial'
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- estado-cliente
```
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/cobranza/estado-cliente.ts lib/cobranza/estado-cliente.test.ts
git commit -m "feat: calculo de estado normal/moroso/prejudicial"
```

---

### Task 6: Función pura de generación de cuotas

**Files:**
- Create: `lib/lotes/generar-cuotas.ts`
- Test: `lib/lotes/generar-cuotas.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `generarCuotas(cantidadCuotas: number, montoCuotaBase: number, fechaPrimeraCuota: string): CuotaGenerada[]`, type `CuotaGenerada { numero: number; montoBase: number; fechaVencimiento: string }` — Task 9 calls this when a lote is created.

- [ ] **Step 1: Write the failing tests**

Create `lib/lotes/generar-cuotas.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { generarCuotas } from './generar-cuotas'

describe('generarCuotas', () => {
  it('genera la cantidad de cuotas pedida, una por mes, con el mismo monto', () => {
    const cuotas = generarCuotas(3, 100, '2026-08-01')

    expect(cuotas).toEqual([
      { numero: 1, montoBase: 100, fechaVencimiento: '2026-08-01' },
      { numero: 2, montoBase: 100, fechaVencimiento: '2026-09-01' },
      { numero: 3, montoBase: 100, fechaVencimiento: '2026-10-01' },
    ])
  })

  it('devuelve un array vacio si la cantidad es 0', () => {
    expect(generarCuotas(0, 100, '2026-08-01')).toEqual([])
  })

  it('documenta el comportamiento de desborde de fin de mes de la fecha', () => {
    // El dia 31 no existe en todos los meses: Date.UTC lo hace desbordar
    // al mes siguiente. Es un comportamiento conocido, aceptable para el
    // MVP porque las fechas de cuota reales que usa Nicolas son dia 1 o
    // dia 10, nunca dia 31.
    const cuotas = generarCuotas(2, 100, '2026-01-31')

    expect(cuotas[1].fechaVencimiento).toBe('2026-03-03')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- generar-cuotas
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/lotes/generar-cuotas.ts`:

```typescript
export interface CuotaGenerada {
  numero: number
  montoBase: number
  fechaVencimiento: string
}

function sumarMeses(fechaISO: string, meses: number): string {
  const [anio, mes, dia] = fechaISO.split('-').map(Number)
  const fecha = new Date(Date.UTC(anio, mes - 1 + meses, dia))
  return fecha.toISOString().slice(0, 10)
}

export function generarCuotas(
  cantidadCuotas: number,
  montoCuotaBase: number,
  fechaPrimeraCuota: string
): CuotaGenerada[] {
  return Array.from({ length: cantidadCuotas }, (_, i) => ({
    numero: i + 1,
    montoBase: montoCuotaBase,
    fechaVencimiento: sumarMeses(fechaPrimeraCuota, i),
  }))
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- generar-cuotas
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/lotes/generar-cuotas.ts lib/lotes/generar-cuotas.test.ts
git commit -m "feat: generacion de cuotas por lote"
```

---

### Task 7: Clientes de Supabase (browser, server, admin)

**Files:**
- Create: `lib/supabase/browser.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/admin.ts`
- Create: `lib/supabase/middleware.ts`
- Create: `proxy.ts` (Next.js 16 renamed the middleware file convention to `proxy.ts`; same content, function exported as `proxy` instead of `middleware`)

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` from `.env.local`
- Produces: `createClient()` (browser, from `lib/supabase/browser.ts`), `createClient()` (server, async, from `lib/supabase/server.ts`), `createAdminClient()` (from `lib/supabase/admin.ts`) — every later task that touches Supabase imports one of these three.

- [ ] **Step 1: Browser client**

Create `lib/supabase/browser.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
```

- [ ] **Step 2: Server client**

Create `lib/supabase/server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // se llama desde un Server Component sin permiso de escritura de cookies
          }
        },
      },
    }
  )
}
```

- [ ] **Step 3: Admin client (secret key — server-only)**

Create `lib/supabase/admin.ts`:

```typescript
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

- [ ] **Step 4: Middleware session refresh**

Create `lib/supabase/middleware.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const RUTAS_PUBLICAS = ['/login', '/set-password']

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const esRutaPublica = RUTAS_PUBLICAS.some((ruta) => request.nextUrl.pathname.startsWith(ruta))

  if (!user && !esRutaPublica) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}
```

Create `proxy.ts` at the project root (Next.js 16 renamed the `middleware.ts` convention to `proxy.ts` — the exported function is now called `proxy`, everything else is unchanged):

```typescript
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 5: Verify the connection end-to-end**

Use the `mcp__supabase__list_tables` tool again — this just confirms the project is still reachable and unchanged (the six tables from Task 2 should still be there). There is no unit test here: this task is pure wiring, verified by the auth flow working in Task 8.

```bash
npm run build
```
Expected: build succeeds (no route uses these files yet, but they must type-check).

- [ ] **Step 6: Commit**

```bash
git add lib/supabase proxy.ts
git commit -m "feat: clientes de supabase (browser, server, admin) y middleware de sesion"
```

---

### Task 8: Login, logout, set-password y ruteo por rol

**Files:**
- Create: `app/login/page.tsx`
- Create: `app/login/actions.ts`
- Create: `app/set-password/page.tsx`
- Create: `app/set-password/actions.ts`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `createClient()` from `lib/supabase/server.ts` (Task 7), table `profiles` (Task 2)
- Produces: `/login` route, `/set-password` route, `app/page.tsx` redirecting by `profiles.role` — every `/admin/*` and `/portal-cliente/*` page built from Task 9 onward assumes the user reaching it is already authenticated (enforced by `middleware.ts`) and reads the role the same way this task does.

- [ ] **Step 1: Login action**

Create `app/login/actions.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/')
}
```

- [ ] **Step 2: Login page**

Create `app/login/page.tsx`:

```tsx
import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="mb-6 text-xl font-semibold">Ingresar a SIMA</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      <form action={login} className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="password"
          type="password"
          placeholder="Contraseña"
          required
          className="rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Ingresar
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 3: Set-password page (para invitaciones)**

Create `app/set-password/actions.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function setPassword(formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser({
    password: formData.get('password') as string,
  })

  if (error) {
    redirect(`/set-password?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/')
}
```

Create `app/set-password/page.tsx`:

```tsx
import { setPassword } from './actions'

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="mb-6 text-xl font-semibold">Elegí tu contraseña</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      <form action={setPassword} className="flex flex-col gap-3">
        <input
          name="password"
          type="password"
          placeholder="Nueva contraseña"
          required
          minLength={6}
          className="rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Guardar
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4: Ruteo por rol en la raíz**

Modify `app/page.tsx` (replace the default Next.js starter content entirely):

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/login')
  }

  if (profile.role === 'cliente') {
    redirect('/portal-cliente')
  }

  if (profile.role === 'administrador' || profile.role === 'acreedor') {
    redirect('/admin')
  }

  return (
    <main className="mx-auto mt-24 max-w-sm p-6 text-center">
      <p>Tu rol ({profile.role}) todavía no tiene una pantalla propia en esta versión.</p>
    </main>
  )
}
```

- [ ] **Step 5: Verify it builds**

```bash
npm run build
```
Expected: build succeeds. `/admin` and `/portal-cliente` don't exist yet (Tasks 9–15 create them) — that's fine, `redirect()` doesn't require the target to exist at build time.

- [ ] **Step 6: Commit**

```bash
git add app/login app/set-password app/page.tsx
git commit -m "feat: login, set-password y ruteo por rol"
```

---

### Task 9: Admin — crear lote y generar sus cuotas

**Files:**
- Create: `app/admin/layout.tsx`
- Create: `app/admin/lotes/page.tsx`
- Create: `app/admin/lotes/nuevo/page.tsx`
- Create: `app/admin/lotes/actions.ts`

**Interfaces:**
- Consumes: `createClient()` server (Task 7), `generarCuotas()` (Task 6), tables `lotes`/`cuotas` (Task 2)
- Produces: server action `crearLote(formData: FormData)` that inserts a `lotes` row and its `cuotas` rows — Task 10 links a `lotes.id` created here to a new client.

- [ ] **Step 1: Admin layout with simple nav**

Create `app/admin/layout.tsx`:

```tsx
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav className="flex gap-4 border-b p-4 text-sm">
        <a href="/admin/lotes">Lotes</a>
        <a href="/admin/pagos">Pagos</a>
      </nav>
      <div className="p-6">{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Server action to create a lote + its cuotas**

Create `app/admin/lotes/actions.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { generarCuotas } from '@/lib/lotes/generar-cuotas'
import { redirect } from 'next/navigation'

export async function crearLote(formData: FormData) {
  const supabase = await createClient()

  const identificador = formData.get('identificador') as string
  const moneda = formData.get('moneda') as 'USD' | 'ARS'
  const cantidadCuotas = Number(formData.get('cantidadCuotas'))
  const montoCuotaBase = Number(formData.get('montoCuotaBase'))
  const fechaPrimeraCuota = formData.get('fechaPrimeraCuota') as string

  const { data: lote, error: errorLote } = await supabase
    .from('lotes')
    .insert({
      identificador,
      moneda,
      cantidad_cuotas: cantidadCuotas,
      monto_cuota_base: montoCuotaBase,
      fecha_primera_cuota: fechaPrimeraCuota,
    })
    .select()
    .single()

  if (errorLote || !lote) {
    redirect(`/admin/lotes/nuevo?error=${encodeURIComponent(errorLote?.message ?? 'error desconocido')}`)
  }

  const cuotas = generarCuotas(cantidadCuotas, montoCuotaBase, fechaPrimeraCuota)

  const { error: errorCuotas } = await supabase.from('cuotas').insert(
    cuotas.map((cuota) => ({
      lote_id: lote.id,
      numero: cuota.numero,
      monto_base: cuota.montoBase,
      saldo_pendiente: cuota.montoBase,
      fecha_vencimiento: cuota.fechaVencimiento,
    }))
  )

  if (errorCuotas) {
    redirect(`/admin/lotes/nuevo?error=${encodeURIComponent(errorCuotas.message)}`)
  }

  redirect('/admin/lotes')
}
```

- [ ] **Step 3: Form page**

Create `app/admin/lotes/nuevo/page.tsx`:

```tsx
import { crearLote } from '../actions'

export default async function NuevoLotePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="max-w-md">
      <h1 className="mb-6 text-xl font-semibold">Nuevo lote</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      <form action={crearLote} className="flex flex-col gap-3">
        <input
          name="identificador"
          placeholder="Identificador (ej: Loteo San Martín - Manzana 3 - Lote 12)"
          required
          className="rounded border px-3 py-2"
        />
        <select name="moneda" required className="rounded border px-3 py-2">
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>
        <input
          name="cantidadCuotas"
          type="number"
          min="1"
          placeholder="Cantidad de cuotas"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="montoCuotaBase"
          type="number"
          step="0.01"
          min="0"
          placeholder="Monto de cada cuota"
          required
          className="rounded border px-3 py-2"
        />
        <input name="fechaPrimeraCuota" type="date" required className="rounded border px-3 py-2" />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Crear lote
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4: Lista de lotes**

Create `app/admin/lotes/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'

export default async function LotesPage() {
  const supabase = await createClient()
  const { data: lotes } = await supabase
    .from('lotes')
    .select('id, identificador, moneda, estado, cantidad_cuotas')
    .order('created_at', { ascending: false })

  return (
    <main>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Lotes</h1>
        <a href="/admin/lotes/nuevo" className="rounded bg-black px-3 py-2 text-sm text-white">
          + Nuevo lote
        </a>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Identificador</th>
            <th>Moneda</th>
            <th>Estado</th>
            <th>Cuotas</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lotes?.map((lote) => (
            <tr key={lote.id} className="border-b">
              <td className="py-2">{lote.identificador}</td>
              <td>{lote.moneda}</td>
              <td>{lote.estado}</td>
              <td>{lote.cantidad_cuotas}</td>
              <td>
                {lote.estado !== 'vendido' && (
                  <a href={`/admin/lotes/${lote.id}/vender`} className="text-sm underline">
                    Vender / asignar cliente
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
```

- [ ] **Step 5: Verify it builds**

```bash
npm run build
```
Expected: build succeeds. `/admin/lotes/[id]/vender` referenced above doesn't exist yet — Task 10 creates it.

- [ ] **Step 6: Commit**

```bash
git add app/admin
git commit -m "feat: alta de lote y generacion automatica de sus cuotas"
```

---

### Task 10: Admin — vender lote y alta automática del cliente

**Files:**
- Create: `app/admin/lotes/[id]/vender/page.tsx`
- Create: `app/admin/lotes/[id]/vender/actions.ts`

**Interfaces:**
- Consumes: `createAdminClient()` (Task 7), table `lotes` (Task 2)
- Produces: server action `venderLote(loteId: string, formData: FormData)` that creates the `auth.users` + `profiles` row for the client, sends the invite email, and flips `lotes.estado` to `'vendido'` — this is the exact trigger the spec describes for automatic client account creation.

- [ ] **Step 1: Server action**

Create `app/admin/lotes/[id]/vender/actions.ts`:

```typescript
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function venderLote(loteId: string, formData: FormData) {
  const email = formData.get('email') as string
  const fullName = formData.get('fullName') as string

  const admin = createAdminClient()

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

  const supabase = await createClient()
  const { error: errorLote } = await supabase
    .from('lotes')
    .update({ estado: 'vendido', cliente_id: invited.user.id })
    .eq('id', loteId)

  if (errorLote) {
    redirect(`/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorLote.message)}`)
  }

  redirect('/admin/lotes')
}
```

- [ ] **Step 2: Form page**

Create `app/admin/lotes/[id]/vender/page.tsx`:

```tsx
import { venderLote } from './actions'

export default async function VenderLotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
  const venderLoteConId = venderLote.bind(null, id)

  return (
    <main className="max-w-md">
      <h1 className="mb-6 text-xl font-semibold">Vender lote y dar de alta al cliente</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      <form action={venderLoteConId} className="flex flex-col gap-3">
        <input
          name="fullName"
          placeholder="Nombre completo del comprador"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="email"
          type="email"
          placeholder="Email del comprador"
          required
          className="rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Confirmar venta y enviar invitación
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 3: Verify it builds**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/admin/lotes/[id]
git commit -m "feat: venta de lote con alta automatica del cliente e invitacion por email"
```

---

### Task 11: Admin — alta manual de cuentas de staff (acreedor / vendedor / cobrador)

**Files:**
- Create: `app/admin/usuarios/page.tsx`
- Create: `app/admin/usuarios/actions.ts`
- Modify: `app/admin/layout.tsx`

**Interfaces:**
- Consumes: `createAdminClient()` (Task 7), `createClient()` server (Task 7), table `profiles` (Task 2)
- Produces: server action `crearUsuarioStaff(formData: FormData)` that invites + creates a `profiles` row with `role` in `('acreedor', 'vendedor', 'cobrador')` — Task 16's manual checklist uses this to create a real acreedor account, since Task 14's cross-confirmation requires a genuinely distinct acreedor user.

- [ ] **Step 1: Server action**

Create `app/admin/usuarios/actions.ts`:

```typescript
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

const ROLES_STAFF = ['acreedor', 'vendedor', 'cobrador'] as const

export async function crearUsuarioStaff(formData: FormData) {
  const email = formData.get('email') as string
  const fullName = formData.get('fullName') as string
  const role = formData.get('role') as (typeof ROLES_STAFF)[number]

  if (!ROLES_STAFF.includes(role)) {
    redirect('/admin/usuarios?error=rol+invalido')
  }

  const admin = createAdminClient()

  const { data: invited, error: errorInvite } = await admin.auth.admin.inviteUserByEmail(email)

  if (errorInvite || !invited.user) {
    redirect(
      `/admin/usuarios?error=${encodeURIComponent(errorInvite?.message ?? 'error desconocido')}`
    )
  }

  const { error: errorProfile } = await admin
    .from('profiles')
    .insert({ id: invited.user.id, role, full_name: fullName })

  if (errorProfile) {
    redirect(`/admin/usuarios?error=${encodeURIComponent(errorProfile.message)}`)
  }

  redirect('/admin/usuarios')
}
```

- [ ] **Step 2: Página de listado + formulario**

Create `app/admin/usuarios/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { crearUsuarioStaff } from './actions'

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()
  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['administrador', 'acreedor', 'vendedor', 'cobrador'])
    .order('role')

  return (
    <main className="max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">Usuarios de staff</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      <form action={crearUsuarioStaff} className="mb-8 flex flex-col gap-3">
        <input
          name="fullName"
          placeholder="Nombre completo"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="rounded border px-3 py-2"
        />
        <select name="role" required className="rounded border px-3 py-2">
          <option value="acreedor">Acreedor</option>
          <option value="vendedor">Vendedor</option>
          <option value="cobrador">Cobrador</option>
        </select>
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Invitar
        </button>
      </form>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Nombre</th>
            <th>Rol</th>
          </tr>
        </thead>
        <tbody>
          {staff?.map((persona) => (
            <tr key={persona.id} className="border-b">
              <td className="py-2">{persona.full_name}</td>
              <td>{persona.role}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
```

- [ ] **Step 3: Agregar el link de navegación**

In `app/admin/layout.tsx`, add a third link next to the existing two:

```tsx
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav className="flex gap-4 border-b p-4 text-sm">
        <a href="/admin/lotes">Lotes</a>
        <a href="/admin/pagos">Pagos</a>
        <a href="/admin/usuarios">Usuarios</a>
      </nav>
      <div className="p-6">{children}</div>
    </div>
  )
}
```

- [ ] **Step 4: Verify it builds**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/admin/usuarios app/admin/layout.tsx
git commit -m "feat: alta manual de cuentas de staff por el administrador"
```

---

### Task 12: Portal del cliente — ver cuotas y estado de cobranza

**Files:**
- Create: `app/portal-cliente/page.tsx`

**Interfaces:**
- Consumes: `createClient()` server (Task 7), `calcularEstadoCobranza()` (Task 5), tables `lotes`/`cuotas` (Task 2)
- Produces: the client-facing list of cuotas with a "Subir comprobante" link that only appears on the oldest unpaid cuota — Task 13 implements what that link points to.

- [ ] **Step 1: Portal page**

Create `app/portal-cliente/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { calcularEstadoCobranza } from '@/lib/cobranza/estado-cliente'
import { redirect } from 'next/navigation'

export default async function PortalClientePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: lote } = await supabase
    .from('lotes')
    .select('id, identificador, moneda')
    .eq('cliente_id', user.id)
    .single()

  if (!lote) {
    return (
      <main className="mx-auto mt-24 max-w-md p-6 text-center">
        <p>Todavía no tenés un lote asignado.</p>
      </main>
    )
  }

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, numero, monto_base, saldo_pendiente, fecha_vencimiento')
    .eq('lote_id', lote.id)
    .order('numero', { ascending: true })

  const hoy = new Date().toISOString().slice(0, 10)
  const estado = calcularEstadoCobranza(
    (cuotas ?? []).map((cuota) => ({
      saldoPendiente: cuota.saldo_pendiente,
      fechaVencimiento: cuota.fecha_vencimiento,
    })),
    hoy
  )

  const primeraImpaga = cuotas?.find((cuota) => cuota.saldo_pendiente > 0)

  return (
    <main className="mx-auto mt-12 max-w-2xl p-6">
      <h1 className="mb-2 text-xl font-semibold">{lote.identificador}</h1>
      <p className="mb-6 text-sm">
        Estado:{' '}
        <span
          className={
            estado === 'normal'
              ? 'text-green-700'
              : estado === 'moroso'
                ? 'text-amber-700'
                : 'text-red-700'
          }
        >
          {estado}
        </span>
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Cuota</th>
            <th>Vencimiento</th>
            <th>Monto base</th>
            <th>Saldo pendiente</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cuotas?.map((cuota) => (
            <tr key={cuota.id} className="border-b">
              <td className="py-2">{cuota.numero}</td>
              <td>{cuota.fecha_vencimiento}</td>
              <td>
                {cuota.monto_base} {lote.moneda}
              </td>
              <td>
                {cuota.saldo_pendiente} {lote.moneda}
              </td>
              <td>
                {primeraImpaga?.id === cuota.id && (
                  <a href={`/portal-cliente/pagar/${cuota.id}`} className="underline">
                    Pagar / subir comprobante
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
```

- [ ] **Step 2: Verify it builds**

```bash
npm run build
```
Expected: build succeeds. `/portal-cliente/pagar/[id]` doesn't exist yet — Task 13 creates it.

- [ ] **Step 3: Commit**

```bash
git add app/portal-cliente/page.tsx
git commit -m "feat: portal del cliente con cuotas y estado de cobranza"
```

---

### Task 13: Subir comprobante de pago

**Files:**
- Create: `app/portal-cliente/pagar/[id]/page.tsx`
- Create: `app/portal-cliente/pagar/[id]/actions.ts`

**Interfaces:**
- Consumes: `createClient()` server (Task 7), `createAdminClient()` (Task 7), bucket `comprobantes` (Task 2), table `pagos` (Task 2)
- Produces: a `pagos` row with `estado: 'pendiente'` and a `comprobante_path` — Task 14 lists these for cross-confirmation.

- [ ] **Step 1: Server action**

Create `app/portal-cliente/pagar/[id]/actions.ts`. Supabase Storage has RLS **enabled by default on `storage.objects`** regardless of the tables in Task 2 — since no storage policies are being written in this plan, uploads must go through the admin client (same reasoning as the invite calls in Task 10/11), while the caller's identity still comes from the regular session:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export async function registrarPago(cuotaId: string, formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const monto = Number(formData.get('monto'))
  const moneda = formData.get('moneda') as 'USD' | 'ARS'
  const comprobante = formData.get('comprobante') as File

  const comprobantePath = `${user!.id}/${Date.now()}-${comprobante.name}`

  const admin = createAdminClient()

  const { error: errorUpload } = await admin.storage
    .from('comprobantes')
    .upload(comprobantePath, comprobante)

  if (errorUpload) {
    redirect(`/portal-cliente/pagar/${cuotaId}?error=${encodeURIComponent(errorUpload.message)}`)
  }

  const { error: errorPago } = await admin.from('pagos').insert({
    cliente_id: user!.id,
    monto,
    moneda,
    comprobante_path: comprobantePath,
  })

  if (errorPago) {
    redirect(`/portal-cliente/pagar/${cuotaId}?error=${encodeURIComponent(errorPago.message)}`)
  }

  redirect('/portal-cliente')
}
```

- [ ] **Step 2: Form page**

Create `app/portal-cliente/pagar/[id]/page.tsx`:

```tsx
import { registrarPago } from './actions'

export default async function PagarCuotaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
  const registrarPagoConId = registrarPago.bind(null, id)

  return (
    <main className="mx-auto mt-12 max-w-md p-6">
      <h1 className="mb-6 text-xl font-semibold">Registrar pago</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      <form action={registrarPagoConId} className="flex flex-col gap-3">
        <input
          name="monto"
          type="number"
          step="0.01"
          min="0.01"
          placeholder="Monto transferido"
          required
          className="rounded border px-3 py-2"
        />
        <select name="moneda" required className="rounded border px-3 py-2">
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>
        <input name="comprobante" type="file" required accept="image/*,.pdf" />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Enviar
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 3: Verify it builds**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/portal-cliente/pagar
git commit -m "feat: carga de comprobante de pago por el cliente"
```

---

### Task 14: Confirmación cruzada e imputación real

**Files:**
- Create: `app/admin/pagos/page.tsx`
- Create: `app/admin/pagos/actions.ts`

**Interfaces:**
- Consumes: `imputarPagoFIFO()` (Task 3), `createClient()` server (Task 7), tables `profiles`/`pagos`/`cuotas`/`pago_imputaciones` (Task 2)
- Produces: the actual FIFO write-back to `cuotas.saldo_pendiente` once both confirmations are in — this is the last piece needed for an end-to-end payment.

- [ ] **Step 1: Server action**

Create `app/admin/pagos/actions.ts`. The confirming role must come from the caller's own `profiles.role`, never from a client-supplied argument — otherwise anyone able to submit the form could claim to be "the acreedor" regardless of who they actually are, defeating the whole point of a cross-check:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { imputarPagoFIFO } from '@/lib/pagos/imputar-fifo'
import { revalidatePath } from 'next/cache'

export async function confirmarPago(pagoId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!perfil || (perfil.role !== 'acreedor' && perfil.role !== 'administrador')) {
    return
  }

  const campoPor = perfil.role === 'acreedor' ? 'confirmado_acreedor_por' : 'confirmado_admin_por'
  const campoAt = perfil.role === 'acreedor' ? 'confirmado_acreedor_at' : 'confirmado_admin_at'

  await supabase
    .from('pagos')
    .update({ [campoPor]: user.id, [campoAt]: new Date().toISOString() })
    .eq('id', pagoId)

  const { data: pago } = await supabase
    .from('pagos')
    .select('id, cliente_id, monto, confirmado_acreedor_por, confirmado_admin_por, estado')
    .eq('id', pagoId)
    .single()

  if (!pago || pago.estado === 'confirmado' || !pago.confirmado_acreedor_por || !pago.confirmado_admin_por) {
    revalidatePath('/admin/pagos')
    return
  }

  const { data: lote } = await supabase
    .from('lotes')
    .select('id')
    .eq('cliente_id', pago.cliente_id)
    .single()

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, saldo_pendiente')
    .eq('lote_id', lote!.id)
    .gt('saldo_pendiente', 0)
    .order('numero', { ascending: true })

  const resultado = imputarPagoFIFO(
    pago.monto,
    (cuotas ?? []).map((cuota) => ({ id: cuota.id, saldoPendiente: cuota.saldo_pendiente }))
  )

  for (const imputacion of resultado.imputaciones) {
    await supabase.from('pago_imputaciones').insert({
      pago_id: pago.id,
      cuota_id: imputacion.cuotaId,
      monto_imputado: imputacion.montoImputado,
    })

    const cuota = cuotas!.find((c) => c.id === imputacion.cuotaId)!
    await supabase
      .from('cuotas')
      .update({ saldo_pendiente: cuota.saldo_pendiente - imputacion.montoImputado })
      .eq('id', imputacion.cuotaId)
  }

  await supabase.from('pagos').update({ estado: 'confirmado' }).eq('id', pago.id)

  revalidatePath('/admin/pagos')
  revalidatePath('/portal-cliente')
}
```

- [ ] **Step 2: Listado de pagos pendientes**

Create `app/admin/pagos/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { confirmarPago } from './actions'

export default async function PagosPage() {
  const supabase = await createClient()
  const { data: pagos } = await supabase
    .from('pagos')
    .select(
      'id, monto, moneda, comprobante_path, estado, confirmado_acreedor_por, confirmado_admin_por, cliente_id'
    )
    .order('created_at', { ascending: false })

  return (
    <main>
      <h1 className="mb-6 text-xl font-semibold">Pagos</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Monto</th>
            <th>Estado</th>
            <th>Confirmado acreedor</th>
            <th>Confirmado admin</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pagos?.map((pago) => {
            const confirmarEstePago = confirmarPago.bind(null, pago.id)

            return (
              <tr key={pago.id} className="border-b">
                <td className="py-2">
                  {pago.monto} {pago.moneda}
                </td>
                <td>{pago.estado}</td>
                <td>{pago.confirmado_acreedor_por ? 'Sí' : 'No'}</td>
                <td>{pago.confirmado_admin_por ? 'Sí' : 'No'}</td>
                <td>
                  {pago.estado === 'pendiente' && (
                    <form action={confirmarEstePago}>
                      <button type="submit" className="underline">
                        Confirmar mi parte
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </main>
  )
}
```

Sólo aparece un botón por fila: qué campo termina marcado (`confirmado_acreedor_por` o `confirmado_admin_por`) depende de quién esté logueado al hacer click, no de cuál botón tocó — por eso hace falta iniciar sesión como el acreedor real y como el administrador real por separado para completar una confirmación cruzada de verdad (ver el checklist manual de Task 16).

- [ ] **Step 3: Verify it builds**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/admin/pagos
git commit -m "feat: confirmacion cruzada de pagos con imputacion FIFO real"
```

---

### Task 15: Indexación de cuotas en pesos (UI)

**Files:**
- Create: `app/admin/lotes/[id]/indexar/page.tsx`
- Create: `app/admin/lotes/[id]/indexar/actions.ts`
- Modify: `app/admin/lotes/page.tsx` (agregar el link "Indexar")

**Interfaces:**
- Consumes: `calcularAjusteIndexacion()` (Task 4), `createClient()` server (Task 7), tables `cuotas`/`ajustes_indexacion` (Task 2)
- Produces: the write-back of `calcularAjusteIndexacion()`'s result into `cuotas.saldo_pendiente`, plus the audit row in `ajustes_indexacion`.

- [ ] **Step 1: Server action**

Create `app/admin/lotes/[id]/indexar/actions.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { calcularAjusteIndexacion } from '@/lib/lotes/aplicar-indexacion'
import { redirect } from 'next/navigation'

export async function aplicarIndexacion(loteId: string, formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const porcentaje = Number(formData.get('porcentaje'))
  const fechaDesde = formData.get('fechaDesde') as string

  const { data: cuotas } = await supabase
    .from('cuotas')
    .select('id, saldo_pendiente, fecha_vencimiento')
    .eq('lote_id', loteId)

  const ajustes = calcularAjusteIndexacion(
    porcentaje,
    fechaDesde,
    (cuotas ?? []).map((cuota) => ({
      id: cuota.id,
      saldoPendiente: cuota.saldo_pendiente,
      fechaVencimiento: cuota.fecha_vencimiento,
    }))
  )

  for (const ajuste of ajustes) {
    await supabase
      .from('cuotas')
      .update({ saldo_pendiente: ajuste.saldoPendienteNuevo })
      .eq('id', ajuste.cuotaId)
  }

  await supabase.from('ajustes_indexacion').insert({
    lote_id: loteId,
    porcentaje,
    fecha_desde: fechaDesde,
    aplicado_por: user!.id,
  })

  redirect('/admin/lotes')
}
```

- [ ] **Step 2: Form page**

Create `app/admin/lotes/[id]/indexar/page.tsx`:

```tsx
import { aplicarIndexacion } from './actions'

export default async function IndexarLotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const aplicarIndexacionConId = aplicarIndexacion.bind(null, id)

  return (
    <main className="max-w-md">
      <h1 className="mb-6 text-xl font-semibold">Aplicar ajuste por índice</h1>
      <form action={aplicarIndexacionConId} className="flex flex-col gap-3">
        <input
          name="porcentaje"
          type="number"
          step="0.001"
          placeholder="Porcentaje de ajuste (ej: 8.5)"
          required
          className="rounded border px-3 py-2"
        />
        <input name="fechaDesde" type="date" required className="rounded border px-3 py-2" />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Aplicar
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 3: Link desde el listado de lotes**

In `app/admin/lotes/page.tsx`, inside the `<td>` that already has the "Vender / asignar cliente" link, add below it:

```tsx
{lote.moneda === 'ARS' && (
  <a href={`/admin/lotes/${lote.id}/indexar`} className="ml-3 text-sm underline">
    Indexar
  </a>
)}
```

- [ ] **Step 4: Verify it builds**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/admin/lotes
git commit -m "feat: aplicar ajuste por indexacion a las cuotas en pesos de un lote"
```

---

### Task 16: Smoke test manual end-to-end y levantar el servidor local

**Files:** none (verification only)

**Interfaces:**
- Consumes: everything from Tasks 1–15
- Produces: a confirmed working local instance for the user to review

- [ ] **Step 1: Run the full automated suite one more time**

```bash
npm test
npm run build
```
Expected: all unit tests pass (Tasks 3–6: 20 tests total), build succeeds.

- [ ] **Step 2: Create the first administrador manually (one-time, via Supabase MCP)**

Since there's no signup flow, the very first `administrador` account has to be inserted directly — every account after this one goes through Task 10 (cliente) or Task 11 (staff). Use the admin client's `inviteUserByEmail` for this one-off, then insert the `profiles` row: temporarily call `admin.auth.admin.inviteUserByEmail('<email real que el usuario indique>')`, then `insert into profiles (id, role, full_name) values ('<id devuelto>', 'administrador', '<nombre>')` via the `mcp__supabase__execute_sql` tool. **Ask the user for the real email to use before doing this — do not invent one.**

- [ ] **Step 3: Start the dev server**

```bash
cd "e:/WHAPIGEN/1. Clientes y Posibles Clientes/9. Nico_Saieg (Inmobiliaria)/0. Plataforma_Rentas_Nico/sima-inmobiliaria"
npm run dev
```
Leave it running (background) and tell the user it's live at `http://localhost:3000`.

- [ ] **Step 4: Walk the manual checklist (do this yourself before handing off, then let the user repeat it)**

This needs **two real, distinct email inboxes you control** — one for the administrador (Step 2), one for a second person who will act as the acreedor (Task 11). The cross-confirmation in Task 14 only proves anything if it's actually two different logged-in identities, not the same person clicking two buttons.

1. Open `http://localhost:3000` — should redirect to `/login`.
2. Log in as the administrador created in Step 2.
3. Go to `/admin/usuarios`, invite a second real email as "Acreedor" (e.g. "Propietario de prueba"). Check that inbox, follow the invite link, set a password. This session should land back on `/admin` (staff roles other than cliente see the "todavía no tiene una pantalla propia" placeholder outside of `/admin/pagos` — that's expected for vendedor/cobrador, but acreedor is explicitly allowed into `/admin` by Task 8's `app/page.tsx`).
4. Log back in as administrador. Go to `/admin/lotes/nuevo`, create a lote (e.g. 3 cuotas of 1000 each, moneda USD, first cuota today).
5. From `/admin/lotes`, click "Vender / asignar cliente" on that lote, enter a third real email you control, submit.
6. Check that third inbox for the Supabase invite email, follow the link — should land on `/set-password`.
7. Set a password — should redirect to `/portal-cliente` showing 3 cuotas, estado "normal".
8. Click "Pagar / subir comprobante" on cuota 1, submit an amount larger than the cuota (e.g. 1500) with any small image/PDF as comprobante.
9. Log in as the **acreedor** from Step 3 (separate browser/incognito, since the administrador session from Step 4 is still active elsewhere), go to `/admin/pagos`, click "Confirmar mi parte" for that pago. It should show "Confirmado acreedor: Sí", "Confirmado admin: No", `estado` still `pendiente`.
10. Log in as **administrador**, go to `/admin/pagos`, click "Confirmar mi parte" on the same pago. Now both columns should say "Sí" and `estado` should flip to `confirmado`.
11. Go back to `/portal-cliente` as the client — cuota 1 should show saldo 0, cuota 2 should show saldo 500 (the 500 sobrante spilled over via FIFO).

Do not mark this task complete until this exact sequence works without errors.

---
