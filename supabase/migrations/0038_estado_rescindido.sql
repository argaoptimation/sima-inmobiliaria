-- Estado "rescindido" para un lote: vendido -> rescindido -> disponible
-- (para poder venderse de nuevo). Ver Notas_Decisiones_SIMA.txt punto 73.

alter type public.lote_estado add value 'rescindido';

-- Historial de cambios de estado del lote -- por ahora solo lo escriben
-- rescindirLote/volverADisponible (no las demas transiciones existentes,
-- como reservar o vender), es un historial acotado a este flujo puntual,
-- no la "vida completa del lote" (eso queda para cuando se construya esa
-- feature aparte).
create table public.lote_historial_estados (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes(id) on delete cascade,
  estado_anterior public.lote_estado not null,
  estado_nuevo public.lote_estado not null,
  cambiado_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index lote_historial_estados_lote_id_idx on public.lote_historial_estados (lote_id, created_at);
