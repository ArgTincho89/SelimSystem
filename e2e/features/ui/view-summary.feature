# language: es
@ui
Característica: Ver la analítica de Inicio
  Para conocer mi situación financiera
  Como usuario autenticado
  Quiero ver los datos financieros integrados en Inicio

  Escenario: Ver métricas y analítica del mes
    Dado que existe un usuario autenticado en el navegador
    Cuando abro la página de inicio
    Entonces veo las tarjetas de ingresos, gastos y ahorro
