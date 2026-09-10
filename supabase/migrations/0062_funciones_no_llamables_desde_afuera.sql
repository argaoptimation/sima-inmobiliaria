-- Achicar la superficie de las tres funciones SECURITY DEFINER que el
-- analizador marca como llamables desde la API (10/09).
--
-- Contexto: una funcion SECURITY DEFINER corre con los permisos de quien la
-- creo, no de quien la llama. Si ademas vive en `public`, PostgREST la
-- publica como /rest/v1/rpc/<nombre> y cualquiera con una sesion puede
-- invocarla directamente.
--
-- OJO CON EL REVOKE: en Postgres, una funcion nace con EXECUTE otorgado a
-- PUBLIC (se ve como `=X/postgres` al principio de la ACL). `anon` y
-- `authenticated` lo heredan de ahi, asi que revocarles a ellos por nombre
-- no saca nada -- hay que revocarle a PUBLIC y volver a otorgar a mano a
-- quien si lo necesita. La primera version de esta migracion revocaba por
-- nombre y no cambio nada; queda escrito para que no se repita.
--
-- Lo que SI se hace acá:
--
--   * evitar_cambio_de_rol_no_admin(): es una funcion de trigger. Los
--     triggers corren por su cuenta, no los llama nadie: nadie necesita
--     EXECUTE sobre ella.
--
--   * mi_rol() y es_participante_del_lote(): dejan de ser ejecutables por
--     anon. Historial de ingresos era la unica politica que alcanzaba al
--     rol `public` (o sea, tambien a anon) y usaba mi_rol(); se acota a
--     `authenticated` primero, porque es una tabla que solo mira el
--     administrador y un usuario sin sesion no tiene nada que hacer ahi.
--
-- Lo que NO se hace, y por que: mi_rol() y es_participante_del_lote()
-- siguen siendo ejecutables por `authenticated`. NO es un descuido. Las
-- usan 50 de las 60 politicas de RLS del sistema, y una politica se evalua
-- con los permisos del que consulta: sacarle EXECUTE a authenticated deja
-- a la plataforma entera sin poder leer nada. La alternativa -- mudarlas a
-- un esquema privado -- obliga a reescribir esas 50 politicas. Y lo que se
-- gana es poco: llamando a /rpc/mi_rol un usuario logueado se entera de su
-- propio rol, que ya sabe, y con es_participante_del_lote(uuid) averigua si
-- el mismo participa de un lote cuyo id ya tiene que conocer. Ninguna de
-- las dos devuelve datos de otra persona.

alter policy historial_ingresos_select on public.historial_ingresos to authenticated;

revoke execute on function public.evitar_cambio_de_rol_no_admin() from public, anon, authenticated;

revoke execute on function public.mi_rol() from public, anon;
grant execute on function public.mi_rol() to authenticated, service_role;

revoke execute on function public.es_participante_del_lote(uuid) from public, anon;
grant execute on function public.es_participante_del_lote(uuid) to authenticated, service_role;
