-- El destinatario de la cuota confirma su propio cobro (06/09).
--
-- Hasta ahora la primera confirmación de un pago la hacía siempre el
-- acreedor del lote, así que las policies solo dejaban escribir a
-- 'administrador' y 'acreedor'. Desde que cada cuota puede cobrarse en la
-- cuenta de otra persona (0053), quien confirma es esa persona: puede ser un
-- vendedor o un cobrador.
--
-- El alcance real (que sea EL destinatario de ESE pago, y no cualquier
-- vendedor) lo aplica confirmarPago() en el servidor. Estas policies son la
-- barrera de abajo: acotan por rol y por los lotes que cada uno ya podía
-- ver, que para un vendedor/acreedor son los propios más aquellos donde
-- figura como participante (ver lotes_select).

drop policy pagos_update on public.pagos;

create policy pagos_update on public.pagos for update
  to authenticated
  using (
    public.mi_rol() in ('administrador', 'acreedor', 'vendedor', 'cobrador')
    and lote_id in (select id from public.lotes)
  )
  with check (
    public.mi_rol() in ('administrador', 'acreedor', 'vendedor', 'cobrador')
    and lote_id in (select id from public.lotes)
  );

-- confirmarPago() postea, con el cliente del usuario que confirma (no el
-- admin), el Debe automático de la distribución y el Haber automático de
-- quien cobró directo. Si el que confirma es un vendedor o un cobrador,
-- necesita poder insertar esas filas.
drop policy movimientos_cc_insert on public.movimientos_cuenta_corriente;

create policy movimientos_cc_insert on public.movimientos_cuenta_corriente for insert
  to authenticated
  with check (public.mi_rol() in ('administrador', 'acreedor', 'vendedor', 'cobrador'));

-- Ídem el crédito de una cuenta externa cuando la cuota se cobra ahí.
drop policy cuentas_externas_movimientos_insert on public.cuentas_externas_movimientos;

create policy cuentas_externas_movimientos_insert on public.cuentas_externas_movimientos for insert
  to authenticated
  with check (public.mi_rol() in ('administrador', 'acreedor', 'vendedor', 'cobrador'));
