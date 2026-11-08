# language: es
@api
Característica: Categorías API
  Para organizar mis gastos
  Como usuario autenticado
  Quiero gestionar categorías

  Antecedentes:
    Dado que existe un usuario registrado

  Escenario: Crear, listar, actualizar y eliminar una categoría
    Cuando creo una categoría llamada "Categoría test" con color "#FF6B6B"
    Entonces la respuesta tiene status 201
    Y la categoría tiene nombre "Categoría test"
    Y la categoría aparece en el listado
    Cuando actualizo la categoría a nombre "Categoría actualizada"
    Entonces la respuesta tiene status 200
    Y la categoría tiene nombre "Categoría actualizada"
    Cuando elimino la categoría
    Entonces la respuesta tiene status 200

  Escenario: Soportar jerarquía padre/hijo
    Cuando creo una categoría llamada "Hogar" con color "#4ECDC4"
    Y creo una subcategoría "Supermercado" bajo "Hogar"
    Entonces la respuesta tiene status 201
    Y la subcategoría tiene como padre a "Hogar"
    Y la subcategoría aparece en el listado
    Cuando intento crear una subcategoría bajo "Supermercado"
    Entonces la respuesta tiene status 400

  Escenario: Rechazar categoría sin nombre
    Cuando creo una categoría con color "#FF6B6B" sin nombre
    Entonces la respuesta tiene status 400

  Escenario: Rechazar eliminar categoría con transacciones asociadas
    Cuando creo una categoría llamada "No borrable" con color "#FF6B6B"
    Y creo un gasto de 10 en la categoría "No borrable"
    Cuando elimino la categoría "No borrable"
    Entonces la respuesta tiene status 409
