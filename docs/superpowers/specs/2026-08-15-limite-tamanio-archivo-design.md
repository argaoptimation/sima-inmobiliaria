# Límite de tamaño de archivo en subidas — Diseño

**Origen:** punto 42 de `Notas_Decisiones_SIMA.txt`. Pedido de producto (evitar
que alguien suba por error un video o un archivo gigante) con una lectura de
seguridad real (un archivo enorme podría degradar el servicio).

## Estado actual

Hoy ningún upload del sistema valida tamaño. Hay 6 puntos de subida a
Supabase Storage (bucket `comprobantes`), repartidos en 2 archivos:

- `app/admin/lotes/[id]/reservar/actions.ts`: comprobante de la seña
  (obligatorio), DNI frente (obligatorio), DNI dorso (obligatorio), DNI del
  cónyuge (opcional, solo si casado), sentencia de divorcio (opcional, solo
  si divorciado). 4 de los 5 pasan por un helper local `subirArchivoReserva`;
  el comprobante de la seña se sube con código inline separado.
- `app/portal-cliente/pagos/[id]/comprobante/actions.ts`: comprobante de pago
  de cuota (obligatorio), subida inline.

No hay ningún helper compartido entre ambos archivos — cada uno arma su
propio `path` y llama a `admin.storage.from('comprobantes').upload(...)`.

El proyecto es 100% Server Components/Server Actions sin JavaScript de
cliente (fuera del patrón ya establecido de confirm-dialog), así que no hay
forma de frenar la subida ANTES de que el archivo viaje al servidor — la
validación es server-side, igual que el resto de las validaciones del
proyecto (campos obligatorios, formatos, etc.), y un archivo gigante va a
tardar en subirse igual antes de ser rechazado. Es una limitación aceptada,
coherente con el resto del proyecto.

Confirmado con la documentación de Supabase: el plan Pro del proyecto
permite hasta 500 GB por archivo y 100 GB de Storage incluidos en la
suscripción — el límite que ponemos acá es 100% una decisión de producto
nuestra, no algo impuesto por la plataforma.

## Diseño

### Helper compartido

Nuevo archivo `lib/storage/validar-tamanio-archivo.ts`:

- `MAX_ARCHIVO_BYTES`: constante, 15 MB (`15 * 1024 * 1024`).
- `excedeTamanioMaximo(archivo: File): boolean`: devuelve `true` si
  `archivo.size > MAX_ARCHIVO_BYTES`.

Un único punto de verdad para el límite, usado por los dos archivos de
acciones existentes. Si en el futuro se agrega un nuevo punto de subida
(por ejemplo el "documento firmado" del punto 7, en curso en paralelo),
importa el mismo helper en vez de reinventar el chequeo.

### Aplicación en `reservar/actions.ts`

Para cada archivo (comprobante, dniFrente, dniDorso, dniConyuge,
sentenciaDivorcio), se agrega el chequeo de tamaño en el mismo punto donde
hoy se valida presencia/tamaño-cero, con el mismo patrón de
`redirect` + mensaje de error legible en español, ej.:

> "El comprobante de la seña pesa más de 15 MB — subí uno más liviano."

Cada archivo tiene su propio mensaje (mencionando qué campo es), igual que
ya hace el proyecto con "Subí el comprobante de la seña" / "Subí las fotos
del DNI (frente y dorso)".

### Aplicación en `portal-cliente/pagos/[id]/comprobante/actions.ts`

Mismo patrón: chequeo justo después de la validación de tamaño-cero
existente, redirect con `?error=` legible.

### Fuera de alcance

- No hay validación de tipo de archivo (MIME/extensión) — solo tamaño. Es
  un pedido aparte, no mencionado en el punto 42.
- No hay límite distinto por tipo de campo (todos comparten el mismo tope
  de 15 MB) — no hay ninguna razón de negocio para diferenciarlos hoy.
- No se toca el límite global de Supabase Storage (configuración del
  dashboard) — el chequeo vive enteramente en el código de la app.
- No se agrega ninguna advertencia client-side (JS) antes de subir — fuera
  del alcance del proyecto (sin JS de cliente).

## Testing

- Test unitario para `excedeTamanioMaximo`: un archivo de exactamente 15 MB
  pasa, uno de 15 MB + 1 byte no pasa, uno chico (ej. 1 KB) pasa.
- Un test e2e en el flujo de reservar subiendo un comprobante de más de
  15 MB (`Buffer` generado en el test) y verificando el mensaje de error.
- Un test e2e en el flujo de comprobante de pago del portal del cliente,
  mismo mecanismo.

No hace falta un test e2e por cada uno de los 5 campos de `reservar/
actions.ts` — el test unitario ya cubre exhaustivamente la lógica del
helper; los e2e solo confirman que quedó conectado en cada archivo.
