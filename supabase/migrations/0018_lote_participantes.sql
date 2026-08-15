create table public.lote_participantes (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes(id) on delete cascade,
  profile_id uuid references public.profiles(id),
  cuenta_externa_id uuid references public.cuentas_externas(id),
  etiqueta text,
  created_at timestamptz not null default now(),
  constraint lote_participantes_uno_u_otro check (
    (profile_id is not null and cuenta_externa_id is null)
    or (profile_id is null and cuenta_externa_id is not null)
  ),
  unique (lote_id, profile_id),
  unique (lote_id, cuenta_externa_id)
);
