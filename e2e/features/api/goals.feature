# language: es
@api
Característica: Metas API
  Para controlar mis finanzas
  Como usuario autenticado
  Quiero definir metas de ahorro y límites de gasto

  Antecedentes:
    Dado que existe un usuario registrado

  Escenario: Crear, listar y eliminar una meta de ahorro
    Cuando creo una meta de ahorro mensual de 500
    Entonces la respuesta tiene status 201
    Y la meta es de tipo "ahorro_mensual" con modo "monto_fijo" y monto 500
    Y la meta aparece en el listado del mes actual
    Cuando elimino la meta
    Entonces la respuesta tiene status 200
    Y la meta no aparece en el listado del mes actual

  Escenario: Rechazar meta sin meses
    Cuando creo una meta sin meses
    Entonces la respuesta tiene status 400

  Escenario: Crear meta de límite de gasto por categoría
    Dado que existe una categoría "Transporte"
    Cuando creo una meta de gasto por categoría de 200 para "Transporte"
    Entonces la respuesta tiene status 201
    Y la meta es de tipo "gasto_categoria" y está asociada a "Transporte"
