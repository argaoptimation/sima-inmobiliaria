create table public.lote_distribucion_objetivos (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes(id) on delete cascade,
  profile_id uuid references public.profiles(id),
  cuenta_externa_id uuid references public.cuentas_externas(id),
  monto_objetivo numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint lote_distribucion_objetivos_uno_u_otro check (
    (profile_id is not null and cuenta_externa_id is null)
    or (profile_id is null and cuenta_externa_id is not null)
  ),
  unique (lote_id, profile_id),
  unique (lote_id, cuenta_externa_id)
);

create table public.cuota_distribuciones (
  id uuid primary key default gen_random_uuid(),
  cuota_id uuid not null references public.cuotas(id) on delete cascade,
  profile_id uuid references public.profiles(id),
  cuenta_externa_id uuid references public.cuentas_externas(id),
  monto numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint cuota_distribuciones_uno_u_otro check (
    (profile_id is not null and cuenta_externa_id is null)
    or (profile_id is null and cuenta_externa_id is not null)
  ),
  unique (cuota_id, profile_id),
  unique (cuota_id, cuenta_externa_id)
);
