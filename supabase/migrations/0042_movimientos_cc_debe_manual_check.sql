alter table public.movimientos_cuenta_corriente drop constraint movimientos_cc_tipo_origen_check;
alter table public.movimientos_cuenta_corriente add constraint movimientos_cc_tipo_origen_check check (
  (origen = 'cobro_cuota' and tipo = 'debe' and monto > 0)
  or (origen in ('transferencia_empresa', 'pago_directo_cliente') and tipo = 'haber' and monto > 0)
  or (origen in ('reversion_cobro_cuota', 'ajuste_distribucion') and tipo = 'debe' and monto <> 0)
  or (origen = 'debe_manual' and tipo = 'debe' and monto <> 0)
);
