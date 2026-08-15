# Diseño: Múltiples participantes por lote

**Proyecto:** SIMA Inmobiliaria (cliente: Nicolás Saieg)
**Fecha:** 2026-08-15
**Estado:** Aprobado por Gabriel (WHAPIGEN) por chat

## Contexto

Hoy la sección "Cobro" de un lote tiene 3 casilleros fijos: `lotes.admin_id`,
`lotes.acreedor_id`, `lotes.vendedor_id`. Nicolás pidió, en la reunión
transcripta por Gabriel el 14/08/2026, poder sumar más participantes a un
mismo lote — el ejemplo real que dio fue dos vendedores compartiendo la
comisión de una misma venta (`Notas_Decisiones_SIMA.txt` punto 30).

Esta es la segunda pieza de la cadena que arrancó con "cuentas externas"
(punto 27, ya construida) y sigue con "distribución manual por cuota"
(punto 31, próxima pieza): Nicolás decidió que el reparto entre
participantes se va a cargar **a mano, cuota por cuota** — no hace falta
ningún algoritmo de prioridad ni cascada automática. Para que esa pantalla
futura tenga de dónde leer "a quién se le puede asignar plata en este
lote", primero hace falta la lista de participantes en sí. Eso es lo único
que construye esta pieza: **quiénes participan**, sin montos ni
porcentajes todavía.

## Decisión de alcance: extensión aditiva, no reemplazo

`admin_id`, `acreedor_id` y `vendedor_id` **no se tocan**. Siguen
gobernando, exactamente como hoy:

- Permisos (un acreedor solo ve/edita sus propios lotes, vía `acreedor_id`).
- Confirmación cruzada de pagos (`confirmarPago` sigue chequeando
  `lote.acreedor_id` específicamente).
- Auto-asignación de vendedor al reservar (`reservar/actions.ts`).

Reemplazar esas columnas por una tabla de participantes fue evaluado y
descartado para esta pieza: implicaría tocar permisos, el flujo de
reserva y la confirmación cruzada al mismo tiempo — ese último rediseño ya
está planeado aparte (`Notas_Decisiones_SIMA.txt` punto 6/35) y no
conviene mezclarlo acá. En cambio, se agrega una tabla nueva
**solo para participantes adicionales**: gente que comparte la comisión
de un lote pero no necesita ningún permiso especial ni cambia cómo se
confirma un pago.

## Modelo de datos

```sql
create table public.lote_participantes (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes(id) on delete cascade,
  profile_id uuid references public.profiles(id),
  cuenta_externa_id uuid references public.cuentas_externas(id),
  etiqueta text,
  created_at timestamptz not null default now(),
  constraint lote_participantes_uno_u_otro check (
    (profile_id is not null and cuenta_externa_id is null)
    or (profile_id is null and cuenta_externa_id is not null)
  ),
  unique (lote_id, profile_id),
  unique (lote_id, cuenta_externa_id)
);
```

- `profile_id` **o** `cuenta_externa_id`, nunca los dos — mismo patrón que
  ya usan `lotes.cuenta_cobro_id`/`cuenta_cobro_externa_id`, pero acá sí
  se refuerza con un `check` de Postgres (no solo validación en el server
  action): esta tabla no tiene ningún otro campo que dependa de cuál de
  los dos está seteado, así que el constraint no estorba y da una garantía
  extra a nivel de base.
- Los dos `unique` (uno por columna) son la forma estándar en Postgres de
  evitar duplicados cuando la fila puede tener cualquiera de dos FKs
  nulables: un `unique(lote_id, profile_id)` normal ya ignora las filas
  con `profile_id null` (el estándar SQL no compara `null` como igual a
  `null`), así que no hace falta un índice parcial a mano.
