-- Cierra el gap real que quedó anotado al construir "rescindido": si un
-- lote rescindido-y-disponible se vuelve a vender, las cuotas nuevas
-- chocaban con las viejas (unique(lote_id, numero)), porque numero vuelve
-- a arrancar en 1. Se agrega un "ciclo de venta" -- cada rescisión seguida
-- de "volver a disponible" (volverADisponible, app/admin/lotes/[id]/actions.ts)
-- incrementa `lotes.ciclo_actual`, y las cuotas nuevas quedan marcadas con
-- ese ciclo. Las cuotas/ajustes de índice de un ciclo viejo quedan
-- intactos como historial, nunca se tocan ni se mezclan con el ciclo
-- nuevo.

alter table public.lotes add column ciclo_actual int not null default 1;
alter table public.cuotas add column ciclo int not null default 1;
alter table public.ajustes_indexacion add column ciclo int not null default 1;

alter table public.cuotas drop constraint cuotas_lote_id_numero_key;
alter table public.cuotas add constraint cuotas_lote_id_ciclo_numero_key unique (lote_id, ciclo, numero);
