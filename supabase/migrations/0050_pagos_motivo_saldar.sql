-- "Saldar" (pedido de Nico, 02/09): un pago manual que cierra TODA la
-- deuda restante de un lote por un monto acordado, sin importar si es
-- menor al saldo real -- distinto de 'ajuste' (que corrige un pago ya
-- existente) y de 'cuota' (que es siempre imputado 1:1 vía FIFO).
alter type public.motivo_pago add value 'saldar';
