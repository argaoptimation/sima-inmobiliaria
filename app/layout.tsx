import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";

// Dos familias, no una (rediseno Stitch 2026-09, DESIGN.md): Plus Jakarta
// Sans queda SOLO para titulos de modulo, encabezados y KPIs -- su ancho
// geometrico da autoridad pero cansa en una tabla de 180 filas. Inter toma
// todo el cuerpo (tablas, formularios, badges): es mas angosta, asi entra
// mas dato por pantalla, y sus digitos tabulares son los que alinean las
// columnas de plata.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "SIMACOR",
  description: "SIMACOR Servicios Inmobiliarios",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${jakarta.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50">{children}</body>
    </html>
  );
}
