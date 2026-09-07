-- Cuentas externas y cuentas corrientes se manejan igual (06/09, pedido de
-- Gabriel).
--
-- Son la misma cosa -- una cuenta corriente con alguien -- y la única
-- diferencia real es que una cuenta externa no tiene login. Que el
-- formulario para cargar un movimiento pida cosas distintas en cada una
-- obliga a Nicolás a aprender dos mecánicas para el mismo trabajo.
--
-- Estas columnas son las que tenía movimientos_cuenta_corriente y le
-- faltaban a cuentas_externas_movimientos.

-- Fecha en que pasó el movimiento, que no es lo mismo que cuándo se cargó:
-- sin esto no se puede registrar con atraso algo que pasó la semana pasada.
alter table public.cuentas_externas_movimientos
  add column fecha_evento date;

-- Los movimientos ya cargados no tienen fecha propia: la más fiel que hay
-- es el día en que se cargaron.
update public.cuentas_externas_movimientos
  set fecha_evento = created_at::date
  where fecha_evento is null;

alter table public.cuentas_externas_movimientos
  alter column fecha_evento set not null,
  alter column fecha_evento set default current_date;

create index cuentas_externas_movimientos_fecha_idx
  on public.cuentas_externas_movimientos (fecha_evento desc);

-- Lote al que corresponde el movimiento, opcional (igual que en la cuenta
-- corriente de una persona).
alter table public.cuentas_externas_movimientos
  add column lote_id uuid references public.lotes(id);

create index cuentas_externas_movimientos_lote_idx
  on public.cuentas_externas_movimientos (lote_id);

-- De quién vino la plata, para los créditos.
alter table public.cuentas_externas_movimientos
  add column de_parte_de text;

-- Por qué vía llegó. Mismo vocabulario que la cuenta corriente de una
-- persona, pero acotado a los dos casos que aplican acá: una cuenta externa
-- no participa de distribuciones, así que nunca tiene un movimiento de
-- 'cobro_cuota' ni de 'debe_manual'.
--
-- Nullable a propósito: los movimientos ya cargados y los débitos (plata que
-- le debemos, que no "llegó" de ningún lado) no tienen origen.
alter table public.cuentas_externas_movimientos
  add column origen text;

alter table public.cuentas_externas_movimientos
  add constraint cuentas_externas_movimientos_origen_check check (
    origen is null or origen in ('transferencia_empresa', 'pago_directo_cliente')
  );

-- Un pago directo del cliente necesita saber de quién vino la plata -- mismo
-- criterio que ya aplica movimientos_cc_de_parte_de_check.
alter table public.cuentas_externas_movimientos
  add constraint cuentas_externas_movimientos_de_parte_de_check check (
    origen <> 'pago_directo_cliente' or de_parte_de is not null
  );

-- El concepto pasa a ser opcional, como el "detalle" de una cuenta
-- corriente: ahí solo se exige cuando el movimiento es un Debe (hay que
-- explicar el gasto o el adelanto), y para un Haber es opcional. La regla
-- equivalente la aplica el server action; acá solo se saca el NOT NULL para
-- que sea posible.
alter table public.cuentas_externas_movimientos
  alter column concepto drop not null;

comment on column public.cuentas_externas_movimientos.concepto is
  'En la UI se llama "Detalle", igual que en movimientos_cuenta_corriente. Obligatorio solo para los débitos.';
