-- Dos cambios de la pantalla de distribución de cuotas (15/09, pedidos de
-- Gabriel).
--
-- 1) CUÁNTO LE TOCA A CADA UNO DEL LOTE, EN PORCENTAJE
--
-- Gabriel: "si la persona no tiene agregado como que debe cobrar un X monto,
-- siempre muestra 'Cobra de más' [...] el acreedor debería cobrar un 85%,
-- admin un 10 y vendedor/es el restante, entonces esa 'Comisión' es la que
-- también se debe distribuir en la vida del lote".
--
-- Ya existía una tabla para eso: los "objetivos" del 17/08, pero en pesos
-- ("vendedor: $1.500 de este lote") y sin ningún efecto sobre el reparto. Los
-- 24 que había cargados eran exactamente un porcentaje escrito en plata
-- (24.000 de 30.000 = 80%). Pasan a guardarse como porcentaje: sobrevive a
-- una refinanciación o a un cambio de monto de las cuotas sin que nadie tenga
-- que recalcularlo, y es como lo piensa Nico.
--
-- El porcentaje NO reparte nada solo. Lo que genera el Debe en la cuenta
-- corriente sigue siendo cuota_distribuciones (generarDebeAutomatico); la
-- pantalla usa el porcentaje para llenar el reparto de las cuotas que todavía
-- no se cobraron, y Nico lo guarda. Así el reparto cuota por cuota a mano
-- sigue funcionando igual que siempre.

alter table public.lote_distribucion_objetivos
  add column porcentaje numeric(5,2);

update public.lote_distribucion_objetivos o
set porcentaje = round(o.monto_objetivo * 100 / t.total, 2)
from (
  select l.id as lote_id, sum(c.monto_base) as total
  from public.lotes l
  join public.cuotas c on c.lote_id = l.id and c.ciclo = l.ciclo_actual and not c.refinanciada
  group by l.id
) t
where t.lote_id = o.lote_id
  and t.total > 0;

-- Sin cuotas no hay contra qué calcular el porcentaje (y un objetivo más
-- grande que el total daría más de 100): esos no se pueden traducir.
delete from public.lote_distribucion_objetivos
where porcentaje is null or porcentaje > 100;

-- EN DOS PASOS, a propósito: la base es la misma para la app publicada y la
-- que se está probando. Si esta migración borrara monto_objetivo, la versión
-- de Vercel que todavía no tiene el código nuevo se rompería (lee esa columna
-- y le manda un "monto" a guardar_distribucion_lote) hasta que se publique.
-- Por eso acá las dos columnas conviven y aceptan null; la 0066, que se
-- aplica recién con el código nuevo publicado, borra monto_objetivo y deja
-- porcentaje obligatorio.
alter table public.lote_distribucion_objetivos
  alter column monto_objetivo drop not null,
  add constraint lote_distribucion_objetivos_porcentaje_valido check (porcentaje >= 0 and porcentaje <= 100);

comment on table public.lote_distribucion_objetivos is
  'Qué porcentaje de lo que se cobra en cuotas le toca a cada integrante del lote (la comisión). Desde el 15/09; antes era un monto objetivo.';

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

  -- Transición (ver arriba): el código nuevo manda "porcentaje" y el viejo
  -- "monto". La 0066 saca el "monto".
  insert into public.lote_distribucion_objetivos (lote_id, profile_id, cuenta_externa_id, porcentaje, monto_objetivo)
  select
    p_lote_id,
    (fila->>'profile_id')::uuid,
    (fila->>'cuenta_externa_id')::uuid,
    (fila->>'porcentaje')::numeric,
    (fila->>'monto')::numeric
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

