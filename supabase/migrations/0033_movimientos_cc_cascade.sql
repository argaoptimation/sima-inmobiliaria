-- La migración anterior dejó lote_id/cuota_id sin "on delete cascade", a
-- diferencia de cuota_distribuciones (que sí cascadea). Eso rompe cualquier
-- borrado de un lote/cuota que ya tenga movimientos de cuenta corriente
-- (ej. la limpieza de datos de test, o eliminarLote) con un error de FK en
-- vez de limpiar en cascada como el resto de las tablas colgadas de un lote.
alter table public.movimientos_cuenta_corriente
  drop constraint movimientos_cuenta_corriente_lote_id_fkey,
  add constraint movimientos_cuenta_corriente_lote_id_fkey
    foreign key (lote_id) references public.lotes(id) on delete cascade;

alter table public.movimientos_cuenta_corriente
  drop constraint movimientos_cuenta_corriente_cuota_id_fkey,
  add constraint movimientos_cuenta_corriente_cuota_id_fkey
    foreign key (cuota_id) references public.cuotas(id) on delete cascade;
