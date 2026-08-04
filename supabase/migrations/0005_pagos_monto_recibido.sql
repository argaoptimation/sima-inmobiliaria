alter table public.pagos
  add column monto_recibido numeric(14,2),
  add column moneda_recibida public.moneda;
