-- Condonar el interés moratorio de una cuota (08/09/2026).
--
-- Pedido de Nicolás vía Gabriel: el interés moratorio no es solo un número
-- que se cobra, es la moneda de cambio para destrabar una deuda parada
-- ("pagame el capital y te saco los intereses"). Hasta ahora el sistema lo
-- devengaba solo, todos los días, sin ninguna forma de perdonarlo.
--
-- Es un interruptor por cuota y NO un monto: el interés se recalcula a
-- diario contra la fecha de vencimiento, así que perdonar "los $50.000 de
-- hoy" haría reaparecer intereses mañana y la promesa quedaría incumplida.
-- Con el interruptor prendido esa cuota deja de generar interés, punto.
--
-- No devuelve la mora YA COBRADA (cuotas.mora_pagada): eso sería una
-- devolución de plata que ya entró y se repartió, otra operación. Corta la
-- que todavía no se cobró y la que se seguiría acumulando.
--
-- Se puede volver atrás (apagar el interruptor), justamente porque es una
-- palanca: si el cliente no cumple lo que prometió, el interés vuelve.
alter table public.cuotas
  add column if not exists interes_condonado boolean not null default false,
  add column if not exists interes_condonado_en timestamptz,
  add column if not exists interes_condonado_por uuid references public.profiles(id),
  add column if not exists interes_condonado_motivo text;

comment on column public.cuotas.interes_condonado is
  'Interruptor: esta cuota no genera interes moratorio (ni el ya devengado ni el futuro). No afecta a mora_pagada.';
comment on column public.cuotas.interes_condonado_motivo is
  'Por que se condono, para que meses despues se entienda el numero. Lo escribe el administrador.';
