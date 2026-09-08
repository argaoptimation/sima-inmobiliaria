// Alfabeto sin caracteres que se confunden al dictarlos por teléfono o
// WhatsApp, que es exactamente cómo Nicolás le va a pasar esto al
// comprador: sin O/0, sin I/l/1.
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const NUMEROS = '23456789'

// Contraseña inicial de un comprador cargado a mano, para que Nicolás se la
// dicte y entre.
//
// Es una por cuenta y al azar, NO una fija tipo "Simacor123!" para todos
// (08/09, discutido con Gabriel). Una contraseña compartida sería una llave
// maestra a las ~200 cuentas: con ella cualquiera que la escuche una vez ve
// la deuda, el DNI y los documentos de cualquier comprador. Y como el
// portal del cliente no tiene pantalla para cambiarla, la mayoría se
// quedaría con la de fábrica para siempre. Encima el repo es público: una
// contraseña fija en el código sería literalmente publicarla.
//
// Se muestra una sola vez, al terminar de cargar el lote. Si se pierde, el
// admin le genera otra desde la ficha del cliente.
export function generarContrasenaInicial(): string {
  const azar = (alfabeto: string, cantidad: number) =>
    Array.from(
      crypto.getRandomValues(new Uint32Array(cantidad)),
      (valor) => alfabeto[valor % alfabeto.length]
    ).join('')

  // Formato fijo (4 letras - 4 números - signo) para que sea dictable y
  // pase esContrasenaValida: 9 caracteres y un signo.
  return `${azar(LETRAS, 4)}-${azar(NUMEROS, 4)}!`
}
