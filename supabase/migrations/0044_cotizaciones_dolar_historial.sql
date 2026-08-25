-- Log insert-only de cada carga/corrección de la cotización del día. La
-- tabla `cotizaciones_dolar` sigue siendo upsert (1 valor vigente por fecha,
-- para que la cotización de un lote/pago la resuelva con una sola fila) --
-- esta tabla nueva guarda además CADA valor que se cargó ese día, para que
-- quede visible si se corrigió algo (pedido de Gabriel, 25/08/2026: el
-- historial de correcciones queda para uso interno/admin, nunca se le
-- muestra al cliente).
create table public.cotizaciones_dolar_historial (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  valor numeric not null,
  cargado_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index cotizaciones_dolar_historial_fecha_idx on public.cotizaciones_dolar_historial (fecha);
