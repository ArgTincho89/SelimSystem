# language: es
@api
Característica: Transacciones API
  Para registrar mis movimientos
  Como usuario autenticado
  Quiero crear, listar, actualizar y eliminar transacciones

  Antecedentes:
    Dado que existe un usuario registrado

  Escenario: Crear un gasto
    Dado que existe una categoría "Gasto test"
    Cuando creo un gasto llamado "Supermercado" por 50.25 en "Gasto test"
    Entonces la respuesta tiene status 201
    Y la transacción es de tipo "expense" con monto 50.25
    Y la transacción tiene título "Supermercado"
    Y la transacción está asociada a la categoría "Gasto test"

  Escenario: Crear un ingreso
    Cuando creo un ingreso llamado "Salario" por 1500 con clasificación "A"
    Entonces la respuesta tiene status 201
    Y la transacción es de tipo "income" con monto 1500
    Y la transacción tiene clasificación "A"

  Escenario: Listar transacciones
    Dado que existe una categoría "Listado test"
    Y que existe un gasto "Café" por 25 en "Listado test"
    Cuando listo las transacciones del mes actual
    Entonces la respuesta tiene status 200
    Y el listado contiene la transacción

  Escenario: Obtener una transacción por ID
    Dado que existe una categoría "Por ID"
    Y que existe un gasto "Libro" por 45 en "Por ID"
    Cuando consulto la transacción por su id
    Entonces la respuesta tiene status 200
    Y la transacción tiene título "Libro"
    Y la transacción tiene monto 45

  Escenario: Actualizar monto y descripción
    Dado que existe una categoría "Actualizar"
    Y que existe un gasto "Original" por 100 en "Actualizar"
    Cuando actualizo la transacción a título "Actualizado" y monto 175.5
    Entonces la respuesta tiene status 200
    Y la transacción tiene título "Actualizado"
    Y la transacción tiene monto 175.5

  Escenario: Eliminar una transacción
    Dado que existe una categoría "Eliminar"
    Y que existe un gasto "Borrar" por 30 en "Eliminar"
    Cuando elimino la transacción
    Entonces la respuesta tiene status 200
    Y la transacción no aparece en el listado del mes actual

  Escenario: Reflejar IVA en un ingreso
    Cuando creo un ingreso llamado "Factura con IVA" por 1000 con clasificación "A" e IVA 21%
    Entonces la respuesta tiene status 201
    Y la transacción tiene ivaPorcentaje 21

  Escenario: Soportar clasificación Mixto
    Cuando creo un ingreso mixto llamado "Ingreso mixto" por 1500 con montos A 900 y B 600
    Entonces la respuesta tiene status 201
    Y la transacción tiene clasificación "Mixto"
    Y la transacción tiene montoA 900
    Y la transacción tiene montoB 600

  Escenario: Crear transacción recurrente mensual
    Dado que existe una categoría "Recurrente"
    Cuando creo un gasto recurrente mensual "Alquiler" por 800 en "Recurrente" desde "2020-01-01"
    Entonces la respuesta tiene status 201
    Y la transacción es recurrente con frecuencia "monthly"
    Y el total recurrente del mes actual incluye "Alquiler" con al menos 800

  Escenario: Filtrar transacciones
    Dado que existe una categoría "Filtros"
    Y que existe un gasto "Gasto filtrable" por 60 en "Filtros"
    Y que existe un ingreso "Ingreso filtrable" por 500
    Cuando listo las transacciones del mes actual filtradas por tipo "expense" y categoría "Filtros"
    Entonces la respuesta tiene status 200
    Y el listado tiene al menos 1 elemento
