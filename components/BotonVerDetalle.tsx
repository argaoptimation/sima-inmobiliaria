import { Eye } from 'lucide-react'
import { EnlaceBoton } from '@/components/EnlaceBoton'

// El ojito para entrar al detalle de una fila (06/09, pedido de Gabriel).
//
// Mismo gesto en cuentas corrientes y en cuentas externas: son la misma
// pantalla con distinto contenido, y la forma de entrar tiene que ser una
// sola. El `title` explica a dónde lleva, porque un ícono solo no lo dice.
export function BotonVerDetalle({ href, titulo }: { href: string; titulo: string }) {
  return (
    <EnlaceBoton
      href={href}
      title={titulo}
      aria-label={titulo}
      className="inline-flex items-center justify-center rounded-lg border border-blue-100 p-2 text-blue-800 transition-colors hover:bg-blue-50 hover:text-blue-900"
    >
      <Eye className="h-4 w-4" />
    </EnlaceBoton>
  )
}
