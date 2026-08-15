# Diseño: Cuentas externas (acreedores sin login)

**Proyecto:** SIMA Inmobiliaria (cliente: Nicolás Saieg)
**Fecha:** 2026-08-14
**Estado:** Aprobado por Gabriel (WHAPIGEN) por chat

## Contexto

Hoy la "cuenta de cobro" de un lote (a quién se le transfiere el dinero de
una cuota, `lotes.cuenta_cobro_id`) solo puede apuntar a alguien con cuenta
de usuario en el sistema — admin, acreedor o vendedor de ese lote
específico (ver `docs/superpowers/specs/2026-08-04-cuentas-cobro-y-gestion-de-lotes-design.md`).

Nicolás (dueño real del negocio) pidió, en una reunión transcripta por
Gabriel el 14/08/2026, poder redirigir el pago de una cuota a personas o
comercios que **no tienen ningún usuario ni login** en SIMA. Ejemplo real
que dio: le debe plata a un corralón por materiales de construcción, y en
vez de cobrar él la cuota de un cliente y pagarle aparte al corralón,
prefiere que esa cuota se transfiera directo a la cuenta del corralón,
saldando la deuda en el mismo movimiento.

Restricción técnica real que condiciona el diseño: `profiles.id` tiene una
referencia estricta `references auth.users(id) on delete cascade`
(`supabase/migrations/0001_core_schema.sql`) — toda fila de `profiles` hoy
corresponde obligatoriamente a alguien con login real. No se puede modelar
un "acreedor sin login" como una fila más de `profiles`; necesita una
tabla completamente aparte, sin relación con `auth.users`.

Esta es la primera pieza de una cadena más grande (cuentas externas →
cuenta de cobro ampliada → múltiples participantes por lote → distribución
manual por cuota, ver `Notas_Decisiones_SIMA.txt` puntos 27-31), elegida
como punto de partida por ser la más fundacional y autocontenida.

## Modelo de datos

Dos tablas nuevas:

```sql
create table public.cuentas_externas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  titular text,
  alias text,
  banco text,
  cbu text,
  created_at timestamptz not null default now()
);

create type public.movimiento_tipo as enum ('debito', 'credito');

create table public.cuentas_externas_movimientos (
  id uuid primary key default gen_random_uuid(),
  cuenta_externa_id uuid not null references public.cuentas_externas(id),
  tipo public.movimiento_tipo not null,
  monto numeric(14,2) not null,
  moneda public.moneda not null,
  concepto text not null,
  pago_id uuid references public.pagos(id),
  cargado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.lotes
  add column cuenta_cobro_externa_id uuid references public.cuentas_externas(id);
```

- `débito` = lo que Nicolás le debe a esa cuenta externa (aumenta el saldo
  pendiente). `crédito` = lo que ya se le pagó/transfirió (lo reduce).
- El saldo se calcula al vuelo sumando débitos menos créditos — no se
  materializa ninguna columna de "saldo actual". El volumen de movimientos
  por cuenta externa va a ser bajo, no hace falta optimizar esto.
- `pago_id` queda `null` en los movimientos manuales (deuda cargada a
  mano) y apunta al pago real en los créditos automáticos (ver más abajo)
  — así queda trazado de qué cobro salió cada crédito.
- `lotes.cuenta_cobro_externa_id` es hermana de `lotes.cuenta_cobro_id`
  (que ya existe, apunta a `profiles`) — nunca las dos a la vez. Se valida
  en el server action (no con un `check` de Postgres): como máximo una de
  las dos puede estar seteada.
- Sin moneda única en `cuentas_externas`: cada movimiento lleva la suya
  propia (mismo criterio que el resto del proyecto, sin conversión
  automática entre monedas — el saldo se muestra agrupado por moneda si
  hay de las dos).

## Alta y gestión — sección nueva "Cuentas externas"

Nueva sección en el menú, exclusiva del administrador (mismo patrón que
"Usuarios" o "Clientes" — no encaja en "Usuarios" porque esa pantalla es
gente con login real).

- **Listado**: nombre + saldo actual de cada cuenta externa.
- **Alta**: nombre del destinatario + datos de transferencia (titular,
  alias, banco, CBU opcional — mismo shape que ya usa
  `lib/lotes/validar-cuenta-cobro.ts`), más una deuda inicial opcional
  (monto, moneda, concepto). Si se completa la deuda inicial, se crea
  automáticamente el primer movimiento (`tipo: 'debito'`).
- **Detalle**: datos de la cuenta (editables en cualquier momento) +
  tabla de movimientos (fecha, concepto, tipo, monto, moneda) ordenada
  por fecha, con el saldo actual bien visible arriba. Un formulario chico
  para agregar deuda pendiente en cualquier momento (monto + moneda +
  concepto libre) — no solo al crear la cuenta. Esto es explícitamente
  distinto de una pantalla genérica de "otros movimientos" compartida
  entre todos los acreedores (con selector de a quién se le debe/quién
  debe) — esa pieza más grande queda para después; acá el formulario es
  específico de cada cuenta externa, simple.
