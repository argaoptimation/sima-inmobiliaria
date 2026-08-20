-- Ya migrado el código a telefono_prefijo/telefono_numero (columnas
-- nuevas). La columna vieja "telefono" en reservas quedó NOT NULL y ya
-- nadie la escribe -- bloqueaba cualquier insert nuevo (encontrado en
-- tests: "null value in column telefono... violates not-null constraint").
-- Se relaja a nullable en vez de borrarla todavía (columna sin usar, cero
-- riesgo de pérdida de datos al sacarle el constraint; el borrado
-- definitivo queda para cuando Gabriel lo confirme explícitamente, es una
-- acción más destructiva).
alter table public.reservas alter column telefono drop not null;
