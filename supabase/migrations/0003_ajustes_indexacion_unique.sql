alter table public.ajustes_indexacion
  add constraint ajustes_indexacion_lote_fecha_pct_key unique (lote_id, fecha_desde, porcentaje);
