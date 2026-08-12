# Pase a vendido (fase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el ciclo `disponible → reservado → vendido`: exigir reserva antes de poder vender, mover la decisión de cuotas del momento de crear el lote al momento de vender (con monto por cuota auto-calculado), permitir seña en $0 para ventas al contado, y separar con claridad quién reservó de quién termina siendo el comprador.

**Architecture:** Next.js App Router, Server Components + Server Actions exclusivamente (cero JavaScript de cliente, es una restricción deliberada del proyecto — no se agrega en esta tanda). Supabase Postgres sin RLS. Mismo patrón de claim atómico (`UPDATE ... WHERE estado = X`) ya usado por `reservarLote`/`cancelarReserva` para las transiciones de estado.

**Tech Stack:** Next.js 16 (Turbopack), TypeScript, Supabase JS, Vitest (unitarios), Playwright (e2e, single worker).

## Global Constraints

- Spec de referencia: `docs/superpowers/specs/2026-08-12-pase-a-vendido-fase2-design.md` — cualquier duda sobre el "por qué" de una decisión está ahí.
- Cero JavaScript de cliente nuevo. Nada de `'use client'` salvo los dos componentes de confirm-dialog que ya existen (`BotonEliminarLote`, `BotonCancelarReserva`) — no se agregan más.
- Todo Server Action que mute datos repite su propio guard de rol, independiente del guard de la página (defensa en profundidad, patrón ya establecido en el proyecto).
- Mensajes de error al usuario: siempre en español llano, nunca un mensaje técnico crudo de Postgres/Supabase sin envolver.
- Cada tarea termina con `npm test` (unitarios) y, si tocó algo de UI/flujo, la suite de Playwright relevante en verde antes de pasar a la siguiente.
- Working directory de todos los comandos: `sima-inmobiliaria/` (raíz del proyecto Next.js dentro del repo).

---

### Task 1: Migración — cuotas nullable en `lotes` + limpieza de datos incongruentes

**Files:**
- Create: `supabase/migrations/0012_lotes_cuotas_nullable_y_limpieza.sql`

**Interfaces:**
- Produces: columnas `lotes.cantidad_cuotas` y `lotes.monto_cuota_base` dejan de ser `not null`. Ningún lote con `estado <> 'vendido'` tiene filas en `cuotas` ni esas 3 columnas cargadas después de esta tarea.

- [ ] **Step 1: Escribir el archivo de migración**

```sql
alter table public.lotes
  alter column cantidad_cuotas drop not null,
  alter column monto_cuota_base drop not null;

delete from public.cuotas
where lote_id in (select id from public.lotes where estado <> 'vendido');

update public.lotes
set cantidad_cuotas = null, monto_cuota_base = null, fecha_primera_cuota = null
where estado <> 'vendido';
```

- [ ] **Step 2: Aplicar la migración**

Usar la tool `mcp__supabase__apply_migration` con `name: "lotes_cuotas_nullable_y_limpieza"` y `query` igual al contenido del Step 1. (Antes de aplicar nada, confirmar con `mcp__supabase__get_project_url` que apunta al mismo proyecto que `NEXT_PUBLIC_SUPABASE_URL` en `.env.local` — regla fija de este proyecto.)

- [ ] **Step 3: Verificar la limpieza**

Correr con `mcp__supabase__execute_sql`:

```sql
select count(*) from public.cuotas c
join public.lotes l on l.id = c.lote_id
where l.estado <> 'vendido';
```

Esperado: `0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0012_lotes_cuotas_nullable_y_limpieza.sql
git commit -m "feat: cuotas nullable en lotes y limpieza de datos previos a pase a vendido"
```

---

### Task 2: `calcularMontoCuota` — función pura + test

**Files:**
- Create: `lib/lotes/calcular-monto-cuota.ts`
- Create: `lib/lotes/calcular-monto-cuota.test.ts`

**Interfaces:**
- Produces: `calcularMontoCuota(precioTotal: number, cantidadCuotas: number): number` — usada por Task 8 (`venderLote`).

- [ ] **Step 1: Escribir el test (falla primero)**

```typescript
import { describe, expect, it } from 'vitest'
import { calcularMontoCuota } from './calcular-monto-cuota'

describe('calcularMontoCuota', () => {
  it('divide exacto', () => {
    expect(calcularMontoCuota(12000, 12)).toBe(1000)
  })

  it('redondea a 2 decimales cuando no divide exacto', () => {
    expect(calcularMontoCuota(1000, 3)).toBe(333.33)
  })

  it('con una sola cuota, devuelve el precio total', () => {
    expect(calcularMontoCuota(5000, 1)).toBe(5000)
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test -- calcular-monto-cuota`
Expected: FAIL (`Cannot find module './calcular-monto-cuota'`)

- [ ] **Step 3: Implementar**

```typescript
export function calcularMontoCuota(precioTotal: number, cantidadCuotas: number): number {
  return Math.round((precioTotal / cantidadCuotas) * 100) / 100
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm test -- calcular-monto-cuota`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/lotes/calcular-monto-cuota.ts lib/lotes/calcular-monto-cuota.test.ts
git commit -m "feat: calcularMontoCuota, monto por cuota a partir del precio total"
```

---

### Task 3: `generarCuotas` — la última cuota cierra exacto contra el precio total

**Files:**
- Modify: `lib/lotes/generar-cuotas.ts`
- Modify: `lib/lotes/generar-cuotas.test.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `generarCuotas(cantidadCuotas: number, montoCuotaBase: number, fechaPrimeraCuota: string, precioTotal?: number): CuotaGenerada[]`. El 4º parámetro es **opcional**: sin él, el comportamiento es idéntico al actual (todas las cuotas con `montoCuotaBase`, sin ajuste). Con él, la última cuota se ajusta para que la suma total cierre exacto contra `precioTotal`. Usada por Task 8 (`venderLote`).

