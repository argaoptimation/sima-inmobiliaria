-- Cuotas que ya estaban cobradas antes de que existiera la plataforma
-- (07/09, pedido de Gabriel: Nicolás tiene ~200 lotes vendidos en curso que
-- hay que cargar).
--
-- El problema que resuelve: para mostrar una cuota vieja como cobrada, la
-- única forma hoy es cargar un pago y confirmarlo. Pero un pago dispara la
-- distribución y los movimientos de cuenta corriente, así que la plataforma
-- le diría a Nicolás que le debe al acreedor plata que le entregó hace dos
-- años. El tablero de "cómo queda cada uno" nacería equivocado.
--
-- Una cuota marcada acá se carga saldada (saldo_pendiente = 0) SIN pago,
-- sin imputación y sin movimiento de cuenta corriente. El tablero arranca
-- en cero y cuenta solo lo que pasa desde que se empieza a usar el sistema.
--
-- La marca existe para poder DECIRLO en pantalla: sin ella, una cuota vieja
-- saldada es indistinguible de una cuota que el sistema cobró, y el monto
-- que se le carga es el de hoy, no necesariamente el que se pagó en su
-- momento (nadie tiene ese dato lote por lote).
alter table public.cuotas
  add column migrada boolean not null default false;

comment on column public.cuotas.migrada is
  'La cuota ya estaba cobrada antes de usar la plataforma. Se cargó saldada, sin pago ni distribución: esa plata no pasó por el sistema. El monto es informativo (el de hoy), no necesariamente el que se pagó.';

create index cuotas_migrada_idx on public.cuotas (migrada) where migrada;
