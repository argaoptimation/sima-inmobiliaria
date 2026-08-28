import type { NextConfig } from "next";

// Hasta el 27/08 acá había un experimental.serverActions.bodySizeLimit /
// proxyClientMaxBodySize de 100 MB: los formularios de reserva/pago/venta
// subían el archivo real como parte del body del Server Action (hasta 5
// archivos de 15 MB cada uno en el peor caso). Desde que los 5 flujos de
// subida pasaron a mandar el archivo directo del navegador a Supabase
// Storage (CampoArchivoDirecto, ver migración 0048), ningún Server Action
// recibe ya el archivo en sí -- solo texto (nombre, montos, el path
// resultante de la subida), así que se sacó el override y se vuelve al
// límite por defecto de Next.js (1 MB, de sobra para eso). Ese límite era
// GLOBAL (no hay bodySizeLimit por ruta para Server Actions), así que
// también aplicaba de más a rutas públicas sin login (/login,
// /set-password, /login/recuperar-contrasena) -- innecesario ahora.
const nextConfig: NextConfig = {
  /* config options here */
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