- [ ] **Step 1: Agregar el test del nuevo comportamiento (falla primero)**

Agregar al final de `lib/lotes/generar-cuotas.test.ts` (no tocar los 3 tests existentes):

```typescript
  it('sin precioTotal, se comporta igual que antes (todas las cuotas iguales)', () => {
    const cuotas = generarCuotas(3, 333.33, '2026-08-01')
    expect(cuotas.every((c) => c.montoBase === 333.33)).toBe(true)
  })

  it('con precioTotal, la ultima cuota absorbe el resto del redondeo para cerrar exacto', () => {
    const cuotas = generarCuotas(3, 333.33, '2026-08-01', 1000)

    expect(cuotas[0].montoBase).toBe(333.33)
    expect(cuotas[1].montoBase).toBe(333.33)
    expect(cuotas[2].montoBase).toBe(333.34)

    const suma = cuotas.reduce((acc, c) => acc + c.montoBase, 0)
    expect(Math.round(suma * 100) / 100).toBe(1000)
  })

  it('con precioTotal y una sola cuota, la cuota unica es el precio total exacto', () => {
    const cuotas = generarCuotas(1, 5000, '2026-08-01', 5000)
    expect(cuotas).toEqual([{ numero: 1, montoBase: 5000, fechaVencimiento: '2026-08-01' }])
  })
```

- [ ] **Step 2: Correr y verificar que los 3 nuevos fallan (los viejos siguen pasando)**

Run: `npm test -- generar-cuotas`
Expected: 3 nuevos FAIL, 3 existentes PASS

- [ ] **Step 3: Implementar el cambio**

Reemplazar el cuerpo de `lib/lotes/generar-cuotas.ts` completo:

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
  fechaPrimeraCuota: string,
  precioTotal?: number
): CuotaGenerada[] {
  const totalACerrar = precioTotal !== undefined ? Math.round(precioTotal * 100) / 100 : null

  return Array.from({ length: cantidadCuotas }, (_, i) => {
    const esUltima = i === cantidadCuotas - 1
    const monto =
      esUltima && totalACerrar !== null
        ? Math.round((totalACerrar - montoCuotaBase * (cantidadCuotas - 1)) * 100) / 100
        : montoCuotaBase

    return {
      numero: i + 1,
      montoBase: monto,
      fechaVencimiento: sumarMeses(fechaPrimeraCuota, i),
    }
  })
}
```

- [ ] **Step 4: Correr y verificar que todo pasa**

Run: `npm test -- generar-cuotas`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/lotes/generar-cuotas.ts lib/lotes/generar-cuotas.test.ts
git commit -m "feat: generarCuotas cierra la ultima cuota exacto contra el precio total"
```

---

### Task 4: `crearLote` deja de pedir cuotas

**Files:**
- Modify: `app/admin/lotes/actions.ts` (función `crearLote`, líneas 9-66 del archivo actual)
- Modify: `app/admin/lotes/nuevo/page.tsx`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `crearLote(formData)` sigue existiendo con la misma firma; ya no lee `cantidadCuotas`/`montoCuotaBase`/`fechaPrimeraCuota` de `formData` ni inserta en `cuotas`.

- [ ] **Step 1: Reescribir `crearLote` en `app/admin/lotes/actions.ts`**

Reemplazar la función `crearLote` completa (mantener `cancelarReserva` intacta debajo, sin tocarla):

```typescript
export async function crearLote(formData: FormData) {
  await requireAdmin()

  const supabase = await createClient()

  const identificador = formData.get('identificador') as string
  const moneda = formData.get('moneda') as 'USD' | 'ARS'
  const ubicacion = ((formData.get('ubicacion') as string) || '').trim() || null
  const precioTotalTexto = ((formData.get('precioTotal') as string) || '').trim()
  const precioTotal = precioTotalTexto ? Number(precioTotalTexto) : null

  if (!ubicacion || !precioTotal || !Number.isFinite(precioTotal) || precioTotal <= 0) {
    redirect(
      `/admin/lotes/nuevo?error=${encodeURIComponent(
        'La ubicación y el precio total del lote son obligatorios'
      )}`
    )
  }

  const { error: errorLote } = await supabase.from('lotes').insert({
    identificador,
    moneda,
    ubicacion,
    precio_total: precioTotal,
  })

  if (errorLote) {
    redirect(`/admin/lotes/nuevo?error=${encodeURIComponent(errorLote.message)}`)
  }

  redirect('/admin/lotes')
}
```

Sacar del bloque de imports, arriba del archivo, la línea `import { generarCuotas } from '@/lib/lotes/generar-cuotas'` (ya no se usa en este archivo).

- [ ] **Step 2: Sacar los 3 campos de cuotas del formulario**

En `app/admin/lotes/nuevo/page.tsx`, borrar estos tres inputs (quedan `identificador`, `ubicacion`, `precioTotal`, `moneda` y el botón):

```typescript
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
```

