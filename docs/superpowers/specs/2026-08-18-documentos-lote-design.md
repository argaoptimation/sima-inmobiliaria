# Documentos del lote + información de acceso rápido para el vendedor — Diseño

**Fecha:** 2026-08-18
**Estado:** Aprobado por Gabriel, avanzar directo a plan + ejecución (sin revisión de spec).

## Contexto (puntos 41d + 43 de Notas_Decisiones_SIMA.txt)

Hoy no hay forma de adjuntar documentación suelta a un lote (planos, papeles varios) más
allá de los archivos con columna fija ya existentes (DNI, comprobante de seña, documento
firmado). Tampoco hay una pantalla donde el vendedor pueda ver esa documentación, el
precio o quién es el acreedor de un lote antes de reservarlo — hoy `/admin/lotes/[id]/reservar`
no muestra ningún dato del lote, solo el formulario de reserva.

## Alcance

- Tabla nueva de documentos sueltos por lote, con descripción libre (no categorías fijas).
- Subir/borrar: administrador o el acreedor del lote (mismo criterio que ya usan "Datos
  generales"/"Cobro" en el detalle de lote).
- Pantalla nueva de solo lectura, accesible sin pasar por el flujo de reservar, con acceso
  para administrador/acreedor/vendedor/cobrador (mismo criterio que ya usa reservar).
- Fuera de alcance: categorías predefinidas de documento, versionado, previsualización
  inline (se linkea igual que el resto de archivos del proyecto, con URL firmada).

## Modelo de datos

Tabla nueva `lote_documentos` — primera vez que el proyecto tiene una lista de largo
variable de archivos (todo lo demás es una columna fija por archivo):

```sql
create table public.lote_documentos (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes(id) on delete cascade,
  path text not null,
  descripcion text not null,
  subido_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
```

## Quién sube/borra, y desde dónde

Sección nueva "Documentos" en `app/admin/lotes/[id]/page.tsx` (detalle de lote de
administrador/acreedor), con:
- Lista de documentos ya subidos: descripción, link "Ver documento" (URL firmada, mismo
  mecanismo que `documento_firmado_path`), quién lo subió, botón "Eliminar".
- Formulario para subir uno nuevo: descripción (texto libre, obligatorio) + archivo.

Ambas acciones (`subirDocumentoLote`, `eliminarDocumentoLote`) usan
`requireAdminSobreLote(loteId)` (`lib/auth/require-admin.ts`) — mismo gate que ya protege
`actualizarDatosGenerales`/`actualizarCobro` en el mismo archivo de actions: administrador,
o el acreedor si es el suyo. Eliminar borra solo la fila de `lote_documentos` (no el
archivo del storage — mismo criterio que el resto del proyecto ya usa en otros lados,
no se limpia storage al borrar referencias).

Tamaño máximo: se reusa `MAX_ARCHIVO_MB`/`excedeTamanioMaximo` (`lib/storage/validar-tamanio-archivo.ts`)
tal cual, mismo límite que el resto de subidas del proyecto. Bucket: `comprobantes` (el
mismo que ya usa todo el proyecto), path `lotes/${loteId}/documento-${Date.now()}-${nombreSeguro}`.

## Pantalla de solo lectura para acceso rápido

Página nueva `app/admin/lotes/[id]/info/page.tsx`, sin formulario, gateada con
`requireAccesoParaReservar(id)` (mismo acceso que ya tiene `/reservar`: administrador,
acreedor si es el suyo, vendedor, cobrador). Muestra:

- Identificador, ubicación, estado.
- Precio total + moneda (si el lote lo tiene cargado).
- Quién es el acreedor (nombre, o "sin asignar" si no tiene).
- Lista de documentos con sus links (misma URL firmada que la sección de arriba, pero
  sin controles de subir/eliminar — es de solo lectura acá).

No incluye cuotas, cliente ni cobranza — ninguno de esos existe todavía en un lote
"disponible", y esta pantalla es la misma para cualquier estado del lote (no se oculta
nada dependiendo del estado, a diferencia de `/reservar` que sí cambia según
`lote.estado`).

## Acceso desde la lista de lotes

En `app/admin/lotes/page.tsx`, se agrega un link "Ver información del lote →" apuntando
a `/admin/lotes/${lote.id}/info`, visible para todos los roles que hoy ven esta tabla
(vendedor/cobrador ya tienen ahí mismo "Reservar"; administrador/acreedor ya tienen "Ver
detalle" — a ambos grupos se les agrega este link nuevo, sin sacar los que ya existen).

## Testing

Casos e2e a cubrir:
1. Admin sube un documento, aparece en la sección "Documentos" del detalle de lote con
   su link funcionando.
2. Acreedor sube un documento a SU PROPIO lote — permitido.
3. Acreedor intenta acceder a la acción sobre un lote que NO es suyo — rechazado
   (servidor, no solo el filtro de render).
4. Admin elimina un documento — desaparece de la lista, el resto queda intacto.
5. Vendedor entra a `/admin/lotes/[id]/info` de un lote "disponible" y ve precio,
   acreedor y los documentos, sin necesidad de pasar por "Reservar".
6. Un cliente (rol sin acceso) no puede entrar a `/admin/lotes/[id]/info` — redirigido.
7. El link "Ver información del lote →" aparece en `/admin/lotes` para vendedor/cobrador.
