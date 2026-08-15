alter table public.profiles
  add column dni text,
  add column domicilio text,
  add column telefono text;

create unique index profiles_dni_unique on public.profiles (dni) where dni is not null;