- **Eliminar**: bloqueado si la cuenta tiene algún movimiento o está
  asignada como `cuenta_cobro_externa_id` de algún lote — mismo criterio
  de "no borrar historial" que ya usa el resto del proyecto
  (`eliminarUsuarioStaff`, `eliminarCliente`, `eliminarLote`).

## Selector de cuenta de cobro — se amplía

En la sección "Cobro" del detalle de cualquier lote, el selector de
"Cuenta de cobro" pasa a incluir, además del admin/acreedor/vendedor ya
asignados a ESE lote (como hoy), **todas las cuentas externas existentes**
— lista global, sin necesidad de asociarlas antes al lote (confirmado
explícitamente por Gabriel: la deuda del corralón no está ligada a un
lote en particular, puede saldarse con la cuota de cualquier cliente).

`actualizarCobro` (`app/admin/lotes/[id]/actions.ts`) se extiende: si
viene un `cuentaCobroExternaId`, valida que exista en `cuentas_externas`
(sin el chequeo de "tiene que ser uno de los tres roles del lote" que
aplica hoy a `cuentaCobroId`) y lo guarda en la columna nueva, dejando
`cuenta_cobro_id` en `null` (y viceversa).

Mismo criterio que ya existe para `cuenta_cobro_id`: una cuenta externa
sin datos de transferencia completos (`tieneDatosTransferencia` —
titular, alias y banco; el CBU sigue opcional) no puede elegirse como
cuenta de cobro — se puede crear la cuenta externa con datos incompletos
(por ejemplo, para dejarla cargada de antemano), pero no seleccionarla
todavía hasta completarlos.

## Créditos automáticos al confirmar un pago

Cuando se confirma un pago cuyo lote tiene `cuenta_cobro_externa_id`
seteado, se genera automáticamente un movimiento `tipo: 'credito'` en
`cuentas_externas_movimientos` por el monto confirmado del pago, con
`pago_id` vinculado y un concepto autogenerado (ej. "Pago de cuota — Lote
{identificador} — {nombre del cliente}").

## Confirmación con un solo lado cuando el destino es una cuenta externa

Una cuenta externa no tiene login — no tiene sentido pedirle que confirme
nada. En `confirmarPago` (`app/admin/pagos/actions.ts`):

- Se resuelve, junto con el lote, si `cuenta_cobro_externa_id` está
  seteado.
- Si lo está, el "claim atómico" (el `update` que pasa `estado` a
  `'confirmado'` y dispara el FIFO) deja de exigir
  `confirmado_acreedor_por` no nulo — alcanza con `confirmado_admin_por`.
  El resto del mecanismo (guarda atómica del monto, limpieza de la
  confirmación del otro lado si hubo edición, `imputarPagoFIFO`) sigue
  exactamente igual.
- En `/admin/pagos`, la fila de un pago así no muestra ninguna acción de
  "confirmar como acreedor" — no hay nadie que pueda hacerlo. Se muestra
  como si ese lado ya no aplicara (no como "pendiente" de algo que nunca
  va a pasar).

Esto es un cambio puntual y acotado, no el rediseño completo del circuito
de confirmación cruzada (orden secuencial, quién puede editar el monto,
etc. — ver `Notas_Decisiones_SIMA.txt` punto 6/35) — ese sigue siendo una
pieza aparte, fuera de alcance de este spec.

## Fuera de alcance (piezas relacionadas, ya designadas aparte)

- Pestaña genérica de "otros movimientos" compartida entre todos los
  acreedores (con o sin login), con selector de a quién se le debe/quién
  debe — se construye después, sobre la base de esta pieza.
- "Múltiples participantes por lote" (lista libre, no solo 3 casilleros
  fijos) y "distribución manual por cuota" — dependen de esto pero son
  piezas posteriores.
- Rediseño completo del circuito de confirmación cruzada (orden
  secuencial destinatario→admin, quién puede editar el monto en general).
- Conversión automática entre monedas — sigue sin existir en ningún lado
  del proyecto, tampoco acá.

## Testing

- Alta de una cuenta externa (con y sin deuda inicial).
- Agregar deuda pendiente desde el detalle, en más de una oportunidad.
- El saldo mostrado refleja correctamente débitos menos créditos.
- Seleccionar una cuenta externa como cuenta de cobro de un lote (sin
  necesidad de asociarla antes).
- Confirmar un pago hacia una cuenta externa: alcanza con la confirmación
  del admin, se genera el crédito automático vinculado al pago, el FIFO
  imputa igual que siempre.
- Eliminar una cuenta externa sin movimientos ni lotes asociados funciona;
  con cualquiera de los dos, se rechaza con mensaje claro.
- Un acreedor/vendedor (no admin) no puede acceder a "Cuentas externas"
  ni a sus acciones por URL directa.
