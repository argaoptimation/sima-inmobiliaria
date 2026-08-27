-- Row Level Security para las 19 tablas de `public`. Redactada la noche del
-- 27/08 y aplicada esa misma noche/madrugada con Gabriel presente. Este
-- archivo YA REFLEJA la versión final, corregida después de que el primer
-- apply real (con el suite de e2e completo como prueba) encontrara 4 bugs
-- reales -- ver docs/superpowers/plans/2026-08-27-row-level-security.md
-- para el diagnóstico completo de cada uno:
--   1. Recursión infinita entre `lotes` y `lote_participantes` (se
--      consultaban mutuamente) -- rompía CUALQUIER lectura de `lotes`, para
--      cualquier rol. Arreglado con la función es_participante_del_lote().
--   2. Vendedor no podía ver lotes 'disponible'/'reservado' que todavía no
--      eran suyos, así que no podía reservarlos.
--   3. Cliente no podía ver el profile (datos de transferencia) del
--      acreedor/vendedor de su propio lote, para poder pagarle.
--   4. Cobrador no podía insertar en `pagos` (registrarPagoEfectivo).
-- Confirmado con el suite de e2e completo en verde después de estos 4
-- arreglos (153/153 relevantes, descontando flakiness pre-existente no
-- relacionada a RLS).
--
-- Principio general: las políticas reflejan lo que el código YA hace hoy
-- (los guards de lib/auth/require-admin.ts + los roles hardcodeados en cada
-- action), no reglas nuevas. El objetivo es blindar la base para el caso de
-- una fuga de la clave pública (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY), no
-- cambiar quién puede hacer qué dentro de la app.
--
-- `createAdminClient()` (SUPABASE_SECRET_KEY, rol `service_role` de
-- Postgres) sigue sin verse afectado por ninguna de estas políticas -- eso
-- es esperado y documentado en la memoria del proyecto
-- (reference_rls_no_bloquea_migraciones_ni_admin.md).

-- ============================================================
-- Helper: rol del usuario autenticado actual.
-- SECURITY DEFINER para poder leer `profiles` desde DENTRO de una política
-- de `profiles` sin recursión infinita (si la política llamara a un SELECT
-- normal contra profiles, evaluaría la política de nuevo sobre sí misma).
-- ============================================================
create or replace function public.mi_rol()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

comment on function public.mi_rol() is
  'Rol del usuario autenticado actual, para usar en políticas RLS. SECURITY DEFINER a propósito: evita recursión al usarla en policies de profiles.';

-- ============================================================
-- profiles
-- ============================================================
alter table public.profiles enable row level security;

create policy profiles_select on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or public.mi_rol() in ('administrador', 'acreedor', 'vendedor', 'cobrador')
    -- El cliente necesita ver el profile (datos de transferencia) del
    -- acreedor/vendedor de SU PROPIO lote para poder pagarle -- ver
    -- cuenta-cobro.spec.ts. Sin recursión: esta subquery contra `lotes` se
    -- evalúa bajo la policy de lotes para 'cliente' (cliente_id =
    -- auth.uid()), que no vuelve a consultar `profiles`.
    or id in (
      select acreedor_id from public.lotes where cliente_id = auth.uid()
      union
      select vendedor_id from public.lotes where cliente_id = auth.uid()
    )
  );

create policy profiles_update on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.mi_rol() = 'administrador')
  with check (id = auth.uid() or public.mi_rol() = 'administrador');

-- Nadie de `authenticated` inserta/borra profiles por RLS: altas y bajas de
-- usuario pasan siempre por createAdminClient() (admin/usuarios/actions.ts),
-- que ignora estas políticas igual.

-- Un cliente/staff puede editar su propio nombre/teléfono desde "Mi perfil",
-- pero la policy de arriba sola no evita que se autoasigne role =
-- 'administrador' -- WITH CHECK no distingue columnas. Lo bloqueamos con un
-- trigger, más simple y confiable acá que privilegios por columna (que no
-- distinguen "mi propia fila" de "la fila de otro").
create or replace function public.evitar_cambio_de_rol_no_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and public.mi_rol() <> 'administrador' then
    raise exception 'No tenés permiso para cambiar el rol de un usuario.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_bloquear_cambio_rol on public.profiles;
