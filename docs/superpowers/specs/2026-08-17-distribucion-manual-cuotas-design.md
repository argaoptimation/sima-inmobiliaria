# Distribución manual por cuota — Diseño

**Origen:** punto 31 de `Notas_Decisiones_SIMA.txt`. Nicolás, en la reunión del
14/08/2026, descartó un motor automático de reparto de comisiones (orden de
prioridad, cascada dentro de una cuota) a favor de cargar todo A MANO, CUOTA
POR CUOTA: para cada cuota de un lote, escribir libremente cuánto le
corresponde en $ a cada participante (ejemplo suyo: cuota de $1.500 → $800 al
acreedor, $300 para Nicolás, $200 y $200 para dos vendedores), pudiendo
modificar una cuota puntual después sin problema.

Depende de dos piezas ya construidas, exploradas antes de diseñar esto:
- `lote_participantes` (punto 30): lista de quiénes participan de un lote,
  más allá de admin/acreedor/vendedor — hoy sin ningún monto asociado.
- `cuentas_externas` + `cuentas_externas_movimientos` (punto 27): cuenta
  corriente simple (débitos/créditos) para personas/comercios sin login,
  pero solo se acredita automático cuando la cuenta externa ES la cuenta de
  cobro completa del lote — nunca un reparto entre varios.

Ninguna de las dos piezas alcanza para esto: la distribución que pide
Nicolás es independiente de `lote_participantes` (ver más abajo) y no existe
ninguna cuenta corriente hoy para perfiles internos (admin/acreedor/
vendedor/cobrador).

## Decisiones tomadas en la conversación con Gabriel (17/08/2026)

1. **Los beneficiarios de una cuota NO requieren estar pre-registrados como
   "participante" del lote.** Cualquier profile con rol administrador,
   acreedor, vendedor o cobrador, o cualquier cuenta externa del sistema,
   puede recibir parte de una cuota — sin relación previa con ese lote
   puntual. `lote_participantes` sigue existiendo tal cual está, para su
   propósito original (registro/reporte de quién participa de qué lote —
   "vendedor 1 vendió tantos lotes", etc.), pero es un mecanismo aparte, no
   un prerrequisito de esta pieza.
2. **La suma cargada en una cuota nunca bloquea el guardado** — ni contra el
   monto de la cuota, ni contra ningún objetivo. Es puramente informativo,
   mismo criterio que el balance del modo manual al vender (punto 32).
3. **Se edita desde una pantalla propia del lote, en cualquier momento**,
   no como parte del formulario de vender. Cada cuota se puede modificar
   después sin perder lo demás.
