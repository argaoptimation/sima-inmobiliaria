create type public.movimiento_externo_tipo as enum ('debito', 'credito');

create table public.cuentas_externas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  titular text not null,
  alias text not null,
  banco text not null,
  cbu text,
  created_at timestamptz not null default now()
);

create table public.cuentas_externas_movimientos (
  id uuid primary key default gen_random_uuid(),
  cuenta_externa_id uuid not null references public.cuentas_externas(id),
  tipo public.movimiento_externo_tipo not null,
  monto numeric(14,2) not null,
  moneda public.moneda not null,
  concepto text not null,
  pago_id uuid references public.pagos(id),
  cargado_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.lotes
  add column cuenta_cobro_externa_id uuid references public.cuentas_externas(id);
