-- La cuota que originó cada pago (06/09, pedido de Gabriel).
--
-- Hasta ahora un pago sabía a qué LOTE pertenece, pero no a qué cuota: la
-- imputación es FIFO, así que un pago puede repartirse entre varias cuotas.
-- Eso alcanzaba mientras el que confirmaba era siempre el acreedor del lote.
--
-- Desde que cada cuota puede tener su propia cuenta de cobro (0053), el que
-- confirma pasa a ser el DESTINATARIO de la cuota: el mismo cuyo alias vio
-- el cliente al transferir. Para saber quién es hace falta la cuota que el
-- cliente estaba pagando -- que el portal siempre conoce, porque el cliente
-- entra a pagar desde la pantalla de una cuota puntual.
--
-- Nullable a propósito: los pagos viejos, los que carga el admin a mano y
-- los de seña no tienen cuota de origen. Esos siguen confirmándose como
-- siempre (cae a la cuenta de cobro del lote, y de ahí a su acreedor).
alter table public.pagos add column cuota_origen_id uuid references public.cuotas(id);

create index pagos_cuota_origen_idx on public.pagos (cuota_origen_id);

comment on column public.pagos.cuota_origen_id is
  'Cuota que el cliente estaba pagando cuando registró este pago. Define quién hace la primera confirmación (el destinatario de esa cuota). No confundir con la imputación real, que es FIFO y puede tocar otras cuotas.';

-- Las dos columnas de confirmación pasan a leerse así. No se renombran para
-- no romper el historial ya cargado ni las policies que las nombran.
comment on column public.pagos.confirmado_acreedor_por is
  'Primera confirmación: la hace el DESTINATARIO del cobro (el dueño del alias al que el cliente transfirió), que puede ser un vendedor, un cobrador o el acreedor. Se llama "acreedor" por historia.';

comment on column public.pagos.confirmado_admin_por is
  'Segunda confirmación (doble check de Nicolás). Es la única cuando el destinatario no puede confirmar por su cuenta: cuenta externa sin login, el propio admin, o pago en efectivo.';
