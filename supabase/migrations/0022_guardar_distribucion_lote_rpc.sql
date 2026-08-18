-- Guarda la distribución completa de un lote (objetivos + distribución por
-- cuota) como una sola transacción atómica: si algo falla a mitad de camino,
-- no queda nada borrado sin su reemplazo. Reemplaza la secuencia de 4
-- llamadas sueltas (borrar/insertar en cada tabla) que se usaba antes, que
-- podía perder la distribución ya guardada de un lote entero si la última
-- inserción fallaba por un error transitorio de base de datos.
create or replace function public.guardar_distribucion_lote(
  p_lote_id uuid,
  p_objetivos jsonb,
  p_distribuciones jsonb
) returns void
language plpgsql
as $$
begin
  delete from public.lote_distribucion_objetivos where lote_id = p_lote_id;

  insert into public.lote_distribucion_objetivos (lote_id, profile_id, cuenta_externa_id, monto_objetivo)
  select
    p_lote_id,
    (fila->>'profile_id')::uuid,
    (fila->>'cuenta_externa_id')::uuid,
    (fila->>'monto')::numeric
  from jsonb_array_elements(p_objetivos) as fila;

  delete from public.cuota_distribuciones
  where cuota_id in (select id from public.cuotas where lote_id = p_lote_id);

  insert into public.cuota_distribuciones (cuota_id, profile_id, cuenta_externa_id, monto)
  select
    (fila->>'cuota_id')::uuid,
    (fila->>'profile_id')::uuid,
    (fila->>'cuenta_externa_id')::uuid,
    (fila->>'monto')::numeric
  from jsonb_array_elements(p_distribuciones) as fila;
end;
$$;
