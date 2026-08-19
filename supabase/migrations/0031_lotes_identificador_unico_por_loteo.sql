-- El identificador de un lote es único por loteo, no global. Los lotes
-- sin loteo asignado (loteo_id null) forman su propio grupo aparte: una
-- constraint unique compuesta normal no alcanza para ese caso porque
-- Postgres nunca considera dos NULL iguales entre sí, así que se agrega
-- un índice único parcial específico para loteo_id is null.
alter table public.lotes
  add constraint lotes_loteo_identificador_unique unique (loteo_id, identificador);

create unique index lotes_identificador_sin_loteo_unique
  on public.lotes (identificador)
  where loteo_id is null;
