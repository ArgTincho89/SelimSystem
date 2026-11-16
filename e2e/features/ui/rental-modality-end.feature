# language: es
@ui @rental @regression
Característica: Finalizar un contrato de una modalidad del alquiler
  Para terminar una modalidad sin finalizar todo el alquiler
  Como usuario autenticado
  Quiero finalizar el comodato desde la pestaña Contratos y que el resto del alquiler siga vigente

  Antecedentes:
    Dado que existe un usuario autenticado en el navegador
    Y que el inmueble "Casa Contratos" tiene un alquiler de locación 100000 con IVA 21, comodato 50000 y mutuo 30000 desde el mes pasado

  Escenario: Finalizar solo el contrato de comodato
    Cuando finalizo el contrato de "Comodato" del alquiler del inmueble "Casa Contratos"
    Entonces la modalidad "Comodato" termina hoy en el alquiler del inmueble "Casa Contratos"
