# Evolutivo 3 — Original user request (verbatim, Spanish)

> Source of truth for this change. User feedback after testing evolutivo-2 in production. Do not paraphrase in specs without tracing back here.

Aspectos a evolucionar:

Agregar LOGS de cada acción realizada con su timestamp

Configuración:
Las cuentas deben permitir la creación de una sub-cuenta hija con su propia divisa, y las imputaciones de transacciones (Ingresos, Gastos o reembolsos) se deben poder asignar a esa cuenta bancaria o una de sus sub cuentas.


Bienes:

En el modal de creación de un Inmueble, Identificación catastral debe ser un campo de texto de tipo string a completar, opcional.

El campo "Antigüedad" del modal de creación de bien debe solicitar una fecha y por ende calcular la antigüedad automáticamente.

La creación del bien no debe solicitar la condición de alquilado o no alquilado, necesito una vez que el bien está creado, poder declarar un alquiler del bien, y ahi el modal me pide la información y además con respecto al monto del alquiler, moneda, frecuencia de ajuste, criterio de ajuste debe permitirme especificar mas de una modalidad de alquiler, es decir: "contrato de locación" y también "Comodato" y también "Mutuo", puede ser uno, el otro o dos o tres al mismo tiempo en el mismo alquiler: Me debe permitir asignar esos tipos con checkboxews y en función de la o las opciones que seleccione, serán los datos que el modal de "Declaración de alquiler" me solicitaran:  En el caso de seleccionar "Contrato de locacion"  Me pedirá, fecha de inicio, fecha finalizacion, monto original, IVA (aclaro el porcentaje y se suma al monto original), Moneda, Frecuencia de ajuste ( meses) y criterio de ajuste.  En el caso de ser de tipo "Comodato" me pedira lo mismo pero sin el IVA. En el caso de ser Mutuo, lo mismo pero sin IVA. Luego lo de Obligaciones del bien y Notas es generico para todos los casos y se comparte.



Una vez que creo el bien, y se renderiza en la tabla, quiero un boton de "Ver" que me abra el mismo modal de "Editar" pero no editable (modo lectura) para poder consultar su contenido.
Del mismo modal, elimina lo de "Añadir titularidad" por que eso se hace desde "Editar"

Cuando intento editar un bien para modificar la fecha de "Contrato vigente desde", no me deja. el modal de "Editar" me debe permitir editar todo, y siempre mostrando un aviso de alerta al pulsar "Guardar cambios"


En el modal "Ver historial" en la seccion "Pendiente, fuera de resutlados reales" figura:" Pendiente, fuera de resultados reales
2026-05-01 · Alquiler esperado · Alquiler esperado · ARS 9.750.000,00 · overdue"  "overdue" es una palabra en ingles igual que pending y no debemos utilizar esas palabras, debemos utilizar terminologia en castellano.


Obligaciones:

Esto esta en el modal de Nueva obligacion pero también es general a muchos campos de la aplicacion: Los campos donde se inserta un valor numerico de dinero ( ej: Importe estimado) los numeros se deben renderizar como montos monetarios , es decir "211.392,00" en lugar de "211392".

Avisos: 

Cuando tengo "Alquileres pendientes de cobro" y pulso "Registrar cobro" Me debe permitir registrar solamente el cobro seleccionado, actualmente me da un listado de todos los meses del contrato incluidos los futuros y eso no es correto. y quita de ahi lo de "Medio reutilizable".

Registre un cobro de un alquiler, se imputó en Transacciones (correcto) pero se imputo como pago en B aunque era con IVA y a una cuenta bancaria ( la principal) y luego intenté editar la transacción y no me dejó con un mensaje de "Los cobros de alquiler vinculados a períodos son inmutables; registra un movimiento compensatorio si hace falta"  Debe existir la posibilidad de corregir un error en la imputación del cobro de un alquiler. Por ejemplo debo poder eliminar ese registro de transacciones y debe volver hacia atrás y aparecer ese cobro del alquiler en "Avisos" como pendiente de cobro nuevamente y ahi puedo corregir el error.

## Follow-up clarification (verbatim, Spanish)

con respeco a "Agregar LOGS de cada acción realizada con su timestamp" eso debe ser una sección en "Perfil"  y en "Acciones de cuenta" que se llame LOGS y me permita consultar todas mis acciones en lenguaje claro declarando dia, hora y minuto

## Answers to open questions (verbatim, Spanish, 2026-11-10)

Con respeto a preguntas abiertas: Pago en A significa un pago en blanco, declarado y que por ende tributa impuestos, pago en B significa en efectivo, sin facturar y por ende sin IVA por eso ambos deben impactar a ingresos pero afectar a la categoria correspondiente ( A y B) y solo A permite ingresar IVA. Con respecto a las marias modalidades en un mismo alquiler eso es por que un alquiler se puede determinar por ejemplo por un monto de 10.000.000 pero que 5.000.000 es en blanco y por ende con un contrato de alquiler ( todo declarado) y el saldo dividido entre un comodato y un contrato de mutuo pero los 3 son fundamentales para considerar ese mes de alquiler pagado ( y un alquiler puede componerse de un solo tipo de esos contratos, dos o tres) . Respecto al cambio de fecha de inicio de contrato, me parece correcto.  Lo de anular un cobro, sigo pensando que se debe poder anular el cobro y esa anulación debe estar correctamente implementada para que sea como "Deshacer" la acción de imputación del cobro.  Continua con el desarrollo, lo restante tambien me parece bien
