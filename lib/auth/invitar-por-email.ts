import type { createAdminClient } from '@/lib/supabase/admin'
import { obtenerSiteUrl } from '@/lib/config/site-url'
import { verificarLimiteIntentos } from '@/lib/seguridad/rate-limit'

type ClienteAdmin = ReturnType<typeof createAdminClient>

// Cupo diario de emails que la plataforma se permite gastar en direcciones
// de prueba (06/09, pedido de Gabriel).
//
// El suite E2E vende lotes y da de alta staff pasando por la UI real, y esa
// UI invita por mail igual que en producción. Cada corrida completa dispara
// decenas de invitaciones a direcciones `@sima-e2e.invalid`, que nadie
// puede recibir (dominio reservado por RFC 2606, no existe) pero que igual
// consumen el cupo de envíos del proyecto de Supabase. Resultado: Gabriel
// se quedaba sin poder mandar los mails que sí importan.
//
// El límite es solo para direcciones de prueba: un email real nunca pasa
// por este contador ni se ve afectado si el cupo de prueba está agotado.
export const LIMITE_DIARIO_EMAILS_DE_PRUEBA = 80

const ACCION_LIMITE = 'email-invitacion-prueba'
const UN_DIA_EN_MINUTOS = 24 * 60

// Dominios que por definición no pueden pertenecer a una persona real:
// los TLD reservados de RFC 2606/6761 y los dominios de ejemplo. Todo lo
// que el suite E2E usa cae acá (`@sima-e2e.invalid`, `@sima-demo.invalid`).
const TLDS_RESERVADOS = ['.invalid', '.test', '.example', '.localhost']
const DOMINIOS_RESERVADOS = ['example.com', 'example.net', 'example.org']

export function esEmailDePrueba(email: string): boolean {
  const dominio = email.trim().toLowerCase().split('@')[1]

  if (!dominio) return false

  return (
    TLDS_RESERVADOS.some((tld) => dominio.endsWith(tld)) || DOMINIOS_RESERVADOS.includes(dominio)
  )
}

// `true` si todavía se puede gastar un envío real con esta dirección.
//
// Una dirección real siempre devuelve `true` -- no pasa por el contador ni
// se ve afectada si el cupo de prueba está agotado. Una de prueba consume
// una unidad del cupo del día, y devuelve `false` cuando ya se llegó al
// límite.
export async function hayCupoDeEmailDePrueba(email: string): Promise<boolean> {
  if (!esEmailDePrueba(email)) return true

  return await verificarLimiteIntentos(
    'global',
    ACCION_LIMITE,
    LIMITE_DIARIO_EMAILS_DE_PRUEBA,
    UN_DIA_EN_MINUTOS
  )
}

// Contraseña de descarte para las cuentas de prueba que se crean sin mandar
// invitación: nadie la usa (los tests setean la suya con el Admin API),
// pero `createUser` necesita alguna y dejarla en blanco sería una cuenta
// sin credencial.
function contrasenaDeDescarte(): string {
  return `prueba-${crypto.randomUUID()}`
}

// Alta de una cuenta nueva por invitación -- el mismo camino que usan
// `venderLote`, `crearUsuarioStaff` y el alta de acreedor desde un lote.
//
// Para una dirección real es exactamente `inviteUserByEmail`. Para una
// dirección de prueba, mientras quede cupo del día también se manda la
// invitación de verdad (así el mecanismo real sigue ejercitándose en los
// tests); pasado el cupo la cuenta se crea igual con `createUser`, sin
// mail. La diferencia es invisible para quien llama: en los dos casos
// vuelve el usuario creado.
export async function invitarPorEmail(
  admin: ClienteAdmin,
  email: string
): Promise<Awaited<ReturnType<ClienteAdmin['auth']['admin']['inviteUserByEmail']>>> {
  const redirectTo = `${obtenerSiteUrl()}/auth/confirm`

  if (await hayCupoDeEmailDePrueba(email)) {
    return await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
  }

  console.info(
    `Cupo diario de ${LIMITE_DIARIO_EMAILS_DE_PRUEBA} emails de prueba agotado: la cuenta ${email} se crea sin mandar invitación.`
  )

  return await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: contrasenaDeDescarte(),
  })
}
