-- Higiene de base (10/09, autorizado por Gabriel: "si, ejecuta esos cambios
-- de higiene"). Tres cosas, ninguna cambia el comportamiento de la app:
-- indices en las claves foraneas que el codigo consulta de verdad, el
-- search_path del trigger de monto_ajustado, y auth.uid() envuelto en un
-- subselect adentro de las politicas de RLS.

-- ══════════════════════════════════════════════════════════════════════
-- 1. INDICES EN CLAVES FORANEAS
-- ══════════════════════════════════════════════════════════════════════
-- El analizador de Supabase marca 37 claves foraneas sin indice. No van las
-- 37: cada indice hay que mantenerlo en cada alta y en cada modificacion, y
-- ocupa disco. Un indice sobre una columna por la que nunca se busca es
-- puro costo.
--
-- Van las que el codigo consulta por valor (`.eq()` / `.in()`) o que usa
-- una politica de RLS. Quedan afuera a proposito todas las columnas de
-- auditoria (cargado_por, subido_por, confirmado_admin_por, cambiado_por,
-- recibido_por, cancelada_por): se leen para mostrar un nombre, nunca se
-- filtra por ellas.

-- lotes: los tres cortes por persona. acreedor_id y vendedor_id ademas los
-- usa la politica lotes_select en cada fila que mira un acreedor o un
-- vendedor, y cliente_id el portal del cliente entero.
create index if not exists lotes_cliente_id_idx on public.lotes (cliente_id);
create index if not exists lotes_acreedor_id_idx on public.lotes (acreedor_id);
create index if not exists lotes_vendedor_id_idx on public.lotes (vendedor_id);

-- lotes.cuenta_cobro_id: "a quien se le paga este lote". Lo consulta la
-- pantalla mes a mes del acreedor por cada persona.
create index if not exists lotes_cuenta_cobro_id_idx on public.lotes (cuenta_cobro_id)
  where cuenta_cobro_id is not null;

-- pagos.cliente_id: el portal del cliente lista SUS pagos. Sin esto es leer
-- todos los pagos de todos los clientes para mostrar los de uno.
create index if not exists pagos_cliente_id_idx on public.pagos (cliente_id);

-- pagos.corrige_pago_id: la pantalla de Pagos pregunta, por cada pago que
-- muestra, si alguien lo corrigio despues. Parcial porque la enorme mayoria
-- de los pagos no corrigen nada: el indice queda chico.
create index if not exists pagos_corrige_pago_id_idx on public.pagos (corrige_pago_id)
  where corrige_pago_id is not null;

-- pago_imputaciones.cuota_id: ya existe (pago_id, cuota_id), pero un indice
-- compuesto solo sirve para buscar por su PRIMERA columna. La pregunta
-- "que pagos cubrieron esta cuota" -- la que hace el detalle del lote y la
-- que hace la base sola al borrar una cuota -- va por cuota_id.
create index if not exists pago_imputaciones_cuota_id_idx on public.pago_imputaciones (cuota_id);

-- pago_imputaciones_mora no tiene ningun indice mas alla de su clave
-- primaria, y se consulta por los dos lados: por pago (cuanto interes tenia
-- este pago) y por cuota (cuanta mora se le cobro a esta cuota).
create index if not exists pago_imputaciones_mora_pago_id_idx
  on public.pago_imputaciones_mora (pago_id);
create index if not exists pago_imputaciones_mora_cuota_id_idx
  on public.pago_imputaciones_mora (cuota_id);

-- lote_documentos.lote_id: tampoco tenia indice, y es la consulta que hace
-- el desplegable "Documentacion del lote" cada vez que se abre un lote.
create index if not exists lote_documentos_lote_id_idx on public.lote_documentos (lote_id);

-- cuota_distribuciones.profile_id: existe (cuota_id, profile_id), que otra
-- vez solo sirve entrando por cuota_id. La cuenta corriente del acreedor
-- entra al reves: "todas las distribuciones de ESTA persona".
create index if not exists cuota_distribuciones_profile_id_idx
  on public.cuota_distribuciones (profile_id);

-- lote_distribucion_objetivos.profile_id: mismo caso.
create index if not exists lote_distribucion_objetivos_profile_id_idx
  on public.lote_distribucion_objetivos (profile_id);

-- reservas.created_by: el vendedor ve "los lotes que reservaste", y las
-- politicas de update/delete de reservas comparan contra esta columna.
create index if not exists reservas_created_by_idx on public.reservas (created_by);

-- ajustes_indexacion.lote_id: se consulta lote por lote al aplicar o
-- deshacer una indexacion.
create index if not exists ajustes_indexacion_lote_id_idx on public.ajustes_indexacion (lote_id);

-- NO se agregan (y queda anotado para que nadie los agregue "por las
-- dudas" mas adelante):
--   lote_participantes.profile_id -- ya existe (lote_id, profile_id) y
--     es_participante_del_lote() filtra por las dos columnas.
--   cuentas_externas_movimientos.* -- sus dos indices actuales ya figuran
--     como nunca usados.
--   lotes.admin_id, lotes.cuenta_cobro_externa_id, cuotas.interes_condonado_por,
--   historial_ingresos.user_id, cotizaciones_dolar.cargado_por,
--   indices_valores.cargado_por, y el resto de las columnas de auditoria.

-- ══════════════════════════════════════════════════════════════════════
-- 2. search_path DEL TRIGGER DE monto_ajustado
-- ══════════════════════════════════════════════════════════════════════
-- Sin `set search_path`, la funcion resuelve los nombres que usa con el
-- search_path del que la llama. Esta no llama a nada, asi que hoy no hay
-- riesgo real; se fija igual porque es la unica del esquema que quedaba
-- suelta y porque una funcion sin search_path fijo es una funcion que el
-- dia que crezca se vuelve un problema.
create or replace function public.cuotas_default_monto_ajustado()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.monto_ajustado is null then
    new.monto_ajustado := new.monto_base;
  end if;
  return new;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 3. auth.uid() Y mi_rol() ENVUELTOS EN UN SUBSELECT
-- ══════════════════════════════════════════════════════════════════════
-- `auth.uid() = algo` adentro de una politica se evalua UNA VEZ POR FILA.
-- `(select auth.uid()) = algo` se evalua una sola vez por consulta y
-- Postgres reusa el resultado. Es el mismo permiso, exactamente: cambia
-- cuantas veces se calcula, no que devuelve.
--
-- Ojo: no se toca a quien deja pasar cada politica. Si algo de esto
-- cambiara el permiso, se veria de inmediato en el suite de e2e, que corre
-- contra la base de verdad con un usuario por rol.

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (select mi_rol()) = any (array['administrador'::user_role, 'acreedor'::user_role, 'vendedor'::user_role, 'cobrador'::user_role])
  or id in (
    select lotes.acreedor_id from lotes where lotes.cliente_id = (select auth.uid())
    union
    select lotes.vendedor_id from lotes where lotes.cliente_id = (select auth.uid())
    union
    select lotes.cuenta_cobro_id from lotes where lotes.cliente_id = (select auth.uid())
    union
    select cuotas.cuenta_cobro_id from cuotas
      join lotes on lotes.id = cuotas.lote_id
      where lotes.cliente_id = (select auth.uid())
  )
);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
using (id = (select auth.uid()) or (select mi_rol()) = 'administrador'::user_role)
with check (id = (select auth.uid()) or (select mi_rol()) = 'administrador'::user_role);

drop policy if exists lotes_select on public.lotes;
create policy lotes_select on public.lotes for select to authenticated
using (
  (select mi_rol()) = any (array['administrador'::user_role, 'cobrador'::user_role])
  or ((select mi_rol()) = 'acreedor'::user_role
      and (acreedor_id = (select auth.uid()) or es_participante_del_lote(id)))
  or ((select mi_rol()) = 'vendedor'::user_role
      and (estado = any (array['disponible'::lote_estado, 'reservado'::lote_estado])
           or vendedor_id = (select auth.uid())
           or es_participante_del_lote(id)))
  or ((select mi_rol()) = 'cliente'::user_role and cliente_id = (select auth.uid()))
);

drop policy if exists pagos_select on public.pagos;
create policy pagos_select on public.pagos for select to authenticated
using (
  ((select mi_rol()) = 'cliente'::user_role and cliente_id = (select auth.uid()))
  or lote_id in (select lotes.id from lotes)
);

drop policy if exists pagos_insert on public.pagos;
create policy pagos_insert on public.pagos for insert to authenticated
with check (
  ((select mi_rol()) = 'cliente'::user_role and cliente_id = (select auth.uid()))
  or (select mi_rol()) = any (array['administrador'::user_role, 'cobrador'::user_role])
);

drop policy if exists pagos_delete on public.pagos;
create policy pagos_delete on public.pagos for delete to authenticated
using (
  (select mi_rol()) = 'cliente'::user_role
  and cliente_id = (select auth.uid())
  and confirmado_acreedor_por is null
  and confirmado_admin_por is null
);

drop policy if exists reservas_update on public.reservas;
create policy reservas_update on public.reservas for update to authenticated
using (
  (select mi_rol()) = 'administrador'::user_role
  or ((select mi_rol()) = any (array['vendedor'::user_role, 'cobrador'::user_role])
      and created_by = (select auth.uid()))
)
with check (
  (select mi_rol()) = 'administrador'::user_role
  or ((select mi_rol()) = any (array['vendedor'::user_role, 'cobrador'::user_role])
      and created_by = (select auth.uid()))
);

drop policy if exists reservas_delete on public.reservas;
create policy reservas_delete on public.reservas for delete to authenticated
using (
  (select mi_rol()) = 'administrador'::user_role
  or ((select mi_rol()) = any (array['vendedor'::user_role, 'cobrador'::user_role])
      and created_by = (select auth.uid()))
);

drop policy if exists movimientos_cc_select on public.movimientos_cuenta_corriente;
create policy movimientos_cc_select on public.movimientos_cuenta_corriente for select to authenticated
using (
  (select mi_rol()) = 'administrador'::user_role
  or profile_id = (select auth.uid())
);

drop policy if exists cuentas_externas_select on public.cuentas_externas;
create policy cuentas_externas_select on public.cuentas_externas for select to authenticated
using (
  (select mi_rol()) = any (array['administrador'::user_role, 'acreedor'::user_role, 'vendedor'::user_role, 'cobrador'::user_role])
  or id in (
    select lotes.cuenta_cobro_externa_id from lotes where lotes.cliente_id = (select auth.uid())
    union
    select cuotas.cuenta_cobro_externa_id from cuotas
      join lotes on lotes.id = cuotas.lote_id
      where lotes.cliente_id = (select auth.uid())
  )
);
