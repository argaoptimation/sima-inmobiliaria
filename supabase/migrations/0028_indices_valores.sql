create table public.indices_valores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  periodo date not null,
  valor numeric not null,
  cargado_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (nombre, periodo)
);

alter table public.lotes add column indice_tipo text;
