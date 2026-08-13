# Diseño: Descontar la seña de la reserva en las cuotas al vender

**Proyecto:** SIMA Inmobiliaria (cliente: Nicolás Saieg)
**Fecha:** 2026-08-12
**Estado:** Aprobado por Gabriel (WHAPIGEN) por chat

## Contexto

Probando "pase a vendido (fase 2)" recién shippeada, Gabriel encontró que
`venderLote` genera las cuotas por el **precio total completo** del lote, sin
descontar la seña que ya se cobró al reservar. Ejemplo real: precio_total
10.000, seña 500, 10 cuotas de 1.000 → hoy se termina cobrando 10.500 en vez
de 10.000.

De paso surgió un segundo pedido más grande (un mismo cliente comprando
varios lotes debe quedar en una sola cuenta) que **se decidió separar en su
propia tanda**, porque toca el motor de pagos/imputaciones (FIFO), no solo
`venderLote` — un cambio de mayor riesgo que amerita su propio diseño. Esta
spec cubre únicamente el descuento de la seña.

## Decisión

Al confirmar la venta, después de generar las cuotas (`generarCuotas`), si
la reserva activa del lote tiene `monto_sena > 0` **y** `moneda_sena` es
igual a `lotes.moneda`:

1. Se crea una fila en `pagos`, ya en estado `confirmado` (no pasa por el
   flujo normal de confirmación doble acreedor+admin — la seña ya fue
   verificada físicamente al reservar, con su propio comprobante):
   - `cliente_id`: el comprador recién dado de alta.
   - `monto` / `moneda`: `monto_sena` / `moneda_sena` de la reserva.
   - `comprobante_path`: se reusa `reservas.comprobante_sena_path` (mismo
     archivo, no se pide subirlo de nuevo).
   - `estado: 'confirmado'`, `confirmado_admin_por: <admin que vende>`,
     `confirmado_admin_at: now()`.
2. Se reparte ese monto con `imputarPagoFIFO` (la misma función pura que ya
   usa `confirmarPago`) contra las cuotas recién generadas, ordenadas por
   `numero` — si la seña supera el monto de la primera cuota, el sobrante
   cascadea a la segunda, y así sucesivamente (mismo criterio que un pago
   normal, sin inventar una regla aparte).
3. Por cada imputación: fila en `pago_imputaciones` + descuento del
   `saldo_pendiente` de la cuota correspondiente — mismo patrón exacto que
   el loop de `confirmarPago` (`app/admin/pagos/actions.ts:119-145`), sin el
   claim atómico previo (no hace falta: la fila se crea ya confirmada en el
   mismo request, no hay concurrencia posible sobre un pago que todavía no
   existía).

Si `moneda_sena !== lotes.moneda`, **no se descuenta nada automáticamente**
— consistente con que este proyecto no hace conversión de moneda en ningún
lado (mismo criterio que `pagos.monto_recibido` vs. moneda del lote). El
admin ya ve el monto y la moneda de la seña en el panel de "Datos de la
reserva" de la pantalla de vender (agregado en la tanda anterior), así que
lo nota si no coincide y lo reconcilia a mano si hace falta — no se agrega
ningún aviso especial nuevo para este caso.

Si no hay seña (`monto_sena` es 0, caso de venta al contado) o no hay
reserva activa (no debería pasar, el gating ya exige `reservado`), no se
crea ningún pago — las cuotas quedan con su `saldo_pendiente` completo,
como hoy.

## Dónde vive el cambio

Todo dentro de `app/admin/lotes/[id]/vender/actions.ts` (`venderLote`), en
el mismo punto donde hoy se insertan las cuotas — después de insertarlas
(necesita sus `id` reales para las imputaciones), antes del `redirect`
final. Se reutiliza `lib/pagos/imputar-fifo.ts` (`imputarPagoFIFO`) tal
cual existe hoy, sin modificarlo.

Para conseguir los datos de la reserva (`monto_sena`, `moneda_sena`,
`comprobante_sena_path`), se hace la misma consulta que ya usa
`vender/page.tsx` para el panel de "Datos de la reserva" (reserva activa
más reciente por `lote_id`), agregando el campo `comprobante_sena_path` que
hoy esa consulta no trae (solo se usa para mostrar en pantalla, no se
guardaba en la acción).

## Fuera de alcance de esta tanda

- Cliente con varios lotes / reutilizar cuenta existente al vender — tanda
  aparte, pendiente de diseñar (toca el motor de pagos por lote).
- Conversión automática de moneda cuando `moneda_sena` difiere de la del
  lote — no existe en ningún lado del sistema, no se agrega acá tampoco.
- Aviso visual especial si la seña queda sin descontar por diferencia de
  moneda — el panel de reserva ya visible en la pantalla de vender cubre
  esto sin trabajo adicional.

## Testing

- Unitario: no hace falta ninguno nuevo — `imputarPagoFIFO` y
  `generarCuotas` ya están probados; esta tanda solo los orquesta.
- E2E: extender `tests/e2e/pase-a-vendido.spec.ts` (o agregar un test nuevo
  en el mismo archivo) verificando, contra la base real:
  - Vender con seña menor a la primera cuota → la primera cuota queda con
    `saldo_pendiente = monto_base - seña`, se creó un `pago` en estado
    `confirmado` por el monto de la seña, con una fila en
    `pago_imputaciones` apuntando a esa cuota.
  - Vender con seña mayor a la primera cuota (pero menor a la suma de las
    dos primeras) → cascada: primera cuota en `saldo_pendiente = 0`,
    segunda cuota con el sobrante descontado.
  - Vender con seña en moneda distinta a la del lote → no se crea ningún
    pago, las cuotas quedan con `saldo_pendiente` completo (comportamiento
    documentado, no un bug).
  - Vender al contado (seña $0) → no se crea ningún pago (ya cubierto
    implícitamente, pero vale una aserción explícita de que no aparece
    ninguna fila en `pagos` para ese cliente).
- Regresión completa del proyecto antes de cerrar (build + unitarios + e2e
  x2), mismo criterio que todas las tandas anteriores.
