create type public.estado_civil as enum ('soltero', 'casado', 'divorciado', 'viudo');
create type public.instrumentacion as enum ('boleto', 'escritura');

create table public.reservas (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes(id) on delete cascade,
  nombre_completo text not null,
  dni text not null,
  domicilio text not null,
  email text not null,
  telefono text not null,
  telefono_alternativo text,
  estado_civil public.estado_civil not null,
  instrumentacion public.instrumentacion,
  monto_sena numeric(14,2) not null,
  moneda_sena public.moneda not null,
  recibido_por uuid references public.profiles(id),
  recibido_por_otro text,
  comprobante_sena_path text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint reservas_recibido_por_check check (
    (recibido_por is not null) or (recibido_por_otro is not null)
  )
);

-- Antes de esta tanda, el admin podía asignar un vendedor a cualquier lote a
-- mano, sin relación con una reserva real. A partir de ahora, vendedor_id de
-- un lote disponible recién se completa cuando alguien lo reserva -- limpiamos
-- cualquier asignación previa que haya quedado en lotes que siguen disponibles
-- (los ya reservados/vendidos no se tocan, esa asignación histórica sigue
-- siendo válida).
update public.lotes set vendedor_id = null where estado = 'disponible';
