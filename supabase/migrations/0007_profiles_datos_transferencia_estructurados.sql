alter table public.profiles
  add column alias text,
  add column banco text,
  add column cbu text,
  add column titular text,
  drop column datos_transferencia;
