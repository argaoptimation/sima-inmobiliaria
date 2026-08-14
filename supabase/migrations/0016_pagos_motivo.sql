create type public.motivo_pago as enum ('cuota', 'sena');
alter table public.pagos add column motivo public.motivo_pago not null default 'cuota';

-- El descuento automático de la seña (app/admin/lotes/[id]/vender/actions.ts)
-- copia comprobante_sena_path tal cual como comprobante_path del pago, sin
-- subir un archivo nuevo -- por eso ese path coincidiendo exacto con el de
-- alguna reserva es un identificador confiable de "este pago es una seña".
update public.pagos
set motivo = 'sena'
where comprobante_path in (select comprobante_sena_path from public.reservas);
