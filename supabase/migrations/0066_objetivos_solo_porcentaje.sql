-- Segundo paso de la 0065 (15/09): se aplica recién con el código nuevo de
-- la distribución publicado en Vercel, que ya lee y guarda solo el
-- porcentaje. Ver el comentario "EN DOS PASOS" de la 0065.

delete from public.lote_distribucion_objetivos where porcentaje is null;

alter table public.lote_distribucion_objetivos
  alter column porcentaje set not null,
  drop column monto_objetivo;

create or replace function public.guardar_distribucion_lote(
  p_lote_id uuid,
  p_objetivos jsonb,
  p_distribuciones jsonb
)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  v_ciclo integer;
begin
  select ciclo_actual into v_ciclo from public.lotes where id = p_lote_id;

  if v_ciclo is null then
    raise exception 'El lote % no existe', p_lote_id;
  end if;

  delete from public.lote_distribucion_objetivos where lote_id = p_lote_id;

  insert into public.lote_distribucion_objetivos (lote_id, profile_id, cuenta_externa_id, porcentaje)
  select
    p_lote_id,
    (fila->>'profile_id')::uuid,
    (fila->>'cuenta_externa_id')::uuid,
    (fila->>'porcentaje')::numeric
  from jsonb_array_elements(p_objetivos) as fila;

  -- Igual que en la 0064: el reemplazo se acota a las cuotas VIVAS del ciclo
  -- vigente.
  delete from public.cuota_distribuciones
  where cuota_id in (
    select id from public.cuotas
    where lote_id = p_lote_id
      and ciclo = v_ciclo
      and not refinanciada
  );

  insert into public.cuota_distribuciones (cuota_id, profile_id, cuenta_externa_id, monto)
  select
    (fila->>'cuota_id')::uuid,
    (fila->>'profile_id')::uuid,
    (fila->>'cuenta_externa_id')::uuid,
    (fila->>'monto')::numeric
  from jsonb_array_elements(p_distribuciones) as fila
  where (fila->>'cuota_id')::uuid in (
    select id from public.cuotas
    where lote_id = p_lote_id
      and ciclo = v_ciclo
      and not refinanciada
  );
end;
$$;
