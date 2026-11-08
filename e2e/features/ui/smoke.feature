# language: es
@ui @smoke
Característica: Smoke UI
  Para verificar el funcionamiento básico
  Como usuario
  Quiero realizar las acciones críticas

  Escenario: Health check - la app carga login sin errores críticos
    Cuando abro la página de login
    Entonces veo el formulario de login
    Y no hay errores críticos en la consola

  Escenario: Crear transacción de gasto
    Dado que existe un usuario autenticado en el navegador
    Y que existe una categoría "Supermercado Smoke" por API
    Cuando abro la página de inicio
    Y creo un gasto en "Supermercado Smoke" llamado "Gasto smoke" por 42.5
    Entonces veo la transacción "Gasto smoke"

  Escenario: Ver analítica integrada del mes
    Dado que existe un usuario autenticado en el navegador
    Cuando abro la página de inicio
    Entonces veo las tarjetas de ingresos, gastos y ahorro

  Escenario: Logout
    Dado que existe un usuario autenticado en el navegador
    Cuando abro la página de perfil
    Y cierro sesión desde el perfil
    Entonces veo el formulario de login
