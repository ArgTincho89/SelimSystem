# language: es
@ui @summary @regression
Característica: Resumen mensual
  Para entender mi situación financiera
  Como usuario autenticado
  Quiero ver los gráficos analíticos del inicio

  Escenario: IVA acumulado correcto
    Dado que existe un usuario autenticado en el navegador
    Cuando registro por API un ingreso A de 1000 con IVA 21%
    Y registro por API un ingreso Mixto de 1000 con A 700, B 300 e IVA 10%
    Y registro por API un ingreso B de 500
    Y abro la página de inicio
    Entonces veo el gráfico en el resumen "IVA acumulado por mes"
    Y el gráfico "IVA acumulado por mes" tiene un canvas
    Y no hay errores críticos en la consola

  Escenario: Distribución Fijo vs Variable
    Dado que existe un usuario autenticado en el navegador
    Y que existe una categoría "Fijos UI" por API
    Y que existe una categoría "Variables UI" por API
    Cuando registro por API un gasto fijo de 600 en "Fijos UI"
    Y registro por API un gasto variable de 400 en "Variables UI"
    Y abro la página de inicio
    Entonces veo el gráfico en el resumen "Fijo vs Variable"
    Y la leyenda Fijo vs Variable contiene "Fijo: EUR 600,00"
    Y la leyenda Fijo vs Variable contiene "Variable: EUR 400,00"
    Y no hay errores críticos en la consola

  Escenario: Ingresos A vs B
    Dado que existe un usuario autenticado en el navegador
    Cuando registro por API un ingreso A de 700
    Y registro por API un ingreso B de 300
    Y abro la página de inicio
    Entonces veo el gráfico en el resumen "Ingresos A vs B"
    Y la leyenda A vs B contiene "A: EUR 700,00"
    Y la leyenda A vs B contiene "B: EUR 300,00"
    Y no hay errores críticos en la consola

  Escenario: Barras de desglose por categoría
    Dado que existe un usuario autenticado en el navegador
    Y que existe una categoría "Transporte UI" por API
    Y que existe una categoría "Ocio UI" por API
    Cuando registro por API un gasto variable de 250 en "Transporte UI"
    Y registro por API un gasto variable de 150 en "Ocio UI"
    Y abro la página de inicio
    Entonces el desglose muestra la barra "Transporte UI" con "EUR 250,00"
    Y el desglose muestra la barra "Ocio UI" con "EUR 150,00"
    Y no hay errores críticos en la consola

