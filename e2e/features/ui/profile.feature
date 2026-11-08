# language: es
@ui @profile @regression
Característica: Perfil y cuenta
  Para mantener mis datos actualizados
  Como usuario autenticado
  Quiero cambiar email, contraseña y poder eliminar mi cuenta

  Escenario: Cambiar email
    Dado que existe un usuario autenticado en el navegador
    Cuando abro la página de perfil
    Y cambio el email a "nuevo_email_ui@example.com"
    Entonces el email mostrado en el perfil es "nuevo_email_ui@example.com"
    Y no hay errores críticos en la consola

  Escenario: Cambiar contraseña
    Dado que existe un usuario autenticado en el navegador
    Cuando abro la página de perfil
    Y cambio la contraseña a "NuevaPass789!"
    Y cierro sesión desde el perfil
    E inicio sesión con la contraseña "NuevaPass789!"
    Entonces veo la barra de navegación
    Y no hay errores críticos en la consola

  Escenario: Eliminar cuenta
    Dado que existe un usuario autenticado en el navegador
    Cuando abro la página de perfil
    Y elimino la cuenta
    Entonces veo el formulario de login
    Cuando intento iniciar sesión con las credenciales anteriores
    Entonces veo el formulario de login
    Y no hay errores críticos en la consola
