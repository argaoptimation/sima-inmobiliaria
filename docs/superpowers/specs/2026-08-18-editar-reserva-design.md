# Editar una reserva ya cargada — Diseño

**Origen:** punto 41b de `Notas_Decisiones_SIMA.txt`. Hoy, si al reservar un
lote se cargó algo mal (un DNI mal tipeado, el archivo equivocado, un
teléfono incorrecto), la única opción es cancelar la reserva entera —
perdiendo todos los datos y archivos ya subidos — y cargarla de nuevo desde
cero.

## Decisiones tomadas con Gabriel (18/08/2026)

1. **Solo administrador puede editar**, y **solo mientras el lote sigue
   "reservado"** — mismo criterio y mismo límite que ya usa "Cancelar
   reserva" (`BotonCancelarReserva`, visible solo para admin, solo con
   `lote.estado === 'reservado'`). Una vez que el lote pasa a "vendido" ya
   no se puede editar la reserva, igual que ya no se puede cancelar.
2. **Se puede editar todo**, incluidos los 5 campos de archivo (comprobante
   de la seña, DNI frente, DNI dorso, DNI del cónyuge, sentencia de
   divorcio) — no solo los campos de texto.
3. **Corrige la fila existente en `reservas`** (UPDATE in place). Sin
   historial de versiones — mismo criterio que ya usan `actualizarDatosCliente`
   y `actualizarDatosGenerales` (lote) en el proyecto.

## Diseño

### Página nueva: `/admin/lotes/[id]/reservar/editar`

Exclusiva de administrador (`requireAdministrador`), reusando la
estructura de campos de `app/admin/lotes/[id]/reservar/page.tsx` pero
precargada con los datos de la reserva más reciente del lote
(`defaultValue` en cada input/select, igual que ya hace `vender/page.tsx`
con los datos de la reserva al precargar el comprador).

Si `lote.estado !== 'reservado'` (no hay nada que editar, o ya se vendió),
se muestra un mensaje amber en vez del formulario — mismo patrón ya usado
en `vender/page.tsx` y en la nueva `distribucion/page.tsx`.

### Los 5 campos de archivo quedan OPCIONALES en esta pantalla

A diferencia de `reservar` (donde los 5 son obligatorios, 3 siempre y 2
condicionales según estado civil), acá ningún `<input type="file">` lleva
`required`:
- Si no se elige un archivo nuevo, se mantiene el `_path` que ya estaba
  guardado en la fila de `reservas` — sin tocarlo.
- Si se elige uno, se sube (mismo patrón `subirArchivoReserva` de
  `reservar/actions.ts`, con el mismo chequeo de `excedeTamanioMaximo`) y
  reemplaza el `_path` guardado. El archivo viejo queda huérfano en
  Storage — no se borra nada al reemplazar, mismo criterio que ya rige en
  el resto del proyecto (ningún flujo existente borra archivos
  reemplazados).

Las validaciones condicionales de `reservarLote` se mantienen, pero
adaptadas a "ya tenía uno guardado" como alternativa válida a "subiste uno
nuevo":
- Si el estado civil editado queda en "casado": hace falta un DNI del
  cónyuge, sea el que ya estaba guardado o uno nuevo subido ahora. Si
  nunca hubo uno guardado (la reserva original no era de un casado) y no
  se sube ninguno ahora, se rechaza con el mismo mensaje que ya usa
  `reservarLote`.
- Mismo criterio para "divorciado" + sentencia de divorcio.
- El comprobante de la seña, DNI frente y DNI dorso siempre tienen que
  terminar con un path válido (el guardado o uno nuevo) — nunca pueden
  quedar sin ninguno, aunque en la práctica siempre van a tener el
  guardado como mínimo.

### Server Action `actualizarReserva(loteId, formData)`

Nueva, en `app/admin/lotes/[id]/reservar/actions.ts` (junto a
`reservarLote`, reusando sus helpers de validación donde aplique: moneda,
estado civil, `tieneRecibidoPorValido`, `excedeTamanioMaximo`).

1. `requireAdministrador()`.
2. Verificar que el lote existe y `estado === 'reservado'` — si no,
   redirigir con error (defensa server-side, más allá de que la UI ya lo
   oculta).
3. Buscar la reserva activa más reciente del lote (mismo query que ya usa
   `cancelarReserva`: `.eq('lote_id', loteId).is('cancelada_at', null)
   .order('created_at', {ascending:false}).limit(1)`).
4. Validar los campos de texto igual que `reservarLote` (obligatorios,
   moneda, estado civil, `recibidoPor`/`recibidoPorOtro`).
5. Para cada uno de los 5 campos de archivo: si llegó un archivo nuevo
   (`.size > 0`), validar tamaño y subirlo, usando el nuevo path; si no
   llegó ninguno, reusar el path ya guardado en la reserva encontrada en
   el paso 3.
6. Validar las condiciones de cónyuge/divorcio contra el path resultante
   (nuevo o heredado) del paso 5, no contra si se subió algo en ESTE
   envío puntual.
7. `UPDATE reservas SET ... WHERE id = <la encontrada en el paso 3>`.
8. Redirigir a `/admin/lotes/${loteId}` con éxito.

### Preservación de datos en errores de validación

Igual que ya hace `reservarLote` (pieza "reservar-preservar-datos",
`construirParamsPreservados`/`redirectConError`): si falla una validación
de texto, los campos de texto ya tipeados en ESTE envío se preservan vía
query params al volver a mostrar el formulario. Los archivos elegidos en
este envío (si los hubo) NO se preservan — limitación de `<input
type="file">`, aceptada en el resto del proyecto — pero como los archivos
son opcionales acá, esto es menos grave que en `reservar` (el usuario
puede simplemente corregir el texto y volver a confirmar sin necesidad de
re-elegir ningún archivo si no lo estaba reemplazando).

### Link nuevo en el detalle del lote

En `app/admin/lotes/[id]/page.tsx`, junto al botón "Cancelar reserva" ya
existente (mismo bloque condicional: admin + `estado === 'reservado'`),
un link "Editar reserva →" a la nueva página.

### Fuera de alcance

- Historial/auditoría de ediciones — no se construye.
- Editar la reserva de un lote ya vendido — bloqueado a propósito, mismo
  límite que cancelar.
- Cualquier interacción con el descuento de seña vía FIFO — no aplica,
  porque ese descuento ocurre recién al vender, y editar ya está
  bloqueado en ese punto.

## Testing

- Editar campos de texto (ej. corregir un teléfono), confirmar que
  persiste y que los archivos originales siguen intactos (mismos paths).
- Reemplazar un archivo (ej. subir un comprobante nuevo), confirmar que
  el path cambia y el archivo nuevo es el que queda accesible desde "Ver
  comprobante" en el detalle del lote.
- Cambiar estado civil a "casado" sin subir DNI del cónyuge (y la reserva
  original no era de una persona casada) → rechazado con mensaje claro.
- Cambiar estado civil a "casado" cuando la reserva YA tenía un DNI del
  cónyuge guardado (poco realista pero válido) → no exige subir uno
  nuevo, se mantiene el existente.
- Intentar acceder a la pantalla de edición de un lote que no está
  "reservado" (disponible o vendido) → mensaje, sin formulario.
- Un acreedor o vendedor no puede acceder a la pantalla (solo admin).
- Los datos de texto tipeados en un intento fallido se preservan al
  volver a mostrar el formulario.
