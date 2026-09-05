-- Cuenta de cobro por cuota (05/09, pedido de Gabriel).
--
-- Hasta ahora el destino del pago era del LOTE entero
-- (lotes.cuenta_cobro_id / cuenta_cobro_externa_id): todas las cuotas se
-- transferían a la misma cuenta. Nicolás reparte cuota por cuota -- la 1 al
-- vendedor 1, la 2 al vendedor 2, la 3 a él, las demás al acreedor -- y
-- necesita que el cliente vea en su portal el alias que corresponde a la
-- cuota que está por pagar.
--
-- Una sola cuenta por cuota (lo aclaró explícitamente): o un perfil del
-- staff, o una cuenta externa, nunca las dos. La cuenta del lote sigue
-- existiendo y hace de default para las cuotas que no tengan una propia.

alter table public.cuotas
  add column cuenta_cobro_id uuid references public.profiles (id) on delete set null,
  add column cuenta_cobro_externa_id uuid references public.cuentas_externas (id) on delete set null;

alter table public.cuotas
  add constraint cuotas_una_sola_cuenta_de_cobro
  check (cuenta_cobro_id is null or cuenta_cobro_externa_id is null);

create index if not exists cuotas_cuenta_cobro_id_idx
  on public.cuotas (cuenta_cobro_id)
  where cuenta_cobro_id is not null;

create index if not exists cuotas_cuenta_cobro_externa_id_idx
  on public.cuotas (cuenta_cobro_externa_id)
  where cuenta_cobro_externa_id is not null;
