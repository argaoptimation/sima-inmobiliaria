-- Manzana y lote se ordenan como números, no como texto (10/09, pedido de
-- Gabriel).
--
-- El problema: `manzana` y `numero_lote` son columnas de texto -- tienen que
-- serlo, porque una manzana puede ser "B" y un lote puede ser "12 bis". Pero
-- ordenar texto pone "10" antes que "2", y desde que la tabla de lotes
-- muestra estas dos columnas en vez del identificador, ese es el orden con
-- el que Nico va a ver toda su cartera.
--
-- La solución: dos columnas generadas con la parte numérica, para ordenar
-- por ellas primero y por el texto después. Así "2" viene antes que "10", y
-- "12" y "12 bis" quedan juntos y en ese orden. Las que no tienen ningún
-- número ("B") quedan en NULL y van al final, alfabéticamente entre ellas.
--
-- Se toma LA PRIMERA CORRIDA DE DÍGITOS, no todos los dígitos sueltos: un
-- lote subdividido "1-2" tiene que ordenar como el 1, no como el 12. Sacar
-- todos los dígitos y pegarlos daba 12, que es un lote distinto y existente.
--
-- Generadas y no calculadas en la consulta porque el orden tiene que
-- resolverse en la base: la pantalla va a paginar, y una vez que pagina ya
-- no puede ordenar en memoria lo que trajo.
--
-- El `{1,9}` acota a nueve dígitos: un pegado accidental de treinta dígitos
-- no puede hacer fallar un INSERT por desbordar el entero.

alter table public.lotes
  drop column if exists manzana_orden,
  drop column if exists numero_lote_orden;

alter table public.lotes
  add column manzana_orden bigint generated always as (
    nullif(substring(coalesce(manzana, '') from '[0-9]{1,9}'), '')::bigint
  ) stored,
  add column numero_lote_orden bigint generated always as (
    nullif(substring(coalesce(numero_lote, '') from '[0-9]{1,9}'), '')::bigint
  ) stored;

-- Índice compuesto en el orden en que se consulta: es el orden por defecto
-- del listado, así que lo va a usar cada vez que alguien entra a Lotes.
drop index if exists lotes_orden_catastral_idx;
create index lotes_orden_catastral_idx
  on public.lotes (manzana_orden nulls last, manzana, numero_lote_orden nulls last, numero_lote);
