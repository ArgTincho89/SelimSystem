# language: es
@ui
Característica: Registro y login
  Para acceder a SelimSystem
  Como usuario nuevo
  Quiero registrarme e iniciar sesión

  Escenario: Registro + login
    Dado que existe un usuario registrado
    Cuando abro la página de login
    Y inicio sesión con el usuario de prueba
    Entonces veo la barra de navegación

  @default-experience
  Escenario: Elegir y recordar la experiencia de escritorio
    Dado que existe un usuario registrado
    Cuando abro la página de login
    Entonces la experiencia de escritorio está seleccionada por defecto
    Cuando selecciono la experiencia de escritorio
    Entonces la elección de escritorio queda guardada
    Y la preferencia de escritorio se conserva al recargar
    Cuando inicio sesión con el usuario de prueba
    Entonces el inicio muestra las áreas de transacciones y analítica
