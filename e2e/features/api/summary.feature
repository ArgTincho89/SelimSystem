# language: es
@api
Característica: Resumen API
  Para entender mi situación financiera
  Como usuario autenticado
  Quiero ver un resumen mensual

  Antecedentes:
    Dado que existe un usuario registrado

  Escenario: Resumen mensual vacío
    Cuando consulto el resumen del mes actual
    Entonces la respuesta tiene status 200
    Y el resumen tiene el mes actual
    Y los totales del resumen son cero
    Y el desglose por categoría está vacío

  Escenario: Resumen con ingresos y gastos
    Dado que existe una categoría "Gastos varios"
    Y que existe un ingreso "Sueldo" por 3000 con clasificación "A"
    Y que existe un gasto "Supermercado" por 500 en "Gastos varios" clasificación "variable"
    Y que existe un gasto "Alquiler" por 800 en "Gastos varios" clasificación "fijo"
    Cuando consulto el resumen del mes actual
    Entonces la respuesta tiene status 200
    Y el resumen tiene ingresos 3000
    Y el resumen tiene gastos 1300
    Y el resumen tiene gastosNetos 1300
    Y el resumen tiene ahorro 1700
    Y el resumen tiene fijos 800
    Y el resumen tiene variables 500

  Escenario: Resumen con IVA acumulado
    Cuando creo un ingreso llamado "Factura A" por 1000 con clasificación "A" e IVA 21%
    Y creo un ingreso llamado "Factura B" por 1000 con clasificación "B"
    Cuando consulto el resumen del mes actual
    Entonces la respuesta tiene status 200
    Y el resumen tiene ingresos 2000
    Y el resumen tiene ingresosA 1000
    Y el resumen tiene ingresosB 1000
    Y el resumen tiene ivaAcumulado 210

  Escenario: Resumen con clasificación A, B y Mixto
    Cuando creo un ingreso llamado "Ingreso A" por 1000 con clasificación "A"
    Y creo un ingreso llamado "Ingreso B" por 2000 con clasificación "B"
    Y creo un ingreso mixto llamado "Ingreso Mixto" por 1500 con montos A 900 y B 600
    Cuando consulto el resumen del mes actual
    Entonces la respuesta tiene status 200
    Y el resumen tiene ingresos 4500
    Y el resumen tiene ingresosA 1900
    Y el resumen tiene ingresosB 2600
    Y el desglose de ingresos A es 1900
    Y el desglose de ingresos B es 2600
    Y el porcentaje A es 42.22
    Y el porcentaje B es 57.78

  Escenario: Resumen con metas
    Dado que existe una categoría "Gastos controlados"
    Y que existe una meta de ahorro mensual de 500
    Y que existe una meta de gasto por categoría de 200 para "Gastos controlados"
    Y que existe un ingreso "Sueldo" por 3000 con clasificación "A"
    Y que existe un gasto "Gasto en categoría controlada" por 150 en "Gastos controlados" clasificación "variable"
    Cuando consulto el resumen del mes actual
    Entonces la respuesta tiene status 200
    Y el resumen tiene ahorro 2850
    Y el resumen tiene gastosNetos 150
    Y el progreso de la meta de ahorro es 2850 sobre 500
    Y el progreso de la meta de gasto por categoría es 150 sobre 200 para "Gastos controlados"