- [ ] **Step 3: Verificar manualmente / con build**

Run: `npm run build`
Expected: build exitoso, sin errores de tipos (no queda ninguna referencia a `cantidadCuotas`/`montoCuotaBase`/`fechaPrimeraCuota` en estos dos archivos).

- [ ] **Step 4: Commit**

```bash
git add app/admin/lotes/actions.ts app/admin/lotes/nuevo/page.tsx
git commit -m "feat: crear lote ya no pide cuotas (se definen al vender)"
```

---

### Task 5: Importación masiva deja de pedir cuotas (7 → 4 columnas)

**Files:**
- Modify: `lib/lotes/parsear-importacion.ts`
- Modify: `lib/lotes/parsear-importacion.test.ts`
- Modify: `app/admin/lotes/importar/actions.ts`
- Modify: `app/admin/lotes/importar/page.tsx`

**Interfaces:**
- Produces: `LoteAImportar` pierde `cantidadCuotas`/`montoCuotaBase`/`fechaPrimeraCuota`. `parsearLoteImportado`/`parsearTextoImportacion` mantienen su firma, pero ahora esperan filas de 4 columnas.

- [ ] **Step 1: Reescribir el test completo (falla primero)**

Reemplazar `lib/lotes/parsear-importacion.test.ts` completo:

```typescript
import { describe, expect, it } from 'vitest'
import { parsearLoteImportado, parsearTextoImportacion } from './parsear-importacion'

describe('parsearLoteImportado', () => {
  const filaValida = ['Loteo San Martín - Lote 1', 'Ruta 9 km 12', '15000', 'USD']

  it('parsea una fila completa y bien formada', () => {
    const resultado = parsearLoteImportado(filaValida, 1)
    expect(resultado).toEqual({
      identificador: 'Loteo San Martín - Lote 1',
      ubicacion: 'Ruta 9 km 12',
      precioTotal: 15000,
      moneda: 'USD',
    })
  })

  it('recorta espacios de cada celda', () => {
    const fila = ['  Lote 1  ', ' Ruta 9 ', ' 15000 ', ' USD ']
    const resultado = parsearLoteImportado(fila, 1)
    expect(resultado).toEqual({
      identificador: 'Lote 1',
      ubicacion: 'Ruta 9',
      precioTotal: 15000,
      moneda: 'USD',
    })
  })

  it('rechaza si falta el identificador', () => {
    const fila = ['', 'Ruta 9 km 12', '15000', 'USD']
    expect(parsearLoteImportado(fila, 3)).toBe('Fila 3: falta el identificador')
  })

  it('rechaza si falta la ubicación', () => {
    const fila = ['Lote 1', '', '15000', 'USD']
    expect(parsearLoteImportado(fila, 2)).toBe('Fila 2: falta la ubicación')
  })

  it('rechaza un precio total no numérico o negativo', () => {
    expect(parsearLoteImportado(['Lote 1', 'Ruta 9', 'abc', 'USD'], 1)).toMatch(
      /precio total inválido/
    )
    expect(parsearLoteImportado(['Lote 1', 'Ruta 9', '-100', 'USD'], 1)).toMatch(
      /precio total inválido/
    )
  })

  it('rechaza una moneda que no sea USD ni ARS', () => {
    expect(parsearLoteImportado(['Lote 1', 'Ruta 9', '15000', 'EUR'], 1)).toMatch(
      /la moneda tiene que ser USD o ARS/
    )
  })
})

describe('parsearTextoImportacion', () => {
  it('parsea varias filas separadas por salto de línea', () => {
    const texto = ['Lote 1\tRuta 9 km 12\t15000\tUSD', 'Lote 2\tRuta 9 km 12\t16000\tUSD'].join('\n')

    const resultado = parsearTextoImportacion(texto)
    expect('lotes' in resultado).toBe(true)
    if ('lotes' in resultado) {
      expect(resultado.lotes).toHaveLength(2)
      expect(resultado.lotes[0].identificador).toBe('Lote 1')
      expect(resultado.lotes[1].identificador).toBe('Lote 2')
    }
  })

  it('ignora líneas en blanco', () => {
    const texto = '\nLote 1\tRuta 9 km 12\t15000\tUSD\n\n'
    const resultado = parsearTextoImportacion(texto)
    expect('lotes' in resultado).toBe(true)
    if ('lotes' in resultado) {
      expect(resultado.lotes).toHaveLength(1)
    }
  })

  it('si el texto está vacío, devuelve un error', () => {
    const resultado = parsearTextoImportacion('   \n  ')
    expect('errores' in resultado).toBe(true)
  })

  it('si UNA fila tiene un error, no devuelve ningún lote (todo o nada)', () => {
    const texto = ['Lote 1\tRuta 9 km 12\t15000\tUSD', 'Lote 2\tRuta 9 km 12\tno-es-un-precio\tUSD'].join(
      '\n'
    )

    const resultado = parsearTextoImportacion(texto)
    expect('errores' in resultado).toBe(true)
    if ('errores' in resultado) {
      expect(resultado.errores).toHaveLength(1)
      expect(resultado.errores[0]).toMatch(/Fila 2/)
    }
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test -- parsear-importacion`
Expected: FAIL (el código viejo todavía espera 7 columnas y exige cuotas)

- [ ] **Step 3: Reescribir `lib/lotes/parsear-importacion.ts` completo**

