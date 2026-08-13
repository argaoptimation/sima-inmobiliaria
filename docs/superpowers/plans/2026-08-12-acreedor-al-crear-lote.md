# Acreedor al crear/importar lotes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El acreedor pasa a ser obligatorio al crear un lote (individual o importado en masa): en el formulario individual se puede elegir uno existente o crear uno nuevo dinámicamente en el mismo paso; en la importación masiva, el email tiene que coincidir con un acreedor ya cargado.

**Architecture:** Se agrega `profiles.email` (nueva columna, con backfill retroactivo desde `auth.users`) como la pieza que permite resolver "¿existe ya un acreedor con este email?" tanto en la creación individual como en la masiva. La lógica de decisión (existente vs. nuevo vs. inválido) se extrae a una función pura testeable, siguiendo el patrón ya usado para el selector "Quién recibió la seña".

**Tech Stack:** Next.js 16, TypeScript, Supabase JS, Vitest, Playwright.

## Global Constraints

- Spec de referencia: `docs/superpowers/specs/2026-08-12-acreedor-al-crear-lote-design.md`.
- Cero JavaScript de cliente nuevo — el selector "existente o nuevo" muestra siempre los mismos campos, sin mostrar/ocultar nada dinámicamente (mismo criterio que el selector "Quién recibió la seña" de la reserva).
- Mensajes de error al usuario: siempre en español llano.
- En la importación masiva NO se crean cuentas de acreedor nuevas automáticamente — el email tiene que matchear una ya existente, o se rechaza todo el lote de filas.
- Working directory: `sima-inmobiliaria/`.
- La migración de la Task 1 la aplica el CONTROLLER directamente vía `mcp__supabase__apply_migration`, no un subagente (en la tanda anterior un subagente quedó bloqueado por el clasificador de permisos de Auto Mode al intentar usar esa tool — no reintentarlo desde un subagente).

---

### Task 1: Migración — `profiles.email` + backfill

**Files:**
- Create: `supabase/migrations/0013_profiles_email.sql`

**Ejecutada por el CONTROLLER, no por un subagente.**

- [ ] **Step 1: Escribir la migración**

```sql
alter table public.profiles add column email text;
create index idx_profiles_email on public.profiles(email);

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id;
```

- [ ] **Step 2: Aplicar la migración**

Verificar primero con `mcp__supabase__get_project_url` que coincide con `NEXT_PUBLIC_SUPABASE_URL` de `.env.local`. Aplicar con `mcp__supabase__apply_migration`, `name: "profiles_email"`, `query` = el contenido del Step 1.

- [ ] **Step 3: Verificar el backfill**

Con `mcp__supabase__execute_sql`:

```sql
select count(*) from public.profiles where email is null;
```

Esperado: `0` (todo `profile` existente tiene un `auth.users` correspondiente).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0013_profiles_email.sql
git commit -m "feat: agregar profiles.email, con backfill retroactivo desde auth.users"
```

---

### Task 2: Guardar `email` al crear un profile en los flujos existentes

**Files:**
- Modify: `app/admin/usuarios/actions.ts` (función `crearUsuarioStaff`)
- Modify: `app/admin/lotes/[id]/vender/actions.ts` (función `venderLote`)

**Interfaces:** ninguna firma cambia — solo se agrega un campo al `insert`.

- [ ] **Step 1: `crearUsuarioStaff`**

En `app/admin/usuarios/actions.ts`, dentro de `crearUsuarioStaff`, el `insert` a `profiles` pasa de:

```typescript
  const { error: errorProfile } = await admin
    .from('profiles')
    .insert({ id: invited.user.id, role, full_name: fullName })
```

a:

```typescript
  const { error: errorProfile } = await admin
    .from('profiles')
    .insert({ id: invited.user.id, role, full_name: fullName, email })
```

- [ ] **Step 2: `venderLote`**

En `app/admin/lotes/[id]/vender/actions.ts`, el `insert` a `profiles` pasa de:

```typescript
  const { error: errorProfile } = await admin.from('profiles').insert({
    id: invited.user.id,
    role: 'cliente',
    full_name: fullName,
  })
```

a:

```typescript
  const { error: errorProfile } = await admin.from('profiles').insert({
    id: invited.user.id,
    role: 'cliente',
    full_name: fullName,
    email,
  })
