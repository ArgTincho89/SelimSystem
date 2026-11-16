# Evolutivo 6 — Original user request (verbatim, Spanish)

> Source of truth for this change. Do not paraphrase in specs without tracing back here. Branch: `evolutivo-6`.
> Delivery: implement on branch, open a PR, do NOT deploy until the user asks.

Backlog Completo de Requisitos y Correcciones (Actualizado)
1. Módulo de Obligaciones
Precarga inteligente del Inquilino en cancelación:

Descripción: Al pulsar el botón "Resolver" en una obligación pendiente a cargo del inquilino, el modal de imputación de cancelación debe traer seleccionado por defecto al inquilino vinculado al contrato de alquiler de ese bien inmueble (y a quien corresponde el gasto).

Corrección actual: Actualmente trae la lista completa de inquilinos de la aplicación en orden alfabético. Debe venir populado automáticamente con el inquilino correcto.

Obligatoriedad del campo "Notas":

Descripción: Al resolver una obligación y marcarla como pagada dentro de la sección de obligaciones, el sistema debe obligar al usuario a rellenar el campo de notas antes de permitir guardar la acción.

2. Módulo de Logs / Historial de Auditoría
Enriquecimiento del detalle en los mensajes de log:

Descripción: Los registros de acciones con fecha y hora deben ser mucho más descriptivos. Por ejemplo, al resolver un impuesto municipal, el mensaje debe detallar: nombre de la propiedad, monto exacto, fecha de vencimiento o cuota correspondiente (ej. "Resolviste un vencimiento de la obligación [Impuesto Municipal] de la propiedad [X], por un monto de [Y], con vencimiento/cuota [Z]").

Incorporación de acción rápida "Deshacer" en el log:

Descripción: En la misma línea de cada registro de log que permita deshacer una acción, debe incluirse directamente el botón "Deshacer", facilitando la reversión rápida desde el propio historial.

Nuevos filtros avanzados en Logs:

Descripción: Incorporar un panel de filtros en la sección de logs para permitir segmentar la información de auditoría por:

Bien inmueble.

Titular.

Inquilino.

Categoría.

3. Historial del Inmueble y Reversión de Pagos
Gestión de reversiones desde el detalle del historial:

Descripción: Al acceder al detalle de una obligación resuelta o un pago de alquiler pagado desde el historial de un inmueble (mediante un modal), se debe incluir un botón "Deshacer".

Requisitos de seguridad para la reversión:

Al pulsar "Deshacer", se abrirá obligatoriamente un text area para redactar una nota justificativa.

Al confirmar, el sistema debe eliminar por completo el impacto financiero/operativo de ese movimiento y devolver la obligación a estado pendiente.

4. Módulo de Bienes y Alquileres
Resaltado visual en alertas de alquileres sin cobrar:

Descripción: En la sección de bienes -> Ver alquiler -> scroll down a la sección de Alertas (listado de alquileres sin cobrar), los registros pendientes de cobro deben visualizarse en fuente roja y en negrita para destacar su estado y facilitar el seguimiento visual.

Gestión avanzada de documentos de contrato:

Descripción: En la sección de bienes -> Ver alquiler -> pestaña Contratos, si existe un documento de contrato adjunto, deben mostrarse dos botones diferenciados:

Descargar documento: Para descargar el archivo al equipo local.

Ver documento: Para abrir un iframe integrado que renderice el contrato, permitiendo navegar por él, hacer zoom y visualizarlo cómodamente.

Limpieza de interfaz en la pestaña contratos:

Descripción: Eliminar el botón "Registrar cobro" ubicado en la parte inferior de la pestaña contratos (dentro de Ver alquiler).

Eliminación de bienes creados por error:

Descripción: Habilitar la opción o el botón para poder eliminar un bien inmueble que haya sido registrado por error.

Comportamiento de confirmación al editar un bien:

Descripción: Se ha detectado un cartel de confirmación antes de guardar los cambios al editar un bien. (Nota: Validar uniformidad si este comportamiento de confirmación previa debe aplicarse a otras entidades o mantenerse tal y como está).

Flexibilidad en tipos de bienes (Categorías personalizables):

Descripción: Actualmente las opciones de tipo de bien son muy limitadas (por ejemplo, no está disponible "local comercial"). Se debe implementar una manera o interfaz para que el usuario pueda crear nuevas opciones de tipos de bienes cuando las predeterminadas no se ajusten a sus necesidades.

5. Configuración y Mantenimiento
Reubicación de Categorías:

Descripción: Mudar la sección de "Categorías" para que pase a ser una nueva subsección dentro del módulo de Configuración.

Corrección en la creación de Proveedores:

Descripción: En Configuración -> Proveedores (para crear nuevos proveedores), el desplegable (dropdown menu) de "Seleccionar categoría de gasto" es obligatorio pero no muestra opciones cargadas, lo que bloquea y no permite presionar el botón de crear.

Corrección en el campo "Cuenta Principal" (Creación de cuentas):

Descripción: En Configuración -> Cuentas, al crear una cuenta nueva, el cuadro de selección de "Cuenta principal" no responde al clic antes de presionar el botón de guardar cuenta (sí funciona correctamente cuando se está en el modo de edición de una cuenta existente).

Restricción al desmarcar cuentas principales:

Descripción: Al editar una cuenta que ya está marcada como "cuenta principal", el sistema no permite desmarcar dicha opción. Debe permitirse la modificación.

Mejora de interfaz en cuentas principales:

Descripción: Cuando se crea/edita una cuenta etiquetada como cuenta principal, se muestran botones de acción redundantes (como el botón "hacer principal"). Es necesario ocultar o eliminar el botón "hacer principal" en aquellas cuentas que ya ostentan ese rol, así como revisar la disponibilidad de opciones de archivar/eliminar en estos casos.

6. Estabilidad y Experiencia de Usuario (UX / General)
Prevención de doble clic / Acciones duplicadas (Debounce / Throttling):

Descripción: Al presionar cualquier botón múltiples veces de forma rápida antes de que se complete la ejecución, existe una carrera de datos que provoca que la acción se registre varias veces. Es necesario implementar un bloqueo visual o debounce en los botones de acción del sistema para evitar registros duplicados.

7. Pantalla de Inicio / Analítica
Rediseño de la sección "IVA mensual por titular":

Descripción: Modificar la visualización actual para que no muestre un listado histórico de meses.

Comportamiento requerido: El enfoque debe centrarse exclusivamente en el mes actual en curso. Se debe mostrar un listado de todos los titulares y, a la derecha de cada uno, el importe total del IVA registrado en el mes actual.
