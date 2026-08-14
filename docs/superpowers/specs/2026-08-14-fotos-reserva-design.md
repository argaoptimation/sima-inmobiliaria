# Diseño: Fotos en la reserva (DNI + condicionales por estado civil)

**Proyecto:** SIMA Inmobiliaria (cliente: Nicolás Saieg)
**Fecha:** 2026-08-14
**Estado:** Aprobado por Gabriel (WHAPIGEN) por chat.

## Contexto

La reserva (fase 1, 11/08/2026) deliberadamente no subía fotos todavía —
solo el comprobante de la seña — para cerrar primero el circuito de texto.
El documento original de Nicolás especifica además: fotos del DNI (ambos
lados), y si el interesado es casado el DNI del cónyuge, o si es divorciado
la sentencia de divorcio.

Un campo del documento original, "foto de la reserva", queda **fuera de
esta tanda**: su significado exacto (¿foto del recibo firmado en papel?
¿foto del lote?) no está claro y Gabriel decidió confirmarlo con Nicolás en
la reunión del lunes 17/08/2026 antes de construirlo, en vez de adivinar.
Ver `Notas_Decisiones_SIMA.txt`, punto 4 de PENDIENTE.

## Decisión

### 1. Cuatro columnas nuevas en `reservas`

```sql
alter table public.reservas
  add column dni_frente_path text,
  add column dni_dorso_path text,
  add column dni_conyuge_path text,
  add column sentencia_divorcio_path text;
```

`dni_frente_path` y `dni_dorso_path` se validan como obligatorios en la
Server Action (no `not null` en la base, porque no hay backfill posible
para las reservas ya existentes creadas en fase 1 — mismo criterio que
`comprobante_sena_path`, que si fuera agregado hoy tampoco podría ser
`not null` sin romper filas viejas; a diferencia de `comprobante_sena_path`
—que sí es `not null` porque existió desde el día 1 de la tabla— estas
columnas se agregan después, así que quedan nullable a nivel de schema y la
obligatoriedad vive en la validación de la Server Action, igual que ya pasa
hoy con `nombreCompleto`/`dni`/`domicilio` etc., que tampoco son `not null`
por la misma razón histórica).

`dni_conyuge_path` y `sentencia_divorcio_path` son condicionales: se exigen
solo si `estado_civil` es `casado` o `divorciado` respectivamente. Para
`soltero`/`viudo` quedan `null`.

### 2. Formulario: los 4 campos siempre visibles, validación condicional server-side

Sin JavaScript de cliente no se puede mostrar/ocultar un campo según el
`<select>` de estado civil sin recargar la página. Se opta por el mismo
patrón que ya usa "Quién recibió la seña" / "Si no está en la lista": los 4
inputs de archivo (DNI frente, DNI dorso, DNI del cónyuge, sentencia de
divorcio) están siempre visibles en el formulario, con una aclaración de
texto bajo los dos últimos ("Solo si elegiste 'Casado/a' arriba" / "Solo si
elegiste 'Divorciado/a' arriba"). La Server Action valida qué es
obligatorio según el `estadoCivil` que realmente vino en el `formData`, no
según lo que el campo de archivo tenga o no cargado.

### 3. Subida a storage: mismo bucket, mismo patrón de path

Reutiliza el bucket `comprobantes` ya existente (no hace falta uno nuevo) y
el mismo patrón de sanitización de nombre de archivo
(`replace(/[^a-zA-Z0-9._-]/g, '_')`). Path:
`reservas/${loteId}/${tipo}-${Date.now()}-${nombreSeguro}`, donde `tipo` es
uno de `dni-frente`, `dni-dorso`, `dni-conyuge`, `sentencia-divorcio` (el
comprobante de la seña ya usa el mismo prefijo `reservas/${loteId}/` sin
`tipo`, no se le toca).

### 4. Detalle del lote: nuevos links "Ver X"

En `app/admin/lotes/[id]/page.tsx`, junto al link ya existente "Ver
comprobante de la seña", se agregan (cuando corresponda): "Ver DNI
(frente)", "Ver DNI (dorso)", y condicionalmente "Ver DNI del cónyuge" /
"Ver sentencia de divorcio" si esos paths no son `null`. Mismo mecanismo de
signed URL (`createSignedUrl`, 300 segundos) ya usado para el comprobante.

## Fuera de alcance de esta tanda

- "Foto de la reserva" (significado a confirmar con Nicolás el lunes).
- Fotos del lote/terreno en sí (no mencionadas en el documento original
  como parte de la reserva).
- Reservas ya existentes antes de esta tanda no tienen estas fotos
  cargadas — no hay backfill posible, quedan con estos campos en `null`
  para siempre (dato histórico, no un error).

## Testing

- Unitario: no hace falta ninguno nuevo puro — es validación de formulario
  y orquestación de storage, se prueba con e2e contra la base real.
- E2E (extendiendo `tests/e2e/reserva-lote.spec.ts`):
  - Reservar con estado civil "soltero": DNI frente + dorso obligatorios,
    cónyuge/sentencia NO se piden aunque no se suban.
  - Reservar con estado civil "casado" sin subir el DNI del cónyuge →
    rechazado con mensaje claro, el lote sigue disponible.
  - Reservar con estado civil "divorciado" sin subir la sentencia →
    rechazado con mensaje claro.
  - Reservar con estado civil "casado" subiendo todo lo requerido → éxito,
    y el detalle del lote muestra los 4 links correspondientes (DNI
    frente/dorso/cónyuge), sin el link de sentencia (no aplica).
  - Reservar sin subir el DNI frente (o el dorso) → rechazado, mismo
    criterio que ya existe hoy para el comprobante de la seña.
- Regresión completa (build + unitarios + e2e x2) antes de cerrar, mismo
  criterio de siempre.
