# Reservar — preservar datos tipeados si falta un campo obligatorio — Diseño

**Origen:** punto 41c de `Notas_Decisiones_SIMA.txt`. "Si falta un campo
obligatorio al guardar la reserva, que no se pierdan los datos que sí se
habían tipeado (hoy, al redirigir con error, el formulario vuelve vacío —
no hay preservación de valores)."

## Estado actual

`reservarLote` (`app/admin/lotes/[id]/reservar/actions.ts`) valida en
varios pasos ANTES del claim atómico del lote (el `update ... eq('estado',
'disponible')` que marca el lote como reservado): quién recibió la seña,
presencia del comprobante, presencia de las fotos de DNI, campos
obligatorios completos, monto de la seña válido, estado civil válido, DNI
del cónyuge/sentencia de divorcio según corresponda, moneda válida,
instrumentación válida. Cada uno de estos 9 chequeos redirige a
`/admin/lotes/{id}/reservar?error=...` sin preservar ningún valor tipeado.

Ya existe un precedente idéntico y funcionando en este mismo proyecto: la
página de vender (`app/admin/lotes/[id]/vender/page.tsx` +
`actions.ts`) preserva `fullName`, `email`, `cantidadCuotas` y
`fechaPrimeraCuota` como query params en sus redirects de error, y la
página los usa como `defaultValue` de cada input. Este diseño reutiliza
exactamente ese patrón para reservar, sin inventar uno nuevo.

Esta misma página ya tiene un mecanismo de `searchParams.dni` para el
buscador de cliente por DNI (tanda del 15/08/2026) — el diseño de abajo
convive con eso.

## Diseño

### Qué se preserva

Los 12 campos de texto/select del formulario principal (todo excepto los
inputs de archivo, que el navegador nunca permite prellenar por seguridad
— limitación aceptada, mismo criterio que ya acepta el precedente de
vender):

`nombreCompleto`, `dni`, `domicilio`, `email`, `telefono`,
`telefonoAlternativo`, `estadoCivil`, `instrumentacion`, `montoSena`,
`monedaSena`, `recibidoPor`, `recibidoPorOtro`.

### Dónde se aplica

Solo en los 9 redirects de validación que ocurren ANTES del claim atómico
del lote (listados arriba). Los redirects que ocurren DESPUÉS del claim
(lote dejó de estar disponible por una carrera, falla al subir un archivo,
falla al insertar la fila de `reservas`) NO se tocan: en esos casos el
lote ya quedó marcado `estado = 'reservado'` en la base, así que al volver
a esta misma URL la página ya no muestra el formulario — muestra "Este
lote ya no está disponible para reservar" (rama `lote.estado !==
'disponible'`). Preservar valores ahí no tendría ningún efecto visible.

Esto deja expuesto, sin resolver acá (fuera de alcance, prexistente), un
hueco distinto: si el claim tiene éxito pero después falla una subida de
archivo o el insert de `reservas`, el lote queda "reservado" sin ninguna
fila de `reservas` asociada y sin forma de reintentar desde esta pantalla.
No es parte del punto 41c — es un caso de recuperación de fallos aparte,
se anota en la documentación del proyecto para una tanda futura si hace
falta.

### Colisión de nombre a resolver: `dni`

El buscador de DNI ya usa el query param `dni` para dos cosas distintas:
disparar la búsqueda de cliente Y, indirectamente, como valor por defecto
del campo `dni` del formulario. Si el valor preservado del campo `dni`
tipeado usara el mismo nombre de param `dni`, el redirect de un error
volvería a disparar el bloque de búsqueda por DNI (mostrando el aviso
"Encontramos a ... / No encontramos ningún cliente...") aunque la
intención real era solo "no perder lo que tipeé".

Se usa un nombre de param distinto para el valor preservado de ese campo
específico: `dniPreservado`. El resto de los campos preservados reutiliza
el mismo nombre que su campo de formulario (sin colisión con nada
existente), igual que ya hace el precedente de vender.

### Precedencia al calcular cada `defaultValue`

Para cada campo, el valor preservado por error (si está presente en la
URL) tiene prioridad sobre el precargado por la búsqueda de DNI, que a su
vez tiene prioridad sobre el valor vacío por defecto:

`dni`: `dniPreservado ?? clienteEncontrado?.dni ?? dniBuscado ?? ''`

`nombreCompleto`, `domicilio`, `email`, `telefono`: mismo patrón,
`valorPreservado ?? clienteEncontrado?.campo ?? ''`.

`telefonoAlternativo`, `recibidoPorOtro`: no tienen contraparte en
`clienteEncontrado` (no son parte del perfil del cliente) —
`valorPreservado ?? ''`.

`estadoCivil`, `instrumentacion`, `monedaSena`, `recibidoPor`: mismo
patrón que hoy pero con el valor preservado como primera opción, cayendo
al comportamiento actual (primera opción del select, `''`, `'USD'`,
usuario logueado respectivamente) si no hay nada preservado.

Este diseño hace que, una vez que ocurre CUALQUIER redirect de error, el
precargado por búsqueda de DNI quede subsumido: el valor preservado ya
contiene lo que estaba en el campo al momento de enviar (haya venido de
tipeo manual o del precargado de la búsqueda), así que no hace falta
distinguir explícitamente "el usuario lo tocó" de "vino de la búsqueda".

### `montoSena` como número

El valor preservado de `montoSena` viaja como string en la URL (todos los
query params lo son) y se usa directo como `defaultValue` de un
`<input type="number">` — el propio input lo interpreta como número al
mostrarse, mismo mecanismo que ya usa `cantidadCuotas` en el precedente de
vender.

## Fuera de alcance

- Los 5 campos de archivo (comprobante, DNI frente/dorso/cónyuge,
  sentencia de divorcio) no se preservan — imposible sin JavaScript de
  cliente, limitación aceptada.
- El hueco de "lote reservado sin fila de reserva completa" tras una falla
  post-claim (ver arriba) no se resuelve en esta tanda.
- No se toca ningún otro formulario del proyecto (ej. vender ya tiene su
  propia preservación, no se está unificando en un helper compartido —
  son solo 2 casos, no amerita una abstracción todavía).

## Testing

- Test e2e: completar el formulario con todos los campos salvo uno
  obligatorio (ej. sin teléfono), enviar, verificar que redirige con el
  error Y que los demás campos siguen mostrando lo tipeado (via
  `inputValue()` de Playwright).
- Test e2e: usar el buscador de DNI (match existente), después provocar
  un error de validación (ej. sin comprobante), y verificar que los
  campos siguen mostrando los valores que trajo la búsqueda (que ahora
  viajan como valor preservado, no como precarga de búsqueda).
- Verificar que los tests e2e existentes de reservar
  (`reserva-lote.spec.ts`, `fotos-reserva.spec.ts`,
  `buscar-cliente-dni.spec.ts`, `pase-a-vendido.spec.ts`) siguen pasando
  sin cambios de comportamiento no buscados.
