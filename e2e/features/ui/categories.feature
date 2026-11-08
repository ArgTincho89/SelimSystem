# language: es
@ui @category @regression
Característica: Gestión de categorías
  Para organizar mis gastos
  Como usuario autenticado
  Quiero crear, editar y eliminar categorías jerárquicas

  Escenario: Crear categoría padre
    Dado que existe un usuario autenticado en el navegador
    Cuando abro la página de categorías
    Y creo una categoría llamada "Hogar UI"
    Entonces veo la categoría "Hogar UI" en la lista
    Y no hay errores críticos en la consola

  Escenario: Crear subcategoría bajo un padre
    Dado que existe un usuario autenticado en el navegador
    Y que existe una categoría "Hogar UI" por API
    Cuando abro la página de categorías
    Y creo una subcategoría UI "Supermercado UI" bajo "Hogar UI"
    Entonces veo la categoría "Supermercado UI" en la lista
    Y no hay errores críticos en la consola

  Escenario: Editar y eliminar categoría
    Dado que existe un usuario autenticado en el navegador
    Cuando abro la página de categorías
    Y creo una categoría llamada "Editar UI"
    Y edito la categoría "Editar UI" a "Editada UI"
    Entonces veo la categoría "Editada UI" en la lista
    Cuando elimino la categoría UI "Editada UI"
    Entonces no veo la categoría "Editada UI" en la lista
    Y no hay errores críticos en la consola
