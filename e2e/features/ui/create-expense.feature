# language: es
@ui
Característica: Crear gasto
  Para registrar mis gastos
  Como usuario autenticado
  Quiero crear una transacción de gasto

  Escenario: Crear una transacción de gasto
    Dado que existe un usuario autenticado en el navegador
    Y que existe una categoría "Supermercado UI" por API
    Cuando abro la página de inicio
    Y creo un gasto en "Supermercado UI" llamado "Compra semanal" por 75.5
    Entonces veo la transacción "Compra semanal"
