# language: es
@ui @rental @regression
Característica: Declaración de alquiler de un inmueble
  Para registrar el alquiler de un bien existente
  Como usuario autenticado
  Quiero declarar una o varias modalidades con su monto y su IVA

  Antecedentes:
    Dado que existe un usuario autenticado en el navegador
    Y que existe un inquilino "Ana Inquilina" y un inmueble "Casa Declarada" por API

  Escenario: Declarar una locación con IVA
    Cuando abro la página de bienes
    Y abro la declaración de alquiler del inmueble "Casa Declarada" con el inquilino "Ana Inquilina"
    Y marco la modalidad "locación" con monto original "100000" desde "2026-01-01"
    Y indico un IVA de 21 por ciento en la locación
    Entonces el monto original de la "locación" muestra "100.000,00"
    Y veo el total con IVA "121.000,00"
    Cuando guardo la declaración de alquiler
    Entonces la declaración de alquiler queda guardada con 1 modalidad y total 121000
    Y no hay errores críticos en la consola

  Escenario: No se puede guardar sin elegir una modalidad
    Cuando abro la página de bienes
    Y abro la declaración de alquiler del inmueble "Casa Declarada" con el inquilino "Ana Inquilina"
    Y guardo la declaración de alquiler
    Entonces veo el error de declaración "Seleccioná al menos una modalidad"
