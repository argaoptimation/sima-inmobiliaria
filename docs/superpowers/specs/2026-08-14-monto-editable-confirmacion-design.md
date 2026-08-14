# Diseño: Monto editable al confirmar un pago, con guarda contra sobrescritura

**Proyecto:** SIMA Inmobiliaria (cliente: Nicolás Saieg)
**Fecha:** 2026-08-14
**Estado:** Aprobado por Gabriel (WHAPIGEN) por chat.

## Contexto

Hoy `pago.monto` (lo que el cliente tipeó al subir el comprobante) es fijo
para siempre: ni el acreedor ni el admin pueden corregirlo. La confirmación
cruzada de cada uno es un tilde binario contra ese valor fijo. El campo
`monto_recibido`/`moneda_recibida` que ya existe es solo bookkeeping para
cierre de caja — no afecta el descuento real de deuda vía FIFO
(`app/admin/pagos/actions.ts`, `confirmarPago`).

Escenario real sin resolver: el cliente escribe mal el monto en el
comprobante (ej. $50 en vez de $500 reales). Hoy nadie puede corregir ese
número dentro del sistema — la deuda se descuenta mal aunque ambos
confirmen. Gabriel pidió que el monto sea editable al confirmar, precargado
con lo que puso el cliente, y que lo confirmado (editado o no) sea lo que
se use de verdad para el descuento.

## Decisión

### 1. `pago.monto` pasa a ser editable en el formulario de confirmación

En `/admin/pagos`, el formulario "Confirmar mi parte" gana un input
numérico "Monto a confirmar", precargado con el `pago.monto` actual (el
mismo que hoy ya se muestra en la tabla, sin editar). El acreedor/admin
puede dejarlo igual (confirma tal cual) o cambiarlo antes de tocar
"Confirmar mi parte".

### 2. Guarda atómica contra sobrescritura por un formulario obsoleto

Cada formulario lleva un campo oculto `montoVisto` con el valor de
`pago.monto` tal como estaba cuando esa página se renderizó. La Server
Action `confirmarPago` hace el `UPDATE` con `.eq('monto', montoVisto)` en
el `WHERE` (mismo patrón de claim atómico ya usado en todo el proyecto,
ej. `.eq('estado', 'disponible')` al reservar un lote). Si el monto
cambió entre que la página se cargó y que se tocó "Confirmar mi parte"
(porque el otro confirmador ya lo corrigió mientras tanto), el `UPDATE`
no afecta ninguna fila y se rechaza con:

> "El monto cambió desde que abriste esta pantalla (ahora figura $X).
> Revisalo antes de confirmar."

sin aplicar ningún cambio — ni el tilde de quien intentó confirmar, ni el
monto. La persona tiene que recargar `/admin/pagos`, ver el monto
actualizado, y decidir si lo acepta o lo corrige de nuevo.

### 3. Si el monto realmente cambia, se limpia la confirmación previa del otro rol

Si el valor que se envía (`montoIngresado`) difiere del `montoVisto` (o
sea, hubo una edición real, no solo un submit sin tocar el campo), la
misma `UPDATE` atómica:
- Actualiza `pago.monto` al nuevo valor.
- Fija la confirmación de quien está confirmando ahora
  (`confirmado_acreedor_por`/`_at` o `confirmado_admin_por`/`_at`, según
  su rol).
- **Limpia** (pone en `null`) la confirmación del OTRO rol, si ya estaba
  cargada. Nadie puede quedar "confirmando" un número que en realidad
  nunca vio ni aceptó.

Si `montoIngresado` es igual a `montoVisto` (no hubo edición), el
comportamiento es el de hoy: solo se fija la confirmación de quien
confirma, sin tocar la del otro rol ni el monto.

El claim atómico final que dispara el FIFO (`estado: 'pendiente' →
'confirmado'`, condicionado a que AMBAS confirmaciones estén cargadas) no
cambia — sigue funcionando igual, solo que ahora nunca se dispara con una
confirmación "vencida" contra un monto viejo, porque cualquier edición
real limpia la confirmación ajena.

### 4. El descuento de deuda usa el monto final, no el original del cliente

`imputarPagoFIFO` sigue recibiendo `pagoClaimado.monto` tal cual ya lo
hace hoy — no cambia esa parte de la función. La diferencia es que, para
cuando el claim atómico se dispara (ambas confirmaciones cargadas a la
vez), `pago.monto` puede ya no ser el original del cliente, sino el
corregido por acreedor o admin.

## Fuera de alcance de esta tanda

- No se toca `monto_recibido`/`moneda_recibida` (sigue siendo bookkeeping
  aparte, sin efecto en el FIFO).
- No se agrega ningún historial/auditoría de ediciones de monto (quién
  cambió qué número y cuándo) — si hace falta, es una tanda futura.
- No se notifica automáticamente a la otra persona cuando se le limpia su
  confirmación por una edición — se van a dar cuenta la próxima vez que
  entren a `/admin/pagos` y vean que su columna volvió a "No".

## Testing

- Unitario: no hace falta ninguno nuevo puro — es orquestación de una
  Server Action existente, se prueba con e2e contra la base real.
- E2E (extendiendo `tests/e2e/pago-flujo-completo.spec.ts` o un archivo
  nuevo):
  - Confirmar sin editar el monto: comportamiento idéntico al de hoy.
  - Acreedor edita el monto y confirma → el monto del pago cambia, y si
    el admin ya había confirmado antes, su confirmación queda limpiada
    (columna "Confirmado admin" vuelve a "No").
  - Con el monto ya editado por el acreedor, el admin abre una pestaña
    vieja (con el monto viejo precargado) e intenta confirmar sin
    refrescar → rechazado con el mensaje de "el monto cambió", ni su
    confirmación ni el monto se tocan.
  - Caso feliz completo: acreedor corrige el monto, admin recarga, ve el
    monto correcto, confirma → se completa la venta y el FIFO descuenta
    el monto corregido, no el original del cliente.
- Regresión completa (build + unitarios + e2e x2) antes de cerrar, mismo
  criterio de siempre.
