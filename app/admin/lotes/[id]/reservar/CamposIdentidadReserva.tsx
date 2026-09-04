'use client'

import { useState } from 'react'
import { CampoTelefono, AyudaTelefono } from '@/components/CampoTelefono'
import { BuscadorClienteReserva } from './BuscadorClienteReserva'
import type { ClienteEncontrado } from './buscar-clientes-action'
import { ENTRADA } from '@/lib/ui/clases'

// Nombre/DNI/domicilio/email/teléfono del formulario de reserva, ahora en
// un componente cliente para que el buscador (BuscadorClienteReserva)
// pueda precargarlos SIN recargar la página -- ver buscar-clientes-action.ts
// para el bug real que esto reemplaza. Los inputs siguen siendo no
// controlados (siguen funcionando con el <form action={reservarLoteConId}>
// normal, sin JS de por medio para el submit) -- lo único que hace este
// componente es remontarlos con un `key` nuevo cuando se elige un cliente,
// para que tomen el `defaultValue` actualizado.
export function CamposIdentidadReserva({
  nombreCompletoInicial,
  dniInicial,
  domicilioInicial,
  emailInicial,
  prefijoInicial,
  numeroInicial,
}: {
  nombreCompletoInicial: string
  dniInicial: string
  domicilioInicial: string
  emailInicial: string
  prefijoInicial: string | null
  numeroInicial: string | null
}) {
  const [datos, setDatos] = useState({
    nombreCompleto: nombreCompletoInicial,
    dni: dniInicial,
    domicilio: domicilioInicial,
    email: emailInicial,
    prefijo: prefijoInicial,
    numero: numeroInicial,
  })
  const [version, setVersion] = useState(0)

  function seleccionarCliente(cliente: ClienteEncontrado) {
    setDatos({
      nombreCompleto: cliente.full_name,
      dni: cliente.dni ?? '',
      domicilio: cliente.domicilio ?? '',
      email: cliente.email ?? '',
      prefijo: cliente.telefono_prefijo,
      numero: cliente.telefono_numero,
    })
    setVersion((v) => v + 1)
  }

  return (
    <>
      <BuscadorClienteReserva onSeleccionar={seleccionarCliente} />

      <div key={version} className="flex flex-col gap-3">
        <input
          name="nombreCompleto"
          placeholder="Nombre completo *"
          defaultValue={datos.nombreCompleto}
          required
          className={ENTRADA}
        />
        <input name="dni" placeholder="DNI *" defaultValue={datos.dni} required className={ENTRADA} />
        <input
          name="domicilio"
          placeholder="Domicilio *"
          defaultValue={datos.domicilio}
          required
          className={ENTRADA}
        />
        <input
          name="email"
          type="email"
          placeholder="Email *"
          defaultValue={datos.email}
          required
          className={ENTRADA}
        />
        <label className="text-sm text-slate-600">
          Teléfono
          <CampoTelefono prefijoGuardado={datos.prefijo} numeroGuardado={datos.numero} requerido />
          <AyudaTelefono />
        </label>
      </div>
    </>
  )
}