create trigger profiles_bloquear_cambio_rol
  before update on public.profiles
  for each row execute function public.evitar_cambio_de_rol_no_admin();

-- ============================================================
-- lotes
-- ============================================================
alter table public.lotes enable row level security;

-- es_participante_del_lote(): SECURITY DEFINER a propósito -- responde la
-- pregunta "¿este usuario es participante de este lote?" leyendo
-- lote_participantes SIN pasar por la RLS de esa tabla. Sin esto, la
-- policy de `lotes` (abajo) haría una subquery contra la vista con RLS de
-- `lote_participantes`, cuya propia policy vuelve a consultar `lotes` --
-- recursión infinita real, encontrada al aplicar esto la primera vez
-- (rompía TODA lectura de `lotes`, para cualquier rol).
create or replace function public.es_participante_del_lote(p_lote_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.lote_participantes
    where lote_id = p_lote_id and profile_id = auth.uid()
  )
$$;

create policy lotes_select on public.lotes for select
  to authenticated
  using (
    public.mi_rol() in ('administrador', 'cobrador')
    or (
      public.mi_rol() = 'acreedor'
      and (acreedor_id = auth.uid() or public.es_participante_del_lote(id))
    )
    or (
      public.mi_rol() = 'vendedor'
      and (
        -- Disponible/reservado: cualquier vendedor tiene que poder
        -- navegarlos para reservarlos -- vendedor_id todavía es null en
        -- 'disponible', y en 'reservado' puede ser el de OTRO vendedor
        -- (ver reserva-lote.spec.ts: "el listado de lotes de un vendedor
        -- muestra disponibles y reservados (por cualquiera)"). Una vez
        -- 'vendido', vuelve a acotarse a lo propio.
        estado in ('disponible', 'reservado')
        or vendedor_id = auth.uid()
        or public.es_participante_del_lote(id)
      )
    )
    or (public.mi_rol() = 'cliente' and cliente_id = auth.uid())
  );

create policy lotes_insert on public.lotes for insert
  to authenticated
  with check (public.mi_rol() = 'administrador');

create policy lotes_update on public.lotes for update
  to authenticated
  using (public.mi_rol() in ('administrador', 'vendedor', 'cobrador'))
  with check (public.mi_rol() in ('administrador', 'vendedor', 'cobrador'));

create policy lotes_delete on public.lotes for delete
  to authenticated
  using (public.mi_rol() = 'administrador');

-- ============================================================
-- cuotas (visibilidad en cascada desde lotes: el subquery contra `lotes`
-- respeta la RLS de `lotes` para el usuario que está consultando)
-- ============================================================
alter table public.cuotas enable row level security;

create policy cuotas_select on public.cuotas for select
  to authenticated
  using (lote_id in (select id from public.lotes));

create policy cuotas_insert on public.cuotas for insert
  to authenticated
  with check (public.mi_rol() = 'administrador');

create policy cuotas_update on public.cuotas for update
  to authenticated
  using (
    public.mi_rol() in ('administrador', 'acreedor')
    and lote_id in (select id from public.lotes)
  )
  with check (
    public.mi_rol() in ('administrador', 'acreedor')
    and lote_id in (select id from public.lotes)
  );

create policy cuotas_delete on public.cuotas for delete
  to authenticated
  using (public.mi_rol() = 'administrador');

-- ============================================================
-- pagos
-- ============================================================
alter table public.pagos enable row level security;

-- Deliberadamente ESCOPED (no "todo el staff ve cualquier pago"): un
-- acreedor sin ningún lote en común no debe poder leer montos/comprobantes
-- de pagos ajenos ni por RLS directa ni por la UI. Efecto colateral
-- aceptado: cuando un acreedor pierde la relación con un lote justo entre
-- que carga el formulario de confirmarPago y hace submit, el rechazo pasa
-- a ser un no-op silencioso en vez de mostrar "No sos el acreedor
-- vinculado a este lote" (RLS ya filtra la lectura antes de que ese
-- chequeo explícito llegue a correr) -- el rechazo real sigue pasando
-- igual, solo cambia el mensaje. Ver pagos-acotados-por-acreedor.spec.ts.
create policy pagos_select on public.pagos for select
  to authenticated
  using (
    (public.mi_rol() = 'cliente' and cliente_id = auth.uid())
    or lote_id in (select id from public.lotes)
  );

