-- Plantilla de contrato por loteo (un .docx con placeholders, reemplazable
-- en cualquier momento sin perder los contratos ya generados -- ver
-- Notas_Decisiones_SIMA.txt punto 89).
alter table public.loteos
  add column plantilla_contrato_path text,
  add column plantilla_contrato_nombre text;

-- Datos registrales/legales del lote que hoy no existen en el sistema pero
-- que un boleto de compraventa real necesita (identificados a partir del
-- modelo real "BOLETO Quintana Prueba- modelo.docx", ver punto 46 y 89).
-- Todos opcionales: sin ellos, el placeholder queda vacío en el contrato
-- generado y se completa a mano en Word como antes.
alter table public.lotes
  add column numero_lote text,
  add column manzana text,
  add column superficie_m2 numeric,
  add column cuenta_rentas text,
  add column nomenclatura_catastral text,
  add column matricula text;
