'use client'

import { useState } from 'react'
import { CampoTelefono, AyudaTelefono } from '@/components/CampoTelefono'
import { BuscadorClienteReserva } from './BuscadorClienteReserva'
import type { ClienteEncontrado } from './buscar-clientes-action'
import { ENTRADA, CAMPO_ANCHO, ETIQUETA_CAMPO } from '@/lib/ui/clases'
import { Obligatorio } from '@/components/Obligatorio'

// Nombre/DNI/domicilio/email/teléfono del formulario de reserva, en un
// componente cliente para que el buscador (BuscadorClienteReserva) pueda
// precargarlos SIN recargar la página -- ver buscar-clientes-action.ts para
// el bug real que esto reemplaza. Los inputs siguen siendo no controlados
// (siguen funcionando con el <form action={reservarLoteConId}> normal, sin
// JS de por medio para el submit) -- lo único que hace este componente es
// remontarlos con un `key` nuevo cuando se elige un cliente, para que tomen
// el `defaultValue` actualizado.
//
// Los campos son hijos DIRECTOS de la grilla de dos columnas del
// formulario (GRILLA_CAMPOS, en la página): antes venían envueltos en un
// `div` con `flex-col`, así que la grilla los contaba como UNA sola celda y
// los cinco caían apilados en la columna derecha, con la izquierda vacía
// (09/09, reportado por Gabriel con captura). Por eso acá no hay ningún
// contenedor propio: un fragmento, y cada campo se acomoda solo.
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
      <div className={CAMPO_ANCHO}>
        <BuscadorClienteReserva onSeleccionar={seleccionarCliente} />
      </div>

      <label key={`nombre-${version}`} className="text-sm">
        <span className={ETIQUETA_CAMPO}>
          Nombre completo / razón social
          <Obligatorio />
        </span>
        <input
          name="nombreCompleto"
          placeholder="Como figura en el DNI"
          defaultValue={datos.nombreCompleto}
          required
          className={`${ENTRADA} w-full`}
        />
      </label>

      <label key={`dni-${version}`} className="text-sm">
        <span className={ETIQUETA_CAMPO}>
          DNI
          <Obligatorio />
        </span>
        <input
          name="dni"
          placeholder="Sin puntos"
          defaultValue={datos.dni}
          required
          className={`${ENTRADA} w-full tabular-nums`}
        />
      </label>

      <label key={`domicilio-${version}`} className="text-sm">
        <span className={ETIQUETA_CAMPO}>
          Domicilio
          <Obligatorio />
        </span>
        <input
          name="domicilio"
          placeholder="Calle, número, localidad"
          defaultValue={datos.domicilio}
          required
          className={`${ENTRADA} w-full`}
        />
      </label>

      <label key={`email-${version}`} className="text-sm">
        <span className={ETIQUETA_CAMPO}>
          Email
          <Obligatorio />
        </span>
        <input
          name="email"
          type="email"
          placeholder="nombre@correo.com"
          defaultValue={datos.email}
          required
          className={`${ENTRADA} w-full`}
        />
      </label>

      <label key={`telefono-${version}`} className="text-sm">
        <span className={ETIQUETA_CAMPO}>
          Teléfono
          <Obligatorio />
        </span>
        <CampoTelefono prefijoGuardado={datos.prefijo} numeroGuardado={datos.numero} requerido />
        <AyudaTelefono />
      </label>
    </>
  )
}
