alter table public.reservas
  add column cancelada_por uuid references public.profiles(id),
  add column cancelada_at timestamptz;