```

- [ ] **Step 3: Verificar con build**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 4: Commit**

```bash
git add app/admin/usuarios/actions.ts "app/admin/lotes/[id]/vender/actions.ts"
git commit -m "feat: guardar email en profiles al invitar staff o dar de alta un cliente"
```

---

### Task 3: `validarSeleccionAcreedor` — función pura + test

**Files:**
- Create: `lib/lotes/validar-seleccion-acreedor.ts`
- Create: `lib/lotes/validar-seleccion-acreedor.test.ts`

**Interfaces:**
- Produces: `validarSeleccionAcreedor(datos: {acreedorId: string, nombreNuevo: string, emailNuevo: string}): {tipo: 'existente', id: string} | {tipo: 'nuevo', nombre: string, email: string} | {tipo: 'invalido', error: string}`. Usada por Task 4 (`crearLote`).

- [ ] **Step 1: Escribir el test (falla primero)**

```typescript
import { describe, expect, it } from 'vitest'
import { validarSeleccionAcreedor } from './validar-seleccion-acreedor'

describe('validarSeleccionAcreedor', () => {
  it('rechaza si no se eligió nada', () => {
    const resultado = validarSeleccionAcreedor({ acreedorId: '', nombreNuevo: '', emailNuevo: '' })
    expect(resultado).toEqual({ tipo: 'invalido', error: 'Elegí un acreedor o creá uno nuevo' })
  })

  it('devuelve "nuevo" cuando se eligió crear uno y los datos están completos', () => {
    const resultado = validarSeleccionAcreedor({
      acreedorId: '__nuevo__',
      nombreNuevo: 'Carlos Martínez',
      emailNuevo: 'carlos@ejemplo.com',
    })
    expect(resultado).toEqual({
      tipo: 'nuevo',
      nombre: 'Carlos Martínez',
      email: 'carlos@ejemplo.com',
    })
  })

  it('rechaza "crear nuevo" si falta el nombre o el email', () => {
    expect(
      validarSeleccionAcreedor({ acreedorId: '__nuevo__', nombreNuevo: '', emailNuevo: 'x@x.com' })
    ).toEqual({ tipo: 'invalido', error: 'Completá el nombre y el email del acreedor nuevo' })
    expect(
      validarSeleccionAcreedor({ acreedorId: '__nuevo__', nombreNuevo: 'Carlos', emailNuevo: '' })
    ).toEqual({ tipo: 'invalido', error: 'Completá el nombre y el email del acreedor nuevo' })
  })

  it('devuelve "existente" con cualquier otro id no vacío', () => {
    const resultado = validarSeleccionAcreedor({
      acreedorId: 'abc-123',
      nombreNuevo: '',
      emailNuevo: '',
    })
    expect(resultado).toEqual({ tipo: 'existente', id: 'abc-123' })
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test -- validar-seleccion-acreedor`
Expected: FAIL (módulo no existe)

- [ ] **Step 3: Implementar**

```typescript
export type SeleccionAcreedor =
  | { tipo: 'existente'; id: string }
  | { tipo: 'nuevo'; nombre: string; email: string }
  | { tipo: 'invalido'; error: string }

export function validarSeleccionAcreedor(datos: {
  acreedorId: string
  nombreNuevo: string
  emailNuevo: string
}): SeleccionAcreedor {
  if (!datos.acreedorId) {
    return { tipo: 'invalido', error: 'Elegí un acreedor o creá uno nuevo' }
  }

  if (datos.acreedorId === '__nuevo__') {
    if (!datos.nombreNuevo || !datos.emailNuevo) {
      return {
        tipo: 'invalido',
        error: 'Completá el nombre y el email del acreedor nuevo',
      }
    }
    return { tipo: 'nuevo', nombre: datos.nombreNuevo, email: datos.emailNuevo }
  }

  return { tipo: 'existente', id: datos.acreedorId }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm test -- validar-seleccion-acreedor`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/lotes/validar-seleccion-acreedor.ts lib/lotes/validar-seleccion-acreedor.test.ts
git commit -m "feat: validarSeleccionAcreedor, decide entre acreedor existente/nuevo/invalido"
```

---

### Task 4: `crearLote` exige y resuelve el acreedor

**Files:**
- Modify: `app/admin/lotes/actions.ts` (función `crearLote`)

**Interfaces:**
- Consumes: `validarSeleccionAcreedor` (Task 3).

- [ ] **Step 1: Reescribir `crearLote`**

Reemplazar la función completa (mantener `cancelarReserva`, debajo en el mismo archivo, intacta):

```typescript
import { validarSeleccionAcreedor } from '@/lib/lotes/validar-seleccion-acreedor'

export async function crearLote(formData: FormData) {
  await requireAdmin()

  const supabase = await createClient()
  const admin = createAdminClient()

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

  const acreedorId = ((formData.get('acreedorId') as string) || '').trim()
  const acreedorNombreNuevo = ((formData.get('acreedorNombreNuevo') as string) || '').trim()
  const acreedorEmailNuevo = ((formData.get('acreedorEmailNuevo') as string) || '').trim()

  const seleccion = validarSeleccionAcreedor({
    acreedorId,
    nombreNuevo: acreedorNombreNuevo,
    emailNuevo: acreedorEmailNuevo,
  })

  if (seleccion.tipo === 'invalido') {
    redirect(`/admin/lotes/nuevo?error=${encodeURIComponent(seleccion.error)}`)
  }

  let acreedorIdFinal: string

  if (seleccion.tipo === 'nuevo') {
    const { data: invited, error: errorInvite } = await admin.auth.admin.inviteUserByEmail(
      seleccion.email
    )

    if (errorInvite || !invited.user) {
      redirect(
        `/admin/lotes/nuevo?error=${encodeURIComponent(errorInvite?.message ?? 'error desconocido')}`
      )
    }

    const { error: errorProfile } = await admin.from('profiles').insert({
      id: invited.user.id,
      role: 'acreedor',
      full_name: seleccion.nombre,
      email: seleccion.email,
    })

    if (errorProfile) {
      redirect(`/admin/lotes/nuevo?error=${encodeURIComponent(errorProfile.message)}`)
    }

    acreedorIdFinal = invited.user.id
  } else {
    const { data: acreedorExistente } = await admin
      .from('profiles')
      .select('id')
      .eq('id', seleccion.id)
      .eq('role', 'acreedor')
      .maybeSingle()

    if (!acreedorExistente) {
      redirect(`/admin/lotes/nuevo?error=${encodeURIComponent('El acreedor elegido no es válido')}`)
    }

    acreedorIdFinal = acreedorExistente!.id
  }

  const { error: errorLote } = await supabase.from('lotes').insert({
    identificador,
    moneda,
    ubicacion,
    precio_total: precioTotal,
    acreedor_id: acreedorIdFinal,
  })

  if (errorLote) {
    redirect(`/admin/lotes/nuevo?error=${encodeURIComponent(errorLote.message)}`)
  }

  redirect('/admin/lotes')
}
```

(El resto del archivo, imports existentes `createClient`/`createAdminClient`/`redirect`/`requireAdmin` ya están presentes; solo hace falta agregar el import de `validarSeleccionAcreedor` mostrado arriba.)

- [ ] **Step 2: Verificar con build**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add app/admin/lotes/actions.ts
git commit -m "feat: crearLote exige acreedor, existente o creado dinamicamente"
```

---

### Task 5: Formulario de "Nuevo lote" — selector de acreedor

**Files:**
- Modify: `app/admin/lotes/nuevo/page.tsx`

**Interfaces:**
- Consumes: `crearLote` (Task 4) — los `name` de los inputs deben calzar exacto con lo que la acción lee (`acreedorId`, `acreedorNombreNuevo`, `acreedorEmailNuevo`).

- [ ] **Step 1: Reescribir el archivo completo**

```typescript
import { createClient } from '@/lib/supabase/server'
import { requireAdminOAcreedor } from '@/lib/auth/require-admin'
import { crearLote } from '../actions'

export default async function NuevoLotePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  await requireAdminOAcreedor()

  const supabase = await createClient()
  const { data: acreedores } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'acreedor')
    .order('full_name')

  return (
    <main className="max-w-md">
      <a href="/admin/lotes" className="mb-4 inline-block text-sm underline">
        ← Volver a Lotes
      </a>
      <h1 className="mb-6 text-xl font-semibold">Nuevo lote</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      <form action={crearLote} className="flex flex-col gap-3">
        <input
          name="identificador"
          placeholder="Identificador (ej: Loteo San Martín - Manzana 3 - Lote 12)"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="ubicacion"
          placeholder="Ubicación"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="precioTotal"
          type="number"
          step="0.01"
          min="0"
          placeholder="Precio total del lote"
          required
          className="rounded border px-3 py-2"
        />
        <select name="moneda" required className="rounded border px-3 py-2">
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>

        <label className="text-sm">
          Acreedor
          <select
            name="acreedorId"
            required
            defaultValue=""
            className="mt-1 block w-full rounded border px-3 py-2"
          >
            <option value="" disabled>
              — Elegí un acreedor —
            </option>
            {(acreedores ?? []).map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.full_name}
              </option>
            ))}
            <option value="__nuevo__">+ Crear nuevo acreedor</option>
          </select>
        </label>
        <input
          name="acreedorNombreNuevo"
          placeholder="Si elegiste 'Crear nuevo acreedor': nombre completo"
          className="rounded border px-3 py-2"
        />
        <input
          name="acreedorEmailNuevo"
          type="email"
          placeholder="Si elegiste 'Crear nuevo acreedor': email"
          className="rounded border px-3 py-2"
        />

        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Crear lote
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 2: Verificar con build**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add app/admin/lotes/nuevo/page.tsx
git commit -m "feat: formulario de nuevo lote pide acreedor (existente o nuevo)"
```

---

### Task 6: Importación masiva — 5ª columna (email de acreedor)

**Files:**
- Modify: `lib/lotes/parsear-importacion.ts`
- Modify: `lib/lotes/parsear-importacion.test.ts`

**Interfaces:**
- Produces: `LoteAImportar` gana el campo `acreedorEmail: string`. `parsearLoteImportado`/`parsearTextoImportacion` mantienen su firma, ahora esperan 5 columnas.

- [ ] **Step 1: Reescribir el test completo (falla primero)**

```typescript
import { describe, expect, it } from 'vitest'
import { parsearLoteImportado, parsearTextoImportacion } from './parsear-importacion'

describe('parsearLoteImportado', () => {
  const filaValida = [
    'Loteo San Martín - Lote 1',
    'Ruta 9 km 12',
    '15000',
    'USD',
    'acreedor@ejemplo.com',
  ]

  it('parsea una fila completa y bien formada', () => {
    const resultado = parsearLoteImportado(filaValida, 1)
    expect(resultado).toEqual({
      identificador: 'Loteo San Martín - Lote 1',
      ubicacion: 'Ruta 9 km 12',
      precioTotal: 15000,
      moneda: 'USD',
      acreedorEmail: 'acreedor@ejemplo.com',
    })
  })

  it('recorta espacios de cada celda', () => {
    const fila = ['  Lote 1  ', ' Ruta 9 ', ' 15000 ', ' USD ', ' acreedor@ejemplo.com ']
    const resultado = parsearLoteImportado(fila, 1)
    expect(resultado).toEqual({
      identificador: 'Lote 1',
      ubicacion: 'Ruta 9',
      precioTotal: 15000,
      moneda: 'USD',
      acreedorEmail: 'acreedor@ejemplo.com',
    })
  })

  it('rechaza si falta el identificador', () => {
    const fila = ['', 'Ruta 9 km 12', '15000', 'USD', 'acreedor@ejemplo.com']
    expect(parsearLoteImportado(fila, 3)).toBe('Fila 3: falta el identificador')
  })

  it('rechaza si falta la ubicación', () => {
    const fila = ['Lote 1', '', '15000', 'USD', 'acreedor@ejemplo.com']
    expect(parsearLoteImportado(fila, 2)).toBe('Fila 2: falta la ubicación')
  })

  it('rechaza un precio total no numérico o negativo', () => {
    expect(
      parsearLoteImportado(['Lote 1', 'Ruta 9', 'abc', 'USD', 'acreedor@ejemplo.com'], 1)
    ).toMatch(/precio total inválido/)
    expect(
      parsearLoteImportado(['Lote 1', 'Ruta 9', '-100', 'USD', 'acreedor@ejemplo.com'], 1)
    ).toMatch(/precio total inválido/)
  })

  it('rechaza una moneda que no sea USD ni ARS', () => {
    expect(
      parsearLoteImportado(['Lote 1', 'Ruta 9', '15000', 'EUR', 'acreedor@ejemplo.com'], 1)
    ).toMatch(/la moneda tiene que ser USD o ARS/)
  })

  it('rechaza si falta el email del acreedor', () => {
    expect(parsearLoteImportado(['Lote 1', 'Ruta 9', '15000', 'USD', ''], 1)).toMatch(
      /email de acreedor inválido/
    )
  })

  it('rechaza un email de acreedor con formato inválido', () => {
    expect(
      parsearLoteImportado(['Lote 1', 'Ruta 9', '15000', 'USD', 'no-es-un-email'], 1)
    ).toMatch(/email de acreedor inválido/)
  })
})

describe('parsearTextoImportacion', () => {
  it('parsea varias filas separadas por salto de línea', () => {
    const texto = [
      'Lote 1\tRuta 9 km 12\t15000\tUSD\tacreedor1@ejemplo.com',
      'Lote 2\tRuta 9 km 12\t16000\tUSD\tacreedor2@ejemplo.com',
    ].join('\n')

    const resultado = parsearTextoImportacion(texto)
    expect('lotes' in resultado).toBe(true)
    if ('lotes' in resultado) {
      expect(resultado.lotes).toHaveLength(2)
      expect(resultado.lotes[0].identificador).toBe('Lote 1')
      expect(resultado.lotes[1].identificador).toBe('Lote 2')
    }
  })

  it('ignora líneas en blanco', () => {
    const texto = '\nLote 1\tRuta 9 km 12\t15000\tUSD\tacreedor@ejemplo.com\n\n'
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
    const texto = [
      'Lote 1\tRuta 9 km 12\t15000\tUSD\tacreedor@ejemplo.com',
      'Lote 2\tRuta 9 km 12\tno-es-un-precio\tUSD\tacreedor@ejemplo.com',
    ].join('\n')

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
Expected: FAIL (el parser viejo solo espera 4 columnas, no valida email)

- [ ] **Step 3: Reescribir `lib/lotes/parsear-importacion.ts` completo**

```typescript
export interface LoteAImportar {
  identificador: string
  ubicacion: string
  precioTotal: number
  moneda: 'USD' | 'ARS'
  acreedorEmail: string
}

const REGEX_EMAIL = /^\S+@\S+\.\S+$/

export function parsearLoteImportado(fila: string[], numeroFila: number): LoteAImportar | string {
  const [identificador, ubicacion, precioTotalTexto, moneda, acreedorEmail] = fila.map(
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

  if (!acreedorEmail || !REGEX_EMAIL.test(acreedorEmail)) {
    return `Fila ${numeroFila}: email de acreedor inválido ("${acreedorEmail}")`
  }

  return { identificador, ubicacion, precioTotal, moneda, acreedorEmail }
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

- [ ] **Step 5: Commit**

```bash
git add lib/lotes/parsear-importacion.ts lib/lotes/parsear-importacion.test.ts
git commit -m "feat: importar lotes pide email de acreedor como 5ta columna"
```

---

### Task 7: `importarLotes` resuelve el acreedor por email

**Files:**
- Modify: `app/admin/lotes/importar/actions.ts`

**Interfaces:**
- Consumes: `LoteAImportar` con `acreedorEmail` (Task 6).

- [ ] **Step 1: Reescribir el archivo completo**

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

  const emailsUnicos = [...new Set(resultado.lotes.map((lote) => lote.acreedorEmail))]

  const { data: acreedores } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('role', 'acreedor')
    .in('email', emailsUnicos)

  const idPorEmail = new Map((acreedores ?? []).map((persona) => [persona.email as string, persona.id]))

  const emailsSinAcreedor = emailsUnicos.filter((email) => !idPorEmail.has(email))

  if (emailsSinAcreedor.length > 0) {
    redirect(
      `/admin/lotes/importar?error=${encodeURIComponent(
        `Estos emails de acreedor no coinciden con ningún acreedor cargado, no se importó nada: ${emailsSinAcreedor.join(', ')}`
      )}`
    )
  }

  for (const lote of resultado.lotes) {
    const { error: errorLote } = await supabase.from('lotes').insert({
      identificador: lote.identificador,
      ubicacion: lote.ubicacion,
      precio_total: lote.precioTotal,
      moneda: lote.moneda,
      acreedor_id: idPorEmail.get(lote.acreedorEmail),
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

- [ ] **Step 2: Verificar con build**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add app/admin/lotes/importar/actions.ts
git commit -m "feat: importarLotes resuelve el acreedor por email, rechaza si no coincide"
```

---

### Task 8: Actualizar instrucciones de la pantalla de importar

**Files:**
- Modify: `app/admin/lotes/importar/page.tsx`

- [ ] **Step 1: Actualizar el párrafo de instrucciones y el placeholder**

Reemplazar:

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

por:

```typescript
      <p className="mb-4 text-sm text-gray-600">
        Pegá una fila por lote, tal cual se copia de una planilla de Excel (las columnas
        separadas por tabulación, no por comas). El orden de las columnas tiene que ser:
        Identificador, Ubicación, Precio total, Moneda (USD o ARS), Email del acreedor. El email
        de acreedor tiene que coincidir con uno ya cargado en el sistema — si todavía no existe,
        creálo primero en "Usuarios". Las cuotas no se cargan acá: se definen más adelante, cuando
        el lote se vende. Si alguna fila tiene un error, no se crea ningún lote hasta que las
        corrijas todas — así evitamos cargas parciales o con datos mal tipeados.
      </p>
```

Y el `placeholder` del `textarea`:

```typescript
          placeholder={
            'Loteo San Martín - Lote 1\tRuta 9 km 12\t15000\tUSD\tacreedor@ejemplo.com\nLoteo San Martín - Lote 2\tRuta 9 km 12\t16000\tUSD\tacreedor@ejemplo.com'
          }
```

- [ ] **Step 2: Commit**

```bash
git add app/admin/lotes/importar/page.tsx
git commit -m "docs: actualizar instrucciones de importacion masiva a 5 columnas"
```

---

### Task 9: Tests e2e + fixtures con email

**Files:**
- Create: `tests/e2e/acreedor-al-crear-lote.spec.ts`
- Modify: `tests/e2e/fixtures/test-data.ts` (función `ensureTestUser`)

**Interfaces:**
- Consumes: `ensureTestFixtures`, `createAdminClient`, `TestFixtures` (`./fixtures/test-data`), `login` (`./utils/login`). `fixtures.acreedorConDatos` ya tiene `{id, email}`.

- [ ] **Step 1: Asegurar que los fixtures de prueba tengan `email` en `profiles`**

En `tests/e2e/fixtures/test-data.ts`, dentro de `ensureTestUser`, el `upsert` a `profiles` pasa de:

```typescript
  const { error: errorProfile } = await conReintentoTransitorio(() =>
    admin.from('profiles').upsert({
      id: userId,
      role: config.role,
      full_name: config.fullName,
      alias: config.datosTransferencia?.alias ?? null,
      banco: config.datosTransferencia?.banco ?? null,
      cbu: config.datosTransferencia?.cbu ?? null,
      titular: config.datosTransferencia?.titular ?? null,
    })
  )
```

a (agrega `email: config.email`):

```typescript
  const { error: errorProfile } = await conReintentoTransitorio(() =>
    admin.from('profiles').upsert({
      id: userId,
      role: config.role,
      full_name: config.fullName,
      email: config.email,
      alias: config.datosTransferencia?.alias ?? null,
      banco: config.datosTransferencia?.banco ?? null,
      cbu: config.datosTransferencia?.cbu ?? null,
      titular: config.datosTransferencia?.titular ?? null,
    })
  )
```

Esto asegura que `fixtures.acreedorConDatos` (y el resto) tengan `profiles.email` poblado sin depender de que la migración de la Task 1 haya corrido antes de que existieran — necesario para que los tests de este archivo puedan buscar acreedores por email de forma confiable.

- [ ] **Step 2: Escribir el archivo de tests**

```typescript
import { test, expect } from '@playwright/test'
import { ensureTestFixtures, createAdminClient, TestFixtures } from './fixtures/test-data'
import { login } from './utils/login'

test.describe('Acreedor al crear/importar lotes', () => {
  let fixtures: TestFixtures

  test.beforeAll(async () => {
    fixtures = await ensureTestFixtures()
  })

  test('crear lote eligiendo un acreedor ya existente', async ({ page }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes/nuevo')

    const identificador = `E2E Lote Acreedor Existente ${Date.now()}`
    await page
      .getByPlaceholder('Identificador (ej: Loteo San Martín - Manzana 3 - Lote 12)')
      .fill(identificador)
    await page.getByPlaceholder('Ubicación').fill('Ubicación E2E')
    await page.getByPlaceholder('Precio total del lote').fill('10000')
    await page.selectOption('select[name="acreedorId"]', fixtures.acreedorConDatos.id)
    await page.getByRole('button', { name: 'Crear lote' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin
      .from('lotes')
      .select('acreedor_id')
      .eq('identificador', identificador)
      .single()
    expect(lote?.acreedor_id).toBe(fixtures.acreedorConDatos.id)
  })

  test('crear lote eligiendo "+ Crear nuevo acreedor": crea la cuenta y asocia el lote', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    await page.goto('/admin/lotes/nuevo')

    const identificador = `E2E Lote Acreedor Nuevo ${Date.now()}`
    const emailNuevo = `acreedor.nuevo.${Date.now()}@sima-e2e.invalid`
    await page
      .getByPlaceholder('Identificador (ej: Loteo San Martín - Manzana 3 - Lote 12)')
      .fill(identificador)
    await page.getByPlaceholder('Ubicación').fill('Ubicación E2E')
    await page.getByPlaceholder('Precio total del lote').fill('10000')
    await page.selectOption('select[name="acreedorId"]', '__nuevo__')
    await page
      .getByPlaceholder("Si elegiste 'Crear nuevo acreedor': nombre completo")
      .fill('Acreedor Nuevo E2E')
    await page.getByPlaceholder("Si elegiste 'Crear nuevo acreedor': email").fill(emailNuevo)
    await page.getByRole('button', { name: 'Crear lote' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin
      .from('lotes')
      .select('acreedor_id')
      .eq('identificador', identificador)
      .single()
    expect(lote?.acreedor_id).toBeTruthy()

    const { data: acreedorCreado } = await admin
      .from('profiles')
      .select('role, full_name, email')
      .eq('id', lote!.acreedor_id)
      .single()
    expect(acreedorCreado?.role).toBe('acreedor')
    expect(acreedorCreado?.full_name).toBe('Acreedor Nuevo E2E')
    expect(acreedorCreado?.email).toBe(emailNuevo)
  })

  test('importar lotes con email de acreedor existente crea los lotes asociados', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    const identificador = `E2E Import Acreedor OK ${Date.now()}`
    const fila = [identificador, 'Ubicación E2E', '5000', 'USD', fixtures.acreedorConDatos.email].join(
      '\t'
    )

    await page.goto('/admin/lotes/importar')
    await page.locator('textarea[name="filas"]').fill(fila)
    await page.getByRole('button', { name: 'Importar' }).click()
    await page.waitForURL('**/admin/lotes')

    const admin = createAdminClient()
    const { data: lote } = await admin
      .from('lotes')
      .select('acreedor_id')
      .eq('identificador', identificador)
      .single()
    expect(lote?.acreedor_id).toBe(fixtures.acreedorConDatos.id)
  })

  test('importar lotes con email de acreedor inexistente rechaza todo el lote', async ({
    page,
  }) => {
    await login(page, fixtures.admin.email, fixtures.password)
    const identificadorValido = `E2E Import Acreedor Mixto Valido ${Date.now()}`
    const identificadorInvalido = `E2E Import Acreedor Mixto Invalido ${Date.now()}`
    const emailInexistente = `no-existe-${Date.now()}@sima-e2e.invalid`
    const filas = [
      [identificadorValido, 'Ubicación E2E', '5000', 'USD', fixtures.acreedorConDatos.email].join(
        '\t'
      ),
      [identificadorInvalido, 'Ubicación E2E', '5000', 'USD', emailInexistente].join('\t'),
    ].join('\n')

    await page.goto('/admin/lotes/importar')
    await page.locator('textarea[name="filas"]').fill(filas)
    await page.getByRole('button', { name: 'Importar' }).click()

    await expect(page.getByText(/no coinciden con ningún acreedor cargado/)).toBeVisible()

    const admin = createAdminClient()
    const { data: lotesCreados } = await admin
      .from('lotes')
      .select('id')
      .in('identificador', [identificadorValido, identificadorInvalido])
    expect(lotesCreados ?? []).toHaveLength(0)
  })
})
```

Nota: el escenario "crear lote sin elegir ningún acreedor" de la spec **no** se prueba acá por e2e — el `<select required>` con la opción vacía marcada `disabled` hace que el navegador bloquee el envío antes de llegar al servidor (mismo criterio ya aplicado en este proyecto a otros campos `required`: no se automatiza lo que el navegador ya bloquea). Ese caso ya queda cubierto por el test unitario "rechaza si no se eligió nada" de la Task 3.

- [ ] **Step 3: Correr toda la suite nueva**

Run: `npx playwright test acreedor-al-crear-lote`
Expected: PASS (4 tests). Si algún locator no matchea el HTML real, ajustar el selector, no el criterio del test.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/acreedor-al-crear-lote.spec.ts tests/e2e/fixtures/test-data.ts
git commit -m "test: cobertura e2e de acreedor obligatorio al crear/importar lotes"
```

---

### Task 10: Regresión final + limpieza de datos de prueba

**Files:** ninguno (solo comandos y limpieza vía SQL).

**Ejecutada por el CONTROLLER, no por un subagente** (mismo criterio que las tandas anteriores para este tipo de tarea).

- [ ] **Step 1: Build limpio**

Run: `npm run build`
Expected: build exitoso, cero errores de tipos.

- [ ] **Step 2: Suite unitaria completa**

Run: `npm test`
Expected: todo en verde (incluye los nuevos `validar-seleccion-acreedor` y `parsear-importacion` extendido).

- [ ] **Step 3: Suite e2e completa, dos corridas**

Run: `npx playwright test`
Expected: todo en verde, dos veces, sin flakes.

- [ ] **Step 4: Limpiar datos de prueba**

Con `mcp__supabase__execute_sql` (verificar `get_project_url` contra `.env.local` antes):

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
del_profiles_clientes as (
  delete from public.profiles where id in (select cliente_id from lotes_e2e where cliente_id is not null) returning id
),
del_profiles_acreedores_nuevos as (
  delete from public.profiles where email like 'acreedor.nuevo.%@sima-e2e.invalid' returning id
)
select
  (select count(*) from del_pago_imputaciones) as imputaciones_borradas,
  (select count(*) from del_pagos) as pagos_borrados,
  (select count(*) from del_cuotas) as cuotas_borradas,
  (select count(*) from del_lotes) as lotes_borrados,
  (select count(*) from del_profiles_clientes) as profiles_clientes_borrados,
  (select count(*) from del_profiles_acreedores_nuevos) as profiles_acreedores_borrados;
```

(La última CTE, `del_profiles_acreedores_nuevos`, es nueva respecto al patrón de limpieza de tandas anteriores: los acreedores creados dinámicamente en el Step 2 de la Task 9 no cuelgan de ningún `lotes.cliente_id`, así que la limpieza por lote no los alcanza — se identifican por su email de patrón fijo `acreedor.nuevo.*@sima-e2e.invalid`, que nunca coincide con los acreedores fijos de los fixtures.)

## Self-Review (completado antes de entregar este plan)

- **Cobertura de la spec:** los 3 bloques de la spec (columna `email` compartida, crear lote individual con selector+dinámico, importación masiva estricta) están cubiertos: Task 1-2 (dato compartido), Task 3-5 (individual), Task 6-8 (masiva), Task 9 (tests), Task 10 (regresión).
- **Placeholders:** ninguno.
- **Consistencia de tipos:** `SeleccionAcreedor` se define en Task 3 y se consume tal cual en Task 4 (`seleccion.tipo`, `seleccion.error`, `seleccion.email`, `seleccion.nombre`, `seleccion.id`, todos los mismos nombres). `LoteAImportar` gana `acreedorEmail` en Task 6 y se usa con ese mismo nombre en Task 7. Los `name` de los inputs del formulario (Task 5: `acreedorId`, `acreedorNombreNuevo`, `acreedorEmailNuevo`) calzan exacto con lo que lee `crearLote` (Task 4).
- **Ajuste durante la auto-revisión:** el escenario "crear sin acreedor" de la spec se movió de e2e a unitario (ya estaba cubierto ahí desde la Task 3) porque el navegador bloquea ese envío antes de llegar al servidor — se documentó explícitamente en la Task 9 para que no se lea como una omisión.
