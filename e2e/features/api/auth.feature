# language: es
@api
Característica: Autenticación API
  Para poder usar SelimSystem
  Como usuario de la API
  Quiero registrarme, iniciar sesión y gestionar mi cuenta

  Escenario: Registrar un nuevo usuario
    Cuando registro un nuevo usuario
    Entonces la respuesta tiene status 201
    Y el usuario registrado tiene id, email y nombre

  Escenario: Rechazar registro con email duplicado
    Dado que existe un usuario registrado
    Cuando intento registrar otro usuario con el mismo email
    Entonces la respuesta tiene status 409
    Y la respuesta indica error de email duplicado

  Escenario: Iniciar sesión con credenciales válidas
    Dado que existe un usuario registrado
    Cuando inicio sesión con esas credenciales
    Entonces la respuesta tiene status 200
    Y la respuesta contiene id, email y nombre

  Escenario: Rechazar login con contraseña incorrecta
    Dado que existe un usuario registrado
    Cuando inicio sesión con contraseña incorrecta
    Entonces la respuesta tiene status 401

  Escenario: Obtener el perfil estando autenticado
    Dado que existe un usuario registrado
    Cuando consulto mi perfil
    Entonces la respuesta tiene status 200
    Y la respuesta contiene id, email y nombre

  Escenario: Rechazar perfil sin autenticación
    Dado que no estoy autenticado
    Cuando consulto mi perfil
    Entonces la respuesta tiene status 401

  Escenario: Cambiar el email del usuario autenticado
    Dado que existe un usuario registrado
    Cuando cambio el email a uno nuevo
    Entonces la respuesta tiene status 200
    Y puedo consultar mi perfil con éxito

  Escenario: Cambiar la contraseña y permitir login con la nueva
    Dado que existe un usuario registrado
    Cuando cambio la contraseña a una nueva
    Entonces la respuesta tiene status 200
    Cuando inicio sesión en un nuevo contexto con las credenciales actuales
    Entonces la respuesta tiene status 200
    Y puedo consultar mi perfil con éxito

  Escenario: Cerrar sesión y destruirla
    Dado que existe un usuario registrado
    Cuando cierro sesión
    Entonces la respuesta tiene status 200
    Y la sesión está destruida

  Escenario: Eliminar la cuenta autenticada
    Dado que existe un usuario registrado
    Cuando elimino la cuenta autenticada
    Entonces la respuesta tiene status 200
    Y no puedo iniciar sesión con esas credenciales
