# language: es
@ui @accounts @regression
Característica: Sub-cuentas de una cuenta bancaria
  Para separar fondos en otra moneda bajo una cuenta
  Como usuario autenticado
  Quiero crear una sub-cuenta y registrar un ingreso en ella

  Escenario: Crear una sub-cuenta USD y registrar un ingreso
    Dado que existe un usuario autenticado en el navegador
    Cuando abro Cuentas desde Configuración
    Y agrego la sub-cuenta "Caja USD" en USD a la cuenta "Cuenta principal"
    Entonces Configuración muestra la sub-cuenta "Caja USD" en USD bajo su cuenta
    Cuando vuelvo a Inicio desde la navegación
    Y registro el ingreso "Venta USD" de 150 en la sub-cuenta "↳ Caja USD (USD)"
    Entonces el ingreso "Venta USD" quedó asignado a la sub-cuenta "Caja USD"