- `etiqueta`: texto libre opcional (ej. "Vendedor 2", "Corralón
  materiales") para que Nicolás distinga participantes cuando el rol del
  profile no alcanza para explicar por qué está ahí (ej. dos personas con
  rol `vendedor` en el mismo lote). No es un enum — no hay un conjunto
  cerrado de roles posibles para "por qué participa este lote".
- Sin columnas de monto/porcentaje/orden: eso es exactamente lo que
  construye la próxima pieza (punto 31).

## Quién puede agregarse como participante adicional

- Cualquier `profile` con rol `administrador`, `acreedor` o `vendedor`
  (mismo universo que ya usa el selector de "Cobro" — no `cliente` ni
  `cobrador`, que no participan de la distribución de comisiones).
- Cualquier `cuenta_externa` existente.
- **Bloqueado**: agregar a alguien que ya es `admin_id`, `acreedor_id` o
  `vendedor_id` de ese mismo lote — ya está en la lista implícita de
  "principales", sumarlo de nuevo acá sería redundante y confuso para
  cuando se construya la distribución manual por cuota. Se valida en el
  server action con un mensaje de error claro, no con un constraint de
  base (depende de leer las tres columnas de `lotes`, no solo de esta
  tabla).

## UI — sección nueva en el detalle del lote

Debajo de la sección "Cobro" ya existente (mismo bloque exclusivo de
administrador), una subsección "Participantes adicionales":

- Listado de participantes actuales (nombre o nombre de cuenta externa +
  etiqueta si tiene) con un botón para quitar cada uno.
- Formulario para agregar: selector de "persona con cuenta" (profiles con
  rol admin/acreedor/vendedor, excluyendo a quienes ya son
  admin_id/acreedor_id/vendedor_id de este lote) **o** "cuenta externa"
  (mismo patrón de selector unificado que ya usa "Cuenta de cobro", con
  prefijo `externa:` para distinguir el tipo en un único `<select>`) +
  campo de etiqueta opcional.
- Quitar un participante que está seteado como `cuenta_cobro_id`/
  `cuenta_cobro_externa_id` actual del lote queda bloqueado (mismo
  criterio que ya usa `eliminarCuentaExterna`): hay que reasignar la
  cuenta de cobro a otra persona antes de poder quitarlo de la lista de
  participantes.

## Selector de "Cuenta de cobro" — se amplía de nuevo

Mismo criterio ya usado para sumar las cuentas externas (spec anterior):
el selector de "Cuenta de cobro" del lote pasa a incluir también a los
participantes adicionales del lote (tanto profiles como cuentas
externas), con el mismo requisito de `tieneDatosTransferencia` que ya
aplica a admin/acreedor/vendedor/cuentas externas. Esto es lo que permite
el escenario real que motivó todo esto: vendedor 1 sigue siendo la cuenta
de cobro (recibe la transferencia completa de la cuota, cláusula "Opción
A" ya confirmada por Nicolás en el punto 29), mientras vendedor 2
participa del lote como participante adicional para cuando se cargue su
parte a mano en la distribución por cuota.

`actualizarCobro` (`app/admin/lotes/[id]/actions.ts`) se extiende: si el
valor recibido no es ninguno de admin/acreedor/vendedor del lote ni
`externa:<uuid>`, se busca entre `lote_participantes` de ese lote — si
coincide con un `profile_id`, se guarda en `cuenta_cobro_id`; si coincide
con un `cuenta_externa_id`, se guarda en `cuenta_cobro_externa_id` (mismo
destino final que ya existe hoy, no se agrega ninguna columna nueva para
esto). La validación de "tiene que estar asociado al lote" que hoy exige
que `cuentaCobroId` sea uno de los tres roles principales se amplía para
aceptar también cualquier `profile_id` presente en
`lote_participantes` de ese lote.

## Confirmación cruzada de pagos — sin cambios

No se toca `confirmarPago`. Sigue chequeando `lote.acreedor_id`
específicamente para el lado del acreedor, y `cuenta_cobro_externa_id`
para saber si alcanza con una sola confirmación. Un participante
adicional que termine siendo la cuenta de cobro de una cuota puntual
**no** dispara ninguna confirmación especial de su parte — sigue
aplicando la misma regla de siempre (acreedor + admin, o solo admin si es
una cuenta externa). Ampliar quién confirma según quién es realmente el
destinatario de la transferencia es exactamente el rediseño de
confirmación cruzada ya identificado como pieza aparte (punto 6/35) —
fuera de alcance acá.

## Fuera de alcance (piezas relacionadas, ya designadas aparte)

- Distribución manual por cuota (punto 31): montos/porcentajes por
  participante y por cuota — la próxima pieza, depende de esta.
- Rediseño completo de confirmación cruzada (punto 6/35).
- Reemplazar `admin_id`/`acreedor_id`/`vendedor_id` por esta misma tabla
  — evaluado y descartado para esta pieza (ver "Decisión de alcance"
  arriba).
- Cualquier permiso nuevo derivado de ser participante adicional (ej. un
  vendedor 2 no gana acceso a nada que no tuviera ya por su rol).

## Testing

- Agregar un participante adicional (profile con rol vendedor/acreedor/
  administrador) a un lote.
- Agregar un participante adicional que es una cuenta externa.
- Prueba negativa: agregar como participante a alguien que ya es
  admin_id/acreedor_id/vendedor_id de ese mismo lote se rechaza con
  mensaje claro.
- Prueba negativa: agregar dos veces al mismo profile o a la misma cuenta
  externa en el mismo lote se rechaza (constraint `unique`).
- Un participante adicional (profile o cuenta externa) aparece como
  opción válida en el selector de "Cuenta de cobro" del lote, solo si
  tiene datos de transferencia completos.
- Seleccionar a un participante adicional como cuenta de cobro y guardar
  funciona igual que seleccionar al acreedor/vendedor principal.
- Quitar un participante que NO es la cuenta de cobro actual funciona.
- Prueba negativa: quitar un participante que SÍ es la cuenta de cobro
  actual del lote se rechaza con mensaje claro.
- Un acreedor o vendedor (no admin) no puede agregar/quitar participantes
  ni ve la subsección — mismo criterio de acceso que el resto de "Cobro".
- Confirmar un pago de un lote con participantes adicionales sigue
  funcionando exactamente igual que antes (sin participantes adicionales
  no cambia nada de `confirmarPago`).
