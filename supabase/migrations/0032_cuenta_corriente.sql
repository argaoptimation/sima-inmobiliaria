-- Cuenta corriente por usuario (todos los roles salvo cliente): Debe
-- automático cada vez que se cobra una cuota (según el reparto ya cargado en
-- `cuota_distribuciones`) + Haber manual para cuando la plata efectivamente
-- llega al usuario (la empresa le transfiere su parte, o el cliente le paga
-- directo salteando a la empresa). Saldo = suma(Debe) - suma(Haber):
-- positivo = la empresa le debe, negativo = él le debe a la empresa.
create type public.movimiento_cc_tipo as enum ('debe', 'haber');

create type public.movimiento_cc_origen as enum (
  'cobro_cuota',
  'transferencia_empresa',
  'pago_directo_cliente',
  'reversion_cobro_cuota',
  'ajuste_distribucion'
);

create table public.movimientos_cuenta_corriente (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  tipo public.movimiento_cc_tipo not null,
  monto numeric(14,2) not null,
  moneda public.moneda not null,
  cotizacion_dia numeric(14,4),
  lote_id uuid references public.lotes(id),
  cuota_id uuid references public.cuotas(id),
  origen public.movimiento_cc_origen not null,
  fecha_evento date not null default current_date,
  de_parte_de text,
  detalle text,
  corrige_movimiento_id uuid references public.movimientos_cuenta_corriente(id),
  cargado_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  -- Cada origen tiene su tipo y signo esperado: el Debe automático y sus
  -- correcciones son siempre 'debe' (la corrección puede ser negativa para
  -- descontar), el Haber manual es siempre 'haber' y siempre positivo.
  constraint movimientos_cc_tipo_origen_check check (
    (origen = 'cobro_cuota' and tipo = 'debe' and monto > 0)
    or (origen in ('transferencia_empresa', 'pago_directo_cliente') and tipo = 'haber' and monto > 0)
    or (origen in ('reversion_cobro_cuota', 'ajuste_distribucion') and tipo = 'debe' and monto <> 0)
  ),
  -- "Pago directo del cliente" necesita saber de quién vino la plata (no
  -- alcanza con un texto libre opcional, Gabriel lo pidió como campo
  -- estructurado obligatorio para ese caso puntual).
  constraint movimientos_cc_de_parte_de_check check (
    origen <> 'pago_directo_cliente' or de_parte_de is not null
  ),
  -- Los movimientos generados por el sistema siempre tienen que poder
  -- rastrearse hasta la cuota que los originó.
  constraint movimientos_cc_cuota_requerida_check check (
    origen not in ('cobro_cuota', 'reversion_cobro_cuota', 'ajuste_distribucion')
    or cuota_id is not null
  )
);

-- Idempotencia: el Debe automático de una cuota para un participante se
-- postea una sola vez (correcciones/reversiones posteriores usan otro
-- origen, así que no chocan contra este índice).
create unique index movimientos_cc_cobro_cuota_unico
  on public.movimientos_cuenta_corriente (cuota_id, profile_id)
  where origen = 'cobro_cuota';

create index movimientos_cc_profile_id_idx on public.movimientos_cuenta_corriente (profile_id);
create index movimientos_cc_cuota_id_idx on public.movimientos_cuenta_corriente (cuota_id);
create index movimientos_cc_lote_id_idx on public.movimientos_cuenta_corriente (lote_id);
