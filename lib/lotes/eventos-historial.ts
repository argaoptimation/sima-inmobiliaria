// Etiquetas legibles para lote_historial_estados.evento -- compartidas entre
// /admin/historial-lotes (vista global) y el historial colapsado del
// detalle de un lote, para no duplicar el mapeo en los dos lugares.
export const EVENTO_HISTORIAL_ETIQUETA: Record<string, string> = {
  creado: 'Lote creado',
  reservado: 'Reservado',
  vendido: 'Vendido',
  rescindido: 'Rescindido',
  vuelto_disponible: 'Volvió a disponible',
  refinanciado: 'Refinanció',
}
