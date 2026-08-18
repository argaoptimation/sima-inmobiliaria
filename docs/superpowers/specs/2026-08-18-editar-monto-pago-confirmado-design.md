# Editar el monto de un pago ya confirmado — Diseño

**Fecha:** 2026-08-18
**Estado:** Aprobado por Gabriel, avanzar directo a plan + ejecución (sin revisión de spec).

## Contexto (punto 33 de Notas_Decisiones_SIMA.txt)

Hoy, una vez que un pago tiene las dos confirmaciones (acreedor + admin), o directamente
la confirmación del admin cuando el lote cobra a través de una cuenta externa, queda
"cerrado": `app/admin/pagos/page.tsx` solo muestra acciones sobre pagos con
`estado = 'pendiente'`. Si Nicolás se equivocó al tipear el monto al confirmar (ej.
cargó $1.500 cuando el comprobante decía $1.600), hoy no hay forma de corregirlo.

Motivo concreto dado por Nicolás: error humano leyendo el comprobante al confirmar.

## Alcance

- Corrige el **monto** de un pago ya confirmado (`estado = 'confirmado'`).
- Solo administrador.
- No reabre ni edita la fila original del pago — ver "Mecánica" abajo.
- Fuera de alcance: editar pagos todavía `pendiente` (ya se edita ahí mismo al
  confirmar), editar moneda o comprobante, deshacer una confirmación por completo
  (eso ya existiría como "no confirmar" antes de llegar a este flujo).

## Quién y dónde

- Solo `administrador` (confirmado con Gabriel — ni acreedor ni vendedor).
- Vive en `/admin/pagos` (`app/admin/pagos/page.tsx`), la misma tabla que ya lista
  todos los pagos. Se agrega una acción "Editar monto" visible solo para admin, solo
  en filas con `estado = 'confirmado'` y `motivo != 'ajuste'` (un ajuste no se corrige
  a sí mismo — ver abajo).

## Mecánica: pago de ajuste, no edición en el lugar

En vez de pisar `pagos.monto` del pago original (perdiendo el número que efectivamente
se vio y confirmó en su momento) o agregar columnas de auditoría a `pagos`, la
corrección se registra como una **fila nueva en `pagos`**, igual que pidió Gabriel:
"colocar como si fuera un pago adicional del lote", con `motivo = 'ajuste'`. Esto
reusa la tabla y la UI que ya existen sin agregar nada visual nuevo — la fila de
ajuste aparece en el mismo listado, ordenada por fecha junto al pago que corrige, y
es en sí misma el rastro/auditoría que Nicolás pidió.

**Monto efectivo de un pago:** `monto` del pago original + suma de `monto` de todos
los pagos `ajuste` que lo corrigen (`corrige_pago_id = <id del original>`). El
formulario de edición muestra y usa este monto efectivo como valor de partida (no el
`monto` crudo de la fila original, que puede ya estar desactualizado si hubo una
corrección previa).

**Al guardar una corrección**, con `delta = montoNuevo - montoEfectivoActual`:

- `delta == 0`: no hace nada, redirige con un aviso de que no hubo cambios.
- `delta > 0` (se había cargado de menos — el caso que disparó el pedido): se
  inserta un pago nuevo con `monto = delta`, `motivo = 'ajuste'`, `estado =
  'confirmado'`, `confirmado_admin_por`/`confirmado_admin_at` en el momento, mismo
  `lote_id`/`cliente_id`/`moneda`/`comprobante_path` que el pago original, y
  `corrige_pago_id` apuntando al pago original. Se busca la lista actual de cuotas
  del lote con `saldo_pendiente > 0` (mismo query que ya usa `confirmarPago`) y se
  llama a `imputarPagoFIFO(delta, cuotas)` — la misma función pura que ya usan
  `confirmarPago` y `venderLote`, sin lógica nueva. Cada imputación resultante se
  guarda en `pago_imputaciones` contra el `pago_id` del ajuste (nunca contra el
  original) y decrementa `cuotas.saldo_pendiente`, igual que el resto del código ya
  hace. Si no queda ninguna cuota pendiente, el ajuste igual se crea (por prolijidad
  del monto total del lote) pero sin imputaciones, igual que ya tolera
  `confirmarPago` con un sobrepago.
- `delta < 0` (se había cargado de más): se inserta el mismo tipo de fila de ajuste
  pero con `monto = delta` (negativo). En vez de imputar hacia adelante, se **revierte
  específicamente lo que el pago ORIGINAL imputó** — nunca cuotas que otros pagos
  hayan afectado. Se traen las filas de `pago_imputaciones` del pago original
  ordenadas por `created_at desc` (lo más reciente se revierte primero) y se camina
  la lista acumulando `|delta|`: por cada imputación se revierte
  `min(imputacion.monto_imputado, restante)`, sumando esa cantidad de vuelta a
  `cuotas.saldo_pendiente` de esa cuota, y registrando una fila en
  `pago_imputaciones` para el pago de ajuste con `monto_imputado` en negativo (mismo
  mecanismo de rastro que el resto de imputaciones, con signo invertido). Si se
  llega al final de las imputaciones del original y todavía queda `restante > 0`
  (se pidió revertir más de lo que ese pago realmente llegó a imputar — caso borde,
  no debería pasar en el uso normal), se revierte como máximo lo que había y se
  corta ahí; no es un error bloqueante.
