# Diseño: Un cliente puede tener varios lotes

**Proyecto:** SIMA Inmobiliaria (cliente: Nicolás Saieg)
**Fecha:** 2026-08-13
**Estado:** Aprobado por Gabriel (WHAPIGEN) por chat — dirección ya confirmada
("tiene que ser dinámico... no vamos a crear diez cuentas"), esta spec cierra
los detalles técnicos sin necesitar otra ronda de preguntas.

## Contexto

Encontrado durante la tanda "pase a vendido fase 2": `venderLote` siempre
invita a un usuario nuevo, así que un email que ya tiene cuenta (`cliente`)
choca con `profiles_pkey`. Gabriel confirmó que la solución correcta es que
un mismo cliente pueda comprar varios lotes bajo una sola cuenta, viendo
todos sus lotes en el portal.

Investigación previa a esta spec (ver `.superpowers/sdd/progress.md`,
tanda anterior) encontró que el problema es más profundo que `venderLote`:
**`pagos` no tiene `lote_id`** — todo el sistema resuelve "a qué lote
pertenece este pago" indirectamente, asumiendo `cliente_id → un solo lote`
(`.eq('cliente_id', ...).single()`, en 3 lugares: `confirmarPago`,
`portal-cliente/page.tsx`, `portal-cliente/pagar/[id]/page.tsx`). Con más de
un lote por cliente, esa resolución es ambigua o directamente incorrecta —
en `/admin/pagos`, un acreedor podría llegar a ver pagos de un lote que no
es suyo si el mismo cliente tiene otro lote con un acreedor distinto.

## Decisión

### 1. `pagos` gana `lote_id`

Migración: `alter table public.pagos add column lote_id uuid references public.lotes(id)`.
Se backfillea desde los datos existentes (hoy sigue siendo 1:1 cliente↔lote
para todo lo real, así que el backfill es directo: `update pagos set
lote_id = (select id from lotes where lotes.cliente_id = pagos.cliente_id)`)
y después se pone `not null`.

`registrarPago(cuotaId, formData)` (`app/portal-cliente/pagar/[id]/actions.ts`)
ya recibe `cuotaId` pero nunca lo usa para nada — se agrega una consulta a
`cuotas.select('lote_id').eq('id', cuotaId)` y ese `lote_id` se guarda en el
`insert` de `pagos`. Este es el punto de origen: de acá en más, todo pago
sabe a qué lote pertenece.

### 2. `confirmarPago` resuelve el lote por `pagos.lote_id`, no por `cliente_id`

Se reemplaza la consulta `lotes.eq('cliente_id', pago.cliente_id).single()`
por una consulta directa `lotes.eq('id', pago.lote_id).single()` (se agrega
`lote_id` al `select` inicial de `pagos`). El resto de la función
(validación de acreedor dueño, FIFO contra las cuotas de ese lote) queda
igual, porque ya operaba sobre `lote.id` una vez resuelto.

### 3. `/admin/pagos` deja de listar/atribuir por `cliente_id`

- El filtro de "pagos que le corresponden a este acreedor" pasa de
  `clienteIds` (de sus lotes) + `pagos.in('cliente_id', clienteIds)` a
  `loteIds` (de sus lotes) + `pagos.in('lote_id', loteIds)` — cierra el
  hueco real donde un acreedor podía ver el pago de un lote ajeno si el
  cliente tenía otro lote con ese acreedor.
- El mapa `acreedorPorCliente` (usado para el aviso "⚠ lote sin acreedor
  vinculado") pasa a `acreedorPorLote`, resuelto directamente por
  `pago.lote_id` en vez de por `cliente_id` — hoy, si un cliente tuviera 2
  lotes con acreedores distintos, ese mapa se pisaba y atribuía el pago al
  acreedor equivocado.
- Se agrega una columna "Lote" a la tabla (el `identificador`), para que sea
  legible a qué lote corresponde cada pago cuando un cliente tiene más de
  uno.

### 4. `venderLote` reutiliza un cliente existente por email

Antes de invitar, se busca `profiles.select('id').eq('email', email).eq('role', 'cliente').maybeSingle()`.
- Si existe: se usa ese id directo como `cliente_id` del lote. No se invita
  de nuevo (ya tiene cuenta), no se toca su `full_name` existente (evita
  pisarlo si el nombre tipeado esta vez difiere levemente).
- Si no existe: se crea como hoy (invite + insert en `profiles`).

### 5. Portal del cliente: de "un lote" a "lista de lotes"

- `app/portal-cliente/page.tsx` pasa a listar TODOS los lotes con
  `cliente_id = user.id` (0, 1 o varios). Si no hay ninguno, mismo mensaje
  de siempre ("Todavía no tenés un lote asignado"). Si hay uno o más, tabla
  simple (identificador, estado de cobranza resumido) con link a cada uno.
- Contenido nuevo: `app/portal-cliente/lotes/[id]/page.tsx` — es básicamente
  el contenido actual de `portal-cliente/page.tsx` (tabla de cuotas, "Mis
  pagos", link para pagar la próxima), pero:
  - Verifica que `lote.cliente_id === user.id` antes de mostrar nada (si no,
    `notFound()` — mismo criterio que el resto del proyecto para accesos no
    autorizados a un recurso por id).
  - "Mis pagos" se filtra por `pagos.eq('lote_id', id)` en vez de por
    `cliente_id` a secas — así cada lote muestra solo sus propios pagos.
- `app/portal-cliente/pagar/[id]/page.tsx` (donde `id` es un `cuotaId`, no
  un lote): la consulta de `cuenta_cobro_id` hoy usa
  `lotes.eq('cliente_id', user.id).single()` — con más de un lote esto
  resuelve el lote equivocado (o explota). Se cambia para resolver primero
  el `lote_id` de la cuota (`cuotas.eq('id', cuotaId).select('lote_id')`),
  y sobre ESE lote traer `cuenta_cobro_id` — de paso, se agrega una
  verificación de que ese lote sea realmente del cliente logueado antes de
  mostrar nada (hoy no lo verificaba en absoluto, confiaba ciegamente en
  que el `cuotaId` de la URL fuera del cliente correcto).

## Fuera de alcance de esta tanda

- Migrar datos reales existentes más allá del backfill automático de
  `pagos.lote_id` (no hace falta nada manual, es 1:1 hoy).
- Un límite de cuántos lotes puede tener un cliente — no se pone ninguno.
- Cambiar el mecanismo de invitación en sí (`inviteUserByEmail`) — sigue
  igual para clientes nuevos.

## Testing

- Unitario: no hace falta ninguno nuevo puro — todo el cambio es de
  queries/orquestación, se prueba con e2e contra la base real.
- E2E (extendiendo o creando `tests/e2e/cliente-varios-lotes.spec.ts`):
  - Vender un segundo lote al mismo email ya cliente → NO se manda invite
    nuevo, el `cliente_id` del segundo lote es el mismo id que el primero,
    y el portal del cliente lista los 2 lotes.
  - Pagar una cuota del lote A y confirmar el pago → solo se descuenta
    saldo de cuotas del lote A, las del lote B (mismo cliente) quedan
    intactas.
  - Un acreedor dueño del lote A pero NO del lote B (mismo cliente,
    distinto acreedor) → en `/admin/pagos` ve el pago del lote A, NO ve el
    del lote B.
  - `/portal-cliente/pagar/[id]` con la cuota de un lote ajeno (de otro
    cliente) → rechazado, no se muestra el formulario.
- Regresión completa (build + unitarios + e2e x2) antes de cerrar, mismo
  criterio de siempre.
