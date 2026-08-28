-- Hasta acá la mora (lib/cobranza/interes-moratorio.ts) era puramente
-- informativa: se calculaba al vuelo para mostrarla en pantalla, pero un
-- pago solo se imputaba contra saldo_pendiente (capital) -- la mora nunca se
-- cobraba de verdad. Esto persiste lo necesario para cobrarla: cuánta mora
-- ya se pagó de cada cuota (para no volver a cobrar lo mismo, ya que
-- calcularInteresMoratorio se recalcula día a día desde fecha_vencimiento) y
-- un ledger de mora separado del de capital (pago_imputaciones), para que la
-- reversión de correcciones en editarMontoPago (app/admin/pagos/actions.ts,
-- que neteos por pago_imputaciones) siga funcionando exactamente igual que
-- antes -- no lee esta tabla nueva, así que una corrección de monto no
-- revierte mora cobrada (limitación conocida, documentada en el código).
alter table public.cuotas
  add column mora_pagada numeric(14,2) not null default 0;

create table public.pago_imputaciones_mora (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null references public.pagos(id) on delete cascade,
  cuota_id uuid not null references public.cuotas(id),
  monto_imputado numeric(14,2) not null,
  created_at timestamptz not null default now()
);

alter table public.pago_imputaciones_mora enable row level security;

-- Mismo criterio de lectura que pago_imputaciones/movimientos_cuenta_corriente
-- (migración 0047): solo personal (administrador/acreedor/vendedor/cobrador)
-- puede ver el detalle de imputaciones; nada de esto se expone a `cliente`.
create policy "pago_imputaciones_mora_select_personal"
  on public.pago_imputaciones_mora for select
  to authenticated
  using (public.mi_rol() in ('administrador', 'acreedor', 'vendedor', 'cobrador'));

-- confirmarPago corre con el cliente de sesión (no service-role), igual que
-- para pago_imputaciones -- necesita su propia policy de insert, mismo
-- criterio que pago_imputaciones_insert.
create policy "pago_imputaciones_mora_insert"
  on public.pago_imputaciones_mora for insert
  to authenticated
  with check (
    public.mi_rol() in ('administrador', 'acreedor')
    and pago_id in (select id from public.pagos)
  );
