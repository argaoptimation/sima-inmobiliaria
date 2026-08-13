alter table public.pagos add column lote_id uuid references public.lotes(id);

update public.pagos p
set lote_id = l.id
from public.lotes l
where l.cliente_id = p.cliente_id
  and p.lote_id is null;

alter table public.pagos alter column lote_id set not null;
create index idx_pagos_lote_id on public.pagos(lote_id);
