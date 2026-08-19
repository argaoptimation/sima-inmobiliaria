create table public.cotizaciones_dolar (
  id uuid primary key default gen_random_uuid(),
  fecha date not null unique,
  valor numeric not null,
  cargado_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
