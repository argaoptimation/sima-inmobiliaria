-- Guardar la distribución de un lote deja en paz las cuotas refinanciadas
-- y las de ciclos viejos (10/09, bug encontrado por Gabriel en
-- "DEMO Lote Contrato Quintana").
--
-- Lo que pasaba: la pantalla de distribución ofrecía repartir TODAS las
-- cuotas del ciclo, incluidas las 36 que ya se habían refinanciado. Eso solo
-- ya no tiene sentido -- esas cuotas no las va a pagar nadie, su deuda se
-- mudó a las cuotas nuevas. Pero lo grave estaba un paso más adentro:
--
-- Esta función es un REEMPLAZO COMPLETO: borra todo lo guardado del lote y
-- vuelve a insertar exactamente lo que llegó del formulario. Así que en
-- cuanto la pantalla dejara de mostrar las refinanciadas, el primer
-- "Guardar distribución" les habría borrado la distribución que ya tenían.
-- Y esa distribución es historia: es la que dice a quién le correspondía esa
-- plata cuando la cuota estaba viva, y de ahí sale la cuenta corriente de
-- los acreedores. Borrarla en silencio sería perder plata de la memoria del
-- sistema.
--
-- Además el borrado no miraba el ciclo: un lote rescindido y vuelto a vender
-- perdía la distribución del ciclo anterior en cada guardado.
--
-- Ahora el reemplazo se acota a las cuotas VIVAS del ciclo vigente. Va en la
-- base y no solo en el código porque es la garantía de último recurso: el
-- `where` del insert impide escribir sobre una cuota refinanciada aunque
-- llegue en el payload.

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

  insert into public.lote_distribucion_objetivos (lote_id, profile_id, cuenta_externa_id, monto_objetivo)
  select
    p_lote_id,
    (fila->>'profile_id')::uuid,
    (fila->>'cuenta_externa_id')::uuid,
    (fila->>'monto')::numeric
  from jsonb_array_elements(p_objetivos) as fila;

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
