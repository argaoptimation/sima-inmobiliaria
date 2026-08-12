alter table public.lotes
  alter column cantidad_cuotas drop not null,
  alter column monto_cuota_base drop not null;

delete from public.cuotas
where lote_id in (select id from public.lotes where estado <> 'vendido');

update public.lotes
set cantidad_cuotas = null, monto_cuota_base = null, fecha_primera_cuota = null
where estado <> 'vendido';
