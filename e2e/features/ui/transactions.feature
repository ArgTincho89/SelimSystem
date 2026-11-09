# language: es
@ui @transaction @regression
Característica: Gestión de transacciones desde la home
  Para registrar mi actividad financiera
  Como usuario autenticado
  Quiero crear, editar y eliminar transacciones desde el FAB

  Antecedentes:
    Dado que existe un usuario autenticado en el navegador
    Y que existe una categoría "Gastos UI" por API

  Escenario: Crear ingreso A y verificar resumen
    Cuando abro la página de inicio
    Y creo un ingreso "Sueldo A" de 1500 con clasificación "A"
    Entonces el stat "Ingresos" muestra "ARS 1.500,00"
    Y veo la transacción "Sueldo A"
    Y no hay errores críticos en la consola

  Escenario: Crear ingreso de seis cifras y verificar el formato de importe
    Cuando abro la página de inicio
    Y creo un ingreso "Sueldo grande" de 211392 con clasificación "B"
    Entonces el stat "Ingresos" muestra "ARS 211.392,00"
    Y veo la transacción "Sueldo grande"
    Y no hay errores críticos en la consola

  Escenario: Crear ingreso B y verificar resumen
    Cuando abro la página de inicio
    Y creo un ingreso "Sueldo B" de 800 con clasificación "B"
    Entonces el stat "Ingresos" muestra "ARS 800,00"
    Y veo la transacción "Sueldo B"
    Y no hay errores críticos en la consola

  Escenario: Crear ingreso Mixto y verificar resumen
    Cuando abro la página de inicio
    Y creo un ingreso "Mixto UI" de 1000 con clasificación "Mixto" desglosado 700 en A y 300 en B
    Entonces el stat "Ingresos" muestra "ARS 1.000,00"
    Y veo la transacción "Mixto UI"
    Y no hay errores críticos en la consola

  Escenario: Crear gasto fijo y verificar gráfico
    Cuando abro la página de inicio
    Y creo un gasto fijo en "Gastos UI" llamado "Alquiler" por 600
    Entonces el stat "Gastos" muestra "ARS 600,00"
    Y no hay errores críticos en la consola

  Escenario: Crear gasto variable y verificar gráfico
    Cuando abro la página de inicio
    Y creo un gasto variable en "Gastos UI" llamado "Cena" por 150
    Entonces el stat "Gastos" muestra "ARS 150,00"
    Y no hay errores críticos en la consola

  Escenario: Crear reembolso y verificar reducción de gastos
    Cuando abro la página de inicio
    Y creo un gasto en "Gastos UI" llamado "Compra" por 200
    Y creo un reembolso en "Gastos UI" llamado "Devolución" por 50
    Entonces el stat "Gastos" muestra "ARS 150,00"
    Y veo la transacción "Devolución"
    Y no hay errores críticos en la consola

  Escenario: Crear gasto recurrente mensual
    Dado que existe una categoría "Recurrentes UI" por API
    Cuando abro la página de inicio
    Y creo un gasto recurrente mensual en "Recurrentes UI" llamado "Suscripción" por 30
    Entonces veo la transacción "Suscripción"
    Cuando navego al mes siguiente
    Entonces veo la transacción "Suscripción"
    Y no hay errores críticos en la consola

  Escenario: Editar transacción desde la lista
    Cuando abro la página de inicio
    Y creo un gasto en "Gastos UI" llamado "Original" por 80
    Y edito la transacción "Original" a "Editada" por 120
    Entonces veo la transacción "Editada"
    Y no veo la transacción "Original"
    Y no hay errores críticos en la consola

  Escenario: Guardar y editar comentarios en la experiencia móvil
    Cuando abro la página de inicio
    Y mantengo el modo móvil en viewport 375
    Y creo un gasto en "Gastos UI" llamado "Gasto con comentarios" por 45 con comentarios "Comentario de prueba en móvil"
    Entonces los comentarios de "Gasto con comentarios" se muestran en el detalle y el formulario de edición como "Comentario de prueba en móvil"
    Cuando actualizo los comentarios de "Gasto con comentarios" a "Comentario actualizado"
    Entonces los comentarios de "Gasto con comentarios" se muestran en el detalle y el formulario de edición como "Comentario actualizado"

  Escenario: Mostrar comentarios en la lista de escritorio sin cambiar su contenido visible
    Cuando abro la página de inicio
    Y configuro el inicio en modo escritorio
    Y creo un gasto en "Gastos UI" llamado "Gasto de escritorio" por 60 con comentarios "<img src=x onerror=alert(1)>"
    Entonces los comentarios de escritorio de "Gasto de escritorio" se guardan en el atributo title y no se muestran inline como "<img src=x onerror=alert(1)>"
    Y los comentarios de "Gasto de escritorio" se muestran en el detalle y el formulario de edición como "<img src=x onerror=alert(1)>"

  Escenario: Eliminar transacción desde la lista
    Cuando abro la página de inicio
    Y creo un gasto en "Gastos UI" llamado "ABorrar" por 55
    Y elimino la transacción "ABorrar"
    Entonces no veo la transacción "ABorrar"
    Y no hay errores críticos en la consola
