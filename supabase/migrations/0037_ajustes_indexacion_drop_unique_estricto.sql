-- El unique (lote_id, fecha_desde, porcentaje) era un backstop para el
-- modelo viejo (una sola cuota por ventana de mes). Con el catch-up nuevo,
-- dos cuotas del mismo lote vencidas el mismo mes pueden legítimamente
-- terminar con el mismo % aplicado, lo que violaría este constraint sin
-- que sea un error real. La idempotencia real ya la maneja la propia
-- lógica de la aplicación (chequea ajustes_indexacion existentes antes de
-- procesar cada cuota).
alter table public.ajustes_indexacion drop constraint ajustes_indexacion_lote_fecha_pct_key;
