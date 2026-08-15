# Vender — monto de cuota manual con balance + documento firmado obligatorio — Diseño

**Origen:** puntos 32 y 7 de `Notas_Decisiones_SIMA.txt`. Se combinan en un
solo spec/plan porque ambos tocan exactamente los mismos dos archivos
(`app/admin/lotes/[id]/vender/page.tsx` y `actions.ts`) y comparten el
mismo formulario — hacerlos por separado generaría dos diffs pisándose el
mismo archivo.

- **Punto 32:** hoy el monto de cada cuota se calcula siempre solo (precio
  total / cantidad de cuotas). Nicolás quiere un tilde: automático (como
  hoy) o manual (cargar el monto de cada cuota a mano, sin que tengan que
  ser todas iguales).
- **Punto 7:** Nicolás confirmó que quiere exigir la subida del documento
  firmado (boleto de compraventa o escritura) como requisito para pasar un
  lote a "vendido". Hoy `instrumentacion` se carga en la reserva pero es
  solo informativo — vender nunca pide ni valida ningún archivo.

Depende de que ya exista el helper de límite de tamaño de archivo (spec
`2026-08-15-limite-tamanio-archivo-design.md`) — el nuevo upload de esta
tanda lo usa desde el primer momento, no hace falta agregarlo después.

## Estado actual relevante

`venderLote` (`app/admin/lotes/[id]/vender/actions.ts`) ya tiene un flujo
de varios pasos por redirect para el caso "cliente existente por email":
si el email coincide con una cuenta ya cargada y todavía no se confirmó,
redirige a la misma página con `confirmarClienteId`, `nombreEncontrado`,
más los campos ya tipeados preservados (`fullName`, `email`,
`cantidadCuotas`, `fechaPrimeraCuota`), y opcionalmente `dniReserva`/
`dniPerfil` si el DNI no coincide. El admin confirma con un submit que
incluye `confirmarClienteExistente=<id>`.

`calcularMontoCuota` + `generarCuotas` (`lib/lotes/calcular-monto-cuota.ts`,
`lib/lotes/generar-cuotas.ts`) generan las cuotas automáticas hoy: monto
igual para todas salvo la última, que absorbe el redondeo para que la
suma cierre exacto con `precio_total`.

## Diseño

### Punto 7 — documento firmado

Un campo de archivo nuevo, "Documento firmado (boleto de compraventa o
escritura)", obligatorio para completar cualquier venta (automática o
manual). Se sube al mismo bucket `comprobantes`, path
`ventas/{loteId}/documento-{timestamp}-{nombreArchivo}` (mismo patrón que
`subirArchivoReserva` de la reserva). Pasa por el mismo chequeo de tamaño
máximo del helper compartido (spec de límite de archivo).

Nueva columna `lotes.documento_firmado_path text` (nullable — no rompe
lotes vendidos antes de esta tanda), migración
`supabase/migrations/0020_lotes_documento_firmado.sql`.

En el detalle del lote (`app/admin/lotes/[id]/page.tsx`), se agrega un
enlace "Ver documento firmado" con URL firmada, mismo patrón que ya existe
para "Ver DNI (frente)/(dorso)".

No se valida contra el tipo de `instrumentacion` elegido en la reserva
(boleto vs. escritura) — es un solo campo genérico, sin selector de tipo.
Decisión deliberada para no sobre-construir: la reserva ya registra la
instrumentación prevista como dato informativo: alcanza con exigir UN
archivo al vender, sea cual sea.

El input de archivo NO lleva el atributo HTML `required` (a diferencia
del resto de los campos de archivo del proyecto) porque su presencia
efectiva se exige en un paso distinto según el modo (ver abajo) — la
validación real es 100% server-side, igual que todo lo demás, solo que
acá no hay forma de expresar "obligatorio, pero recién en el paso que
corresponda" con el atributo nativo del navegador.

### Punto 32 — cuota manual con balance

Selector nuevo en el formulario: "Cómo cargar las cuotas — Automático /
Manual" (radio, `Automático` tildado por defecto). Automático es
exactamente el comportamiento de hoy.

Con Manual, como no hay JavaScript de cliente y la cantidad de campos de
monto depende de `cantidadCuotas` (que recién se conoce al enviar el
formulario), el flujo necesita pasos por redirect — reusando el mismo
mecanismo de preservar valores vía query params que ya usa esta página
para "cliente existente":

1. **Paso 1 (formulario principal):** nombre, email, cantidad de cuotas,
   fecha de la primera cuota, modo. Si modo = Manual, este envío no trae
   todavía ningún monto de cuota — la acción lo detecta y redirige a la
   misma página agregando `modo=manual` + los campos ya preservados
   (mismo criterio que hoy con fullName/email/cantidadCuotas/
   fechaPrimeraCuota). El chequeo de "cliente existente por email" sigue
   pasando primero, sin cambios — si hace falta confirmar, ese paso ocurre
   acá, antes de llegar a la carga de montos. El redirect existente de
   "cliente existente" (el que arma `confirmarClienteId` +
   `nombreEncontrado` + los campos preservados) también pasa a incluir
   `modo` en su lista de query params preservados, para no perderlo si el
   admin tiene que confirmar la cuenta existente antes de llegar al paso
   de montos manuales.
