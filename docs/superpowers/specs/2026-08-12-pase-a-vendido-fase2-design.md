# Diseño: Pase a vendido (fase 2 — cierra disponible → reservado → vendido)

**Proyecto:** SIMA Inmobiliaria (cliente: Nicolás Saieg)
**Fecha:** 2026-08-12
**Estado:** Aprobado por Gabriel (WHAPIGEN) por chat

## Contexto

La fase 1 (`docs/superpowers/specs/2026-08-11-reserva-lote-fase1-design.md`)
construyó `disponible → reservado`. Esa spec dejaba anotado como pendiente
firme: `/admin/lotes/[id]/vender` seguía funcionando exactamente igual que
antes (saltaba directo desde `disponible`, sin exigir reserva). Esta tanda
cierra el ciclo completo.

Durante las pruebas manuales de la fase 1, Gabriel encontró y confirmó estos
problemas concretos que esta tanda resuelve:

1. `crearLote` e importar lotes piden cantidad de cuotas / monto de cuota /
   fecha de primera cuota como obligatorios, pero esos términos todavía no
   se pueden decidir en ese momento — recién tienen sentido cuando hay un
   comprador real. Además, pedir "monto de cada cuota" por separado del
   precio total es redundante: se puede calcular.
2. "Vender / asignar cliente" funciona standalone, sin exigir haber
   reservado antes, y solo pide nombre + email — perdiendo todo el detalle
   ya cargado en la reserva (DNI, domicilio, teléfono, estado civil, etc.).
3. La reserva no permite seña en $0, lo que bloquea ventas al contado
   inmediatas (reservar con seña nula y vender en el momento).
4. `/admin/lotes/[id]/vender` solo tiene un link "← Volver al lote", lo cual
   confunde porque no lleva al listado.

## Decisiones de esta tanda

### 1. Gating real: no se puede vender sin haber reservado antes

`venderLote` exige `lotes.estado === 'reservado'` con el mismo patrón de
claim atómico que ya usan `reservarLote` y `cancelarReserva`
(`.eq('estado', 'reservado')` en el `UPDATE`, se verifica la fila devuelta).
Si el lote no está en ese estado, se rechaza con el mismo tipo de cartel
amarillo que ya existe en `/reservar` para "lote no disponible".

En `/admin/lotes` (listado), el link "Vender / asignar cliente" deja de
aparecer para lotes `disponible` — solo aparece para lotes `reservado`.

**Venta al contado**: no es una excepción al gating. Se resuelve reservando
con seña en $0 (ver punto 3) y vendiendo inmediatamente después — sigue
existiendo una única regla ("siempre pasa por reservado"), sin una segunda
rama de lógica para "contado".

### 2. Las cuotas se deciden al vender, no al crear el lote

`crearLote` (y el formulario `/admin/lotes/nuevo`) dejan de pedir/guardar
`cantidad_cuotas`, `monto_cuota_base`, `fecha_primera_cuota`. Quedan
obligatorios únicamente los 4 campos que ya lo son hoy: identificador,
ubicación, precio_total, moneda.

La importación masiva (`lib/lotes/parsear-importacion.ts`,
`/admin/lotes/importar`) baja de 7 columnas a las mismas 4: identificador,
ubicación, precio_total, moneda. Se saca toda la validación de cuotas de
`parsearLoteImportado`, y `importarLotes` deja de generar cuotas.

El formulario de "Vender" (`/admin/lotes/[id]/vender`) pasa a pedir:
- Cantidad de cuotas (entero, mínimo 1 — para contado se carga 1).
- Fecha de la primera cuota.

El monto de cada cuota **ya no se pide**: se calcula en el servidor como
`precio_total / cantidad_cuotas`, redondeado a 2 decimales (función pura
nueva, con test unitario, en `lib/lotes/calcular-monto-cuota.ts`). Las
filas de `cuotas` se generan recién acá, con `generarCuotas(...)`, en el
mismo paso que se crea el cliente y se marca `vendido`.

