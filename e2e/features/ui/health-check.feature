# language: es
@ui
Característica: Health check
  Para asegurarme de que la app está operativa
  Como usuario
  Quiero verificar el estado del sistema

  Escenario: Health check de la API
    Cuando consulto el endpoint de health
    Entonces la respuesta tiene status 200
    Y la respuesta indica status "ok"
