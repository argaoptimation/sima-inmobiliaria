create type public.user_role as enum ('administrador', 'acreedor', 'vendedor', 'cliente', 'cobrador');
create type public.moneda as enum ('USD', 'ARS');
create type public.lote_estado as enum ('disponible', 'reservado', 'vendido');
create type public.pago_estado as enum ('pendiente', 'confirmado');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null,
  full_name text not null,
  created_at timestamptz not null default now()
);

create table public.lotes (
  id uuid primary key default gen_random_uuid(),
  identificador text not null,
  moneda public.moneda not null,
  estado public.lote_estado not null default 'disponible',
  cliente_id uuid references public.profiles(id),
  cantidad_cuotas int not null,
  monto_cuota_base numeric(14,2) not null,
  fecha_primera_cuota date,
  created_at timestamptz not null default now()
);

create table public.cuotas (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes(id) on delete cascade,
  numero int not null,
  monto_base numeric(14,2) not null,
  saldo_pendiente numeric(14,2) not null,
  fecha_vencimiento date not null,
  created_at timestamptz not null default now(),
  unique (lote_id, numero)
);

create table public.ajustes_indexacion (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes(id) on delete cascade,
  porcentaje numeric(6,3) not null,
  fecha_desde date not null,
  aplicado_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.profiles(id),
  monto numeric(14,2) not null,
  moneda public.moneda not null,
  comprobante_path text,
  estado public.pago_estado not null default 'pendiente',
  confirmado_acreedor_por uuid references public.profiles(id),
  confirmado_acreedor_at timestamptz,
  confirmado_admin_por uuid references public.profiles(id),
  confirmado_admin_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.pago_imputaciones (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null references public.pagos(id) on delete cascade,
  cuota_id uuid not null references public.cuotas(id),
  monto_imputado numeric(14,2) not null,
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', false);
