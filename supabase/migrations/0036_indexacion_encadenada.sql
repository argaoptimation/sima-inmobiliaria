-- Índice compuesto encadenado entre cuotas (no repetido desde el monto_base
-- de cada cuota) + trazabilidad de qué índice/mes se usó en cada ajuste.
-- Ver Notas_Decisiones_SIMA.txt punto 81b y la conversación del 23/08 sobre
-- el caso "IPC promocional".

-- `monto_ajustado`: el monto nominal de la cuota ya afectado por índice,
-- ANTES de descontar pagos (a diferencia de `saldo_pendiente`, que sí los
-- descuenta). Es la base que usa la cuota SIGUIENTE para encadenar su propio
-- ajuste -- nunca vuelve a partir del `monto_base` original una vez que hubo
-- algún ajuste en la cadena.
alter table public.cuotas add column monto_ajustado numeric(14,2);

update public.cuotas set monto_ajustado = monto_base where monto_ajustado is null;

alter table public.cuotas alter column monto_ajustado set not null;

-- Trigger en vez de tocar cada uno de los ~13 call-sites que insertan
-- cuotas (vender, importar, distribución manual, tests, etc.): así una
-- cuota nueva siempre arranca con monto_ajustado = monto_base sin que cada
-- insert tenga que acordarse de setearlo.
create function public.cuotas_default_monto_ajustado()
returns trigger
language plpgsql
as $$
begin
  if new.monto_ajustado is null then
    new.monto_ajustado := new.monto_base;
  end if;
  return new;
end;
$$;

create trigger cuotas_default_monto_ajustado
  before insert on public.cuotas
  for each row
  execute function public.cuotas_default_monto_ajustado();

-- Trazabilidad del historial de índices: qué índice y qué período de ESE
-- índice se usó realmente en cada ajuste (con el fallback al último
-- cargado, el período usado puede ser distinto del período "ideal" que le
-- tocaba a la cuota). Nullable porque las filas viejas (antes de este
-- cambio) no tienen forma de reconstruir esto de manera confiable.
alter table public.ajustes_indexacion add column indice_nombre text;
alter table public.ajustes_indexacion add column indice_periodo date;
