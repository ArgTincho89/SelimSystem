# language: es
@ui @rental @regression
Característica: Cobro mensual de un alquiler con varias modalidades
  Para registrar el cobro de un mes completo de alquiler
  Como usuario autenticado
  Quiero cobrar todas las modalidades del mes desde Avisos y poder deshacerlo

  Antecedentes:
    Dado que existe un usuario autenticado en el navegador
    Y que el inmueble "Casa Mensual" tiene un alquiler de locación 100000 con IVA 21, comodato 50000 y mutuo 30000 desde el mes pasado

  Escenario: Cobrar un mes completo desde Avisos y deshacer el cobro
    Cuando abro la página de avisos
    Entonces hay 2 avisos de alquiler pendientes
    Y el primer aviso de alquiler detalla las modalidades "Locación", "Comodato" y "Mutuo"
    Cuando registro el cobro del primer aviso de alquiler en la cuenta "Cuenta alquileres"
    Entonces hay 1 avisos de alquiler pendientes
    Cuando deshago el cobro del mes cobrado desde el historial del inmueble "Casa Mensual"
    Y abro la página de avisos
    Entonces hay 2 avisos de alquiler pendientes