```typescript
export interface LoteAImportar {
  identificador: string
  ubicacion: string
  precioTotal: number
  moneda: 'USD' | 'ARS'
}

export function parsearLoteImportado(fila: string[], numeroFila: number): LoteAImportar | string {
  const [identificador, ubicacion, precioTotalTexto, moneda] = fila.map(
    (celda) => celda?.trim() ?? ''
  )

  if (!identificador) return `Fila ${numeroFila}: falta el identificador`
  if (!ubicacion) return `Fila ${numeroFila}: falta la ubicación`

  const precioTotal = Number(precioTotalTexto)
  if (!precioTotalTexto || !Number.isFinite(precioTotal) || precioTotal <= 0) {
    return `Fila ${numeroFila}: precio total inválido ("${precioTotalTexto}")`
  }

  if (moneda !== 'USD' && moneda !== 'ARS') {
    return `Fila ${numeroFila}: la moneda tiene que ser USD o ARS ("${moneda}")`
  }

  return { identificador, ubicacion, precioTotal, moneda }
}

export function parsearTextoImportacion(
  texto: string
): { lotes: LoteAImportar[] } | { errores: string[] } {
  const lineas = texto
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0)

  if (lineas.length === 0) {
    return { errores: ['No pegaste ninguna fila'] }
  }

  const resultados = lineas.map((linea, indice) =>
    parsearLoteImportado(linea.split('\t'), indice + 1)
  )
  const errores = resultados.filter((resultado): resultado is string => typeof resultado === 'string')

  if (errores.length > 0) {
    return { errores }
  }

  return { lotes: resultados as LoteAImportar[] }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm test -- parsear-importacion`
Expected: PASS (13 tests)

- [ ] **Step 5: Simplificar `importarLotes` en `app/admin/lotes/importar/actions.ts`**

Reemplazar el archivo completo:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { parsearTextoImportacion } from '@/lib/lotes/parsear-importacion'
import { redirect } from 'next/navigation'
import { requireAdminOAcreedor } from '@/lib/auth/require-admin'

export async function importarLotes(formData: FormData) {
  await requireAdminOAcreedor()

  const texto = (formData.get('filas') as string) || ''
  const resultado = parsearTextoImportacion(texto)

  if ('errores' in resultado) {
    redirect(`/admin/lotes/importar?error=${encodeURIComponent(resultado.errores.join('\n'))}`)
  }

  const supabase = await createClient()

  for (const lote of resultado.lotes) {
    const { error: errorLote } = await supabase.from('lotes').insert({
      identificador: lote.identificador,
      ubicacion: lote.ubicacion,
      precio_total: lote.precioTotal,
      moneda: lote.moneda,
    })

    if (errorLote) {
      redirect(
        `/admin/lotes/importar?error=${encodeURIComponent(
          `No se pudo crear "${lote.identificador}": ${errorLote.message}`
        )}`
      )
    }
  }

  redirect('/admin/lotes')
}
```

- [ ] **Step 6: Actualizar instrucciones y placeholder en `app/admin/lotes/importar/page.tsx`**

Reemplazar el párrafo de instrucciones y el `placeholder` del `textarea`:

```typescript
      <p className="mb-4 text-sm text-gray-600">
        Pegá una fila por lote, tal cual se copia de una planilla de Excel (las columnas
        separadas por tabulación, no por comas). El orden de las columnas tiene que ser:
        Identificador, Ubicación, Precio total, Moneda (USD o ARS). Las cuotas no se cargan acá:
        se definen más adelante, cuando el lote se vende. Si alguna fila tiene un error, no se
        crea ningún lote hasta que las corrijas todas — así evitamos cargas parciales o con datos
        mal tipeados.
      </p>
```

```typescript
          placeholder={
            'Loteo San Martín - Lote 1\tRuta 9 km 12\t15000\tUSD\nLoteo San Martín - Lote 2\tRuta 9 km 12\t16000\tUSD'
          }
```

- [ ] **Step 7: Commit**

```bash
git add lib/lotes/parsear-importacion.ts lib/lotes/parsear-importacion.test.ts app/admin/lotes/importar/actions.ts app/admin/lotes/importar/page.tsx
git commit -m "feat: importar lotes ya no pide cuotas (4 columnas en vez de 7)"
```

---

### Task 6: Reserva con seña en $0 (venta al contado)

**Files:**
- Modify: `app/admin/lotes/[id]/reservar/actions.ts`

**Interfaces:** ninguna firma cambia.

- [ ] **Step 1: Cambiar la validación**

En `reservarLote`, reemplazar:

```typescript
  if (!Number.isFinite(montoSena) || montoSena <= 0 || montoSena > 999999999999.99) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('Ingresá un monto de seña válido, mayor a cero')}`
    )
  }
```

por:

```typescript
  if (!Number.isFinite(montoSena) || montoSena < 0 || montoSena > 999999999999.99) {
    redirect(
      `/admin/lotes/${loteId}/reservar?error=${encodeURIComponent('El monto de la seña no puede ser negativo')}`
    )
  }
```

Nota: el input HTML ya tiene `min="0"`, así que un valor negativo tipeado a mano ya lo bloquea el navegador antes de llegar acá (igual que pasa hoy con los campos `required`) — este cambio de servidor es la segunda capa de defensa, la que sí importa para que $0 (que el navegador SÍ deja pasar) sea aceptado por el backend.

