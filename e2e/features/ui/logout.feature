# language: es
@ui
Característica: Cerrar sesión
  Para proteger mi cuenta
  Como usuario autenticado
  Quiero cerrar sesión

  Escenario: Logout
    Dado que existe un usuario autenticado en el navegador
    Cuando abro la página de perfil
    Y cierro sesión desde el perfil
    Entonces veo el formulario de login
