# language: es
@ui @home @regression
Característica: Dashboard de inicio
  Para controlar mi situación mensual
  Como usuario autenticado
  Quiero que los stats reaccionen a transacciones y poder navegar meses

  Antecedentes:
    Dado que existe un usuario autenticado en el navegador
    Y que existe una categoría "Dashboard UI" por API

  Escenario: Los stats se actualizan tras ingreso, gasto y reembolso
    Cuando abro la página de inicio
    Y creo un ingreso "Sueldo" de 2000 con clasificación "A"
    Entonces el stat "Ingresos reales" muestra "EUR 2.000,00"
    Y el stat "Ahorro real" muestra "+EUR 2.000,00"
    Cuando creo un gasto en "Dashboard UI" llamado "Compra" por 500
    Entonces el stat "Gastos netos" muestra "EUR 500,00"
    Y el stat "Ahorro real" muestra "+EUR 1.500,00"
    Cuando creo un reembolso en "Dashboard UI" llamado "Reembolso" por 100
    Entonces el stat "Gastos brutos" muestra "EUR 500,00"
    Y el stat "Reembolsos" muestra "EUR 100,00"
    Y el stat "Gastos netos" muestra "EUR 400,00"
    Y el stat "Ahorro real" muestra "+EUR 1.600,00"
    Y no hay errores críticos en la consola

  Escenario: Navegación prev/next actualiza mes y lista
    Dado que existe una transacción "Mes pasado" de 100 del mes pasado por API en "Dashboard UI"
    Cuando abro la página de inicio
    Entonces no veo la transacción "Mes pasado"
    Cuando navego al mes anterior
    Entonces veo la transacción "Mes pasado"
    Y el título del mes cambia
    Cuando navego al mes siguiente
    Entonces no veo la transacción "Mes pasado"
    Y no hay errores críticos en la consola

  Escenario: Las flechas de mes funcionan en escritorio ancho y compacto
    Cuando abro la página de inicio
    Y configuro el inicio en modo escritorio
    Y redimensiono el inicio al ancho de escritorio 1280
    Entonces las flechas del mes están visibles y no se superponen
    Cuando navego al mes siguiente
    Entonces las flechas del mes están visibles y no se superponen
    Cuando redimensiono el inicio al ancho de escritorio 768
    Entonces las flechas del mes están visibles y no se superponen
    Cuando navego al mes siguiente
    Entonces las flechas del mes están visibles y no se superponen
    Y no hay errores críticos en la consola

  Escenario: Toggle de ojo oculta ingresos y ahorro
    Cuando abro la página de inicio
    Y creo un ingreso "Sueldo" de 2000 con clasificación "A"
    Y hago clic en el botón de ojo
    Entonces los valores de ingresos y ahorro aparecen difuminados
    Cuando hago clic en el botón de ojo
    Entonces los valores de ingresos y ahorro no aparecen difuminados
    Y no hay errores críticos en la consola

  Escenario: Favoritos analíticos, controles y tooltips en escritorio
    Cuando abro la página de inicio
    Y configuro el inicio en modo escritorio
    Y redimensiono el inicio al ancho de escritorio 1280
    Entonces el selector muestra mes y año completos sin preposición
    Cuando guardo el desglose por categoría como favorito heredado y recargo
    Entonces aparecen cinco métricas principales
    Y el favorito heredado de desglose por categoría se descarta
    Y las cinco métricas principales no tienen estrellas
    Y las métricas tienen iconos decorativos y el botón dice Nueva transacción
    Y los controles de inicio aparecen en el orden requerido
    Y no hay accesos a secciones analíticas retiradas
    Y el selector de mes está centrado y destacado
    Cuando creo un ingreso "Favorito sueldo" de 2100 con clasificación "A" y con IVA cero
    Y creo un gasto en "Dashboard UI" llamado "Favorito compra" por 500
    Entonces veo el gráfico en el resumen "Ingresos A vs B"
    Y el gráfico "IVA acumulado por mes" tiene un canvas
    Y el tooltip del gráfico "Distribución de gastos" muestra datos de euros y porcentajes
    Entonces el desglose por categoría sigue en analítica sin estrella
    Y el desglose por categoría está contraído y se abre y cierra con teclado
    Y la gráfica "Distribución de gastos" sigue disponible como favorito
    Y el tooltip del gráfico "Distribución de gastos" muestra datos de euros y porcentajes
    Y el tooltip del gráfico "Distribución de gastos" se puede explorar con teclado
    Y marco "Distribución de gastos" como favorito analítico
    Entonces el favorito analítico de inicio es "Distribución de gastos"
    Y la réplica favorita contiene un gráfico interactivo
    Y la réplica favorita es compacta, sin desplazamiento interno y la fila KPI ocupa como máximo dos filas
    Y la página no tiene desbordamiento horizontal
    Y el tooltip del gráfico "Distribución de gastos" muestra datos de euros y porcentajes
    Cuando navego al mes anterior
    Entonces el favorito analítico de inicio es "Distribución de gastos"
    Y no hay datos para el favorito analítico del período actual
    Cuando navego al mes siguiente
    Entonces la réplica favorita contiene un gráfico interactivo
    Cuando creo un gasto fijo en "Dashboard UI" llamado "Favorito fijo" por 300
    Cuando marco "Fijo vs Variable" como favorito analítico
    Entonces el favorito analítico de inicio es "Fijo vs Variable"
    Y la réplica favorita contiene un gráfico interactivo
    Y la réplica favorita es compacta, sin desplazamiento interno y la fila KPI ocupa como máximo dos filas
    Y la leyenda de la réplica favorita contiene "Fijo: EUR 300,00"
    Y la leyenda de la réplica favorita contiene "Variable: EUR 500,00"
    Cuando redimensiono el inicio al ancho de escritorio 768
    Entonces la réplica favorita es compacta, sin desplazamiento interno y la fila KPI ocupa como máximo dos filas
    Y la página no tiene desbordamiento horizontal
    Cuando redimensiono el inicio al ancho de escritorio 1280
    Cuando quito el favorito analítico "Fijo vs Variable"
    Entonces no hay tarjeta de favorito en inicio
    Cuando marco "IVA acumulado por mes" como favorito analítico
    Entonces el favorito analítico de inicio es "IVA acumulado por mes"
    Y la estrella del gráfico de IVA queda dentro de la tarjeta sin tapar el título
    Cuando quito el favorito analítico "IVA acumulado por mes"
    Entonces no hay tarjeta de favorito en inicio
    Cuando hago clic en el botón de ojo
    Entonces los valores de ingresos y ahorro aparecen difuminados
    Y la privacidad indica importes ocultos
    Cuando hago clic en el botón de ojo
    Entonces los valores de ingresos y ahorro no aparecen difuminados
    Y la privacidad indica importes visibles
    Y no hay accesos a secciones analíticas retiradas
    Cuando activo nueva transacción desde los controles de inicio
    Entonces el formulario de nueva transacción está abierto
    Cuando redimensiono el inicio al ancho de escritorio 768
    Entonces el diseño de inicio cabe en el viewport
    Y no hay errores críticos en la consola

  Escenario: Inicio móvil preservado en viewport estrecho
    Cuando abro la página de inicio
    Y mantengo el modo móvil en viewport 390
    Entonces el inicio móvil conserva su estructura
    Y no hay accesos a secciones analíticas retiradas