- Guarda con el mismo patrón de concurrencia optimista que ya usa `confirmarPago`:
  un campo oculto `montoEfectivoVisto` viaja con el form; si el monto efectivo
  calculado al momento de guardar ya no coincide (alguien más hizo otra corrección
  mientras tanto), se rechaza con un mensaje en vez de aplicar un delta calculado
  sobre datos viejos.
- No dispara ni exige ninguna reconfirmación cruzada — el pago sigue `confirmado`
  antes y después. Confirmado con Gabriel: es el admin corrigiendo su propio error de
  carga, no una disputa entre acreedor y admin.

## Cambios de esquema (migración nueva, `0024_...`)

- `alter type public.motivo_pago add value 'ajuste'` — nuevo motivo, junto a los ya
  existentes `'cuota'`/`'sena'`.
- `alter table public.pagos add column corrige_pago_id uuid references public.pagos(id)`
  — nulo salvo en filas de ajuste, donde apunta al pago que corrigen. No lleva
  `on delete cascade`: si algún día se borra un pago original a mano, no tiene
  sentido borrar en cascada el ajuste que lo corrigió (queda huérfano de referencia
  pero visible, más seguro que un borrado silencioso encadenado).

## UI

- Columna "Motivo" ya existente en la tabla: además de "Seña"/"Cuota" mapea
  `'ajuste'` a "Ajuste".
- Columna "Monto": para una fila de ajuste con `monto` negativo, se muestra tal cual
  (con el signo) — no hace falta formato especial, el signo ya comunica que es una
  resta.
- En cada fila con `estado === 'confirmado' && motivo !== 'ajuste'` y el usuario
  logueado es admin, un link/botón "Editar monto" que abre un form inline (mismo
  patrón ya usado para "Confirmar mi parte": un `<form>` con `action` bindeado a la
  nueva Server Action, sin JS de cliente) con un input numérico precargado con el
  monto efectivo actual y un campo oculto `montoEfectivoVisto`.

## Server Action

Nueva función `editarMontoPago(pagoId, formData)` en `app/admin/pagos/actions.ts`,
junto a `confirmarPago` (mismo archivo, reusa su import de `imputarPagoFIFO`):

- `requireAdministrador()` (`lib/auth/require-admin.ts`).
- Carga el pago por `pagoId`; si no existe, o `estado !== 'confirmado'`, o
  `motivo === 'ajuste'`, redirige con error.
- Resuelve el lote (`lote_id`) igual que `confirmarPago` ya hace.
- Calcula el monto efectivo (original + ajustes previos) vía una consulta a `pagos`
  filtrando `corrige_pago_id = pagoId`.
- Valida `montoNuevo` (numérico, `>= 0`) y `montoEfectivoVisto` contra el efectivo
  recién calculado — guarda optimista, igual criterio que `confirmarPago`.
- Ejecuta la rama `delta > 0` / `delta < 0` / `delta == 0` descripta arriba.
- `revalidatePath('/admin/pagos')` y `revalidatePath('/portal-cliente')` al final
  (mismo efecto que ya tiene `confirmarPago`, porque esto cambia saldos de cuotas
  que el cliente ve en su portal).

## Testing (e2e)

Casos a cubrir en `tests/e2e/`:

1. Corregir hacia arriba (ej. 1500 → 1600): se crea el pago de ajuste con
   `monto = 100`, `motivo = 'ajuste'`, `estado = 'confirmado'`; la cuota pendiente
   más próxima recibe 100 más de `saldo_pendiente` descontado; el pago original
   queda con su `monto` original sin tocar.
2. Corregir hacia abajo (ej. 1600 → 1500) cuando el pago original imputó exactamente
   a una sola cuota: se crea el ajuste con `monto = -100`; esa cuota recupera 100 de
   `saldo_pendiente`.
3. Corregir hacia abajo cuando el pago original se repartió en cascada entre dos
   cuotas (imputación parcial a la primera, resto a la segunda): la reversión toca
   primero la imputación más reciente (la segunda cuota) antes de tocar la primera.
4. Segunda corrección sobre el mismo pago original: el formulario parte del monto
   efectivo (original + ajuste previo), no del monto crudo original.
5. Intento de editar un pago con `estado = 'pendiente'`: rechazado.
6. Intento de editar un pago cuyo `motivo` ya es `'ajuste'`: rechazado.
7. Un acreedor (no admin) no puede acceder a la acción.
8. Carrera: el monto efectivo cambia entre que se carga la pantalla y se guarda
   (otra corrección se coló en el medio) → guarda optimista rechaza con mensaje.
