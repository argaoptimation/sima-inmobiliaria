-- Endurecimiento de guardar_distribucion_lote (hallazgos Minor de la
-- revision final de rama):
-- 1) La insercion en cuota_distribuciones ahora exige que cada cuota_id
--    pertenezca realmente a p_lote_id -- antes el DELETE estaba scopeado
--    por lote pero el INSERT aceptaba cualquier cuota_id, confiando en que
--    el Server Action llamante siempre mandara datos consistentes. Ahora
--    el contrato de la funcion se autoimpone, no depende solo de quien la
--    llama.
-- 2) search_path fijo a "public" -- recomendacion estandar de Supabase
--    para toda funcion nueva (evita que un search_path manipulado en la
--    sesion cambie a que tabla apunta un nombre sin schema-qualificar;
--    acá no era explotable porque todo ya estaba schema-qualificado, pero
--    fija la convencion para la primera funcion de este tipo en el
--    proyecto).
create or replace function public.guardar_distribucion_lote(
  p_lote_id uuid,
  p_objetivos jsonb,
  p_distribuciones jsonb
) returns void
language plpgsql
set search_path = public
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
  from jsonb_array_elements(p_distribuciones) as fila
  where (fila->>'cuota_id')::uuid in (select id from public.cuotas where lote_id = p_lote_id);
end;
$$;
