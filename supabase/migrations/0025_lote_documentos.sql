create table public.lote_documentos (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes(id) on delete cascade,
  path text not null,
  descripcion text not null,
  subido_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
