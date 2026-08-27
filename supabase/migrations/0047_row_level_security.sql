-- Row Level Security para las 19 tablas de `public`. Redactada en la noche
-- del 27/08 con el MCP de Supabase sin token válido (Unauthorized) --
-- por eso este archivo está PREPARADO PERO NO APLICADO todavía. Ver
-- docs/superpowers/plans/2026-08-27-row-level-security.md para el
-- razonamiento completo detrás de cada política (qué archivo del código la
-- justifica) y el checklist de verificación obligatorio antes de darla por
-- buena.
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

create policy lotes_select on public.lotes for select
  to authenticated
  using (
    public.mi_rol() in ('administrador', 'cobrador')
    or (
      public.mi_rol() = 'acreedor'
      and (
        acreedor_id = auth.uid()
        or id in (select lote_id from public.lote_participantes where profile_id = auth.uid())
      )
    )
    or (
      public.mi_rol() = 'vendedor'
      and (
        vendedor_id = auth.uid()
        or id in (select lote_id from public.lote_participantes where profile_id = auth.uid())
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
    or public.mi_rol() = 'administrador'
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
