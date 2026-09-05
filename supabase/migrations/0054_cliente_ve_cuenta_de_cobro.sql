-- El cliente tiene que poder leer los datos de la cuenta a la que le toca
-- transferir CADA cuota (05/09).
--
-- Con la cuenta de cobro por cuota (migración 0053), el destino de una cuota
-- puede ser cualquier integrante del lote -- el admin, un vendedor, un
-- participante adicional -- o una cuenta externa. Las políticas de RLS solo
-- le dejaban ver al acreedor y al vendedor de sus lotes, y nada de
-- cuentas_externas, así que el portal le mostraba "Consultá los datos de la
-- cuenta con SIMA Inmobiliaria" en vez del alias.
--
-- Esto también arregla un caso que ya existía antes de la cuota: un lote
-- cuya cuenta de cobro era el propio administrador tampoco se le mostraba.

drop policy if exists profiles_select on public.profiles;

create policy profiles_select on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or mi_rol() = any (array['administrador'::user_role, 'acreedor'::user_role, 'vendedor'::user_role, 'cobrador'::user_role])
    or id in (
      select lotes.acreedor_id from lotes where lotes.cliente_id = auth.uid()
      union
      select lotes.vendedor_id from lotes where lotes.cliente_id = auth.uid()
      -- Cuenta de cobro del lote (puede ser el admin, que antes quedaba afuera).
      union
      select lotes.cuenta_cobro_id from lotes where lotes.cliente_id = auth.uid()
      -- Cuenta de cobro de alguna cuota de alguno de sus lotes.
      union
      select cuotas.cuenta_cobro_id
        from cuotas
        join lotes on lotes.id = cuotas.lote_id
       where lotes.cliente_id = auth.uid()
    )
  );

drop policy if exists cuentas_externas_select on public.cuentas_externas;

create policy cuentas_externas_select on public.cuentas_externas
  for select
  to authenticated
  using (
    mi_rol() = any (array['administrador'::user_role, 'acreedor'::user_role, 'vendedor'::user_role, 'cobrador'::user_role])
    or id in (
      select lotes.cuenta_cobro_externa_id from lotes where lotes.cliente_id = auth.uid()
      union
      select cuotas.cuenta_cobro_externa_id
        from cuotas
        join lotes on lotes.id = cuotas.lote_id
       where lotes.cliente_id = auth.uid()
    )
  );
