-- Prejudicial pasa a ser un paso MANUAL del admin (Notas_Decisiones_SIMA.txt,
-- confirmado por Nicolás: "es un caso importante", y reforzado 26/08 --
-- "sí o sí tiene que ser manual"). Hasta ahora `calcularEstadoCobranza`
-- (3+ cuotas vencidas) se mostraba directamente como "Prejudicial", sin que
-- nadie lo decidiera -- ese cálculo automático pasa a llamarse "Posible
-- prejudicial" (una señal para que el admin revise), y esta columna nueva
-- es la marca real, que solo se prende con una acción explícita del admin.
alter table public.lotes add column marcado_prejudicial boolean not null default false;