create policy pagos_insert on public.pagos for insert
  to authenticated
  with check (
    (public.mi_rol() = 'cliente' and cliente_id = auth.uid())
    -- cobrador registra pagos en efectivo con el cliente plano
    -- (app/admin/efectivo/actions.ts, registrarPagoEfectivo) -- se me
    -- había escapado del diseño original.
    or public.mi_rol() in ('administrador', 'cobrador')
  );

create policy pagos_update on public.pagos for update
  to authenticated
  using (
    public.mi_rol() in ('administrador', 'acreedor')
    and lote_id in (select id from public.lotes)
  )
  with check (
    public.mi_rol() in ('administrador', 'acreedor')
    and lote_id in (select id from public.lotes)
  );

-- BotonEliminarPago (portal-cliente/lotes/[id]/BotonEliminarPago.tsx): el
-- cliente borra su propio pago, pero SOLO si todavía nadie lo confirmó --
-- mismo guard que ya hace eliminarPago() en el servidor, repetido acá como
-- segunda barrera.
create policy pagos_delete on public.pagos for delete
  to authenticated
  using (
    public.mi_rol() = 'cliente'
    and cliente_id = auth.uid()
    and confirmado_acreedor_por is null
    and confirmado_admin_por is null
  );

-- ============================================================
-- pago_imputaciones (ledger, en cascada desde pagos)
-- ============================================================
alter table public.pago_imputaciones enable row level security;

create policy pago_imputaciones_select on public.pago_imputaciones for select
  to authenticated
  using (pago_id in (select id from public.pagos));

create policy pago_imputaciones_insert on public.pago_imputaciones for insert
  to authenticated
  with check (
    public.mi_rol() in ('administrador', 'acreedor')
    and pago_id in (select id from public.pagos)
  );

-- Sin update/delete: es un ledger insert-only (las reversiones insertan
-- filas nuevas en negativo, no editan las viejas -- ver editarMontoPago).

-- ============================================================
-- cuentas_externas / cuentas_externas_movimientos
-- ============================================================
alter table public.cuentas_externas enable row level security;

create policy cuentas_externas_select on public.cuentas_externas for select
  to authenticated
  using (public.mi_rol() in ('administrador', 'acreedor', 'vendedor', 'cobrador'));

create policy cuentas_externas_insert on public.cuentas_externas for insert
  to authenticated
  with check (public.mi_rol() = 'administrador');

create policy cuentas_externas_update on public.cuentas_externas for update
  to authenticated
  using (public.mi_rol() = 'administrador')
  with check (public.mi_rol() = 'administrador');

create policy cuentas_externas_delete on public.cuentas_externas for delete
  to authenticated
  using (public.mi_rol() = 'administrador');

alter table public.cuentas_externas_movimientos enable row level security;

create policy cuentas_externas_movimientos_select on public.cuentas_externas_movimientos for select
  to authenticated
  using (public.mi_rol() in ('administrador', 'acreedor', 'vendedor', 'cobrador'));

-- confirmarPago (app/admin/pagos/actions.ts) inserta el crédito acá cuando
-- el lote redirige el cobro a una cuenta externa, corriendo como acreedor o
-- administrador con el cliente normal (no admin).
create policy cuentas_externas_movimientos_insert on public.cuentas_externas_movimientos for insert
  to authenticated
  with check (public.mi_rol() in ('administrador', 'acreedor'));

create policy cuentas_externas_movimientos_update on public.cuentas_externas_movimientos for update
  to authenticated
  using (public.mi_rol() = 'administrador')
  with check (public.mi_rol() = 'administrador');

create policy cuentas_externas_movimientos_delete on public.cuentas_externas_movimientos for delete
  to authenticated
  using (public.mi_rol() = 'administrador');

