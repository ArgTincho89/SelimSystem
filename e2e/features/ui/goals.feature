# language: es
@ui @goals @regression
Característica: Acceso a Metas retirado de la interfaz
  Para mantener el seguimiento de metas fuera de la navegación de la aplicación
  Como usuario autenticado
  Quiero que las rutas de interfaz retiradas vuelvan a Inicio

  Escenario: La ruta de metas vuelve a Inicio
    Dado que existe un usuario autenticado en el navegador
    Cuando abro la página de metas
    Entonces la sección retirada redirige a Inicio
    Y no hay errores críticos en la consola
