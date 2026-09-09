// El nombre del lote sale de la manzana y el número, no se tipea a mano
// (09/09, pedido de Nico vía Gabriel: él piensa en "Loteo, Manzana, Lote" y
// esa es la distribución de columnas a la que está acostumbrado).
//
// La columna `identificador` sigue existiendo en la base -- es `not null`,
// única por loteo, y es el nombre con el que el lote aparece en el detalle,
// en los recibos, en los contratos y en la cuenta corriente. Lo que se saca
// es el campo del formulario: escribir "Loteo San Martín - Manzana 3 - Lote
// 12" a mano, en 200 lotes, es 200 oportunidades de tipear distinto y que
// después no coincida con nada.
//
// El loteo NO entra en el nombre: ya es una columna aparte de la tabla, y
// la restricción de unicidad es (loteo_id, identificador) -- repetirlo acá
// haría "Altos de la Ribera - Mz 5 - Lote 12" dentro del loteo "Altos de la
// Ribera".
export function identificadorAutomatico(
  manzana: string | null | undefined,
  numeroLote: string | null | undefined
): string | null {
  const mza = (manzana ?? '').trim()
  const lote = (numeroLote ?? '').trim()

  if (mza && lote) return `Mza ${mza} - Lote ${lote}`
  if (mza) return `Mza ${mza}`
  if (lote) return `Lote ${lote}`
  return null
}
