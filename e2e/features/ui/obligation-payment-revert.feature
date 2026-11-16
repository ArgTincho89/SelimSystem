# language: es
@ui @obligations @regression
Característica: Revertir un pago de obligación y consultar el historial del bien
  Para corregir un pago registrado por error sin perder la trazabilidad
  Como usuario autenticado
  Quiero revertir el pago desde el historial del bien y elegir año y mes del historial

  Antecedentes:
    Dado que existe un usuario autenticado en el navegador
    Y que el inmueble "Casa Pagos" tiene la obligación "Impuesto municipal" de 100000 pagada hoy

  Escenario: Revertir el pago desde el historial
    Cuando abro el historial del inmueble "Casa Pagos"
    Y reverto el pago de la obligación "Impuesto municipal" con el motivo "Pago duplicado"
    Entonces el historial del inmueble muestra "Impuesto municipal" como "Revertido"

  Escenario: Elegir año y mes en el historial
    Cuando abro el historial del inmueble "Casa Pagos"
    Y elijo el año anterior y todo el año en el historial
    Entonces el historial indica "No hay movimientos en este período."