-- 2) QUITAR A UN INTEGRANTE DEL LOTE
--
-- Gabriel: "si eliminaramos sin querer a alguien de ahí, y ya se lo había
-- vinculado a alguna cuota o cuotas, cómo resolverlo". La pantalla avisa
-- ANTES qué cuotas toca y pide confirmar; esta función es lo que pasa al
-- confirmar, todo junto o nada:
--
--   * En las cuotas que TODAVÍA NO SE COBRARON (sin ninguna imputación): se
--     le saca su parte del reparto y, si se le transferían a esa persona,
--     quedan sin destino. Dejarlo ahí haría que, al cobrarse, se le anote un
--     Debe a alguien que ya no participa del lote, o que el cliente le
--     transfiera a un alias que no corresponde.
--   * En las que YA SE COBRARON (al menos en parte): no se toca nada. Su
--     reparto ya generó el Debe en la cuenta corriente y es la historia de a
--     quién le correspondía esa plata.
--   * Se borra su porcentaje del lote y su fila de participante; si era el
--     vendedor del lote, el lote queda sin vendedor.
--
-- El admin y el acreedor no se quitan por acá (se cambian en "Roles del
-- lote"): eso lo controla la acción del servidor, que es la que tiene el
-- mensaje para la pantalla.

create or replace function public.quitar_integrante_lote(
  p_lote_id uuid,
  p_profile_id uuid,
  p_cuenta_externa_id uuid
)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_ciclo integer;
  v_repartos integer;
  v_destinos integer;
begin
  if (p_profile_id is null) = (p_cuenta_externa_id is null) then
    raise exception 'Hay que indicar una persona o una cuenta externa, no las dos';
  end if;

  select ciclo_actual into v_ciclo from public.lotes where id = p_lote_id;

  if v_ciclo is null then
    raise exception 'El lote % no existe', p_lote_id;
  end if;

  with sin_cobrar as (
    select c.id from public.cuotas c
    where c.lote_id = p_lote_id
      and c.ciclo = v_ciclo
      and not c.refinanciada
      and not exists (select 1 from public.pago_imputaciones pi where pi.cuota_id = c.id)
  ), borrados as (
    delete from public.cuota_distribuciones d
    where d.cuota_id in (select id from sin_cobrar)
      and (d.profile_id = p_profile_id or d.cuenta_externa_id = p_cuenta_externa_id)
    returning 1
  )
  select count(*) into v_repartos from borrados;

  with sin_cobrar as (
    select c.id from public.cuotas c
    where c.lote_id = p_lote_id
      and c.ciclo = v_ciclo
      and not c.refinanciada
      and not exists (select 1 from public.pago_imputaciones pi where pi.cuota_id = c.id)
  ), liberadas as (
    update public.cuotas c
    set cuenta_cobro_id = null,
        cuenta_cobro_externa_id = null
    where c.id in (select id from sin_cobrar)
      and (c.cuenta_cobro_id = p_profile_id or c.cuenta_cobro_externa_id = p_cuenta_externa_id)
    returning 1
  )
  select count(*) into v_destinos from liberadas;

  delete from public.lote_distribucion_objetivos
  where lote_id = p_lote_id
    and (profile_id = p_profile_id or cuenta_externa_id = p_cuenta_externa_id);

  delete from public.lote_participantes
  where lote_id = p_lote_id
    and (profile_id = p_profile_id or cuenta_externa_id = p_cuenta_externa_id);

  if p_profile_id is not null then
    update public.lotes set vendedor_id = null
    where id = p_lote_id and vendedor_id = p_profile_id;
  end if;

  return jsonb_build_object('repartos', v_repartos, 'destinos', v_destinos);
end;
$$;

-- SECURITY INVOKER (como guardar_distribucion_lote): corre con la RLS de
-- quien la llama, así que solo un administrador puede borrar algo. Igual se
-- le saca a anon (ver la 0062: hay que revocarle a PUBLIC).
revoke execute on function public.quitar_integrante_lote(uuid, uuid, uuid) from public, anon;
grant execute on function public.quitar_integrante_lote(uuid, uuid, uuid) to authenticated, service_role;
