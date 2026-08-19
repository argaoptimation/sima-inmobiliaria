create table public.loteos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now()
);

alter table public.lotes add column loteo_id uuid references public.loteos(id);

insert into public.loteos (nombre) values ('Sin asignar');

update public.lotes
set loteo_id = (select id from public.loteos where nombre = 'Sin asignar')
where loteo_id is null;
