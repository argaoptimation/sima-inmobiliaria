-- Forma de pago acordada al reservar (04/09, pedido de Gabriel tras hablarlo
-- con Nico): el boleto de compraventa solo tiene sentido cuando el lote se
-- vende financiado. Si se paga en una sola cuota, se va directo a escritura y
-- no hay boleto que generar.
--
-- Queda como columna aparte de `instrumentacion` (que ya existía con
-- 'boleto'/'escritura') y NO se deriva de ella: Gabriel aclaró que a veces se
-- hace solo escritura aunque sea financiado. La forma de pago propone la
-- instrumentación en el formulario, pero la decisión final es manual.
--
-- Nullable a propósito: las reservas que ya existen no tienen este dato y no
-- se puede inventar. El formulario sí lo exige de acá en adelante.
alter table public.reservas
  add column forma_pago text check (forma_pago in ('contado', 'financiado'));

comment on column public.reservas.forma_pago is
  'Cómo se acordó pagar el lote al reservar: contado (una sola cuota) o financiado. Propone la instrumentación, pero no la determina.';