- [ ] **Step 2: Verificar con build**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add app/admin/lotes/[id]/reservar/actions.ts
git commit -m "feat: permitir seña en \$0 al reservar, para ventas al contado inmediatas"
```

(El test e2e de esta regla se agrega junto con el resto de la fase 2 en Task 11, porque conviene verificarlo en el mismo archivo que ejercita todo el flujo reservar→vender.)

---

### Task 7: `requireAdministrador` redirige a `/admin/lotes` (no a `/login`) si el rol no alcanza

**Files:**
- Modify: `lib/auth/require-admin.ts`

**Interfaces:** ninguna firma cambia — solo el destino del redirect en el caso "logueado pero rol incorrecto".

**Por qué:** Task 8 va a usar `requireAdministrador()` como guard de página en `/admin/lotes/[id]/vender` (hoy usa `requireAdminSobreLote`, que deja pasar también a `acreedor`). `requireAdmin()` ya tiene este mismo fix aplicado (ver `docs/superpowers/specs/2026-08-11-reserva-lote-fase1-design.md`); `requireAdministrador()` se quedó afuera de ese arreglo. Sin este cambio, un `acreedor` que hoy es redirigido a `/admin/lotes` al entrar a `/vender` (test `visibilidad-acreedor.spec.ts`) pasaría a ser mandado a `/login`, rompiendo ese test.

- [ ] **Step 1: Cambiar el redirect**

En `lib/auth/require-admin.ts`, dentro de `requireAdministrador()`, reemplazar:

```typescript
  if (!profile || profile.role !== 'administrador') {
    redirect('/login')
  }
```

por:

```typescript
  if (!profile || profile.role !== 'administrador') {
    redirect('/admin/lotes')
  }
```

- [ ] **Step 2: Correr la suite existente que toca esta función**

Run: `npx playwright test cuenta-cobro visibilidad-acreedor`
Expected: PASS (nada debería romperse — los llamadores actuales de `requireAdministrador` son Server Actions ya protegidas también a nivel de página).

- [ ] **Step 3: Commit**

```bash
git add lib/auth/require-admin.ts
git commit -m "fix: requireAdministrador redirige a /admin/lotes, no a /login, si el rol no alcanza"
```

---

### Task 8: Gating reservado→vendido en `venderLote`

**Files:**
- Modify: `app/admin/lotes/[id]/vender/actions.ts`

**Interfaces:**
- Consumes: `requireAdministrador()` (Task 7), `calcularMontoCuota` (Task 2), `generarCuotas` (Task 3, con el 4º parámetro).
- Produces: `venderLote(loteId, formData)` ahora exige `estado === 'reservado'`, lee además `cantidadCuotas`/`fechaPrimeraCuota` de `formData`, y genera las cuotas él mismo (antes las generaba `crearLote`).

- [ ] **Step 1: Reescribir el archivo completo**

```typescript
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { calcularMontoCuota } from '@/lib/lotes/calcular-monto-cuota'
import { generarCuotas } from '@/lib/lotes/generar-cuotas'

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

  const admin = createAdminClient()

  const { data: loteActual, error: errorLoteActual } = await admin
    .from('lotes')
    .select('estado, precio_total')
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

  const { error: errorCuotas } = await admin.from('cuotas').insert(
    cuotas.map((cuota) => ({
      lote_id: loteId,
      numero: cuota.numero,
      monto_base: cuota.montoBase,
      saldo_pendiente: cuota.montoBase,
      fecha_vencimiento: cuota.fechaVencimiento,
    }))
  )

  if (errorCuotas) {
    redirect(`/admin/lotes/${loteId}/vender?error=${encodeURIComponent(errorCuotas.message)}`)
  }

  redirect('/admin/lotes')
}
```

- [ ] **Step 2: Verificar con build**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add app/admin/lotes/[id]/vender/actions.ts
git commit -m "feat: venderLote exige reservado antes, genera cuotas con monto calculado"
```

---

### Task 9: Rediseño de `/admin/lotes/[id]/vender/page.tsx`

**Files:**
- Modify: `app/admin/lotes/[id]/vender/page.tsx`

**Interfaces:**
- Consumes: `requireAdministrador()` (Task 7), `venderLote` (Task 8).

- [ ] **Step 1: Reescribir el archivo completo**

```typescript
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { requireAdministrador } from '@/lib/auth/require-admin'
import { venderLote } from './actions'

export default async function VenderLotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  await requireAdministrador()
  const { error } = await searchParams

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

          {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}

          <form action={venderLoteConId} className="flex flex-col gap-3">
            <input
              name="fullName"
              placeholder="Nombre completo del comprador"
              defaultValue={reserva?.nombre_completo ?? ''}
              required
              className="rounded border px-3 py-2"
            />
            <input
              name="email"
              type="email"
              placeholder="Email del comprador"
              defaultValue={reserva?.email ?? ''}
              required
              className="rounded border px-3 py-2"
            />
            <input
              name="cantidadCuotas"
              type="number"
              min="1"
              step="1"
              placeholder="Cantidad de cuotas (1 para venta al contado)"
              required
              className="rounded border px-3 py-2"
            />
            <label className="text-sm">
              Fecha de la primera cuota
              <input
                name="fechaPrimeraCuota"
                type="date"
                required
                className="mt-1 block w-full rounded border px-3 py-2"
              />
            </label>
            <button type="submit" className="rounded bg-black px-3 py-2 text-white">
              Confirmar venta y enviar invitación
            </button>
          </form>
        </>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Verificar con build**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add app/admin/lotes/[id]/vender/page.tsx
git commit -m "feat: pantalla de vender muestra la reserva, precarga comprador y pide cuotas"
```

