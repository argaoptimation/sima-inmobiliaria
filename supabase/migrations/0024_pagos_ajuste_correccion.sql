alter type public.motivo_pago add value 'ajuste';

alter table public.pagos
  add column corrige_pago_id uuid references public.pagos(id);
