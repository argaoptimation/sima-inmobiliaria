alter table public.profiles
  add column datos_transferencia text;

alter table public.lotes
  add column admin_id uuid references public.profiles(id),
  add column acreedor_id uuid references public.profiles(id),
  add column vendedor_id uuid references public.profiles(id),
  add column cuenta_cobro_id uuid references public.profiles(id),
  drop column datos_transferencia;
