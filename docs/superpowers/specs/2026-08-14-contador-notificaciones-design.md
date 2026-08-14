# Diseño: Contador de pagos pendientes de confirmación en la nav

**Proyecto:** SIMA Inmobiliaria (cliente: Nicolás Saieg)
**Fecha:** 2026-08-14
**Estado:** Aprobado por Gabriel (WHAPIGEN) por chat.

## Contexto

Gabriel pidió una notificación para admin/acreedor: al entrar a la consola,
que se vea de algún modo si hay pagos esperando su confirmación. Como toda
la app es Server Components/Server Actions sin JavaScript de cliente (regla
de arquitectura ya establecida — el filtro en vivo del listado de lotes fue
explícitamente diferido por esta misma razón), se descartó una campanita que
se actualice sola en vivo mientras la persona está parada en una pantalla.
Se aprobó en su lugar un contador recalculado en cada carga de página
(entrar o navegar a cualquier pantalla de `/admin`), sin ningún JS nuevo.

## Decisión

### 1. Contador en `NavAdmin`, junto al link "Pagos"

`NavAdmin` (`components/NavAdmin.tsx`) ya recibe `role` como prop. Se
amplía para recibir también `pagosPendientes: number` (calculado por el
layout, ver punto 2) y mostrarlo junto al link existente: `Pagos (3)` en
vez de `Pagos` cuando el número es mayor a 0; si es 0, se muestra `Pagos`
tal cual, sin el paréntesis. Solo se muestra para `administrador` y
`acreedor` (los mismos roles que ya ven el link "Pagos" — vendedor/cobrador
no lo ven, mismo criterio que ya existe).

### 2. Cálculo en `app/admin/layout.tsx`

El layout ya resuelve `profile.role` en cada request. Se agrega una
consulta a `pagos` para contar cuántos están `pendiente`, con comprobante
subido (`comprobante_path` no nulo — sin comprobante no hay nada que
confirmar todavía), y sin la confirmación de ESTE usuario:

- Si `role === 'acreedor'`: contar pagos con `lote_id` en los lotes donde
  `acreedor_id = user.id`, `confirmado_acreedor_por is null`. Mismo patrón
  de resolución de `loteIds` que ya usa `/admin/pagos`.
- Si `role === 'administrador'`: contar pagos de cualquier lote,
  `confirmado_admin_por is null`.
- Otros roles (vendedor, cobrador): no se consulta nada, el contador no se
  les muestra.

### 3. El link sigue yendo a `/admin/pagos`, sin cambios de destino

`/admin/pagos` ya lista exactamente los pagos pendientes de confirmación
de cada rol (con la columna "Lote" agregada en una tanda anterior), así
que ya es "la pantalla para confirmar" que pedía Gabriel — no hace falta
ninguna pantalla ni deep-link nuevo. Si en el futuro hace falta saltar
directo a una fila puntual (por ejemplo si el conteo crece mucho), queda
como mejora aparte, no bloqueante para esta tanda.

## Fuera de alcance de esta tanda

- Actualización en vivo sin recargar/navegar (cruzaría la arquitectura
  actual — descartado explícitamente por Gabriel para esta tanda).
- Marcar pagos individuales como "vistos"/leídos — el contador siempre
  refleja el estado real pendiente, no hay estado de lectura separado que
  mantener.
- Notificaciones para vendedor/cobrador (no confirman pagos, no aplica).
- Cualquier otro tipo de notificación (solo pagos pendientes de
  confirmación, no reservas nuevas, cuotas vencidas, etc.).

## Testing

- Unitario: no hace falta, es una consulta simple + render condicional.
- E2E (extendiendo un spec existente o uno nuevo):
  - Como acreedor con 1 pago pendiente de su confirmación (comprobante ya
    subido, `confirmado_acreedor_por` null): el nav muestra "Pagos (1)".
  - Ese mismo acreedor confirma su parte: el nav pasa a mostrar "Pagos"
    sin número.
  - Un pago sin comprobante subido todavía NO cuenta (no hay nada que
    confirmar).
  - Un acreedor no ve en su contador los pagos pendientes de lotes que no
    son suyos (mismo scoping que ya prueba `pagos-acotados-por-acreedor.spec.ts`
    para la lista completa).
  - Como admin, el contador cuenta pagos de cualquier lote, no solo los
    de un acreedor puntual.
- Regresión completa (build + unitarios + e2e x2) antes de cerrar, mismo
  criterio de siempre.
