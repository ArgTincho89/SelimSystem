# language: es
@ui @accounts @regression
Característica: Configuración de cuentas y movimientos multi-moneda
  Para organizar mis movimientos por cuenta sin mezclar monedas
  Como usuario autenticado
  Quiero consultar saldos, registrar movimientos y proteger importes sensibles

  Esquema del escenario: Cuentas, conversiones y privacidad en cada experiencia
    Dado que existe un usuario autenticado en el navegador
    Y que existe una categoría "Account UI" por API
    Y que tengo cuentas EUR y USD conciliadas por API
    Cuando selecciono la experiencia "<experiencia>" con ancho <ancho>
    Y abro la página de inicio
    Entonces el menú de Configuración y las tarjetas EUR y USD están disponibles
    Cuando abro Cuentas desde Configuración
    Entonces Configuración muestra las dos cuentas conciliadas
    Cuando vuelvo a Inicio desde la navegación
    Y registro el ingreso EUR "UI salary" de 2500
    Y registro el gasto USD "UI purchase" de 100
    Y registro el reembolso USD "UI refund" de 20
    Y guardo los totales mensuales antes de transferir
    Y registro una conversión USD a EUR sin asignar ingresos
    Entonces los saldos cambian y los totales de ingresos gastos y reembolsos no cambian
    Cuando programo un gasto recurrente USD de 900 para dentro de cinco días
    Y registro un gasto recurrente EUR de 25 para hoy
    Entonces el gasto futuro no suma al total y el gasto de hoy sí se incluye
    Cuando oculto los importes de las cuentas
    Entonces los saldos de las tarjetas están ocultos
    Y abro Avisos desde Configuración
    Entonces el aviso USD aparece y su importe está oculto
    Cuando abro el detalle de la cuenta USD
    Entonces los importes del detalle de la cuenta siguen ocultos
    Y no hay errores críticos en la consola

    Ejemplos:
      | experiencia | ancho |
      | móvil       | 390   |
      | escritorio  | 1280  |
