-- A que PLAN pertenece cada cuota (10/09, pedido de Gabriel).
--
-- El problema: al refinanciar, las cuotas nuevas siguen la numeracion en
-- vez de arrancar de cero -- un lote de 24 que pago hasta la 10 y refinancio
-- el resto en 20 cuotas pasa a tener las cuotas 25 a 44. Es correcto (las
-- viejas no se borran: son la historia de lo que debia) pero el cliente
-- recibe un recibo que dice "Cuota N° 25" y no entiende nada.
--
-- Con esta columna se puede decir "Cuota 25 — 2 de 20 del plan
-- refinanciado": el numero de la plataforma para que coincida con todo lo
-- demas, y la posicion dentro del plan nuevo, que es lo que la persona
-- entiende.
--
-- plan = 1 es el plan original de la venta. Cada refinanciacion suma uno.
-- Es por (lote, ciclo): un lote rescindido y vuelto a vender empieza de
-- nuevo, igual que la numeracion.

alter table public.cuotas
  add column if not exists plan integer not null default 1;

comment on column public.cuotas.plan is
  'Plan al que pertenece la cuota dentro de su ciclo. 1 = el plan original de la venta; cada refinanciacion suma uno. Se usa para mostrarle a la persona "2 de 20 del plan refinanciado" en vez del numero corrido de la plataforma.';

-- Backfill de lo que ya existe.
--
-- Cada refinanciacion inserta sus cuotas en una sola transaccion, asi que
-- las de un mismo plan comparten el created_at exacto (now() es por
-- transaccion, no por fila). Pero agrupar por created_at NO alcanza: una
-- cuota agregada suelta despues de la venta (un ajuste, una cuota que
-- faltaba) tambien es un "lote" de insercion nuevo y no es una
-- refinanciacion. Probado contra la base: eso le inventaba un plan 2 a
-- "DEMO Cta Cte - Posible prejudicial", que nunca se refinancio.
--
-- La regla correcta: un plan nuevo empieza cuando el grupo anterior tiene
-- al menos una cuota marcada `refinanciada`. O sea, el plan de un grupo es
-- 1 mas la cantidad de grupos anteriores que fueron refinanciados.
with grupos as (
  select lote_id, ciclo, created_at,
         bool_or(refinanciada) as se_refinancio
  from public.cuotas
  group by lote_id, ciclo, created_at
),
planes as (
  select lote_id, ciclo, created_at,
         1 + coalesce(
           sum(case when se_refinancio then 1 else 0 end)
             over (partition by lote_id, ciclo order by created_at
                   rows between unbounded preceding and 1 preceding),
           0
         ) as numero_de_plan
  from grupos
)
update public.cuotas c
set plan = planes.numero_de_plan
from planes
where c.lote_id = planes.lote_id
  and c.ciclo = planes.ciclo
  and c.created_at = planes.created_at
  and c.plan is distinct from planes.numero_de_plan;