Detalle de redondeo: si `precio_total` no es divisible exacto por
`cantidad_cuotas` (ej. 1000 / 3 = 333.33...), redondear todas las cuotas
igual dejaría un resto sin cobrar (o de más) por errores de centavos
acumulados. Para evitar eso, todas las cuotas menos la última usan el
monto redondeado, y la última se ajusta para que la suma total cierre
exacto contra `precio_total` (mismo principio que un prorrateo contable
estándar). Esto se implementa en `generarCuotas` (no en
`calcularMontoCuota`, que sigue siendo el cálculo simple de "monto por
cuota" para mostrarlo en pantalla antes de confirmar).

`lotes.cantidad_cuotas` y `lotes.monto_cuota_base` pasan a ser columnas
`nullable` (hoy son `not null`). `fecha_primera_cuota` ya es nullable.

### 3. Reserva con seña en $0 (para ventas al contado)

`reservarLote` cambia la validación de `montoSena <= 0` a `montoSena < 0`
— rechaza negativos, permite $0. Mensaje de error actualizado: "El monto de
la seña no puede ser negativo" (en vez de "...mayor a cero").

### 4. Comprador vs. persona que reservó: dos roles, siempre explícitos

Quien reserva (ej: "Pepe") no siempre es quien termina siendo el titular de
la compra (ej: "Juan", su padre) — el comprobante de seña puede estar a
nombre de una persona y la cuenta/lote terminar a nombre de otra. Ambos
casos tienen que quedar documentados sin ambigüedad para quien use la
plataforma (vendedor, admin, etc.).

No se agrega una tabla ni columnas nuevas para esto — la tabla `reservas`
de la fase 1 ya guarda la identidad completa de quien reservó (nombre, DNI,
domicilio, teléfono, estado civil). Lo que cambia es la pantalla de Vender:

- Arriba del formulario, un bloque de solo lectura "Datos de la reserva"
  muestra explícitamente la identidad de **quien reservó** (nombre, DNI,
  domicilio, teléfono, monto y moneda de la seña), etiquetado como tal —
  para que quede claro que es un registro histórico, no necesariamente el
  comprador final.
- Los inputs del formulario (nombre completo, email) se etiquetan sin
  ambigüedad como **"Comprador (será el dueño de la cuenta y del lote)"**,
  y vienen precargados (`defaultValue`) con el nombre/email de quien
  reservó, como caso más común. Si el comprador es otra persona (el caso
  "Pepe reserva, Juan compra"), el admin simplemente sobreescribe esos dos
  campos a mano.
- No hace falta un checkbox "es la misma persona" ni JavaScript en el
  navegador: la app es 100% Server Components/Server Actions a propósito, y
  precargar-y-dejar-editar dos inputs de texto logra el mismo resultado sin
  cruzar ese umbral de arquitectura.
- La cuenta de `cliente` que se crea (`profiles` + invitación) sigue
  guardando solo nombre + email, igual que hoy — el resto de los datos del
  comprador (DNI, domicilio) quedan fuera de alcance de esta tanda, igual
  que ya estaba decidido para la reserva en fase 1.

### 5. Limpieza de datos incongruentes con la nueva regla

Con cuotas ahora atadas a "vendido", cualquier lote que **no** esté
`vendido` pero ya tenga cuotas generadas (de antes de este cambio) queda en
un estado incongruente. Se limpia como parte de la migración:

```sql
delete from public.cuotas
where lote_id in (select id from public.lotes where estado <> 'vendido');

update public.lotes
set cantidad_cuotas = null, monto_cuota_base = null, fecha_primera_cuota = null
where estado <> 'vendido';
```

Verificado contra la base real antes de escribir esta spec: hoy solo afecta
a los dos lotes "Prueba 2" (uno `disponible`, uno `reservado`, 10 cuotas
cada uno) y a un lote de datos de prueba de E2E — ninguno tiene pagos
asociados (no puede haberlos: sin `vendido` no hay `cliente_id`, y los
pagos se registran contra un cliente). Los lotes ya `vendido` no se tocan.

### 6. Navegación en `/admin/lotes/[id]/vender`

Se agregan las dos opciones, una al lado de la otra: "← Volver a Lotes"
(al listado) y "← Volver al lote" (al detalle de ese lote en particular).

## Fuera de alcance de esta tanda

- Guardar DNI/domicilio/teléfono del comprador final (distinto del
  reservante) en su propia cuenta — hoy sigue siendo solo nombre + email,
  igual que la venta actual.
- Subida del boleto/escritura firmado como archivo — las notas de decisión
  mencionan instrumentación pero el documento en sí no se pide todavía
  (mismo criterio que la reserva: es progresivo).
- Filtro/orden en vivo sin recargar página, filtro por más columnas — queda
  anotado como pendiente para una tanda de UI dedicada (requiere el primer
  componente interactivo con JS del proyecto).
- Caja/efectivo y motor de comisiones — sigue fuera de alcance (0%
  construido, ya estaba así documentado).

## Testing

Mismo patrón que las tandas anteriores (unitarios + Playwright, suite
completa en verde antes de cerrar):

- `calcularMontoCuota`: unitario (división exacta, redondeo, cantidad = 1).
- `generarCuotas` con `precio_total` no divisible exacto por la cantidad de
  cuotas: la suma de todas las cuotas generadas debe cerrar exacto contra
  `precio_total` (el ajuste de centavos queda en la última cuota).
- Crear lote / importar lotes: ya no piden ni guardan campos de cuotas.
- Vender sin reserva previa (navegando directo por URL) → rechazado.
- Vender tras reservar → formulario precargado con datos de la reserva,
  cuotas generadas correctamente con el monto calculado.
- Vender con comprador distinto del reservante (sobrescribiendo nombre/email)
  → la cuenta creada usa los datos sobrescritos, no los de la reserva.
- Reservar con seña $0 → aceptado; seña negativa → rechazado.
- Listado de lotes: `disponible` no muestra "Vender"; `reservado` sí.
- Regresión completa de la suite existente (fase 1 no debe romperse).

Además, se actualiza `Pruebas_Manuales_Pendientes.txt`: se reescribe la
sección 8.11 (que hoy documenta el comportamiento viejo a propósito) y se
agrega una sección 9 nueva para esta tanda.
