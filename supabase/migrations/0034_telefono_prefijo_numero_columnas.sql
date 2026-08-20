-- Reemplaza el truco de "prefijo|numero" codificado en una sola columna de
-- texto (ver lib/telefono/prefijos.ts) por columnas reales separadas, ahora
-- que hay acceso para aplicar la migración. Backfill desde el valor
-- codificado actual: si tiene "|", se separa; si no (formato viejo, de
-- antes del selector de país), todo el valor queda como número, sin prefijo.

alter table public.profiles
  add column telefono_prefijo text,
  add column telefono_numero text;

update public.profiles
set
  telefono_prefijo = case when position('|' in telefono) > 0 then split_part(telefono, '|', 1) else null end,
  telefono_numero = case
    when telefono is null then null
    when position('|' in telefono) > 0 then split_part(telefono, '|', 2)
    else telefono
  end
where telefono is not null;

alter table public.reservas
  add column telefono_prefijo text,
  add column telefono_numero text;

update public.reservas
set
  telefono_prefijo = case when position('|' in telefono) > 0 then split_part(telefono, '|', 1) else null end,
  telefono_numero = case
    when position('|' in telefono) > 0 then split_part(telefono, '|', 2)
    else telefono
  end;

-- reservas.telefono era obligatorio (not null) -- la columna nueva que lo
-- reemplaza mantiene la misma garantía.
alter table public.reservas
  alter column telefono_numero set not null;