---

### Task 10: Listado de lotes — "Vender" solo para lotes reservados

**Files:**
- Modify: `app/admin/lotes/page.tsx`

**Interfaces:** ninguna firma cambia.

- [ ] **Step 1: Cambiar la condición del link**

Reemplazar:

```typescript
                    {lote.estado !== 'vendido' && (
                      <a href={`/admin/lotes/${lote.id}/vender`} className="ml-3 text-sm underline">
                        Vender / asignar cliente
                      </a>
                    )}
```

por:

```typescript
                    {lote.estado === 'reservado' && (
                      <a href={`/admin/lotes/${lote.id}/vender`} className="ml-3 text-sm underline">
                        Vender / asignar cliente
                      </a>
                    )}
```

- [ ] **Step 2: Verificar con build**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add app/admin/lotes/page.tsx
git commit -m "feat: listado de lotes solo muestra Vender para lotes reservados"
```

---

### Task 11: Tests e2e de la fase 2

**Files:**
- Create: `tests/e2e/pase-a-vendido.spec.ts`

**Interfaces:**
- Consumes: `ensureTestFixtures`, `createAdminClient`, `TestFixtures` (`./fixtures/test-data`), `login`, `logout` (`./utils/login`).

- [ ] **Step 1: Escribir el archivo de tests**

```typescript
import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login, logout } from './utils/login'

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
  datos: { nombreCompleto: string; email: string; montoSena: string }
) {
  await page.goto(`/admin/lotes/${loteId}/reservar`)
  await page.getByPlaceholder('Nombre completo').fill(datos.nombreCompleto)
  await page.getByPlaceholder('DNI').fill('30111222')
  await page.getByPlaceholder('Domicilio').fill('Calle Falsa 123')
  await page.getByPlaceholder('Email').fill(datos.email)
  await page.getByPlaceholder('Teléfono', { exact: true }).fill('3511234567')
  await page.selectOption('select[name="estadoCivil"]', 'soltero')
  await page.getByPlaceholder('Monto de la seña').fill(datos.montoSena)
  await page.setInputFiles('input[name="comprobante"]', {
    name: `e2e-vender-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: COMPROBANTE_BYTES,
  })
  await page.getByRole('button', { name: 'Confirmar reserva' }).click()
  await page.waitForURL('**/admin/lotes')
}

test.describe('Pase a vendido (fase 2)', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('crear lote ya no pide cuotas', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes/nuevo')
    await expect(page.getByPlaceholder('Cantidad de cuotas')).toHaveCount(0)
    await expect(page.getByPlaceholder('Monto de cada cuota')).toHaveCount(0)
  })

  test('vender sin reservar antes es rechazado, con cartel amarillo', async ({ page }) => {
    const loteId = await crearLoteDisponibleConPrecio(`E2E Vender Sin Reserva ${Date.now()}`, 10000)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/vender`)

    await expect(page.getByText(/no está en estado reservado/)).toBeVisible()
    await expect(page.getByPlaceholder('Nombre completo del comprador')).toHaveCount(0)
  })

  test('acreedor no puede vender ni su propio lote (exclusivo del administrador)', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponibleConPrecio(
      `E2E Vender Acreedor Propio ${Date.now()}`,
      10000
    )
    await createAdminClient()
      .from('lotes')
      .update({ acreedor_id: fixtures.acreedorConDatos.id, estado: 'reservado' })
      .eq('id', loteId)

    await login(page, fixtures.acreedorConDatos.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.waitForURL('**/admin/lotes')
    await expect(page).toHaveURL(/\/admin\/lotes$/)
  })

  test('vender tras reservar: formulario precargado, cuotas generadas con monto calculado', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponibleConPrecio(`E2E Vender Completo ${Date.now()}`, 10000)

    await login(page, fixtures.vendedorSinLotes.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Juan Pérez',
      email: 'juan.perez@sima-e2e.invalid',
      montoSena: '500',
    })
    await logout(page)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto(`/admin/lotes/${loteId}/vender`)

    await expect(page.getByPlaceholder('Nombre completo del comprador')).toHaveValue('Juan Pérez')
    await expect(page.getByPlaceholder('Email del comprador')).toHaveValue(
      'juan.perez@sima-e2e.invalid'
    )

    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('3')
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin
      .from('lotes')
      .select('estado, cantidad_cuotas')
      .eq('id', loteId)
      .single()
    expect(lote?.estado).toBe('vendido')
    expect(lote?.cantidad_cuotas).toBe(3)

    const { data: cuotas } = await admin
      .from('cuotas')
      .select('numero, monto_base')
      .eq('lote_id', loteId)
      .order('numero', { ascending: true })
    expect(cuotas).toHaveLength(3)
    const suma = (cuotas ?? []).reduce((acc, c) => acc + Number(c.monto_base), 0)
    expect(Math.round(suma * 100) / 100).toBe(10000)
  })

  test('comprador distinto de quien reservó: se puede sobrescribir nombre y email', async ({
    page,
  }) => {
    const loteId = await crearLoteDisponibleConPrecio(`E2E Vender Comprador Distinto ${Date.now()}`, 6000)

    await login(page, fixtures.admin.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Pepe (reservó)',
      email: 'pepe@sima-e2e.invalid',
      montoSena: '100',
    })

    await page.goto(`/admin/lotes/${loteId}/vender`)
    await page.getByPlaceholder('Nombre completo del comprador').fill('Juan (comprador real)')
    await page.getByPlaceholder('Email del comprador').fill('juan.real@sima-e2e.invalid')
    await page.getByPlaceholder('Cantidad de cuotas (1 para venta al contado)').fill('1')
    await page.locator('input[name="fechaPrimeraCuota"]').fill('2026-09-01')
    await page.getByRole('button', { name: 'Confirmar venta y enviar invitación' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('cliente_id').eq('id', loteId).single()
    const { data: cliente } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', lote!.cliente_id)
      .single()
    expect(cliente?.full_name).toBe('Juan (comprador real)')
  })

  test('reservar con seña en $0 es aceptado (venta al contado inmediata)', async ({ page }) => {
    const loteId = await crearLoteDisponibleConPrecio(`E2E Reserva Contado ${Date.now()}`, 5000)

    await login(page, fixtures.admin.email, fixtures.password)
    await reservarLotePorUI(page, loteId, {
      nombreCompleto: 'Comprador Contado',
      email: 'contado@sima-e2e.invalid',
      montoSena: '0',
    })

    const admin = createAdminClient()
    const { data: lote } = await admin.from('lotes').select('estado').eq('id', loteId).single()
    expect(lote?.estado).toBe('reservado')
  })

  test('listado de lotes: "Vender" solo aparece para lotes reservados, no disponibles', async ({
    page,
  }) => {
    const identificadorDisponible = `E2E Listado Disponible ${Date.now()}`
    const loteId = await crearLoteDisponibleConPrecio(identificadorDisponible, 5000)

    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes')

    const fila = page.locator('table').last().getByRole('row', { name: identificadorDisponible })
    await expect(fila.getByRole('link', { name: 'Vender / asignar cliente' })).toHaveCount(0)

    await createAdminClient().from('lotes').update({ estado: 'reservado' }).eq('id', loteId)
    await page.goto('/admin/lotes')
    const filaReservada = page.locator('table').last().getByRole('row', { name: identificadorDisponible })
    await expect(filaReservada.getByRole('link', { name: 'Vender / asignar cliente' })).toBeVisible()
  })
})
```

- [ ] **Step 2: Correr toda la suite nueva**

Run: `npx playwright test pase-a-vendido`
Expected: PASS (7 tests). Si algún locator no matchea (por ejemplo por el texto exacto de un placeholder), ajustarlo para que coincida exactamente con lo escrito en Task 9 — no cambiar el criterio del test, solo el selector.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/pase-a-vendido.spec.ts
git commit -m "test: cobertura e2e de pase a vendido (fase 2)"
```