-- ============================================================
-- lote_participantes
-- ============================================================
alter table public.lote_participantes enable row level security;

create policy lote_participantes_select on public.lote_participantes for select
  to authenticated
  using (lote_id in (select id from public.lotes));

create policy lote_participantes_insert on public.lote_participantes for insert
  to authenticated
  with check (public.mi_rol() = 'administrador');

create policy lote_participantes_update on public.lote_participantes for update
  to authenticated
  using (public.mi_rol() = 'administrador')
  with check (public.mi_rol() = 'administrador');

create policy lote_participantes_delete on public.lote_participantes for delete
  to authenticated
  using (public.mi_rol() = 'administrador');

-- ============================================================
-- lote_distribucion_objetivos / cuota_distribuciones
-- ============================================================
alter table public.lote_distribucion_objetivos enable row level security;

create policy lote_distribucion_objetivos_select on public.lote_distribucion_objetivos for select
  to authenticated
  using (lote_id in (select id from public.lotes));

create policy lote_distribucion_objetivos_write on public.lote_distribucion_objetivos for all
  to authenticated
  using (public.mi_rol() = 'administrador')
  with check (public.mi_rol() = 'administrador');

alter table public.cuota_distribuciones enable row level security;

create policy cuota_distribuciones_select on public.cuota_distribuciones for select
  to authenticated
  using (cuota_id in (select id from public.cuotas));

create policy cuota_distribuciones_write on public.cuota_distribuciones for all
  to authenticated
  using (public.mi_rol() = 'administrador')
  with check (public.mi_rol() = 'administrador');

-- ============================================================
-- lote_documentos
-- ============================================================
alter table public.lote_documentos enable row level security;

create policy lote_documentos_select on public.lote_documentos for select
  to authenticated
  using (lote_id in (select id from public.lotes));

create policy lote_documentos_insert on public.lote_documentos for insert
  to authenticated
  with check (
    public.mi_rol() in ('administrador', 'acreedor')
    and lote_id in (select id from public.lotes)
  );

create policy lote_documentos_delete on public.lote_documentos for delete
  to authenticated
  using (public.mi_rol() = 'administrador');

-- ============================================================
-- lote_historial_estados (insert-only)
-- ============================================================
alter table public.lote_historial_estados enable row level security;

create policy lote_historial_estados_select on public.lote_historial_estados for select
  to authenticated
  using (lote_id in (select id from public.lotes));

create policy lote_historial_estados_insert on public.lote_historial_estados for insert
  to authenticated
  with check (public.mi_rol() = 'administrador');

-- ============================================================
-- ajustes_indexacion
-- ============================================================
alter table public.ajustes_indexacion enable row level security;

create policy ajustes_indexacion_select on public.ajustes_indexacion for select
  to authenticated
  using (lote_id in (select id from public.lotes));

create policy ajustes_indexacion_write on public.ajustes_indexacion for all
  to authenticated
  using (public.mi_rol() in ('administrador', 'cobrador'))
  with check (public.mi_rol() in ('administrador', 'cobrador'));

-- ============================================================
-- indices_valores
-- ============================================================
alter table public.indices_valores enable row level security;

create policy indices_valores_select on public.indices_valores for select
  to authenticated
  using (public.mi_rol() in ('administrador', 'acreedor', 'vendedor', 'cobrador'));

create policy indices_valores_insert on public.indices_valores for insert
  to authenticated
  with check (public.mi_rol() in ('administrador', 'cobrador'));

create policy indices_valores_update on public.indices_valores for update
  to authenticated
  using (public.mi_rol() in ('administrador', 'cobrador'))
  with check (public.mi_rol() in ('administrador', 'cobrador'));

create policy indices_valores_delete on public.indices_valores for delete
  to authenticated
  using (public.mi_rol() = 'administrador');

-- ============================================================
-- cotizaciones_dolar (visible para TODOS los roles logueados, incluido
-- cliente -- portal-cliente/lotes/[id]/page.tsx y pagar/[id]/page.tsx la
-- leen directo para mostrar el equivalente en ARS)
-- ============================================================
alter table public.cotizaciones_dolar enable row level security;

