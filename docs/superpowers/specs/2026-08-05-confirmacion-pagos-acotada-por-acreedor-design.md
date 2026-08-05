# Diseño: Confirmación de pagos acotada al acreedor del lote

**Proyecto:** SIMA Inmobiliaria (cliente: Nicolás Saieg)
**Fecha:** 2026-08-05
**Estado:** Aprobado por Gabriel (WHAPIGEN) por chat, confirmado explícitamente

## Contexto

Hoy `confirmarPago` (`app/admin/pagos/actions.ts`) decide si alguien puede
confirmar el lado "acreedor" de un pago mirando solo su **rol** (`acreedor`),
no si es el acreedor específico del lote al que pertenece ese pago. Como
consecuencia, cualquier acreedor puede confirmar el pago de cualquier
cliente de cualquier lote, sin relación con él — el mismo problema que ya se
cerró esta semana para `/admin/lotes` y `/admin/usuarios`, pero sin cerrar
acá todavía.

Gabriel confirmó la regla explícitamente:

- El lado **acreedor** de la confirmación cruzada tiene que ser
  específicamente el acreedor asociado al lote de ese pago
  (`lotes.acreedor_id`), no "cualquier acreedor".
- El lado **administrador** no cambia: cualquier `administrador` alcanza —
  si hay más de uno, el primero que confirme cierra ese lado. Esto ya es el
  comportamiento actual (el código nunca distinguió "cuál" admin), no hace
  falta tocar nada ahí.
- El modelo de un único acreedor por lote (`lotes.acreedor_id`, sin
  soportar varios) se mantiene tal cual está — Gabriel lo confirmó
  explícitamente, no hace falta rediseñar el schema.

No cubre (evaluado y descartado por ahora, ver "Fuera de alcance"): una
política de confirmación configurable (por ejemplo, que en algunos casos
alcance con que confirme solo el admin, o solo el acreedor). Gabriel
preguntó qué tan difícil sería — la evaluación quedó en que es un salto de
complejidad real (requiere un concepto nuevo de "política de confirmación"
por lote) y se deja para si surge la necesidad concreta más adelante.

## Regla de autorización

Al confirmar un pago:

- Si quien confirma es `administrador`: sin cambios, puede confirmar
  cualquier pago.
- Si quien confirma es `acreedor`: solo puede confirmar si es exactamente
  el `acreedor_id` del lote del cliente dueño de ese pago. Se resuelve así:
  `pagos.cliente_id → lotes.cliente_id → lotes.acreedor_id`, y se compara
  contra el `user.id` de quien está confirmando.
- Si el lote no tiene `acreedor_id` asignado (columna nullable — no todos
  los lotes lo tienen cargado todavía), **ningún acreedor** puede confirmar
  ese pago, solo el administrador. No es un caso especial a programar
  aparte, es la consecuencia natural de la regla — pero es una nota
  operativa real: mientras un lote no tenga acreedor asignado en su
  detalle, sus pagos quedan esperando únicamente al admin del lado
  acreedor.

## `/admin/pagos`: listado acotado

Mismo patrón ya aplicado a `/admin/lotes` y `/admin/usuarios` esta semana:

- `administrador` sigue viendo todos los pagos pendientes, sin cambios.
- `acreedor` deja de ver la lista completa — solo ve los pagos de clientes
  cuyo lote tiene su propio `acreedor_id`. Si no tiene ningún lote
  asignado, ve la lista vacía.
- No hace falta ocultar el botón "Confirmar mi parte" con lógica aparte:
  al no aparecer en su lista, un acreedor simplemente no ve el botón para
  pagos ajenos. La defensa real contra invocación directa de la Server
  Action sigue siendo el chequeo de autorización de la sección anterior.

## Fuera de alcance

- Política de confirmación configurable por lote (a veces solo admin, a
  veces solo acreedor).
- Soporte a más de un acreedor por lote.
- Cualquier cambio a la lógica de FIFO, el claim atómico de `estado`, o la
  captura de `monto_recibido`/`moneda_recibida` — todo eso sigue exactamente
  igual, esto solo agrega un chequeo de autorización antes de esa lógica.