---

### Task 12: Regresión completa + limpieza de datos de prueba

**Files:** ninguno (solo comandos y, si hace falta, limpieza vía SQL).

- [ ] **Step 1: Build limpio**

Run: `npm run build`
Expected: build exitoso, cero errores de tipos.

- [ ] **Step 2: Suite unitaria completa**

Run: `npm test`
Expected: todos los tests en verde (incluye los nuevos de `calcular-monto-cuota`, `generar-cuotas`, `parsear-importacion`, más todo lo preexistente).

- [ ] **Step 3: Suite e2e completa, al menos dos corridas**

Run: `npx playwright test`
Expected: todos los tests en verde. Repetir una vez más para descartar flakes (el proyecto ya tiene un flake transitorio conocido y no relacionado en `pagos-acotados-por-acreedor.spec.ts`; si aparece, volver a correr solo ese archivo en aislado antes de asumir una regresión real).

- [ ] **Step 4: Limpiar lotes de prueba generados en esta tanda**

Con `mcp__supabase__execute_sql`, revisar qué quedó y borrar solo lo que sea basura de prueba (patrón `identificador like 'E2E %'` salvo los fixtures fijos `E2E Test Lote` y `E2E Lote Secundario`, que gestiona `ensureTestFixtures`):

```sql
select identificador, estado from public.lotes
where identificador like 'E2E %'
  and identificador not in ('E2E Test Lote', 'E2E Lote Secundario')
order by identificador;
```

Borrar los que correspondan (los `vendido` con cliente real asociado quedan, no se tocan; ver Task 8 nota de "revisión manual" si alguno quedó en un estado raro).

- [ ] **Step 5: Commit (si hubo algún ajuste de la Task 11 por locators)**

```bash
git add -A
git commit -m "test: ajustes finales de la suite e2e de pase a vendido"
```

(Si no hubo cambios pendientes de commitear, saltar este paso.)

---

### Task 13: Actualizar `Pruebas_Manuales_Pendientes.txt`

**Files:**
- Modify: `../Pruebas_Manuales_Pendientes.txt` (raíz del repo padre, un nivel arriba de `sima-inmobiliaria/`)

- [ ] **Step 1: Reescribir la sección 8.11**

Reemplazar el bloque completo de la sección `8.11 EL FLUJO VIEJO DE VENTA SIGUE EXACTAMENTE IGUAL` (desde el encabezado hasta el final de `8.11.6`, justo antes de `8.12 LIMPIEZA`) por:

```
-----------------------------------------------------------
8.11 VENDER YA NO ES UN ATAJO — SIEMPRE PASA POR RESERVADO
-----------------------------------------------------------

Esto cambió respecto a lo que probaste antes: ya NO se puede vender un
lote "disponible" directo. Primero hay que reservarlo (sección 8), y
recién desde "reservado" se puede vender. Si intentás entrar a
"Vender / asignar cliente" de un lote que no está reservado (por URL
directa, por ejemplo), el sistema te muestra un cartel amarillo en vez
del formulario — es lo esperado, no un error.

Además "Vender" ahora es EXCLUSIVO del administrador (antes también lo
podía hacer un acreedor sobre sus propios lotes). Y las cuotas (cantidad
y fecha de la primera) ya no se cargan al crear el lote: se piden recién
acá, al vender. El monto de cada cuota ya no se pide, se calcula solo
(precio total dividido la cantidad de cuotas).

AVISO IMPORTANTE: "Vender / asignar cliente" SÍ manda un email de
invitación real a la dirección que pongas. Usá un email tuyo de verdad
(o uno que controles), no uno inventado.

8.11.1 Creá un lote nuevo con "+ Nuevo lote" llamado "Venta Test 1"
       (ubicación y precio total cualquiera, por ejemplo 10000 USD).

8.11.2 Reservalo primero (igual que en la sección 8): "Reservar", completá
       el formulario con datos cualesquiera, seña por ejemplo 500, subí
       el comprobante, "Confirmar reserva".

8.11.3 Ahora sí, en la fila de "Venta Test 1" tocá "Vender / asignar
       cliente". Vas a ver un bloque gris arriba del formulario con los
       datos de la reserva (nombre, DNI, domicilio, teléfono, seña), y
       los campos "Nombre completo del comprador" / "Email del
       comprador" ya vienen completados con esos mismos datos — no hace
       falta tipearlos de nuevo si el comprador es la misma persona que
       reservó.

8.11.4 Completá "Cantidad de cuotas" (por ejemplo 24) y "Fecha de la
       primera cuota", y tocá "Confirmar venta y enviar invitación".
       Esperado: "Venta Test 1" pasa a "vendido", te llega el mail de
       invitación, y en su detalle aparecen 24 cuotas generadas con el
       monto total dividido entre esa cantidad.

8.11.5 Prueba del caso "otra persona compra": creá otro lote, reservalo
       con un nombre (por ejemplo "Pepe, hijo de Juan"), y al vender
       PISÁ el nombre/email precargados con los datos reales del
       comprador final ("Juan"). Esperado: el cliente que se da de alta
       (y el mail de invitación) usa los datos que vos escribiste al
       final, no los de la reserva — la reserva queda igual como quedó,
       solo como registro de quién hizo el trámite.

8.11.6 Prueba negativa: probá entrar a "Vender / asignar cliente" de un
       lote que esté "disponible" (sin reservar) navegando directo por
       URL. Esperado: cartel amarillo "no está en estado reservado", sin
       formulario.

8.11.7 Venta al contado: reservá un lote con "Monto de la seña" en 0 (el
       campo ahora lo permite) y vendelo enseguida con "Cantidad de
       cuotas" = 1. Esperado: reserva y venta funcionan igual que
       siempre, con una sola cuota por el precio total completo.
```

- [ ] **Step 2: Agregar una sección 9 nueva, antes de `NOTAS`**

Insertar, justo antes del encabezado `NOTAS` (al final del archivo):

```
===========================================================
9. IMPORTAR LOTES Y CREAR LOTE — YA NO PIDEN CUOTAS
===========================================================

9.1 Como admin, andá a "Lotes" → "+ Nuevo lote". El formulario ahora
    tiene 4 campos: Identificador, Ubicación, Precio total, Moneda. Ya
    no aparecen "Cantidad de cuotas", "Monto de cada cuota" ni "Fecha de
    la primera cuota" — eso se carga recién al vender (ver sección 8.11).

9.2 "Importar varios" también bajó de 7 a 4 columnas: Identificador,
    Ubicación, Precio total, Moneda. Probá pegar 2-3 filas de ejemplo
    (mirá el placeholder del cuadro de texto para el formato exacto) y
    confirmá que se crean bien, todas en estado "disponible".
```

- [ ] **Step 3: Commit**

```bash
git add "../Pruebas_Manuales_Pendientes.txt"
git commit -m "docs: actualizar pruebas manuales con el flujo de pase a vendido (fase 2)"
```

---

## Self-Review (completado antes de entregar este plan)

- **Cobertura de la spec:** los 6 puntos de "Decisiones de esta tanda" de la spec están cubiertos: gating (Task 8-10), cuotas al vender + autocálculo (Task 2-3-4-5-8-9), seña en $0 (Task 6), comprador vs. reservante (Task 9), limpieza de datos (Task 1), navegación (Task 9). El punto extra de "vender exclusivo del administrador" (ya documentado como decisión previa, no aplicado en código) se cierra en Task 7-8.
- **Placeholders:** ninguno — cada step tiene código completo, ningún "TODO" ni "similar a la Task N".
- **Consistencia de tipos/firmas:** `generarCuotas` cambia de 3 a 4 parámetros (el 4º opcional) en Task 3, y Task 8 es el único caller nuevo — usa la firma nueva correctamente. `calcularMontoCuota` se define en Task 2 y se usa tal cual en Task 8. `LoteAImportar` pierde 3 campos en Task 5 de forma consistente entre la interfaz, el parser y el test.