4. **Hay un monto objetivo OPCIONAL por participante y por lote** (ej.
   "vendedores: $1.000 en total de este lote", "admin: $8.000", "acreedor:
   $50.000"). El resumen del lote compara lo acumulado en las cuotas contra
   ese objetivo y marca "Saldado" cuando se alcanza o supera; si no hay
   objetivo cargado para alguien, el resumen solo muestra su acumulado.
5. **El resumen es POR LOTE, no consolidado entre todos los lotes de una
   persona.** Ver un resumen cruzando todos los lotes de un mismo
   participante (ej. "cuánto le corresponde a vendedor 1 en total, sumando
   todos sus lotes") queda para una pieza futura aparte.
6. **El resumen tiene que actualizarse EN VIVO mientras se cargan varias
   cuotas seguidas**, sin recargar página entre una y otra — al tipear los
   montos de la cuota 1, ya se tiene que ver bajar el saldo pendiente de
   cada participante contra su objetivo; al pasar a la cuota 2, seguir
   viéndolo bajar; etc. Esto requiere que el estado de TODAS las cuotas del
   lote viva junto en un solo componente de cliente (no cada cuota
   recalculando recién después de guardar).
7. **El guardado es un solo botón "Guardar distribución" para todo el
   lote** — se edita lo que haga falta (una cuota o varias), se ve el
   resumen en vivo, y un solo envío manda todo junto al servidor. No hay
   guardado independiente por cuota.
8. **Registrar el movimiento real de plata (Nicolás transfiriéndole a cada
   participante lo que le corresponde) queda explícitamente FUERA de
   alcance** — Gabriel lo nombró como "solapa de movimientos", pieza
   futura aparte. Esta tanda es solo la distribución planificada/
   informativa y el resumen de cuánto lleva acumulado cada uno, no un
   registro de pagos reales.
9. **No se toca nada de comisión de vendedor (punto 21) ni seña
   autodeclarada (punto 23)** — el "objetivo" de esta pieza es un campo
   libre que Nicolás carga a mano, sin ningún cálculo automático detrás.

## Modelo de datos

Dos tablas nuevas, mismo patrón "uno u otro" que ya usa `lote_participantes`
(un participante es un `profile_id` O un `cuenta_externa_id`, nunca los
dos, nunca ninguno):

```sql
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

Sin columna de moneda en ninguna de las dos: el monto siempre está en la
moneda del lote (`lotes.moneda`) — no hay conversión de moneda en ningún
lado del sistema, decisión ya tomada (punto 10).

El "resumen del lote" (acumulado por participante, comparado contra su
objetivo) se calcula al vuelo desde estas dos tablas — no se guarda ningún
total pre-calculado, mismo criterio que el saldo de cuentas externas
(`calcularSaldoPorMoneda`) o el balance del modo manual al vender.

## Pantalla nueva: `/admin/lotes/[id]/distribucion`

Exclusiva de administrador (`requireAdministrador`), solo accesible cuando
`lote.estado === 'vendido'` (recién ahí existen cuotas) — mismo criterio de
guarda que ya usa el resto del detalle del lote. Un link nuevo desde
`/admin/lotes/[id]` ("Ver / editar distribución de cuotas →", junto a la
sección "Cuotas" que ya existe) lleva acá.

**Server component (`page.tsx`):** carga el lote, sus cuotas
(`numero`, `monto_base`, `fecha_vencimiento`), los objetivos ya cargados
(`lote_distribucion_objetivos`), las distribuciones ya cargadas por cuota
(`cuota_distribuciones`), y la lista de participantes elegibles: todos los
`profiles` con rol `administrador`/`acreedor`/`vendedor`/`cobrador`, más
todas las `cuentas_externas` — para poblar los selectores. Todo esto se le
pasa como props al componente de cliente.

**Componente de cliente nuevo, `DistribucionCuotas.tsx`** (`"use client"`,
mismo patrón de ubicación/estructura que `CuotasYDocumento.tsx` — vive
junto a la página que lo usa, sin fetch propio, todo dentro de un único
`<form action={guardarDistribucionConId}>`):

- Estado local único para TODO el lote: por cada cuota, una lista editable
  de filas `{ participanteKey, monto }` (agregar/quitar fila); por
  separado, una lista editable de objetivos `{ participanteKey,
  montoObjetivo }`. Inicializado desde las props (lo ya guardado en la
  base).
- Selector de participante: un `<select>` que junta profiles elegibles
  (`profile:<id>`) y cuentas externas (`externa:<id>`) — mismo truco de
  prefijo ya usado en `agregarParticipante`.
- **Resumen del lote**, recalculado en el cliente en cada cambio (sin red):
  para cada participante que aparece en al menos un objetivo o al menos una
  fila de distribución de cualquier cuota del lote, suma su monto en todas
  las cuotas (estado local, no solo lo persistido) y lo compara contra su
  objetivo si tiene uno: "Saldado" cuando acumulado ≥ objetivo, o "$X de
  $Y, faltan $Z" — sin objetivo, solo muestra el acumulado. Se actualiza al
  instante mientras se tipea, cruzando todas las cuotas ya cargadas en la
  sesión de edición, tal como pidió Gabriel.
- Un solo botón "Guardar distribución" al final de la página — junta todo
  el estado (objetivos + distribución de cada cuota) en el `FormData` y lo
  manda en un solo envío, igual que ya hace `CuotasYDocumento`.

**Server Action `guardarDistribucionLote(loteId, formData)`:**
reemplazo completo (no diff): borra todas las filas existentes de
`lote_distribucion_objetivos` y `cuota_distribuciones` para este lote/sus
cuotas, e inserta de nuevo exactamente lo que llegó en el envío. Válida
solo que cada monto cargado (si la fila tiene participante elegido) sea un
número finito ≥ 0 — filas sin participante o sin monto se descartan sin
error. No hay ninguna validación de que la suma cierre contra nada.

## Fuera de alcance (anotado para el futuro, no en esta spec)

- Cuenta corriente consolidada de un participante cruzando TODOS sus lotes
  (decisión 5 de arriba).
- "Solapa de movimientos": registrar la transferencia real que Nicolás hace
  fuera del sistema a cada participante (decisión 8 de arriba).
- Vista self-service para que un acreedor/vendedor vea su propio resumen
  desde su perfil — hoy esta pantalla es exclusiva de administrador.
- Cualquier cálculo automático de comisión (puntos 21 y 23) — el objetivo
  es un número libre que carga Nicolás, sin ninguna fórmula detrás.

## Testing

- Cargar distribución de una cuota (varios participantes, incluida una
  cuenta externa), guardar, y verificar que persiste correctamente al
  recargar la página.
- Cargar un objetivo para un participante, cargar cuotas hasta alcanzarlo,
  verificar que el resumen muestra "Saldado".
- Cargar un objetivo mayor a lo acumulado, verificar "$X de $Y, faltan $Z".
- Participante sin objetivo: el resumen muestra solo el acumulado, sin
  comparar contra nada.
- Modificar la distribución de UNA cuota puntual sin tocar las demás,
  guardar, verificar que el resto de las cuotas no cambió.
- La suma de una cuota puede ser distinta al monto de la cuota (de más o de
  menos) y el guardado igual funciona, sin ningún error ni bloqueo.
- La pantalla de distribución no es accesible (o no muestra nada útil)
  para un lote que todavía no está "vendido" (sin cuotas).
- Un participante puede ser una cuenta externa en una fila y un profile en
  otra dentro de la misma cuota, sin conflicto.
