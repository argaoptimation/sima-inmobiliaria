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
    proxyClientMaxBodySize: '100mb',
  },
};

export default nextConfig;
