-- Subida directa navegador -> Supabase Storage (bucket "comprobantes"),
-- reemplazando la subida vía Server Action que hacía viajar el archivo por
-- el servidor de Next.js -- y ahí chocaba con el tope duro de Vercel de
-- 4.5 MB por request (no configurable, igual en todos los planes). Ver
-- Notas_Decisiones_SIMA.txt punto 99b.
--
-- Las LECTURAS de estos archivos siguen yendo 100% por el server (signed
-- URLs generadas con el cliente admin/service-role, sin cambios) -- esta
-- migración solo habilita que el navegador pueda subir directo con la
-- publishable key. Storage vive en su propio schema (storage.objects), no
-- hereda las políticas de las 19 tablas de public armadas en 0047.
--
-- Ojo: Supabase Storage necesita una policy de SELECT que cubra el mismo
-- objeto recién insertado, o el propio INSERT falla (el API hace un
-- INSERT ... RETURNING internamente) -- por eso cada bloque de abajo trae
-- su policy de INSERT y su policy de SELECT en pareja, con el mismo check.
-- A propósito NO se da UPDATE/DELETE por policy: el borrado/reemplazo de
-- archivos sigue siendo exclusivo del server (cliente admin), como ya
-- hace /admin/loteos al reemplazar una plantilla.

-- Carpeta con el propio auth.uid(): comprobante de pago que sube el
-- cliente desde el portal (app/portal-cliente/pagos/[id]/comprobante).
create policy "comprobantes: cliente inserta su propio comprobante"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'comprobantes'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "comprobantes: cliente lee su propio comprobante"
on storage.objects for select
to authenticated
using (
  bucket_id = 'comprobantes'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- Carpetas de staff: reservas/, ventas/, lotes/, loteos/ -- comprobante de
-- seña + DNI al reservar, documento firmado al vender, documentos sueltos
-- del lote, plantilla de contrato del loteo. Mismos 4 roles que ya usan
-- estas pantallas hoy (ver requireAccesoParaReservar / requireAdministrador
-- en cada action).
create policy "comprobantes: staff inserta archivos de lote/reserva/venta/loteo"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'comprobantes'
  and (storage.foldername(name))[1] in ('reservas', 'ventas', 'lotes', 'loteos')
  and public.mi_rol() in ('administrador', 'acreedor', 'vendedor', 'cobrador')
);

create policy "comprobantes: staff lee archivos de lote/reserva/venta/loteo"
on storage.objects for select
to authenticated
using (
  bucket_id = 'comprobantes'
  and (storage.foldername(name))[1] in ('reservas', 'ventas', 'lotes', 'loteos')
  and public.mi_rol() in ('administrador', 'acreedor', 'vendedor', 'cobrador')
);
