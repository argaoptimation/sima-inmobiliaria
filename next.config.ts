import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      // El límite por defecto de Next.js para el body de un Server Action es
      // 1 MB. Los formularios de reserva/pago suben hasta 5 archivos y cada
      // uno puede llegar a pesar justo por debajo (o por encima) de los 15 MB
      // que valida `excedeTamanioMaximo`. Sin este límite más alto, un
      // archivo grande nunca llega a esa validación: Next.js corta la
      // request antes con un error 500 genérico ("A server error occurred").
      // 100 MB cubre el peor caso (5 archivos ~15 MB cada uno) dejando
      // margen para que nuestro chequeo sea el que rechace con el mensaje
      // amigable, no Next.js con un error crudo.
      bodySizeLimit: '100mb',
    },
    // El proyecto tiene proxy.ts (el reemplazo de middleware en Next 16), y
    // el proxy trunca por su cuenta el body de la request a 10 MB por
    // defecto — independiente del límite de arriba. Con eso truncado a
    // mitad de un archivo, el multipart queda incompleto y el server
    // termina tirando "Unexpected end of form" en vez de nuestro rechazo
    // amigable. Mismo margen de 100 MB que bodySizeLimit para que el
    // archivo entero llegue a `excedeTamanioMaximo`.
    //
    // IMPORTANTE — esto NO alcanza por sí solo en producción: estos dos
    // límites solo controlan el body dentro de la app Next.js. El reverse
    // proxy real del hosting (EasyPanel/Hostinger, o cualquier Cloudflare/
    // nginx delante) tiene su propio límite de tamaño de body, típicamente
    // más chico por default. Si ese límite no se ajusta también ahí, las
    // subidas grandes van a seguir fallando con un error genérico del proxy
    // ANTES de llegar a esta app, sin importar que acá esté todo bien
    // configurado. Esto hay que verificarlo/ajustarlo en el hosting real —
    // el código no puede garantizarlo.
    //
    // IMPORTANTE — el alcance de este límite es GLOBAL, no solo para los
    // formularios de reserva/pago: Next.js no permite un bodySizeLimit por
    // ruta para Server Actions, así que también se aplica a rutas públicas
    // sin autenticación (/login, /login/recuperar-contrasena, /set-password),
    // que antes de este cambio estaban limitadas a 1 MB y ahora aceptan
    // bodies de hasta 100 MB. Es un trade-off aceptado a falta de límite por
    // ruta; si en algún momento se prioriza ese hardening, se puede mitigar
    // a nivel de borde (Cloudflare/nginx) limitando el tamaño de body
    // específicamente en esas rutas públicas.
    proxyClientMaxBodySize: '100mb',
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'same-origin' }],
      },
    ]
  },
};

export default nextConfig;