create policy cotizaciones_dolar_select on public.cotizaciones_dolar for select
  to authenticated
  using (true);

create policy cotizaciones_dolar_write on public.cotizaciones_dolar for all
  to authenticated
  using (public.mi_rol() in ('administrador', 'acreedor', 'vendedor', 'cobrador'))
  with check (public.mi_rol() in ('administrador', 'acreedor', 'vendedor', 'cobrador'));

-- Historial de correcciones: uso interno, "no se le muestra al cliente"
-- (comentario de la migración 0044) -- a diferencia de la tabla de arriba,
-- cliente queda afuera acá.
alter table public.cotizaciones_dolar_historial enable row level security;

create policy cotizaciones_dolar_historial_select on public.cotizaciones_dolar_historial for select
  to authenticated
  using (public.mi_rol() in ('administrador', 'acreedor', 'vendedor', 'cobrador'));

create policy cotizaciones_dolar_historial_insert on public.cotizaciones_dolar_historial for insert
  to authenticated
  with check (public.mi_rol() in ('administrador', 'acreedor', 'vendedor', 'cobrador'));

-- ============================================================
-- loteos
-- ============================================================
alter table public.loteos enable row level security;

create policy loteos_select on public.loteos for select
  to authenticated
  using (public.mi_rol() in ('administrador', 'acreedor', 'vendedor', 'cobrador'));

create policy loteos_write on public.loteos for all
  to authenticated
  using (public.mi_rol() = 'administrador')
  with check (public.mi_rol() = 'administrador');

-- ============================================================
-- reservas (etapa previa a que el cliente tenga login -- sin acceso de
-- cliente acá, coherente con que ninguna pantalla de portal-cliente
-- consulta esta tabla)
-- ============================================================
alter table public.reservas enable row level security;

create policy reservas_select on public.reservas for select
  to authenticated
  using (public.mi_rol() in ('administrador', 'acreedor', 'vendedor', 'cobrador'));

create policy reservas_insert on public.reservas for insert
  to authenticated
  with check (public.mi_rol() in ('administrador', 'vendedor', 'cobrador'));

-- editar/cancelar una reserva: admin sobre cualquiera, vendedor/cobrador
-- solo sobre la que ellos mismos crearon (mismo chequeo que ya hace
-- app/admin/lotes/actions.ts:158 a nivel de código).
create policy reservas_update on public.reservas for update
  to authenticated
  using (
    public.mi_rol() = 'administrador'
    or (public.mi_rol() in ('vendedor', 'cobrador') and created_by = auth.uid())
  )
  with check (
    public.mi_rol() = 'administrador'
    or (public.mi_rol() in ('vendedor', 'cobrador') and created_by = auth.uid())
  );

create policy reservas_delete on public.reservas for delete
  to authenticated
  using (
    public.mi_rol() = 'administrador'
    or (public.mi_rol() in ('vendedor', 'cobrador') and created_by = auth.uid())
  );

-- ============================================================
-- movimientos_cuenta_corriente
-- ============================================================
alter table public.movimientos_cuenta_corriente enable row level security;

-- "acreedor/vendedor/cobrador pueden ver SOLO la propia" (comentario en
-- lib/auth/require-admin.ts, requireAdminOTitularCuenta) -- admin ve todas.
create policy movimientos_cc_select on public.movimientos_cuenta_corriente for select
  to authenticated
  using (public.mi_rol() = 'administrador' or profile_id = auth.uid());

-- generarDebeAutomaticoSiCorresponde corre DENTRO de confirmarPago con el
-- cliente normal (no admin) cuando quien confirma es acreedor.
create policy movimientos_cc_insert on public.movimientos_cuenta_corriente for insert
  to authenticated
  with check (public.mi_rol() in ('administrador', 'acreedor'));

create policy movimientos_cc_update on public.movimientos_cuenta_corriente for update
  to authenticated
  using (public.mi_rol() = 'administrador')
  with check (public.mi_rol() = 'administrador');

create policy movimientos_cc_delete on public.movimientos_cuenta_corriente for delete
  to authenticated
  using (public.mi_rol() = 'administrador');
