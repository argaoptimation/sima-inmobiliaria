alter table public.pago_imputaciones
  add constraint pago_imputaciones_pago_id_cuota_id_key unique (pago_id, cuota_id);
