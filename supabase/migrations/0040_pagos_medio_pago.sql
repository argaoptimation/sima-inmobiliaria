create type public.medio_pago as enum ('transferencia', 'efectivo');
alter table public.pagos add column medio_pago public.medio_pago not null default 'transferencia';
