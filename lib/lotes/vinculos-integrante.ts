// Qué cuotas de un lote tiene atadas un integrante, y qué pasa con ellas si
// se lo saca del lote (15/09, pedido de Gabriel: "si eliminaramos sin querer
// a alguien de ahí, y ya se lo había vinculado a alguna cuota o cuotas, cómo
// resolverlo [...] debería avisar las cuotas asociadas y que el usuario
// confirme, con aviso previo").
//
// La regla (la aplica quitar_integrante_lote, migración 0065):
//   * cuotas que todavía NO se cobraron: se le saca su parte del reparto y,
//     si se le transferían a esa persona, quedan sin destino;
//   * cuotas que YA se cobraron (al menos en parte): no se tocan, su reparto
//     ya generó el Debe en la cuenta corriente;
//   * si el cliente ya informó un pago de una cuota que se le transfiere a
//     esa persona y falta confirmarlo, no se puede quitar todavía: al
//     confirmarlo el sistema tiene que saber a quién le entró la plata.
//
// Lo usan el aviso de la pantalla y las acciones del servidor, que lo vuelven
// a calcular con los datos del momento antes de borrar nada.

export interface CuotaParaVinculos {
  numero: number
  // Tiene al menos una imputación de pago.
  cobrada: boolean
  // Hay un pago informado por el cliente para esta cuota, sin confirmar.
  conPagoPendiente: boolean
  // A quién se le transfiere ('profile:<id>' / 'externa:<id>', o '').
  destino: string
  // Entre quiénes está repartida (mismas claves).
  repartidaEntre: string[]
}

export interface VinculosDeIntegrante {
  repartoSinCobrar: number[]
  destinoSinCobrar: number[]
  cobradas: number[]
  pagoPendiente: number[]
  porcentaje: number | null
}

export function vinculosDeIntegrante(
  clave: string,
  cuotas: CuotaParaVinculos[],
  porcentajePorClave: Record<string, number>
): VinculosDeIntegrante {
  const vinculos: VinculosDeIntegrante = {
    repartoSinCobrar: [],
    destinoSinCobrar: [],
    cobradas: [],
    pagoPendiente: [],
    porcentaje: porcentajePorClave[clave] ?? null,
  }

  for (const cuota of [...cuotas].sort((a, b) => a.numero - b.numero)) {
    const enElReparto = cuota.repartidaEntre.includes(clave)
    const esElDestino = cuota.destino === clave
    if (!enElReparto && !esElDestino) continue

    if (cuota.cobrada) {
      vinculos.cobradas.push(cuota.numero)
      continue
    }
    if (enElReparto) vinculos.repartoSinCobrar.push(cuota.numero)
    if (esElDestino) {
      vinculos.destinoSinCobrar.push(cuota.numero)
      if (cuota.conPagoPendiente) vinculos.pagoPendiente.push(cuota.numero)
    }
  }

  return vinculos
}

// Si sacarlo del lote cambia algo (y por lo tanto hay que avisar antes).
export function cambiaAlgoAlQuitarlo(vinculos: VinculosDeIntegrante): boolean {
  return (
    vinculos.repartoSinCobrar.length > 0 || vinculos.destinoSinCobrar.length > 0 || vinculos.porcentaje !== null
  )
}

// "la cuota 7" / "las cuotas 1 a 3, 5, 6 y 9". Los tramos de tres o más
// seguidas se abrevian: en un lote de 60 cuotas la lista entera no se lee.
export function listarCuotas(numeros: number[]): string {
  const ordenados = [...new Set(numeros)].sort((a, b) => a - b)
  if (ordenados.length === 1) return `la cuota ${ordenados[0]}`

  const tramos: string[] = []
  let inicio = 0
  for (let i = 1; i <= ordenados.length; i++) {
    if (i < ordenados.length && ordenados[i] === ordenados[i - 1] + 1) continue
    const largo = i - inicio
    if (largo >= 3) tramos.push(`${ordenados[inicio]} a ${ordenados[i - 1]}`)
    else for (let j = inicio; j < i; j++) tramos.push(String(ordenados[j]))
    inicio = i
  }

  const texto = tramos.length === 1 ? tramos[0] : `${tramos.slice(0, -1).join(', ')} y ${tramos[tramos.length - 1]}`
  return `las cuotas ${texto}`
}

function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

// El aviso que se muestra antes de confirmar. `bloqueo` no nulo quiere decir
// que todavía no se puede quitar.
export function avisoDeSalida(
  nombre: string,
  vinculos: VinculosDeIntegrante
): { lineas: string[]; bloqueo: string | null } {
  const lineas: string[] = []
  const varias = (numeros: number[]) => numeros.length > 1

  if (vinculos.repartoSinCobrar.length > 0) {
    const n = vinculos.repartoSinCobrar
    lineas.push(
      `Tiene parte del reparto en ${listarCuotas(n)}, que todavía no se ${varias(n) ? 'cobraron' : 'cobró'}: se le saca. ${
        varias(n) ? 'Esas cuotas van' : 'Esa cuota va'
      } a quedar con plata sin repartir hasta que la reasignes.`
    )
  }

  if (vinculos.destinoSinCobrar.length > 0) {
    const n = vinculos.destinoSinCobrar
    lineas.push(
      `${mayuscula(listarCuotas(n))} se le ${varias(n) ? 'transfieren' : 'transfiere'} a ${nombre}: ${
        varias(n) ? 'quedan' : 'queda'
      } sin destino hasta que elijas a otro, y mientras tanto el cliente no ve a dónde ${
        varias(n) ? 'pagarlas' : 'pagarla'
      }.`
    )
  }

  if (vinculos.porcentaje !== null) {
    lineas.push(`Se borra su ${vinculos.porcentaje}% del lote.`)
  }

  if (vinculos.cobradas.length > 0) {
    const n = vinculos.cobradas
    lineas.push(
      `En ${listarCuotas(n)}, que ya se ${varias(n) ? 'cobraron' : 'cobró'}, no se toca nada: lo que le correspondía ya quedó registrado.`
    )
  }

  if (lineas.length === 0) {
    lineas.push('No tiene cuotas asignadas en este lote: no se toca nada más.')
  }

  const bloqueo =
    vinculos.pagoPendiente.length > 0
      ? `Todavía no se puede quitar: el cliente ya informó un pago de ${listarCuotas(
          vinculos.pagoPendiente
        )}, que se le transfiere a ${nombre}, y falta confirmarlo. Confirmalo en Pagos y después volvé.`
      : null

  return { lineas, bloqueo }
}
