# language: es
@ui @auth @regression
Característica: Ciclo de vida de autenticación
  Para proteger mi cuenta
  Como usuario
  Quiero que el login detecte credenciales incorrectas y poder recuperar el acceso

  Escenario: Login fallido con contraseña incorrecta
    Dado que existe un usuario registrado
    Cuando abro la página de login
    E inicio sesión con contraseña "contraseñaIncorrecta123"
    Entonces veo el formulario de login
    Y no hay errores críticos en la consola

  Escenario: Login incorrecto y luego correcto
    Dado que existe un usuario registrado
    Cuando abro la página de login
    E inicio sesión con contraseña "primeraIncorrecta"
    Entonces veo el formulario de login
    Cuando inicio sesión con el usuario de prueba
    Entonces veo la barra de navegación
    Y no hay errores críticos en la consola

  Escenario: Registro, login, logout y login nuevamente
    Dado que no existe un usuario de prueba
    Cuando abro la página de registro
    Y me registro con un nuevo usuario
    Y abro la página de perfil
    Y cierro sesión desde el perfil
    E inicio sesión con el usuario de prueba
    Entonces veo la barra de navegación
    Y no hay errores críticos en la consola