2. **Paso 2 (montos + documento):** la página, al ver `modo=manual` y
   `cantidadCuotas` en la URL, renderiza un campo de monto por cada cuota
   (`cuotaMonto1` .. `cuotaMontoN`), con el precio de lista del lote
   mostrado como referencia estática arriba (sin suma en vivo, no hay JS
   para eso), más el campo de documento firmado (acá si es obligatorio en
   la práctica). Al enviar, la acción sube el documento, valida que cada
   monto sea un número válido y no negativo, calcula la suma total, y —
   si todavía no está confirmado — redirige al paso 3 preservando todo
   (incluidos los montos y el `documentoFirmadoPath` ya subido).
3. **Paso 3 (confirmar balance):** muestra "Suma total cargada: $X —
   Precio de lista del lote: $Y — Diferencia: $Z" y un botón "Confirmar
   venta". Ese submit final incluye `confirmarMontosManual=true` + todos
   los valores como inputs ocultos (sin volver a pedir el archivo, ya
   subido en el paso 2). Recién ahí se crea la venta.

El documento se sube una sola vez, en el paso 2 — si el admin abandona el
flujo después de subirlo sin llegar a confirmar el paso 3, el archivo
queda huérfano en Storage sin usarse. Es un caso raro y de bajo impacto,
mismo criterio de tolerancia que ya acepta el proyecto en casos
similares (ver punto 27 de `Notas_Decisiones_SIMA.txt`) — no se
construye ninguna limpieza automática para esto.

No se exige que la suma coincida con el precio de lista — Gabriel lo pidió
explícitamente así: "permitir cualquier suma... que al final le dé un
balance total... para que pueda ver si le hizo un descuento". La pantalla
de confirmación es informativa, no bloqueante.

### Generación de cuotas en modo manual

Nueva función en `lib/lotes/generar-cuotas.ts`,
`generarCuotasManual(montos: number[], fechaPrimeraCuota: string):
CuotaGenerada[]`, que arma la lista de cuotas a partir de los montos
tipeados (numeradas 1..N, fecha calculada con el mismo `sumarMeses` que ya
usa `generarCuotas`), sin ningún ajuste de redondeo contra `precio_total`
(los montos ya son los definitivos, tal cual los tipeó Nicolás).

`lotes.monto_cuota_base` se guarda `null` cuando el modo es manual — no
hay un monto "base" único que tenga sentido guardar ahí (la columna hoy
no se lee en ningún lado de la app fuera de la propia escritura al
vender, así que no rompe ninguna pantalla existente).

El resto del flujo (claim atómico del lote, insert de `cuotas`, descuento
automático de la seña vía FIFO) no cambia — ya opera de forma genérica
sobre el array de cuotas ya creadas en la base, sin importar si vinieron
del cálculo automático o de los montos manuales.

## Fuera de alcance

- No se valida que la suma de cuotas manuales coincida con el precio de
  lista (decisión explícita de Gabriel).
- No se sube ningún tipo de "borrador" para recuperar el documento si se
  abandona el flujo manual antes de confirmar (archivo huérfano aceptado).
- No se agrega un selector de tipo de documento (boleto vs. escritura) —
  un solo campo genérico.
- No se cambia nada del modo automático salvo agregar la exigencia del
  documento firmado.
- No se toca la venta al contado (`cantidadCuotas = 1`) más allá de que
  también exige el documento — sigue funcionando igual en cualquier otro
  aspecto.

## Testing

- Test unitario para `generarCuotasManual`: monta cuotas con montos
  distintos, verifica números y fechas correctos, sin ajuste de
  redondeo.
- Test e2e modo automático: vender un lote con el documento firmado
  cargado, cuotas iguales como hoy, verificar que sin documento la venta
  se rechaza con un mensaje claro.
- Test e2e modo manual: elegir manual, cargar montos distintos entre sí
  (algunos por encima, otros por debajo del promedio), pasar por la
  pantalla de balance viendo la diferencia contra el precio de lista,
  confirmar, y verificar que las cuotas quedan creadas con esos montos
  exactos.
- Test e2e modo manual + cliente existente: confirmar que ambos mecanismos
  de redirect (cliente existente y carga manual de cuotas) se pueden
  encadenar sin perder ningún dato preservado.
- Verificar que los tests e2e existentes que pasan por vender
  (`pase-a-vendido.spec.ts`, `vender-datos-cliente.spec.ts`,
  `cliente-varios-lotes.spec.ts`) se actualizan para adjuntar el documento
  firmado donde haga falta, ya que pasa a ser obligatorio.
