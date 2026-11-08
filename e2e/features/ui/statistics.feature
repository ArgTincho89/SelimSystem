# language: es
@ui @statistics @regression
Característica: Acceso a Estadísticas retirado de la interfaz
  Para mantener la analítica financiera integrada en Inicio
  Como usuario autenticado
  Quiero que las rutas de interfaz retiradas vuelvan a Inicio

  Escenario: La ruta de estadísticas vuelve a Inicio
    Dado que existe un usuario autenticado en el navegador
    Cuando abro la página de estadísticas
    Entonces la sección retirada redirige a Inicio
    Y no hay errores críticos en la consola
