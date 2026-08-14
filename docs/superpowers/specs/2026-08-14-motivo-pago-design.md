# Diseño: Motivo del pago (seña / cuota) visible en Pagos

**Proyecto:** SIMA Inmobiliaria (cliente: Nicolás Saieg)
**Fecha:** 2026-08-14
**Estado:** Aprobado por Gabriel (WHAPIGEN) por chat.

## Contexto

Gabriel encontró en datos reales ("Lote1") un pago de seña ya
`estado='confirmado'` con `confirmado_acreedor_por` en blanco — correcto
según el diseño de "descuento automático de la seña" (la seña ya se
verificó al reservar, no repite la confirmación cruzada completa), pero
confuso al mirarlo en `/admin/pagos`: no hay ninguna forma de distinguir a
simple vista un pago de seña de un pago de cuota normal.

## Decisión

### 1. Columna nueva `pagos.motivo`, tipo enum

```sql
create type public.motivo_pago as enum ('cuota', 'sena');
alter table public.pagos add column motivo public.motivo_pago not null default 'cuota';
```

Backfill de los pagos ya existentes: un pago es "sena" si y solo si su
`comprobante_path` coincide exacto con el `comprobante_sena_path` de
alguna reserva (así es como el descuento automático de la seña copia el
comprobante — no sube uno nuevo, reusa el path tal cual). Todo lo demás
(que ya es la enorme mayoría) queda en `'cuota'`, el default.

```sql
update public.pagos
set motivo = 'sena'
where comprobante_path in (select comprobante_sena_path from public.reservas);
```

### 2. Los dos puntos de inserción de `pagos` fijan `motivo` explícito

- `app/portal-cliente/pagar/[id]/actions.ts` (`registrarPago`): agrega
  `motivo: 'cuota'` al insert (podría omitirse por el default, pero se
  deja explícito para que quien lea el código no tenga que ir a buscar
  cuál es el default).
- `app/admin/lotes/[id]/vender/actions.ts` (bloque de descuento
  automático de la seña): agrega `motivo: 'sena'` al insert.

### 3. Columna "Motivo" en `/admin/pagos`

Se agrega como segunda columna (después de "Lote", antes de "Monto"),
mostrando "Seña" o "Cuota" en español. No cambia ningún otro
comportamiento de la pantalla — es puramente informativo.

## Fuera de alcance de esta tanda

- Quién confirma la seña (queda como pregunta para Nicolás, ver
  `Notas_Decisiones_SIMA.txt` punto 2 de PENDIENTE) — esta tanda es solo
  hacer visible el motivo, no cambia el mecanismo de confirmación.
- Cualquier filtro por motivo en la pantalla de Pagos (mostrar todo junto
  sigue siendo el comportamiento actual, solo se agrega la columna).

## Testing

- Unitario: no hace falta.
- E2E: extender un test existente de `/admin/pagos` (o uno nuevo chico)
  para confirmar que un pago de seña muestra "Seña" y uno normal muestra
  "Cuota" en la columna nueva.
- Regresión completa (build + unitarios + e2e x2) antes de cerrar.
