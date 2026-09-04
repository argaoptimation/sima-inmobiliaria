// Asterisco de "campo obligatorio" (04/09, pedido de Gabriel: "siempre que
// sean obligatorias, agregá un asterisco negrito al lado del nombre del
// campo"). Se pone al lado de la etiqueta, no dentro del input -- para los
// inputs que no tienen <label> visible (solo placeholder) la convención es
// terminar el placeholder con " *", así el asterisco igual se ve.
export function Obligatorio() {
  return (
    <span className="font-bold text-red-600" aria-hidden="true" title="Campo obligatorio">
      {' '}
      *
    </span>
  )
}
