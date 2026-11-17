# Evolutivo 7 — Original user request (verbatim, Spanish)

> Source of truth for this change. Branch: `evolutivo-7`.
> Delivery: implement on branch, PR to master, merge after CI green (user authorized deploy: "Realizalo todo y despliegalo").

Sección Configuración:

El botón "Ocultar Importes" sólo debe ocultar los importes de las cuentas creadas, no de las tarjetas de "Ingresos" "Gastos" y "Ahorros". Si además quiero ocultar esos, utilizo el botón de la sección "Inicio".

Sección Inicio:

El selector de mes es demasiado pequeño y tiene un scroll lateral invisible, el modal debería tener el tamaño necesario para contener todos los elementos internos sin que nada se trunque.

El selector de año actualmente es el mismo diseño del selector de meses pero en este caso no es la mejor opción, prefiero un desplegable que se renderice en el año actual pero pueda ir hacia abajo o hacia arriba para seleccionar el año que quiera.

Sección Bienes:

Permitime además de "Registrar cobro" para un alquiler, quiero poder registrar un cobro parcial. La forma en la que debe funcionar es que si al registrar cobro, ingreso un valor menor al que corresponde, al guardar me debe indicar una alerta que estoy ingresando un valor inferior al total y preguntarme si se trata de un pago parcial. En caso de decir "No" me devuelve a la edición del registro de cobro y en caso de decir "si" debe registrar que ese pago de alquiler está en estado "Parcialmente cancelado" y que muestre cual es el saldo pendiente.

Agrega "Cheque" como medio de cobro y cuando se seleccióne agrega un campo de "Dias" donde se debe seleccionar en cuantos días se ingresa ese pago (Se cobra ese cheque) y a la vez cuando eso suceda, agrega un aviso cuando esté por vencer la fecha de cobro de ese cheque y que se indique a que pago de que alquiler y de cual bien corresponde.

En el modal de "Registrar cobro" me debe dejar adjuntar un archivo donde puedo poner el comprobante de pago que envían los inquilinos.

En términos generales y transversales a toda la aplicación, en todo registro de pago o ingreso o alquiler o pago de obligación por parte de inquilino o titular debo poder adjuntar archivos. Si un inquilino paga una obligación que está a su cargo y me avisa que lo ha pagado y me envia el comprobante de pago, al informar que esa obligación está cancelada y yo registrar eso, debo poder adjuntar ese documento. y en todos los objetos que tengan un documento adjuntado, debo poder "Descargar" ese documento o "Ver documento" con un botón que cuando lo pulso se abre un modal con un iFrame y dentro se renderiza el documento en cuestión donde puedo hacer zoom in / zoom out .

## Orchestrator decisions (defaults, user did not specify)

- D1 Partial payments: a rent period can receive several collections; it stays "Parcialmente cancelado" with visible saldo pendiente until the sum reaches the amount due, then becomes fully collected. "Registrar cobro" on a partially paid period preloads the pending balance. Undo of a collection recomputes the state.
- D2 Cheque: collection date = payment date + días. The income is recorded with the cheque's collection date (acreditación). Alert appears in the existing alerts mechanism when the collection date is within 7 days or past (until marked as cobrado / the date passes + reasonable rule), showing bien, alquiler (tenant/period) and amount.
- D3 Attachments: reuse the existing document storage/view infrastructure from evolutivo-6 (contract documents). Viewer = modal with iframe, zoom in / zoom out / reset, plus "Descargar". Allowed types and size limits follow the existing contract-document rules.
- D4 "Ocultar importes" in Configuración hides only account balances; Home summary cards (Ingresos/Gastos/Ahorros) are controlled only by the Home toggle. The two toggles are independent.
