-- Refinanciación de cuotas (Notas_Decisiones_SIMA.txt puntos 73/80/94,
-- spec confirmada por Nicolás 26/08): las cuotas vencidas impagas + futuras
-- de un lote vendido se marcan como "refinanciadas" (dejan de sumar saldo
-- pendiente, se muestran con la etiqueta "Refinanció") y se generan cuotas
-- nuevas con el plan que se carga a mano. El lote NO cambia de estado --
-- sigue "vendido", se sigue comportando igual en todo lo demás (contrato,
-- rescisión, cobranza, filtros).
alter table public.cuotas add column refinanciada boolean not null default false;

-- Historial de eventos del lote: hasta ahora esta tabla solo registraba
-- rescindido/vuelto a disponible. Nicolás pidió (26/08) que el historial
-- muestre TODOS los movimientos relevantes del lote (creado, reservado,
-- vendido, rescindido, vuelto a disponible, refinanció) -- "como un
-- historial de búsqueda, en orden cronológico". Se agrega una columna
-- "evento" con la etiqueta del movimiento, separada de estado_anterior/
-- estado_nuevo: hace falta porque "creado" no tiene un estado anterior
-- real, y "refinanció" no cambia el estado del lote (sigue vendido), así
-- que forzar siempre un par estado_anterior/estado_nuevo no alcanza para
-- representar todos los casos.
alter table public.lote_historial_estados alter column estado_anterior drop not null;
alter table public.lote_historial_estados alter column estado_nuevo drop not null;
alter table public.lote_historial_estados add column evento text;
alter table public.lote_historial_estados add column detalle text;

update public.lote_historial_estados
set evento = case
  when estado_nuevo = 'rescindido' then 'rescindido'
  when estado_nuevo = 'disponible' then 'vuelto_disponible'
  else estado_nuevo::text
end
where evento is null;

alter table public.lote_historial_estados alter column evento set not null;
