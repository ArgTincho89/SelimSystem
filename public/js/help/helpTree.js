// Static decision tree of the "Ayuda" assistant. Pure data: no DOM, no storage, no network.
// Every node has an id and a title. A menu node has `text` and `options` ([{ label, next }], at most 8 so the
// numbers 1-8 stay free and 9 / 0 can always mean "paso anterior" / "menú principal"). A leaf has `steps`
// (friendly step-by-step instructions using the exact labels of the app) and an optional `tip` ("si algo no
// cierra"). Labels in quotes are the literal text of buttons, tabs and fields in the app.
const HelpTree = (() => {
  const NODES = [
    {
      id: 'root',
      title: 'Menú principal',
      text: '¿Sobre qué tema necesitás ayuda?',
      options: [
        { label: 'Transacciones: gastos, ingresos y reembolsos', next: 'tx' },
        { label: 'Cuentas, saldos y transferencias', next: 'acc' },
        { label: 'Bienes (muebles e inmuebles)', next: 'assets' },
        { label: 'Alquileres, inquilinos y cobros', next: 'rent' },
        { label: 'Obligaciones, vencimientos y pagos', next: 'obl' },
        { label: 'Avisos', next: 'alerts' },
        { label: 'Configuración: titulares, inquilinos, proveedores y categorías', next: 'setup' },
        { label: 'Perfil, Logs, deshacer y acceso', next: 'profile' }
      ]
    },

    // ───────────────────────── 1. Transacciones ─────────────────────────
    {
      id: 'tx',
      title: 'Transacciones',
      text: 'Las transacciones se ven y se cargan en "Inicio". ¿Qué querés hacer?',
      options: [
        { label: 'Registrar un movimiento nuevo', next: 'tx-new' },
        { label: 'Gastos recurrentes (todos los meses)', next: 'tx-rec' },
        { label: 'Cuotas con crédito y cheques', next: 'tx-inst' },
        { label: 'Ver, editar o eliminar una transacción', next: 'tx-edit' },
        { label: 'Buscar y filtrar transacciones', next: 'tx-find' },
        { label: 'Totales del mes y analítica', next: 'tx-sum' }
      ]
    },
    {
      id: 'tx-new',
      title: 'Registrar un movimiento nuevo',
      text: '¿Qué tipo de movimiento querés registrar?',
      options: [
        { label: 'Un gasto', next: 'tx-new-expense' },
        { label: 'Un ingreso (A, B o Mixto)', next: 'tx-new-income' },
        { label: 'Un reembolso (me devolvieron un gasto)', next: 'tx-new-refund' },
        { label: 'Un movimiento desde una cuenta puntual', next: 'tx-new-account' },
        { label: 'Cargar el IVA de una factura o de un ingreso', next: 'tx-new-iva' },
        { label: 'Indicar a qué bien corresponde (atribución)', next: 'tx-new-attr' },
        { label: 'Pagar un vencimiento con un gasto nuevo', next: 'tx-new-payocc' },
        { label: 'Adjuntar un comprobante a un movimiento', next: 'tx-new-receipt' }
      ]
    },
    {
      id: 'tx-new-expense',
      title: 'Registrar un gasto',
      steps: [
        'Andá a "Inicio" desde el menú.',
        'Tocá el botón "+" (en el celular) o "Nueva transacción" (en la experiencia Escritorio).',
        'Arriba de la ventana elegí el tipo "Gasto".',
        'Elegí la "Cuenta" con la que pagaste (por defecto aparece la principal). El importe se toma en la moneda de esa cuenta.',
        'Elegí la "Categoría" (es obligatoria) y la "Clasificación": "Fijo" o "Variable" (por defecto Variable).',
        'Escribí el "Monto" y revisá la "Fecha" (por defecto, hoy). El "Título (opcional)" puede quedar vacío: se usa el nombre de la categoría.',
        'Si querés, elegí el "Medio de pago" y escribí "Comentarios".',
        'Tocá "Guardar". El gasto resta del saldo de la cuenta y suma a "Gastos" del mes.'
      ],
      tip: 'Si no aparece ninguna categoría, primero creala en "Configuración" > "Categorías". Si el gasto no se ve, revisá que estés mirando el mes de su fecha en el selector de mes.'
    },
    {
      id: 'tx-new-income',
      title: 'Registrar un ingreso',
      steps: [
        'Andá a "Inicio" y tocá "+" o "Nueva transacción".',
        'Elegí el tipo "Ingreso".',
        'Elegí la "Cuenta" donde entró el dinero.',
        'En "Clasificación" elegí "A" (declarado, facturado), "B" (no declarado, sin factura) o "Mixto" (una parte A y otra B). Por defecto es A.',
        'Escribí el "Monto" y la "Fecha". Si es A, podés cargar el "IVA (%) — débito fiscal".',
        'Tocá "Guardar". El ingreso suma al saldo de la cuenta y a "Ingresos" del mes.'
      ],
      tip: 'Los ingresos no usan categoría. Los cobros de alquiler no se cargan acá: se registran con "Registrar cobro" (ver el tema Alquileres).'
    },
    {
      id: 'tx-new-refund',
      title: 'Registrar un reembolso',
      steps: [
        'Andá a "Inicio" y tocá "+" o "Nueva transacción".',
        'Elegí el tipo "Reembolso".',
        'Elegí la "Cuenta" donde recibiste la devolución y la "Categoría" del gasto original (obligatoria).',
        'Si querés vincularlo, elegí el gasto en "Gasto de origen (opcional)".',
        'Escribí el "Monto" y la "Fecha" y tocá "Guardar".',
        'El reembolso suma al saldo de la cuenta pero no es un ingreso: reduce el gasto de esa categoría y el total de "Gastos".'
      ],
      tip: 'Si lo cargaste como "Ingreso" por error, eliminá ese ingreso y registralo de nuevo como "Reembolso".'
    },
    {
      id: 'tx-new-account',
      title: 'Cargar un movimiento desde una cuenta',
      steps: [
        'Andá a "Configuración" > "Cuentas".',
        'En la cuenta que te interesa tocá "Ver movimientos".',
        'Tocá "Nuevo movimiento en esta cuenta": se abre el mismo formulario de transacción con esa cuenta elegida.',
        'Completá el tipo, el monto y los demás datos y tocá "Guardar".'
      ],
      tip: 'Desde "Inicio" también podés tocar "Ver cuenta" en la tarjeta de una cuenta para llegar a "Configuración" > "Cuentas".'
    },
    {
      id: 'tx-new-iva',
      title: 'Cargar el IVA',
      steps: [
        'En un gasto con factura: en el formulario completá "IVA (%) de la factura — crédito fiscal" (entre 0 y 100). Por ejemplo, 1.000.000 al 21% da 210.000 de crédito fiscal.',
        'En "Factura a nombre de" elegí el titular que recibe el crédito fiscal. Por defecto es "Titular de la cuenta" (el titular de la cuenta con la que pagaste).',
        'En un ingreso A (o la parte A de un Mixto): completá "IVA (%) — débito fiscal". Es débito fiscal del titular de la cuenta donde entra el dinero.',
        'Tocá "Guardar". Vas a ver el resultado en "Inicio" > Analítica > "IVA mensual por titular".'
      ],
      tip: 'Los ingresos B no admiten IVA. Si dejás el IVA vacío o en 0, el movimiento no afecta el IVA mensual.'
    },
    {
      id: 'tx-new-attr',
      title: 'Atribuir un movimiento a un bien',
      steps: [
        'En el formulario de transacción buscá el bloque "Atribución del movimiento".',
        'En "Bien" elegí el bien al que corresponde el importe. En gastos también aparece "Obligaciones sin bien", para llegar a obligaciones que no tienen bien.',
        'Opcionalmente, en "Obligación o período (opcional)" elegí la obligación o el período de alquiler de ese bien. Elegir solo el bien alcanza.',
        'Indicá el "Importe". Con "+ Añadir atribución" repartís el monto entre varios bienes; con "Quitar" sacás una línea.',
        'Tocá "Guardar". La atribución no cambia los totales: alimenta el análisis económico del bien.'
      ],
      tip: 'Un movimiento con atribuciones no se puede eliminar ni cambiar de importe, tipo o cuenta. Para corregir la atribución usá "Editar atribuciones" desde la ficha del bien o la obligación.'
    },
    {
      id: 'tx-new-payocc',
      title: 'Pagar un vencimiento desde "Nueva transacción"',
      steps: [
        'En "Inicio" tocá "+" o "Nueva transacción" y elegí "Gasto".',
        'Elegí una "Cuenta" con la misma moneda que la obligación.',
        'En "Atribución del movimiento" elegí el "Bien" (u "Obligaciones sin bien") y en "Obligación o período (opcional)" elegí el vencimiento ("Vencimiento · título · fecha · pendiente $X").',
        'Abajo vas a ver "Se registrará como pago de este vencimiento". El monto se precarga con lo pendiente; podés pagar menos (pago parcial), nunca más.',
        'Escribí los "Comentarios": son obligatorios porque son las notas del pago.',
        'Tocá "Guardar". El vencimiento queda pagado (o parcial) igual que con "Registrar pago".'
      ],
      tip: 'Un gasto paga un solo vencimiento y esa debe ser su única atribución. No se combina con cuotas ni con "Recurrente" y la fecha no puede ser futura. Al editar un movimiento existente no se puede convertir en pago: usá "Registrar pago" en Obligaciones.'
    },
    {
      id: 'tx-new-receipt',
      title: 'Adjuntar un comprobante a un movimiento',
      steps: [
        'Al cargar un movimiento, usá el campo "Adjuntar comprobante (opcional)" del formulario.',
        'Para un movimiento ya guardado: en "Inicio" tocá la transacción para abrir su detalle.',
        'Tocá "Adjuntar comprobante" y elegí el archivo (PDF, imagen o texto, hasta 20 MiB).',
        'Para verlo después, en el mismo detalle tocá "Ver documento".'
      ],
      tip: 'Si el archivo no se acepta, revisá el formato y el tamaño. Los comprobantes de pagos de obligaciones también se ven en el historial del bien.'
    },
    {
      id: 'tx-rec',
      title: 'Gastos recurrentes',
      text: '¿Qué necesitás hacer con un gasto recurrente?',
      options: [
        { label: 'Crear un gasto que se repite', next: 'tx-rec-create' },
        { label: 'Contabilizar una ocurrencia', next: 'tx-rec-post' },
        { label: 'Saltear una ocurrencia', next: 'tx-rec-skip' },
        { label: 'Cambiar el importe de una o de todas las ocurrencias', next: 'tx-rec-edit' },
        { label: 'Una ocurrencia no suma a los totales', next: 'tx-rec-why' }
      ]
    },
    {
      id: 'tx-rec-create',
      title: 'Crear un gasto recurrente',
      steps: [
        'En "Inicio" tocá "+" o "Nueva transacción" y elegí "Gasto".',
        'Completá cuenta, categoría, monto y fecha como en un gasto común.',
        'Marcá la casilla "Recurrente".',
        'Elegí la "Frecuencia": "Mensual", "Bimensual", "Trimestral", "Semestral" o "Anual".',
        'Indicá una "Fecha fin" o marcá "Indeterminado".',
        'Tocá "Guardar". Cada período se genera una ocurrencia "Programada" el mismo día del mes.'
      ],
      tip: 'Con medio de pago "Cheque" no se puede marcar "Recurrente".'
    },
    {
      id: 'tx-rec-post',
      title: 'Contabilizar una ocurrencia',
      steps: [
        'En "Inicio" elegí el mes de la ocurrencia con el selector de mes.',
        'Tocá la transacción marcada como "Programada".',
        'Tocá "Contabilizar ocurrencia". Pasa a ser un movimiento real y suma a los totales del mes.'
      ],
      tip: 'Solo se pueden contabilizar ocurrencias con fecha de hoy o anterior. Si el botón no aparece, la fecha todavía no llegó o ya estaba contabilizada.'
    },
    {
      id: 'tx-rec-skip',
      title: 'Omitir una ocurrencia',
      steps: [
        'En "Inicio" tocá la ocurrencia programada que no se va a pagar.',
        'Tocá "Omitir ocurrencia". Se saltea solo esa; la serie sigue igual.'
      ],
      tip: 'Una ocurrencia que ya contabilizaste no se puede omitir.'
    },
    {
      id: 'tx-rec-edit',
      title: 'Editar una ocurrencia recurrente',
      steps: [
        'En "Inicio" tocá la ocurrencia y luego "Editar".',
        'Cambiá lo que necesites (por ejemplo, el monto).',
        'En "Aplicar cambios" elegí "Solo esta ocurrencia" o "Esta ocurrencia y las futuras".',
        'Tocá "Guardar".'
      ],
      tip: 'Para terminar la serie, editala con "Esta ocurrencia y las futuras" y poné una "Fecha fin".'
    },
    {
      id: 'tx-rec-why',
      title: 'Una ocurrencia no suma a los totales',
      steps: [
        'Las ocurrencias de un gasto recurrente figuran como "Programada" y no suman a "Ingresos", "Gastos" ni "Ahorro" hasta que se contabilizan.',
        'Tocá la ocurrencia y usá "Contabilizar ocurrencia" cuando el pago se haya hecho (solo con fecha de hoy o pasada).'
      ],
      tip: 'Lo mismo pasa con las cuotas con cheque "Pendiente de confirmación" y las cuotas programadas: no cuentan hasta confirmarlas o contabilizarlas.'
    },
    {
      id: 'tx-inst',
      title: 'Cuotas con crédito y cheques',
      text: '¿Qué caso tenés?',
      options: [
        { label: 'Compra en cuotas con tarjeta de crédito', next: 'tx-inst-credit' },
        { label: 'Anular una compra en cuotas', next: 'tx-inst-cancel' },
        { label: 'Gasto o ingreso pagado con cheques en cuotas', next: 'tx-inst-cheque' },
        { label: 'Confirmar una cuota con cheque', next: 'tx-inst-confirm' },
        { label: 'Deshacer la confirmación de un cheque', next: 'tx-inst-unconfirm' },
        { label: 'Cuotas programadas (planes anteriores)', next: 'tx-inst-legacy' },
        { label: 'Errores al cargar cuotas', next: 'tx-inst-errors' }
      ]
    },
    {
      id: 'tx-inst-credit',
      title: 'Compra en cuotas con crédito',
      steps: [
        'En "Inicio" tocá "+" o "Nueva transacción" y elegí "Gasto".',
        'En "Medio de pago" elegí "Crédito".',
        'Completá "Cuotas" (de 1 a 36) e "Interés (%)" (0 si no tiene). Vas a ver una vista previa: "N cuotas de $X (total $Y)".',
        'Tocá "Guardar". Con más de una cuota se crea un gasto por cuota ("Título — cuota x/N"), a partir del mes siguiente y el mismo día del mes.',
        'Cada cuota suma a los gastos del mes de su fecha.'
      ],
      tip: 'Con 1 cuota es un gasto normal en la fecha elegida. El aviso "Próximas cuotas de crédito" te recuerda las cuotas que se acercan.'
    },
    {
      id: 'tx-inst-cancel',
      title: 'Anular una compra en cuotas',
      steps: [
        'Cada cuota es un gasto independiente: no hay un borrado en bloque.',
        'En "Inicio" andá al mes de cada cuota, tocala y usá "Eliminar".',
        'Repetí con cada cuota que quieras anular.'
      ],
      tip: 'Si una cuota no se deja eliminar, puede tener una atribución o un movimiento vinculado: revisá el mensaje que muestra la aplicación.'
    },
    {
      id: 'tx-inst-cheque',
      title: 'Cheques en cuotas',
      steps: [
        'En un gasto o ingreso nuevo, en "Medio de pago" elegí "Cheque".',
        'En "Cuotas" indicá cuántos cheques son (de 1 a 24).',
        'Por cada cheque completá "Vencimiento cuota Nº x", "Monto" y "Nº cheque". Los montos se reparten solos en partes iguales; podés corregirlos.',
        'Tocá "Guardar". Se crea un movimiento por cheque ("Título — Cheque cuota x/N") que queda "Pendiente de confirmación" y no cuenta en ningún total.',
        'Cuando el cheque se acredite o debite, confirmalo con "Confirmar imputación".'
      ],
      tip: 'La suma de las cuotas debe ser exactamente el monto. Con cheque no se puede marcar "Recurrente", la atribución admite un solo bien y "Mixto" no admite cuotas.'
    },
    {
      id: 'tx-inst-confirm',
      title: 'Confirmar una cuota con cheque',
      steps: [
        'Desde "Avisos": buscá el grupo "Cuotas con cheque por confirmar" y tocá "Confirmar imputación".',
        'O desde "Inicio": tocá el movimiento "Pendiente de confirmación" y tocá "Confirmar imputación".',
        'Confirmá en la ventana. La cuota pasa a contar en los totales del mes de su vencimiento.'
      ],
      tip: 'Si te equivocaste, usá "Deshacer confirmación" (pide un motivo).'
    },
    {
      id: 'tx-inst-unconfirm',
      title: 'Deshacer la confirmación de un cheque',
      steps: [
        'En "Inicio" tocá el movimiento del cheque ya confirmado.',
        'Tocá "Deshacer confirmación".',
        'Escribí el "Motivo" (obligatorio, hasta 500 caracteres) y confirmá.',
        'La cuota vuelve a quedar pendiente de confirmación. Queda registrado en "Logs".'
      ]
    },
    {
      id: 'tx-inst-legacy',
      title: 'Cuotas programadas de planes anteriores',
      steps: [
        'En "Inicio", si existen, verás "Cuotas programadas (no incluidas en los totales)" con las cuotas del mes.',
        'Tocá una cuota y elegí "Contabilizar cuota" (te pide el importe, precargado con el previsto, y la registra como gasto) o "Cancelar cuota".',
        'También podés contabilizarlas desde "Avisos" > "Cuotas de tarjeta" > "Contabilizar cuota".'
      ]
    },
    {
      id: 'tx-inst-errors',
      title: 'Errores al cargar cuotas',
      steps: [
        '"La suma de las cuotas debe ser igual al monto": corregí los montos de cada cheque para que sumen exactamente el "Monto".',
        'El "Nº cheque" es obligatorio, de hasta 30 caracteres, con letras, números y guiones (por ejemplo, 0001-23456789).',
        'Cada fila necesita fecha y un monto mayor a cero.',
        '"La clasificación Mixto no admite cuotas": usá A o B, o cargalo como dos ingresos.',
        '"El interés debe ser un número mayor o igual a 0": dejá 0 si la compra no tiene interés.'
      ]
    },
    {
      id: 'tx-edit',
      title: 'Ver, editar o eliminar',
      text: '¿Qué necesitás?',
      options: [
        { label: 'Ver el detalle de una transacción', next: 'tx-edit-view' },
        { label: 'Editar una transacción', next: 'tx-edit-edit' },
        { label: 'Eliminar una transacción', next: 'tx-edit-delete' },
        { label: 'No me deja editar o eliminar', next: 'tx-edit-blocked' },
        { label: 'Qué es un "Gasto espejo del cobro de alquiler"', next: 'tx-edit-mirror' },
        { label: 'Ver una transferencia desde Inicio', next: 'acc-tr-home' }
      ]
    },
    {
      id: 'tx-edit-view',
      title: 'Ver el detalle de una transacción',
      steps: [
        'En "Inicio" elegí el mes con el selector de mes.',
        'Tocá la transacción en la lista (están agrupadas por día).',
        'Se abre el detalle con título, categoría, Fijo/Variable, fecha, cuenta, importe y comentarios, y los botones disponibles.',
        'Si es un cobro de alquiler, "Ver" muestra el cobro completo del mes.'
      ]
    },
    {
      id: 'tx-edit-edit',
      title: 'Editar una transacción',
      steps: [
        'En "Inicio" tocá la transacción.',
        'Tocá "Editar": se abre el formulario con los datos cargados.',
        'Corregí lo que necesites y tocá "Guardar".'
      ],
      tip: 'Cambiar la cuenta no convierte el importe: si la nueva cuenta tiene otra moneda, revisá el monto. Los pagos de obligaciones y los cobros de alquiler no se editan (ver "No me deja editar o eliminar").'
    },
    {
      id: 'tx-edit-delete',
      title: 'Eliminar una transacción',
      steps: [
        'En "Inicio" tocá la transacción.',
        'Tocá "Eliminar" y confirmá.',
        'El saldo de la cuenta y los totales del mes se recalculan.'
      ],
      tip: 'En una ocurrencia recurrente el botón dice "Omitir ocurrencia" y en un cobro de alquiler "Deshacer cobro".'
    },
    {
      id: 'tx-edit-blocked',
      title: 'No me deja editar o eliminar',
      steps: [
        'Pago de una obligación: no se edita ni se elimina. Usá "Revertir pago" (en el detalle o en Obligaciones) y registrá uno nuevo.',
        'Cobro de alquiler: no se edita. Usá "Deshacer cobro" y registralo de nuevo.',
        'Movimiento con atribuciones o reintegros: no se puede cambiar su importe, tipo, cuenta o moneda, ni eliminar.',
        'Ingreso que sostiene una conversión de moneda: primero hay que eliminar la conversión en "Configuración" > "Cuentas".',
        'Gasto espejo de un cobro de alquiler: es de solo lectura; se elimina al deshacer el cobro.'
      ],
      tip: 'Leé el mensaje de error: siempre indica qué movimiento bloquea el cambio.'
    },
    {
      id: 'tx-edit-mirror',
      title: 'Gasto espejo del cobro de alquiler',
      steps: [
        'Cuando el inquilino de un alquiler también es un titular, cada cobro crea además el gasto de ese titular-inquilino.',
        'En "Inicio" figura como "Gasto espejo del cobro de alquiler", con título "Alquiler pagado — bien mes/año".',
        'Tiene "Ver" (muestra el cobro) y no tiene "Editar" ni "Eliminar".',
        'Para corregirlo, deshacé el cobro con "Deshacer cobro": el gasto espejo se elimina también.'
      ]
    },
    {
      id: 'tx-find',
      title: 'Buscar y filtrar transacciones',
      text: '¿Qué querés hacer?',
      options: [
        { label: 'Cambiar de mes', next: 'tx-find-month' },
        { label: 'Filtrar transacciones', next: 'tx-find-filter' },
        { label: 'Filtrar por monto', next: 'tx-find-amount' },
        { label: 'Quitar los filtros', next: 'tx-find-clear' },
        { label: 'No encuentro un movimiento', next: 'tx-find-missing' }
      ]
    },
    {
      id: 'tx-find-month',
      title: 'Cambiar de mes',
      steps: [
        'En "Inicio" usá las flechas del selector de mes ("Mes anterior" / "Mes siguiente"). También podés ir a meses futuros para ver lo programado.',
        'Tocá el nombre del mes para elegir uno de los doce meses.',
        'Tocá el año para elegir otro año de la lista (se conserva el mes).'
      ]
    },
    {
      id: 'tx-find-filter',
      title: 'Filtrar transacciones',
      steps: [
        'En "Inicio" tocá "Filtrar" (o "Filtro").',
        'Se abre "Filtrar transacciones". Elegí el tipo (Gasto, Ingreso, Reembolso o "Transferencia o conversión"), la cuenta, la categoría, la clasificación (Fijo / Variable), un texto, un rango de montos y de fechas.',
        'Tocá "Aplicar". Mientras haya filtros, el botón dice "Filtrando".'
      ]
    },
    {
      id: 'tx-find-amount',
      title: 'Filtrar por monto',
      steps: [
        'En "Filtrar transacciones" primero elegí una "Cuenta": los montos se filtran en una sola moneda.',
        'Completá "Monto mínimo" y/o "Monto máximo".',
        'Tocá "Aplicar".'
      ],
      tip: 'Si los campos de monto no se habilitan, falta elegir la cuenta ("Elegí una cuenta para filtrar importes de una sola moneda").'
    },
    {
      id: 'tx-find-clear',
      title: 'Quitar los filtros',
      steps: [
        'En "Inicio" tocá "Filtrando".',
        'En la ventana tocá "Limpiar". Vuelven a verse todas las transacciones del mes.'
      ]
    },
    {
      id: 'tx-find-missing',
      title: 'No encuentro un movimiento',
      steps: [
        'Revisá el mes: la lista muestra solo el mes elegido en el selector de mes.',
        'Revisá si el botón dice "Filtrando": si hay filtros activos, tocá "Limpiar".',
        'Si era una cuota con crédito, está en el mes siguiente a la compra (cuota 1) y en los siguientes.',
        'Si cargaste un cheque, cada cuota está en el mes de su vencimiento.',
        'También podés buscarlo en "Perfil" > "Logs", que registra todo lo que hiciste.'
      ]
    },
    {
      id: 'tx-sum',
      title: 'Totales del mes y analítica',
      text: '¿Qué querés entender?',
      options: [
        { label: 'Qué suman Ingresos, Gastos y Ahorro', next: 'tx-sum-cards' },
        { label: 'Ver qué movimientos forman una cifra', next: 'tx-sum-detail' },
        { label: 'Ocultar o mostrar importes', next: 'tx-sum-hide' },
        { label: 'Gráficos de la analítica', next: 'tx-sum-charts' },
        { label: 'IVA mensual por titular', next: 'tx-sum-iva' },
        { label: 'Fijar un gráfico favorito (Escritorio)', next: 'tx-sum-fav' },
        { label: 'Los totales no me cierran', next: 'tx-sum-wrong' }
      ]
    },
    {
      id: 'tx-sum-cards',
      title: 'Ingresos, Gastos y Ahorro',
      steps: [
        '"Ingresos": suma de ingresos contabilizados (incluye cobros de alquiler y reintegros).',
        '"Gastos": gastos contabilizados menos reembolsos (incluye pagos de obligaciones, cuotas y comisiones de transferencias).',
        '"Ahorro": Ingresos menos Gastos. Puede ser negativo.',
        'Se muestran por moneda, sin conversión: si hay ARS y EUR verás los dos importes separados por "/".'
      ],
      tip: 'No suman: transferencias (salvo su comisión), ocurrencias recurrentes sin contabilizar, cheques pendientes de confirmación, cuotas programadas, resoluciones de inquilinos y vencimientos pendientes.'
    },
    {
      id: 'tx-sum-detail',
      title: 'Ver qué movimientos forman una cifra',
      steps: [
        'En "Inicio" tocá la tarjeta "Ingresos", "Gastos" o "Ahorro".',
        'Se abre el "Detalle del resumen económico" con los movimientos reales del mes: fecha, concepto, tipo, importe y cuenta.'
      ]
    },
    {
      id: 'tx-sum-hide',
      title: 'Ocultar o mostrar importes',
      steps: [
        'En "Inicio", el botón con forma de ojo oculta con "••••••" las tarjetas de Ingresos, Gastos y Ahorro. Tocalo otra vez para mostrarlas.',
        'En "Configuración", el botón "Ocultar importes" / "Mostrar importes" oculta solo los saldos de las cuentas.',
        'Son dos preferencias independientes y se recuerdan en este dispositivo.'
      ]
    },
    {
      id: 'tx-sum-charts',
      title: 'Gráficos de la analítica',
      steps: [
        'Están en "Inicio", en la sección "Analítica", y se calculan para el mes elegido en la moneda principal (ARS por defecto).',
        '"Distribución de gastos": dona por categoría principal (las subcategorías suman en su padre).',
        '"Gastos por categoría": barras por categoría y subcategoría con su porcentaje.',
        '"Fijo vs Variable": reparto entre gastos fijos y variables.',
        '"Ingresos A vs B": una dona por titular y moneda con el reparto A/B.'
      ],
      tip: 'Si un gráfico dice "Este análisis no tiene datos en el período actual.", no hay movimientos de ese tipo en el mes elegido.'
    },
    {
      id: 'tx-sum-iva',
      title: 'IVA mensual por titular',
      steps: [
        'En "Inicio" > "Analítica" buscá "IVA mensual por titular". Sigue al mes elegido.',
        'Columnas: "Titular", "Débito fiscal" (IVA de sus ingresos A), "Crédito fiscal" (IVA de los gastos facturados a su nombre) y "Saldo" (crédito menos débito).',
        'Saldo negativo: IVA a pagar. Saldo positivo: saldo a favor.'
      ],
      tip: 'Si un gasto con factura no aparece, revisá su "IVA (%) de la factura" y a quién figura en "Factura a nombre de".'
    },
    {
      id: 'tx-sum-fav',
      title: 'Gráfico favorito',
      steps: [
        'Solo en la experiencia Escritorio: cada gráfico de la Analítica tiene una estrella (☆).',
        'Tocá la estrella para marcarlo como favorito (★): se muestra junto a las tarjetas de métricas.',
        'Solo puede haber un favorito y se recuerda en este dispositivo. "IVA mensual por titular" no se puede fijar.'
      ]
    },
    {
      id: 'tx-sum-wrong',
      title: 'Los totales no me cierran',
      steps: [
        'Confirmá que estás mirando el mes correcto.',
        'Recordá que los totales son por moneda, sin conversión.',
        'Revisá si hay ocurrencias "Programada" o cheques "Pendiente de confirmación": no suman hasta contabilizarlos o confirmarlos.',
        'Los reembolsos restan de "Gastos" (no suman a "Ingresos") y las transferencias no cuentan.',
        'Tocá la tarjeta para ver el "Detalle del resumen económico" y encontrar el movimiento que sobra o falta.'
      ]
    },

    // ───────────────────────── 2. Cuentas ─────────────────────────
    {
      id: 'acc',
      title: 'Cuentas, saldos y transferencias',
      text: 'Las cuentas se administran en "Configuración" > "Cuentas". ¿Qué necesitás?',
      options: [
        { label: 'Crear y administrar cuentas y sub-cuentas', next: 'acc-manage' },
        { label: 'Saldos y conciliación', next: 'acc-bal' },
        { label: 'Transferencias y conversiones entre cuentas', next: 'acc-tr' },
        { label: 'Aviso de saldo insuficiente', next: 'acc-forecast' }
      ]
    },
    {
      id: 'acc-manage',
      title: 'Crear y administrar cuentas',
      text: '¿Qué querés hacer?',
      options: [
        { label: 'Agregar una cuenta', next: 'acc-add' },
        { label: 'Agregar una sub-cuenta', next: 'acc-sub' },
        { label: 'Editar una cuenta', next: 'acc-edit' },
        { label: 'Cambiar la cuenta principal', next: 'acc-primary' },
        { label: 'Archivar una cuenta', next: 'acc-archive' },
        { label: 'Eliminar una cuenta', next: 'acc-delete' }
      ]
    },
    {
      id: 'acc-add',
      title: 'Agregar una cuenta',
      steps: [
        'Andá a "Configuración" > "Cuentas".',
        'Tocá "Agregar cuenta".',
        'Completá el "Nombre de cuenta" (hasta 80 caracteres), la "Moneda" (ARS, EUR o USD) y el "Titular de la cuenta".',
        'Opcional: "Últimos 4 dígitos" (exactamente 4 números) y la casilla "Cuenta principal".',
        'Tocá "Crear cuenta". La cuenta nueva empieza sin saldo calculado hasta que la concilies.'
      ],
      tip: 'Si marcás "Cuenta principal", la anterior deja de serlo. Si no aparece el titular, cargalo antes en "Configuración" > "Titular".'
    },
    {
      id: 'acc-sub',
      title: 'Agregar una sub-cuenta',
      steps: [
        'En "Configuración" > "Cuentas", buscá la cuenta madre (debe ser de primer nivel y estar activa).',
        'Tocá "Agregar sub-cuenta".',
        'Completá nombre, moneda (obligatoria, puede ser distinta de la madre) y titular.',
        'Tocá "Crear sub-cuenta". Se muestra debajo de su cuenta con "↳".'
      ],
      tip: 'Una sub-cuenta no puede tener sub-cuentas ni ser la cuenta principal.'
    },
    {
      id: 'acc-edit',
      title: 'Editar una cuenta',
      steps: [
        'En "Configuración" > "Cuentas" tocá "Editar" en la cuenta.',
        'Podés cambiar nombre, titular, últimos 4 dígitos y, solo si no tiene movimientos ni conciliación, la moneda.',
        'Tocá "Guardar cuenta".'
      ]
    },
    {
      id: 'acc-primary',
      title: 'Cambiar la cuenta principal',
      steps: [
        'En "Configuración" > "Cuentas" tocá "Hacer principal" en la cuenta que querés (solo cuentas de primer nivel).',
        'Otra forma: editá la principal actual, desmarcá "Cuenta principal" y elegí otra en "Nueva cuenta principal".'
      ],
      tip: 'Siempre tiene que haber exactamente una cuenta principal activa. Si no hay otra cuenta elegible, la casilla queda marcada y deshabilitada.'
    },
    {
      id: 'acc-archive',
      title: 'Archivar una cuenta',
      steps: [
        'En "Configuración" > "Cuentas" tocá "Archivar" en la cuenta.',
        'La cuenta queda marcada como "Archivada" y deja de ofrecerse para nuevos movimientos.'
      ],
      tip: 'No se puede archivar la principal. Antes hay que archivar sus sub-cuentas y no debe tener recurrencias ni movimientos programados.'
    },
    {
      id: 'acc-delete',
      title: 'Eliminar una cuenta',
      steps: [
        'En "Configuración" > "Cuentas" tocá "Eliminar" en la cuenta y confirmá.'
      ],
      tip: 'Solo se eliminan cuentas que no son principales, sin movimientos y sin sub-cuentas. Si tiene historia, usá "Archivar".'
    },
    {
      id: 'acc-bal',
      title: 'Saldos y conciliación',
      text: '¿Qué te pasa con el saldo?',
      options: [
        { label: 'Conciliar el saldo de una cuenta', next: 'acc-reconcile' },
        { label: 'Corregir una conciliación', next: 'acc-reconcile-edit' },
        { label: 'El saldo aparece como "—" o "Por conciliar"', next: 'acc-unreconciled' },
        { label: 'Ver los movimientos y el mínimo proyectado', next: 'acc-movements' },
        { label: 'Mensaje "La conciliación de la cuenta quedó pendiente de revisar"', next: 'acc-reset' },
        { label: 'El saldo no coincide con el banco', next: 'acc-mismatch' }
      ]
    },
    {
      id: 'acc-reconcile',
      title: 'Conciliar el saldo',
      steps: [
        'En "Configuración" > "Cuentas" tocá "Conciliar saldo" en la cuenta.',
        'Elegí la "Fecha de referencia" e ingresá el "Saldo al inicio de la fecha" (lo que decía el banco ese día).',
        'En "Movimientos históricos ya incluidos en el saldo" marcá los movimientos que ya estaban contados en ese saldo ("Seleccionar todos" ayuda).',
        'Tocá "Guardar conciliación". Desde entonces el saldo se calcula solo.'
      ]
    },
    {
      id: 'acc-reconcile-edit',
      title: 'Corregir una conciliación',
      steps: [
        'En "Configuración" > "Cuentas" tocá "Editar conciliación" en la cuenta.',
        'Ajustá la fecha, el saldo o los movimientos incluidos.',
        'Tocá "Guardar conciliación".'
      ]
    },
    {
      id: 'acc-unreconciled',
      title: 'Saldo sin conciliar',
      steps: [
        'El saldo de una cuenta solo se muestra cuando está conciliada. Si no, verás "—" en "Inicio" o "Saldo actual: Por conciliar" en "Configuración".',
        'Conciliala con "Conciliar saldo" en "Configuración" > "Cuentas".'
      ],
      tip: 'Si ves "••••••", los importes están ocultos: tocá "Mostrar importes" en "Configuración".'
    },
    {
      id: 'acc-movements',
      title: 'Ver los movimientos de una cuenta',
      steps: [
        'En "Configuración" > "Cuentas" tocá "Ver movimientos".',
        'Vas a ver el saldo, la lista de movimientos de la cuenta y el "Mínimo proyectado" del horizonte de pronóstico.',
        'Desde ahí podés cargar un "Nuevo movimiento en esta cuenta".'
      ]
    },
    {
      id: 'acc-reset',
      title: 'Conciliación pendiente de revisar',
      steps: [
        'Aparece cuando deshacés un cobro o revertís un pago en una cuenta conciliada: la conciliación se reinicia.',
        'Andá a "Configuración" > "Cuentas" y tocá "Conciliar saldo" o "Editar conciliación" para volver a fijar el saldo.'
      ]
    },
    {
      id: 'acc-mismatch',
      title: 'El saldo no coincide con el banco',
      steps: [
        'Revisá en "Ver movimientos" si falta o sobra algún movimiento.',
        'Revisá cheques "Pendiente de confirmación" y ocurrencias "Programada": no afectan el saldo hasta confirmarlos o contabilizarlos.',
        'Revisá transferencias "Programada (solo pronóstico)": no mueven el saldo hasta "Confirmar y contabilizar".',
        'Si todo está bien y la diferencia sigue, corregí con "Editar conciliación".'
      ]
    },
    {
      id: 'acc-tr',
      title: 'Transferencias y conversiones',
      text: '¿Qué necesitás?',
      options: [
        { label: 'Transferir rápido desde "Nueva transacción"', next: 'acc-tr-quick' },
        { label: 'Transferencia con comisión o programada', next: 'acc-tr-full' },
        { label: 'Contabilizar una transferencia programada', next: 'acc-tr-confirm' },
        { label: 'Convertir un ingreso a otra moneda', next: 'acc-tr-convert' },
        { label: 'Editar o eliminar una transferencia', next: 'acc-tr-edit' },
        { label: 'Ver una transferencia desde Inicio', next: 'acc-tr-home' },
        { label: 'Errores al transferir', next: 'acc-tr-errors' }
      ]
    },
    {
      id: 'acc-tr-quick',
      title: 'Transferencia desde "Nueva transacción"',
      steps: [
        'En "Inicio" tocá "+" o "Nueva transacción" y elegí "Transferencia".',
        'Elegí la "Cuenta de salida" y la "Cuenta de ingreso" (distintas).',
        'Completá el "Monto a transferir". Si las monedas son distintas, completá el "Monto recibido".',
        'Revisá la "Fecha" (no puede ser futura), y si querés un título y una "Nota (opcional)".',
        'Tocá "Guardar". Se registra contabilizada, sin comisión, y solo cambia los saldos.'
      ]
    },
    {
      id: 'acc-tr-full',
      title: 'Nuevo movimiento entre cuentas',
      steps: [
        'Andá a "Configuración" > "Cuentas", sección "Transferencias y conversiones".',
        'Tocá "Nuevo movimiento entre cuentas".',
        'Elegí "Cuenta de origen" y "Cuenta de destino", el "Importe enviado" y el "Importe realmente recibido (obligatorio si cambia la moneda)".',
        'Elegí el "Estado": "Contabilizada ahora" o "Programada (solo pronóstico)", y la fecha y descripción.',
        'Si hubo comisión, completá "Comisión explícita (opcional)" y su "Categoría de comisión". La comisión cuenta una sola vez como gasto.',
        'Tocá "Guardar movimiento".'
      ],
      tip: 'La tasa se calcula con lo enviado y lo recibido; la aplicación no consulta cotizaciones.'
    },
    {
      id: 'acc-tr-confirm',
      title: 'Contabilizar una transferencia programada',
      steps: [
        'En "Configuración" > "Cuentas" > "Transferencias y conversiones" buscá la transferencia "Programada".',
        'Tocá "Confirmar y contabilizar". Desde ese momento mueve los saldos.'
      ]
    },
    {
      id: 'acc-tr-convert',
      title: 'Convertir un ingreso a otra moneda',
      steps: [
        'Tocá "Nuevo movimiento entre cuentas" en "Configuración" > "Cuentas".',
        'Elegí origen y destino de monedas distintas y completá el importe enviado y el realmente recibido.',
        'En "Ingresos a normalizar (opcional)" elegí el ingreso que se convierte y su importe ("Agregar otro ingreso" suma más; "Quitar asignación" saca uno).',
        'Tocá "Guardar movimiento".'
      ],
      tip: 'Un ingreso que sostiene una conversión no se puede eliminar hasta que elimines esa conversión.'
    },
    {
      id: 'acc-tr-edit',
      title: 'Editar o eliminar una transferencia',
      steps: [
        'En "Configuración" > "Cuentas" > "Transferencias y conversiones" buscá la transferencia.',
        'Tocá "Editar" para cambiarla o "Eliminar" para borrarla.'
      ],
      tip: 'No se puede editar ni eliminar si tiene conversiones posteriores que dependen de ella: eliminá primero esas.'
    },
    {
      id: 'acc-tr-home',
      title: 'Ver una transferencia desde Inicio',
      steps: [
        'En "Inicio" tocá la transferencia (ícono ↔️).',
        'El detalle muestra importe enviado y recibido, débito total, tasa efectiva, comisión y nota.',
        'Tocá "Administrar transferencias" para ir a "Configuración" > "Cuentas".'
      ]
    },
    {
      id: 'acc-tr-errors',
      title: 'Errores al transferir',
      steps: [
        '"Seleccioná dos cuentas distintas": la cuenta de salida y la de ingreso deben ser diferentes.',
        '"Agregá dos cuentas activas para registrar una transferencia": necesitás al menos dos cuentas activas.',
        '"Indicá el monto recibido": con monedas distintas es obligatorio.',
        '"La fecha no puede ser futura": para algo futuro usá "Programada (solo pronóstico)" en "Nuevo movimiento entre cuentas".'
      ]
    },
    {
      id: 'acc-forecast',
      title: 'Aviso de saldo insuficiente',
      steps: [
        'La aplicación pronostica el saldo de cada cuenta conciliada y avisa si no alcanza para un pago próximo.',
        'Lo ves en "Avisos" > "Saldo insuficiente en cuentas" (botón "Ver cuentas") y en "Configuración" > "Avisos" > "Avisos de saldo".',
        'Para resolverlo, cargá una transferencia hacia esa cuenta o cambiá la cuenta del pago.',
        'El "Horizonte de pronóstico (días)" se cambia en "Configuración" > "Avisos" y se guarda con "Guardar".'
      ],
      tip: 'Solo funciona con cuentas conciliadas. Si una transferencia programada cubre el pago, el aviso lo indica.'
    },

    // ───────────────────────── 3. Bienes ─────────────────────────
    {
      id: 'assets',
      title: 'Bienes',
      text: 'Los bienes están en "Bienes" del menú. ¿Qué necesitás?',
      options: [
        { label: 'Crear un bien', next: 'as-new' },
        { label: 'Ver, editar, ordenar o eliminar bienes', next: 'as-manage' },
        { label: 'La ficha del bien', next: 'as-ficha' },
        { label: 'El historial del bien', next: 'as-hist' },
        { label: 'Gastos recuperables y reintegros', next: 'as-rec' },
        { label: 'Alquilar un inmueble', next: 'rent' }
      ]
    },
    {
      id: 'as-new',
      title: 'Crear un bien',
      text: '¿Qué caso tenés?',
      options: [
        { label: 'Crear un inmueble', next: 'as-new-imm' },
        { label: 'Crear un mueble (automóvil)', next: 'as-new-mov' },
        { label: 'Bien con varios titulares', next: 'as-new-owners' },
        { label: 'Agregar un tipo de inmueble nuevo', next: 'as-new-kind' },
        { label: 'Errores al guardar el bien', next: 'as-new-errors' }
      ]
    },
    {
      id: 'as-new-imm',
      title: 'Crear un inmueble',
      steps: [
        'Andá a "Bienes" y tocá "+ Nuevo bien".',
        'En "Clasificación" elegí "Inmueble" (no se puede cambiar después).',
        'Elegí el titular con "Seleccionar titular".',
        'Completá el "Título" (nombre visible, obligatorio) y el "Tipo": Departamento, Casa, Galpón, Local, Lote o uno propio.',
        'Opcional: "Características", "Ubicación", "Superficie cubierta (m²)", "Superficie libre (m²)", "Identificación catastral", "Fecha de construcción" y "Notas".',
        'Tocá "Crear bien".'
      ],
      tip: 'El alquiler no se pide al crear el bien: se declara después con "Declarar alquiler". Las obligaciones se asignan una vez guardado el bien.'
    },
    {
      id: 'as-new-mov',
      title: 'Crear un mueble',
      steps: [
        'Andá a "Bienes" y tocá "+ Nuevo bien".',
        'En "Clasificación" elegí "Mueble".',
        'Elegí el titular, completá el "Título" y el tipo (Automóvil).',
        'Opcional: "Marca", "Dominio", "KMs", "Color" y "Notas".',
        'Tocá "Crear bien".'
      ]
    },
    {
      id: 'as-new-owners',
      title: 'Bien con varios titulares',
      steps: [
        'En el formulario del bien elegí el primer titular.',
        'Tocá "Agregar titular" para sumar otro.',
        'Con dos o más titulares, completá el "Porcentaje (%)" de cada uno: deben sumar 100% (abajo ves el total).',
        'Con "Quitar" sacás un titular de la lista.'
      ],
      tip: 'Cada porcentaje debe ser mayor que 0. Si un titular no aparece, cargalo antes en "Configuración" > "Titular".'
    },
    {
      id: 'as-new-kind',
      title: 'Agregar un tipo de inmueble',
      steps: [
        'En el formulario de un inmueble, abrí la lista "Tipo".',
        'Elegí "Agregar tipo…" y escribí el nombre (hasta 50 caracteres).',
        'Queda creado y seleccionado.'
      ],
      tip: 'No se puede repetir un tipo existente (aunque cambien mayúsculas o acentos). Los tipos propios no se renombran ni se eliminan.'
    },
    {
      id: 'as-new-errors',
      title: 'Errores al guardar un bien',
      steps: [
        '"Debe indicar al menos un titular": elegí un titular.',
        '"El total de los porcentajes debe ser 100": corregí los porcentajes.',
        '"Cada titular debe tener un porcentaje mayor que 0".',
        '"El título es obligatorio" o "El tipo de inmueble es obligatorio": completá esos campos.',
        'Un mismo titular no puede tener dos períodos de titularidad superpuestos ni superar el 100% entre titulares simultáneos.'
      ]
    },
    {
      id: 'as-manage',
      title: 'Ver, editar, ordenar o eliminar',
      text: '¿Qué querés hacer?',
      options: [
        { label: 'Ver un bien sin modificarlo', next: 'as-view' },
        { label: 'Editar un bien', next: 'as-edit' },
        { label: 'Eliminar un bien', next: 'as-delete' },
        { label: 'Me dice que no se puede eliminar', next: 'as-delete-blocked' },
        { label: 'Cambiar el orden de las tarjetas', next: 'as-order' },
        { label: 'Filtrar la lista de bienes', next: 'as-filter' }
      ]
    },
    {
      id: 'as-view',
      title: 'Ver un bien',
      steps: [
        'En "Bienes" tocá "Ver" en la tarjeta del bien: se abre en modo solo lectura.',
        'En un inmueble alquilado podés tocar "Ver declaración de alquiler".'
      ]
    },
    {
      id: 'as-edit',
      title: 'Editar un bien',
      steps: [
        'En "Bienes" tocá "Editar" en la tarjeta (o "Editar" dentro de la "Ficha").',
        'Cambiá los datos.',
        'Tocá "Guardar cambios". Aparece un aviso de confirmación: tocá "Confirmar y guardar" o "Volver".'
      ],
      tip: 'La "Clasificación" (Mueble/Inmueble) no se puede cambiar.'
    },
    {
      id: 'as-delete',
      title: 'Eliminar un bien',
      steps: [
        'Abrí la "Ficha" del bien (o "Editar").',
        'Tocá "Eliminar".',
        'Leé la confirmación y tocá "Eliminar bien".',
        'Se borran también sus titularidades y su historial de estados. Queda en "Logs" y no se puede deshacer.'
      ]
    },
    {
      id: 'as-delete-blocked',
      title: 'No se puede eliminar el bien',
      steps: [
        'Solo se elimina un bien sin referencias. El mensaje dice qué tiene asociado ("No se puede eliminar el bien porque tiene ... asociados").',
        'Puede tener movimientos, obligaciones, alquileres, documentos, notas, gastos a recuperar o planes de cuotas.',
        'Quitá o eliminá esas referencias primero (por ejemplo, eliminá sus obligaciones o el alquiler finalizado) y volvé a intentar.'
      ]
    },
    {
      id: 'as-order',
      title: 'Ordenar las tarjetas de bienes',
      steps: [
        'En "Bienes", arrastrá la tarjeta desde su agarre "⋮⋮" (con el mouse o el dedo) hasta su nuevo lugar.',
        'Con el teclado: enfocá el agarre y usá las flechas ↑ / ↓.',
        'El orden se guarda y se ve igual en todos tus dispositivos.'
      ],
      tip: 'Con filtros activos solo cambia el orden entre los bienes visibles. Si ves "No se pudo guardar el orden", revisá la conexión y probá de nuevo.'
    },
    {
      id: 'as-filter',
      title: 'Filtrar bienes',
      steps: [
        'En "Bienes" usá los filtros: "Tipo de bien" (Todos / Mueble / Inmueble), "Tipo de inmueble" (aparece al elegir Inmueble), "Titular legal" y "Estado" (Todos / Alquilado / No alquilado).',
        'Tocá "Filtrar". Con "Limpiar" volvés a ver todos.'
      ],
      tip: 'Si ves "No hay bienes que coincidan con la búsqueda", tocá "Limpiar".'
    },
    {
      id: 'as-ficha',
      title: 'La ficha del bien',
      text: '¿Qué parte de la ficha te interesa?',
      options: [
        { label: 'Abrir la ficha y qué contiene', next: 'as-ficha-open' },
        { label: 'Obligaciones del bien y quién las paga', next: 'as-ficha-obl' },
        { label: 'Documentos y notas del bien', next: 'as-ficha-docs' },
        { label: 'Economía y análisis económico', next: 'as-ficha-eco' },
        { label: 'Ficha mensual', next: 'as-ficha-monthly' },
        { label: 'Historial de titularidad y de estados', next: 'as-ficha-owners' }
      ]
    },
    {
      id: 'as-ficha-open',
      title: 'Abrir la ficha',
      steps: [
        'En "Bienes" tocá "Ficha" en la tarjeta del bien.',
        'Arriba tenés "Editar", "Ver historial", "Ver ficha mensual" y "Eliminar".',
        'Debajo: "Datos del bien", "Obligaciones del bien", la tarjeta del alquiler (inmuebles), "Documentos y notas del bien", "Economía del bien", "Historial de titularidad" e "Historial de estados".'
      ],
      tip: 'Si aparece "No se pudo cargar la ficha", cerrá la ventana y volvé a abrirla; sin conexión no se cargan datos.'
    },
    {
      id: 'as-ficha-obl',
      title: 'Obligaciones del bien',
      steps: [
        'En la "Ficha" mirá "Obligaciones del bien": cada una con su responsable y próximo vencimiento.',
        'Desde ahí podés tocar "Registrar pago" o "Resolver", y "Ver obligación" o "Editar obligación".',
        'Para crear una nueva tocá "Agregar obligación": te lleva a Obligaciones con el bien ya elegido.',
        'En el formulario de edición del bien, cada obligación tiene "A cargo de": Titular o Inquilino (Inquilino solo con alquiler vigente).'
      ]
    },
    {
      id: 'as-ficha-docs',
      title: 'Documentos y notas del bien',
      steps: [
        'En la "Ficha" buscá "Documentos y notas del bien".',
        'Para subir un archivo usá "Cargar documento" (PDF, PNG, JPEG, WebP o texto; máximo 20 MiB).',
        'Cada documento tiene "Ver", "Descargar" y "Eliminar" (con confirmación). Podés filtrar por nombre, tipo y fecha.',
        'Para una nota, escribila y tocá "Guardar nota" (o "Añadir nota" si la lista está vacía). Cada nota se puede "Editar" o "Eliminar".'
      ]
    },
    {
      id: 'as-ficha-eco',
      title: 'Economía del bien',
      steps: [
        'En la "Ficha" buscá "Economía del bien": titulares vigentes, inquilino actual, alquiler cobrado este mes, costo de mantenimiento de los últimos 12 meses y pendientes.',
        'En "Análisis económico del bien" elegí mes, año o "Rango personalizado" y tocá "Actualizar período".',
        'Solo cuenta movimientos reales; lo pendiente se muestra aparte ("Pendiente, fuera de resultados reales").'
      ],
      tip: 'Si un gasto no aparece en el análisis, atribuilo al bien desde "Atribución del movimiento" del formulario de transacción.'
    },
    {
      id: 'as-ficha-monthly',
      title: 'Ficha mensual',
      steps: [
        'En la "Ficha" tocá "Ver ficha mensual": se abre una ventana aparte.',
        'Elegí un año o un rango de meses (hasta 36).',
        'Filtrá por tipo (alquiler u obligación), responsable, estado, modalidad y texto o proveedor.',
        'La tabla muestra Período, Concepto, Responsable, Esperado, Ejecutado, Estado, Comprobante y Acción, con totales por moneda.'
      ],
      tip: '"El rango máximo es de 36 meses": achicá el rango. Sin resultados verás "No hay movimientos en este período.".'
    },
    {
      id: 'as-ficha-owners',
      title: 'Historial de titularidad y de estados',
      steps: [
        'Al final de la "Ficha" están "Historial de titularidad" (titular, porcentaje y período) e "Historial de estados".',
        'La titularidad se registra con fechas: cambiá los titulares desde "Editar" del bien.'
      ]
    },
    {
      id: 'as-hist',
      title: 'El historial del bien',
      text: '¿Qué querés hacer en el historial?',
      options: [
        { label: 'Consultar un mes o un año', next: 'as-hist-browse' },
        { label: 'Ver el detalle de un registro', next: 'as-hist-detail' },
        { label: 'Deshacer un pago, una resolución o un cobro', next: 'as-hist-undo' },
        { label: 'Ver un comprobante (zoom, descargar)', next: 'as-hist-viewer' },
        { label: 'Agregar una nota a un registro', next: 'as-hist-note' }
      ]
    },
    {
      id: 'as-hist-browse',
      title: 'Consultar el historial',
      steps: [
        'En "Bienes" tocá "Ver historial" en el bien.',
        'Elegí el "Año" y el "Mes" (o "Todo el año"). "Hoy" vuelve al mes actual.',
        'Cada fila muestra fecha, concepto, tipo, responsable, proveedor o inquilino, esperado, ejecutado, saldo, estado y acción.'
      ],
      tip: 'Si ves "No hay movimientos en este período.", probá con otro mes o tocá "Hoy".'
    },
    {
      id: 'as-hist-detail',
      title: 'Detalle de un registro',
      steps: [
        'En el historial tocá "Ver detalle" en la fila.',
        'Vas a ver tipo, fecha, concepto, importes, estado, pagos o cobros, pagos revertidos, comprobantes y notas.',
        'Según el estado podés "Registrar pago", "Resolver", "Registrar cobro", "Adjuntar comprobante" o "Agregar nota".'
      ]
    },
    {
      id: 'as-hist-undo',
      title: 'Deshacer desde el historial',
      steps: [
        'En el historial abrí el registro con "Ver detalle".',
        'Tocá "Deshacer": sirve para revertir un pago, anular una resolución o deshacer un cobro.',
        'Escribí el "Motivo" (obligatorio, hasta 500 caracteres) y confirmá. El motivo queda visible en el detalle.'
      ]
    },
    {
      id: 'as-hist-viewer',
      title: 'Ver un comprobante',
      steps: [
        'Tocá el comprobante en el detalle del registro (o "Ver documento").',
        'En imágenes usá "− Alejar", "+ Acercar" y "Restablecer". Los PDF y textos se ven en un marco.',
        'Con "Descargar" lo guardás en tu dispositivo.'
      ],
      tip: 'Si dice "Este tipo de archivo no se puede mostrar. Descargalo para verlo.", usá "Descargar".'
    },
    {
      id: 'as-hist-note',
      title: 'Agregar una nota a un registro',
      steps: [
        'En el historial abrí "Ver detalle".',
        'Tocá "Agregar nota", escribila y tocá "Guardar nota".'
      ]
    },
    {
      id: 'as-rec',
      title: 'Gastos recuperables y reintegros',
      text: '¿Qué necesitás?',
      options: [
        { label: 'Registrar un gasto que me tienen que devolver', next: 'as-rec-claim' },
        { label: 'Registrar que me devolvieron el dinero', next: 'as-rec-collect' }
      ]
    },
    {
      id: 'as-rec-claim',
      title: 'Registrar un gasto recuperable',
      steps: [
        'Abrí la "Ficha" del bien y buscá "Gastos recuperables e importes pendientes".',
        'Tocá "Registrar gasto recuperable".',
        'Elegí el "Gasto de origen" (el gasto ya cargado), opcionalmente el "Contrato de alquiler (opcional)" y el "Inquilino responsable (opcional)".',
        'Revisá el "Importe recuperable" y tocá "Guardar reclamo".'
      ],
      tip: 'Primero tiene que existir el gasto en "Inicio". Un gasto con reintegro ya no se puede eliminar ni cambiar de importe.'
    },
    {
      id: 'as-rec-collect',
      title: 'Registrar un reintegro',
      steps: [
        'En la "Ficha" > "Gastos recuperables e importes pendientes", buscá el reclamo con saldo pendiente.',
        'Tocá "Registrar reintegro".',
        'Elegí la cuenta (de la misma moneda), el importe recibido y la fecha.',
        'Tocá "Guardar ingreso": se registra como ingreso real.'
      ],
      tip: '"No hay una cuenta activa en la moneda del reclamo": creá o activá una cuenta en esa moneda.'
    },

    // ───────────────────────── 4. Alquileres ─────────────────────────
    {
      id: 'rent',
      title: 'Alquileres, inquilinos y cobros',
      text: 'Los alquileres se manejan desde "Bienes" (inmuebles). ¿Qué necesitás?',
      options: [
        { label: 'Declarar un alquiler', next: 'rent-dec' },
        { label: 'Cobrar el alquiler', next: 'rent-col' },
        { label: 'Impagos, atrasos y saldos pendientes', next: 'rent-unpaid' },
        { label: 'Corregir un cobro mal registrado', next: 'rent-fix' },
        { label: 'La ventana "Ver alquiler"', next: 'rent-win' },
        { label: 'Actualizar, finalizar o eliminar un alquiler', next: 'rent-chg' }
      ]
    },
    {
      id: 'rent-dec',
      title: 'Declarar un alquiler',
      text: '¿Qué caso tenés?',
      options: [
        { label: 'Declarar un alquiler paso a paso', next: 'rent-dec-steps' },
        { label: 'Qué modalidad elegir (locación, comodato, mutuo)', next: 'rent-dec-mod' },
        { label: 'No aparece el inquilino en la lista', next: 'rent-dec-tenant' },
        { label: 'El inquilino también es titular', next: 'rent-dec-owner' },
        { label: 'Error de fechas superpuestas', next: 'rent-dec-overlap' },
        { label: 'Obligaciones a cargo del inquilino', next: 'rent-dec-obl' }
      ]
    },
    {
      id: 'rent-dec-steps',
      title: 'Declarar un alquiler',
      steps: [
        'En "Bienes" tocá "Declarar alquiler" en el inmueble (o en su "Ficha").',
        'Elegí uno o varios "Inquilino".',
        'Marcá las modalidades: "Contrato de locación", "Comodato" y/o "Mutuo". Para cada una completá "Fecha de inicio", "Fecha de finalización", "Monto original", "Moneda", "Frecuencia de ajuste (meses)" y "Criterio de ajuste" (en locación también "IVA (%)").',
        'En "Obligaciones del bien" indicá si cada obligación está a cargo del Titular o del Inquilino.',
        'Escribí "Notas" si querés y tocá "Guardar".',
        'Se generan los meses a cobrar: vencen el mismo día del mes que la fecha de inicio.'
      ],
      tip: 'Se necesita al menos una modalidad, al menos un inquilino, y un monto original y una fecha de inicio por modalidad. Al desmarcar una modalidad con datos te pregunta "Descartar datos" o "Mantener".'
    },
    {
      id: 'rent-dec-mod',
      title: 'Modalidades del alquiler',
      steps: [
        '"Contrato de locación": admite IVA (se suma al monto) y por defecto se cobra como A (declarado).',
        '"Comodato" y "Mutuo": sin IVA, por defecto se cobran como B (sin facturar).',
        'Un alquiler puede tener una, dos o las tres modalidades. El mes se considera cobrado cuando se cobran todas.'
      ],
      tip: 'La clasificación A/B se puede cambiar línea por línea al cobrar.'
    },
    {
      id: 'rent-dec-tenant',
      title: 'No aparece el inquilino',
      steps: [
        'Los inquilinos se cargan en "Configuración" > "Inquilino" > "Agregar inquilino".',
        'Si la persona ya existe como titular, en "¿Nuevo o existente?" elegí "Elegir un titular existente".',
        'Volvé a "Declarar alquiler": ya va a aparecer.'
      ],
      tip: 'Los titulares vigentes del mismo inmueble no aparecen en la lista: un titular no puede alquilar su propio bien. Si el mensaje dice "en Personas", hoy se cargan en "Configuración" > "Inquilino".'
    },
    {
      id: 'rent-dec-owner',
      title: 'El inquilino también es titular',
      steps: [
        'Un titular puede ser inquilino de un bien de otro titular, pero no de un bien propio ("... es titular de este inmueble: un titular no puede alquilar su propio bien").',
        'Para usarlo como inquilino, en "Configuración" > "Inquilino" > "Agregar inquilino" elegí "Elegir un titular existente".',
        'Al cobrar, cada cobro crea además su "Gasto espejo del cobro de alquiler" en una cuenta de ese titular ("Cuenta del inquilino (titular)").'
      ],
      tip: 'Si el titular-inquilino no tiene una cuenta activa en la moneda del alquiler, el cobro no se registra: creale la cuenta primero en "Configuración" > "Cuentas".'
    },
    {
      id: 'rent-dec-overlap',
      title: 'Fechas superpuestas',
      steps: [
        'Un inmueble no puede tener dos alquileres con fechas superpuestas.',
        'Si el error aparece, tocá "Declarar la finalización del alquiler vigente" e indicá la fecha de fin del anterior.',
        'Después declarás el alquiler nuevo con fechas que no se pisen.'
      ]
    },
    {
      id: 'rent-dec-obl',
      title: 'Obligaciones a cargo del inquilino',
      steps: [
        'En la declaración, en "Obligaciones del bien", elegí "Inquilino" en cada obligación que paga el inquilino.',
        'Con "Nueva obligación" creás una sin perder lo cargado en la declaración.',
        'Esas obligaciones no se pagan desde tus cuentas: se registran con "Resolver" cuando el inquilino presenta el comprobante.'
      ],
      tip: 'Si cerrás la declaración sin guardar después de crear obligaciones, quedan a cargo del propietario. Cuando el alquiler termina, vuelven al titular.'
    },
    {
      id: 'rent-col',
      title: 'Cobrar el alquiler',
      text: '¿Cómo es el cobro?',
      options: [
        { label: 'Registrar el cobro de un mes', next: 'rent-col-month' },
        { label: 'El inquilino pagó menos (pago parcial)', next: 'rent-col-partial' },
        { label: 'Pagó con cheque', next: 'rent-col-cheque' },
        { label: 'Un pago que cubre varios meses', next: 'rent-col-multi' },
        { label: 'Clasificación A/B e IVA del cobro', next: 'rent-col-ab' },
        { label: 'No aparece la cuenta de destino', next: 'rent-col-account' },
        { label: 'El inquilino es titular (gasto espejo)', next: 'tx-edit-mirror' }
      ]
    },
    {
      id: 'rent-col-month',
      title: 'Registrar el cobro de un mes',
      steps: [
        'Entrá por "Avisos" > "Alquileres pendientes de cobro" > "Registrar cobro", o por "Ver alquiler" > pestaña "Períodos" > "Registrar cobro" en el mes.',
        'Por cada modalidad pendiente revisá el "Importe" (precargado con el saldo), la "Clasificación", la "Fecha de cobro", el "Medio de cobro" y la "Cuenta de destino" (de la misma moneda).',
        'Opcional: adjuntá el "Comprobante de pago (opcional)".',
        'Tocá "Registrar cobro". Cada línea entra como ingreso real en su cuenta.'
      ],
      tip: 'Se cobra solo el mes elegido. "No se puede registrar un cobro porque el período ya está cobrado": ese mes ya está saldado.'
    },
    {
      id: 'rent-col-partial',
      title: 'Pago parcial de un alquiler',
      steps: [
        'En "Registrar cobro" escribí el importe realmente recibido (menor al pendiente).',
        'Al tocar "Registrar cobro" te pregunta si es un pago parcial: tocá "Sí, es un pago parcial" ("No" vuelve al formulario).',
        'El período queda "Parcialmente cancelado" y muestra el saldo pendiente.',
        'Cuando pague el resto, registrá otro cobro en el mismo mes: se suma hasta cancelar el saldo.'
      ]
    },
    {
      id: 'rent-col-cheque',
      title: 'Cobro con cheque',
      steps: [
        'En "Registrar cobro" elegí "Cheque" en "Medio de cobro".',
        'Completá "Días" (de 1 a 365): la fecha de cobro del cheque es la fecha de cobro más esos días, y el ingreso se registra en esa fecha.',
        'Tocá "Registrar cobro".',
        'Cuando falten 7 días o menos, aparece "Avisos" > "Cheques por cobrar". Cuando se acredite, tocá "Marcar como cobrado".'
      ],
      tip: 'Si lo marcaste como cobrado por error, deshacelo desde "Perfil" > "Logs" con "Deshacer" (pide motivo).'
    },
    {
      id: 'rent-col-multi',
      title: 'Un pago para varios meses',
      steps: [
        'Abrí "Ver alquiler" y quedate en la pestaña "Resumen".',
        'En la tarjeta de la modalidad tocá "Registrar cobro".',
        'Marcá uno o varios períodos y el importe de cada uno, y completá el "Importe total recibido".',
        'Elegí la cuenta, la "Fecha de cobro" y la clasificación y tocá "Registrar cobro". Lo no asignado queda visible como "Saldo sin aplicar".'
      ],
      tip: '"Selecciona al menos un período para asignar": marcá la casilla de algún período.'
    },
    {
      id: 'rent-col-ab',
      title: 'Clasificación A/B e IVA del cobro',
      steps: [
        'En "Registrar cobro", cada línea tiene "Clasificación": "A (declarado)" o "B (sin facturar)".',
        'Locación viene en A (con el IVA del contrato); comodato y mutuo en B. Podés cambiarlo línea por línea.',
        'El IVA de una línea A es débito fiscal del titular de la cuenta que cobra.'
      ]
    },
    {
      id: 'rent-col-account',
      title: 'No aparece la cuenta de destino',
      steps: [
        'Solo se ofrecen cuentas activas con la misma moneda del contrato.',
        'Si no tenés una, creala en "Configuración" > "Cuentas" > "Agregar cuenta" con esa moneda.',
        'Si el inquilino es titular, también necesita su propia cuenta en esa moneda para el gasto espejo.'
      ]
    },
    {
      id: 'rent-unpaid',
      title: 'Impagos, atrasos y saldos',
      text: '¿Qué necesitás?',
      options: [
        { label: 'Ver qué alquileres están sin cobrar', next: 'rent-unpaid-list' },
        { label: 'Ver cuánto debe de un pago parcial', next: 'rent-unpaid-balance' },
        { label: 'Un mes que no se va a cobrar', next: 'rent-unpaid-cancel' },
        { label: 'El inquilino no presentó el comprobante de un servicio', next: 'obl-ten-resolve' }
      ]
    },
    {
      id: 'rent-unpaid-list',
      title: 'Alquileres sin cobrar',
      steps: [
        'En "Avisos" mirá el grupo "A cargo de inquilinos" > "Alquileres pendientes de cobro". Los vencidos se ven en rojo ("Vencido · fecha").',
        'En "Bienes", la sección "Avisos de alquiler" muestra accesos rápidos.',
        'En "Ver alquiler" > "Períodos" filtrá por estado para ver los meses vencidos o pendientes.'
      ],
      tip: 'Los días de anticipación del aviso (por defecto 5) se cambian en "Configuración" > "Avisos".'
    },
    {
      id: 'rent-unpaid-balance',
      title: 'Saldo pendiente de un pago parcial',
      steps: [
        'Abrí "Ver alquiler" > "Períodos": el mes figura "Parcialmente cancelado" con su saldo pendiente.',
        'Tocá "Ver detalle" para ver los cobros registrados.',
        'También se ve en el historial del bien ("Ver historial").'
      ]
    },
    {
      id: 'rent-unpaid-cancel',
      title: 'Cancelar un período',
      steps: [
        'Abrí "Ver alquiler" > "Períodos".',
        'En el mes tocá "Cancelar período" y confirmá.',
        'El período deja de figurar como pendiente.'
      ],
      tip: 'Solo se cancela un período sin cobros ("No se puede cancelar este período porque tiene cobros registrados."). Si el alquiler terminó antes, usá "Finalizar alquiler": cancela solos los meses posteriores.'
    },
    {
      id: 'rent-fix',
      title: 'Corregir un cobro',
      text: '¿Qué pasó?',
      options: [
        { label: 'Registré mal un cobro (cuenta, importe o clasificación)', next: 'rent-fix-undo' },
        { label: 'Marqué un cheque como cobrado por error', next: 'rent-fix-cheque' },
        { label: 'Dice que el período ya está cobrado', next: 'rent-fix-paid' }
      ]
    },
    {
      id: 'rent-fix-undo',
      title: 'Deshacer un cobro',
      steps: [
        'Tocá "Deshacer cobro" en el mes (Ver alquiler > "Períodos") o en la transacción de "Inicio".',
        'Escribí el "Motivo" (obligatorio, hasta 500 caracteres) y confirmá.',
        'Se eliminan juntos todos los ingresos de ese mes, sus asignaciones y comprobantes (y el gasto espejo, si había).',
        'El mes vuelve a quedar pendiente: registralo de nuevo con "Registrar cobro".'
      ],
      tip: 'Un cobro no se edita: siempre se deshace y se vuelve a registrar. Si la cuenta estaba conciliada, revisá la conciliación.'
    },
    {
      id: 'rent-fix-cheque',
      title: 'Deshacer el cobro de un cheque',
      steps: [
        'Andá a "Perfil" > "Logs".',
        'Buscá la acción del cheque marcado como cobrado y tocá "Deshacer".',
        'Escribí el motivo y confirmá. El cheque vuelve a quedar pendiente de cobro.'
      ]
    },
    {
      id: 'rent-fix-paid',
      title: 'El período ya está cobrado',
      steps: [
        'Ese mes ya tiene todas sus modalidades cobradas.',
        'Si el cobro anterior estaba mal, primero usá "Deshacer cobro" y después registralo de nuevo.',
        'Si el inquilino pagó de más o adelantó, usá el "Registrar cobro" de la tarjeta de la modalidad en "Resumen" para repartirlo entre varios meses.'
      ]
    },
    {
      id: 'rent-win',
      title: 'La ventana "Ver alquiler"',
      text: '¿Qué parte querés usar?',
      options: [
        { label: 'Abrirla y qué muestra', next: 'rent-win-open' },
        { label: 'Pestaña "Períodos" y sus filtros', next: 'rent-win-periods' },
        { label: 'Pestaña "Contratos"', next: 'rent-win-contracts' },
        { label: 'Documentos del alquiler', next: 'rent-win-docs' },
        { label: 'Notas del alquiler', next: 'rent-win-notes' }
      ]
    },
    {
      id: 'rent-win-open',
      title: 'Abrir "Ver alquiler"',
      steps: [
        'En "Bienes" tocá "Ver alquiler" en el inmueble (o en la tarjeta de alquiler de su "Ficha").',
        'El encabezado muestra estado (Activo, Por vencer, Por comenzar o Finalizado), inquilinos, vigencia, monto vigente y próximo cobro, con "Editar alquiler", "Actualizar alquiler" y "Finalizar alquiler".',
        'Pestañas: "Resumen", "Períodos", "Contratos", "Documentos" y "Notas".'
      ],
      tip: 'Si no ves "Ver alquiler", el inmueble no tiene alquiler vigente: aparece "Declarar alquiler".'
    },
    {
      id: 'rent-win-periods',
      title: 'Pestaña "Períodos"',
      steps: [
        'Cada fila es un mes con su vencimiento, una columna por modalidad, las obligaciones del mes, el total y el estado.',
        'Acciones: "Registrar cobro", "Deshacer cobro", "Cancelar período" y "Ver detalle".',
        'Las obligaciones del mes ofrecen "Registrar pago", "Resolver", "Anular resolución" y "Revertir pago".',
        'Usá los filtros (año, mes, estado, tipo, responsable, modalidad, proveedor y texto). "Limpiar filtros" los quita.'
      ]
    },
    {
      id: 'rent-win-contracts',
      title: 'Pestaña "Contratos"',
      steps: [
        'Una tarjeta por modalidad con vigencia, importes, clasificación y ajuste.',
        'Si tiene un documento adjunto: "Ver documento" o "Descargar documento".',
        'Desde acá también podés "Finalizar contrato" (solo esa modalidad).'
      ]
    },
    {
      id: 'rent-win-docs',
      title: 'Documentos del alquiler',
      steps: [
        'En "Ver alquiler" abrí la pestaña "Documentos".',
        'Elegí si el archivo es para "Todo el alquiler" o para una modalidad y usá "Cargar documento".',
        'Cada documento tiene "Ver", "Descargar" y "Eliminar" (con confirmación).'
      ],
      tip: 'Formatos: PDF, PNG, JPEG, WebP o texto, hasta 20 MiB.'
    },
    {
      id: 'rent-win-notes',
      title: 'Notas del alquiler',
      steps: [
        'En "Ver alquiler" abrí la pestaña "Notas".',
        'Escribí la fecha, un título opcional (hasta 120 caracteres) y el texto, y tocá "Guardar nota".',
        'Cada nota se puede "Editar" o "Eliminar". Podés filtrar por fechas y ordenar.'
      ],
      tip: 'Si ves "No hay notas en este rango de fechas.", tocá "Quitar filtro".'
    },
    {
      id: 'rent-chg',
      title: 'Actualizar, finalizar o eliminar',
      text: '¿Qué querés hacer?',
      options: [
        { label: 'Actualizar el monto (ajuste)', next: 'rent-chg-update' },
        { label: 'Editar la declaración del alquiler', next: 'rent-chg-edit' },
        { label: 'Finalizar el alquiler completo', next: 'rent-chg-end' },
        { label: 'Finalizar solo una modalidad', next: 'rent-chg-endcontract' },
        { label: 'Ver alquileres anteriores', next: 'rent-chg-history' },
        { label: 'Eliminar un alquiler', next: 'rent-chg-delete' },
        { label: 'Declarar un alquiler nuevo después de otro', next: 'rent-dec-overlap' }
      ]
    },
    {
      id: 'rent-chg-update',
      title: 'Actualizar alquiler',
      steps: [
        'En "Ver alquiler" tocá "Actualizar alquiler".',
        'Elegí la modalidad, el "Tipo de actualización" (importe manual, porcentaje o índice) y la "Fecha efectiva (vencimiento)".',
        'Podés elegir un vencimiento próximo o, de forma retroactiva, uno de los últimos 3 vencimientos pasados.',
        'Revisá la vista previa ("Desde mes, el alquiler pasa de X a Y...") y tocá "Guardar ajuste".'
      ],
      tip: 'Los períodos ya cobrados no cambian ("Un período ya cobrado se mantiene"); los pasados sin cobrar toman el nuevo importe.'
    },
    {
      id: 'rent-chg-edit',
      title: 'Editar el alquiler',
      steps: [
        'En "Ver alquiler" tocá "Editar alquiler" (o "Editar alquiler" en el bien).',
        'Cambiá los datos y tocá "Guardar cambios"; confirmá con "Confirmar y guardar".',
        'Los períodos sin cobrar se regeneran con los nuevos datos; los cobrados no se tocan.'
      ],
      tip: 'Un alquiler finalizado solo se edita si no tiene cobros, documentos, notas ni obligaciones vinculadas.'
    },
    {
      id: 'rent-chg-end',
      title: 'Finalizar el alquiler',
      steps: [
        'En "Ver alquiler" (o en la tarjeta de la "Ficha") tocá "Finalizar alquiler".',
        'Indicá la "Fecha de finalización" (por defecto, hoy; puede ser anticipada).',
        'Revisá qué se cancela y tocá "Confirmar y finalizar alquiler".',
        'Se finalizan todas las modalidades, se cancelan los meses sin cobrar posteriores y se conservan los cobros.'
      ],
      tip: 'Las obligaciones a cargo del inquilino vuelven al titular. Las fechas posteriores quedan libres para un alquiler nuevo.'
    },
    {
      id: 'rent-chg-endcontract',
      title: 'Finalizar contrato (una modalidad)',
      steps: [
        'En "Ver alquiler" abrí la pestaña "Contratos".',
        'En la tarjeta de la modalidad tocá "Finalizar contrato".',
        'Indicá la fecha, revisá los períodos que se cancelan y tocá "Confirmar y finalizar contrato".'
      ],
      tip: '"No se puede finalizar este contrato porque ya está finalizado.": esa modalidad ya terminó.'
    },
    {
      id: 'rent-chg-history',
      title: 'Histórico de alquileres',
      steps: [
        'En la "Ficha" del inmueble, en la tarjeta del alquiler, tocá "Histórico de alquileres".',
        'Verás todos los alquileres con su vigencia, inquilinos, modalidades y estado.',
        '"Ver" abre uno en solo lectura; también podés "Editar" o "Eliminar alquiler" si corresponde.'
      ]
    },
    {
      id: 'rent-chg-delete',
      title: 'Eliminar un alquiler',
      steps: [
        'Primero el alquiler debe estar finalizado ("Finalizá el alquiler antes de eliminarlo").',
        'Si tiene cobros, deshacelos primero ("Para eliminarlo, primero deshacé sus cobros.").',
        'En "Histórico de alquileres" tocá "Eliminar alquiler", revisá el impacto y confirmá con "Eliminar alquiler".'
      ],
      tip: 'Se borran sus períodos, contratos, notas y documentos exclusivos. Queda un registro en "Logs".'
    },

    // ───────────────────────── 5. Obligaciones ─────────────────────────
    {
      id: 'obl',
      title: 'Obligaciones, vencimientos y pagos',
      text: 'Las obligaciones (impuestos, servicios, seguros...) están en "Obligaciones" del menú. ¿Qué necesitás?',
      options: [
        { label: 'Crear, editar o eliminar una obligación', next: 'obl-crud' },
        { label: 'Pagar un vencimiento', next: 'obl-pay' },
        { label: 'Obligaciones que paga el inquilino', next: 'obl-ten' },
        { label: 'Corregir un pago o un vencimiento', next: 'obl-fix' },
        { label: 'Estados, vencidos y filtros', next: 'obl-status' },
        { label: 'Notas, documentos y comprobantes', next: 'obl-docs' }
      ]
    },
    {
      id: 'obl-crud',
      title: 'Crear, editar o eliminar',
      text: '¿Qué querés hacer?',
      options: [
        { label: 'Crear una obligación', next: 'obl-create' },
        { label: 'Crear una obligación para un bien', next: 'obl-create-asset' },
        { label: 'Elegir quién la paga (titular o inquilino)', next: 'obl-resp' },
        { label: 'Editar una obligación', next: 'obl-edit' },
        { label: 'Eliminar una obligación', next: 'obl-delete' }
      ]
    },
    {
      id: 'obl-create',
      title: 'Crear una obligación',
      steps: [
        'Andá a "Obligaciones" y tocá "+ Nueva obligación".',
        'Completá "Nombre" (obligatorio) y "Tipo" (Servicios, Seguro, Impuesto, Préstamo, Mantenimiento, Suscripción u Otro).',
        'Opcional: "Bien" y "Proveedor" (al elegirlo se precarga la "Categoría"), "Cuenta o contrato" y "Número de cuenta o contrato".',
        'Elegí la "Frecuencia" (viene en Mensual), el "Primer vencimiento" (obligatorio) y, si querés, el "Último vencimiento (opcional)".',
        'Completá "Moneda" e "Importe estimado", la "Categoría", el "Responsable" y "Notas".',
        'Tocá "Crear obligación".'
      ],
      tip: 'Si el proveedor no aparece, cargalo en "Configuración" > "Proveedor".'
    },
    {
      id: 'obl-create-asset',
      title: 'Obligación para un bien',
      steps: [
        'Abrí la "Ficha" del bien y tocá "Agregar obligación": te lleva a Obligaciones con el bien elegido.',
        'También podés crearla desde "Declarar alquiler" con "Nueva obligación", sin perder lo cargado.',
        'Completá los datos y tocá "Crear obligación".'
      ]
    },
    {
      id: 'obl-resp',
      title: 'Titular o inquilino',
      steps: [
        'En el formulario de la obligación, en "Responsable", elegí Titular o Inquilino.',
        'Titular: se paga con "Registrar pago" y genera un gasto real.',
        'Inquilino: no genera gasto; se registra con "Resolver" cuando el inquilino presenta el comprobante.'
      ],
      tip: '"Inquilino" solo está disponible si el bien tiene un contrato de alquiler activo. Cuando el alquiler termina, vuelve al titular.'
    },
    {
      id: 'obl-edit',
      title: 'Editar una obligación',
      steps: [
        'En "Obligaciones" tocá "Editar" en la tarjeta.',
        'Si ya tiene pagos, te pide confirmación y una fecha en "Aplicar cambios desde (obligatorio si hay pagos)" (debe ser futura).',
        'Tocá "Guardar cambios".'
      ],
      tip: 'Para cambiar solo el importe de un vencimiento puntual, usá "Editar" en ese vencimiento (no en la tarjeta).'
    },
    {
      id: 'obl-delete',
      title: 'Eliminar una obligación',
      steps: [
        'En "Obligaciones" tocá "Eliminar" en la tarjeta y confirmá con "Eliminar obligación".',
        'Deja de mostrarse y se cancelan sus vencimientos sin pagos ni resolución. Los pagos hechos se conservan en el historial.'
      ]
    },
    {
      id: 'obl-pay',
      title: 'Pagar un vencimiento',
      text: '¿Qué caso tenés?',
      options: [
        { label: 'Registrar un pago', next: 'obl-pay-steps' },
        { label: 'Pagar solo una parte', next: 'obl-pay-partial' },
        { label: 'Pagar desde "Nueva transacción"', next: 'tx-new-payocc' },
        { label: 'No me deja registrar el pago', next: 'obl-pay-errors' },
        { label: 'Adjuntar el comprobante del pago', next: 'obl-pay-receipt' }
      ]
    },
    {
      id: 'obl-pay-steps',
      title: 'Registrar un pago',
      steps: [
        'En "Obligaciones" tocá "Registrar pago" en la tarjeta (paga el vencimiento impago más antiguo) o en el vencimiento puntual. También desde "Avisos" o la "Ficha" del bien.',
        'Revisá el "Importe pagado" (precargado con lo pendiente) y la "Cuenta" (solo de la moneda de la obligación).',
        'Revisá la "Fecha de pago" (no puede ser futura), "Categoría", "Medio de pago (opcional)" y "Título (opcional)".',
        'Escribí las "Notas" (obligatorias, hasta 1000 caracteres) y, si tenés, el "Comprobante (opcional)".',
        'Tocá "Registrar pago". Se crea un gasto real que descuenta el saldo y afecta Gastos y Ahorro.'
      ]
    },
    {
      id: 'obl-pay-partial',
      title: 'Pago parcial de una obligación',
      steps: [
        'En "Registrar pago" escribí en "Importe pagado" lo que pagaste (menos que lo pendiente).',
        'Tocá "Registrar pago". El vencimiento queda "Parcial" y aparece en "Avisos" > "Pagos parciales".',
        'Cuando pagues el resto, registrá otro pago en el mismo vencimiento.'
      ],
      tip: 'El importe no puede superar lo pendiente.'
    },
    {
      id: 'obl-pay-errors',
      title: 'No me deja registrar el pago',
      steps: [
        '"Las notas son obligatorias": escribí una nota.',
        '"Este pago está a cargo del inquilino. Usá Resolver": usá "Resolver".',
        'No se puede pagar un vencimiento cancelado o ya saldado.',
        'Si no aparece ninguna cuenta, necesitás una cuenta activa en la moneda de la obligación ("Configuración" > "Cuentas").',
        '"Ese pago fue revertido; registrá uno nuevo": volvé a abrir "Registrar pago".'
      ]
    },
    {
      id: 'obl-pay-receipt',
      title: 'Comprobante de un pago',
      steps: [
        'Al pagar, usá el campo "Comprobante (opcional)".',
        'Si ya pagaste: en el vencimiento tocá "Adjuntar comprobante" y elegí el archivo.',
        'Con "Comprobantes" ves los archivos del vencimiento.'
      ],
      tip: 'Si el pago se guardó pero el comprobante falló, adjuntalo después con "Adjuntar comprobante". El aviso "Documentos pendientes" te recuerda los pagos sin comprobante.'
    },
    {
      id: 'obl-ten',
      title: 'Obligaciones del inquilino',
      text: '¿Qué necesitás?',
      options: [
        { label: 'Registrar que el inquilino pagó (Resolver)', next: 'obl-ten-resolve' },
        { label: 'Obligación compartida (parte titular, parte inquilino)', next: 'obl-ten-shared' },
        { label: 'Anular una resolución', next: 'obl-ten-void' }
      ]
    },
    {
      id: 'obl-ten-resolve',
      title: 'Resolver (pagó el inquilino)',
      steps: [
        'Desde "Avisos" > "Comprobantes pendientes de inquilinos" o desde "Obligaciones", tocá "Resolver" (o "Resolver (pagó el inquilino)").',
        'Elegí el inquilino, el "Importe pagado por el inquilino", el "Período (AAAA-MM)" y la "Fecha de resolución".',
        'Elegí comprobantes existentes o "Subir comprobantes nuevos".',
        'Escribí las notas (obligatorias, hasta 2000 caracteres) y tocá "Registrar resolución".'
      ],
      tip: 'La resolución no crea movimientos ni cambia saldos: queda como constancia en el historial del bien.'
    },
    {
      id: 'obl-ten-shared',
      title: 'Obligación compartida',
      steps: [
        'La parte del titular se paga con "Registrar pago".',
        'La parte del inquilino se registra con "Resolver".',
        'El aviso del inquilino aparece cuando la parte del titular ya está saldada.'
      ]
    },
    {
      id: 'obl-ten-void',
      title: 'Anular una resolución',
      steps: [
        'En "Obligaciones", en el vencimiento resuelto, tocá "Anular resolución" (también en el historial del bien con "Deshacer").',
        'Escribí el motivo y confirmá. El vencimiento vuelve a figurar como pendiente.'
      ]
    },
    {
      id: 'obl-fix',
      title: 'Corregir un pago o un vencimiento',
      text: '¿Qué querés corregir?',
      options: [
        { label: 'Revertir un pago registrado por error', next: 'obl-fix-revert' },
        { label: 'Dice que el pago no se puede revertir', next: 'obl-fix-blocked' },
        { label: 'Cambiar el importe de un vencimiento', next: 'obl-fix-amount' },
        { label: 'Cancelar un vencimiento que no corresponde', next: 'obl-fix-cancel' }
      ]
    },
    {
      id: 'obl-fix-revert',
      title: 'Revertir un pago',
      steps: [
        'Tocá "Revertir pago" en el vencimiento (Obligaciones), en el detalle de la transacción en "Inicio", en "Avisos" > "Documentos pendientes" o en el historial del bien.',
        'Si hay varios pagos, elegí cuál ("¿Qué pago querés revertir?").',
        'Revisá los datos, escribí el "Motivo" (obligatorio, hasta 500 caracteres) y tocá "Revertir pago".',
        'El gasto se elimina, el importe vuelve a la cuenta y el vencimiento vuelve a Pendiente, Vencido o Parcial.'
      ],
      tip: 'No se puede deshacer la reversión: registrá un pago nuevo si hace falta. Si la cuenta estaba conciliada, revisá la conciliación.'
    },
    {
      id: 'obl-fix-blocked',
      title: 'El pago no se puede revertir',
      steps: [
        '"No se puede revertir este pago porque tiene movimientos dependientes.": tiene un reembolso, una atribución, un gasto recuperable u otro movimiento vinculado. Eliminá ese movimiento primero.',
        '"Ese pago ya fue revertido": ya está anulado.',
        'Los pagos de obligaciones del inquilino no se revierten: se corrigen con "Anular resolución".'
      ]
    },
    {
      id: 'obl-fix-amount',
      title: 'Cambiar el importe de un vencimiento',
      steps: [
        'En "Obligaciones", en el vencimiento, tocá "Editar".',
        'Escribí el "Importe real del vencimiento" y elegí si aplica solo a ese vencimiento o también a los futuros.',
        'Guardá.'
      ]
    },
    {
      id: 'obl-fix-cancel',
      title: 'Cancelar un vencimiento',
      steps: [
        'En "Obligaciones", en el vencimiento, tocá "Cancelar".',
        'Queda "Cancelado" y deja de generar avisos.'
      ],
      tip: 'Solo se puede si no tiene pagos ni resolución. Si tiene un pago, primero "Revertir pago".'
    },
    {
      id: 'obl-status',
      title: 'Estados y filtros',
      text: '¿Qué querés saber?',
      options: [
        { label: 'Qué significa cada estado y color', next: 'obl-status-meaning' },
        { label: 'Filtrar obligaciones', next: 'obl-status-filter' },
        { label: 'Ver lo vencido o impago', next: 'obl-status-overdue' }
      ]
    },
    {
      id: 'obl-status-meaning',
      title: 'Estados de un vencimiento',
      steps: [
        '"Pendiente" en naranja: vence este mes y todavía no pasó el día.',
        '"Pendiente" en gris: vence en un mes posterior.',
        '"Vencido" en rojo y negrita: pasó el día sin pago completo.',
        '"Pagado": pago completo o resuelto por el inquilino. "Parcial": pagado en parte. "Cancelado": anulado.'
      ],
      tip: 'Cada fila muestra también "Pagado X/Y" y, si es compartida, las partes de propietario e inquilino.'
    },
    {
      id: 'obl-status-filter',
      title: 'Filtrar obligaciones',
      steps: [
        'En "Obligaciones" usá los filtros: "Bien", "Proveedor", "Estado" (Pendientes, Parciales, Pagadas, Resueltas por inquilino, Vencidas), "Tipo", "Desde (dd-mm-aaaa)" y "Hasta (dd-mm-aaaa)".',
        'Tocá "Filtrar". Con "Limpiar" ves todo otra vez.'
      ],
      tip: 'Si ves "No hay obligaciones que coincidan con la búsqueda", tocá "Limpiar".'
    },
    {
      id: 'obl-status-overdue',
      title: 'Ver lo vencido',
      steps: [
        'En "Obligaciones", arriba ves el resumen "Avisos: N vencidas · M próximas".',
        'Filtrá por "Estado" > "Vencidas".',
        'En "Avisos" también está el grupo "Obligaciones vencidas" con "Registrar pago".'
      ]
    },
    {
      id: 'obl-docs',
      title: 'Notas, documentos y comprobantes',
      text: '¿Qué necesitás?',
      options: [
        { label: 'Agregar una nota a la obligación', next: 'obl-docs-note' },
        { label: 'Adjuntar un documento a la obligación', next: 'obl-docs-doc' },
        { label: 'Ver notas y documentos', next: 'obl-docs-view' },
        { label: 'Ver los comprobantes de un vencimiento', next: 'obl-docs-receipts' },
        { label: 'Ver los movimientos atribuidos', next: 'obl-docs-attr' }
      ]
    },
    {
      id: 'obl-docs-note',
      title: 'Nota de una obligación',
      steps: [
        'En la tarjeta de la obligación tocá "Nota".',
        'Escribí la nota y guardala.'
      ]
    },
    {
      id: 'obl-docs-doc',
      title: 'Documento de una obligación',
      steps: [
        'En la tarjeta de la obligación tocá "Adjuntar documento".',
        'Elegí el archivo (PDF, imagen o texto, hasta 20 MiB).'
      ]
    },
    {
      id: 'obl-docs-view',
      title: 'Ver notas y documentos',
      steps: [
        'En la tarjeta de la obligación tocá "Ver notas y documentos".',
        'Abrí cada documento para verlo o descargarlo.'
      ]
    },
    {
      id: 'obl-docs-receipts',
      title: 'Comprobantes de un vencimiento',
      steps: [
        'En el vencimiento pagado o resuelto tocá "Comprobantes".',
        'Para sumar otro, tocá "Adjuntar comprobante".'
      ],
      tip: 'Si dice "No hay comprobantes cargados.", todavía no se adjuntó ninguno.'
    },
    {
      id: 'obl-docs-attr',
      title: 'Movimientos atribuidos',
      steps: [
        'En la tarjeta de la obligación abrí "Movimientos atribuidos".',
        'Vas a ver las transacciones atribuidas a esa obligación; con "Editar atribuciones" corregís una.'
      ],
      tip: '"Editar atribuciones" aparece deshabilitado en el gasto que es el pago del vencimiento: ese se corrige con "Revertir pago".'
    },

    // ───────────────────────── 6. Avisos ─────────────────────────
    {
      id: 'alerts',
      title: 'Avisos',
      text: '"Avisos" reúne todo lo que requiere atención. ¿Qué necesitás?',
      options: [
        { label: 'Entender la pantalla de Avisos', next: 'al-read' },
        { label: 'Filtrar los avisos', next: 'al-filter' },
        { label: 'Qué hacer con cada tipo de aviso', next: 'al-types' },
        { label: 'Cambiar cuándo aparece un aviso', next: 'al-config' },
        { label: 'Anticipación distinta para un bien, obligación o cuenta', next: 'al-exception' },
        { label: 'No aparece un aviso, o sigue aunque lo resolví', next: 'al-missing' },
        { label: 'El número rojo del menú', next: 'al-badge' }
      ]
    },
    {
      id: 'al-read',
      title: 'La pantalla de Avisos',
      steps: [
        'Tocá "Avisos" en el menú. El título indica cuántos avisos hay.',
        'Hay dos grupos: "A cargo de titulares" y "A cargo de inquilinos", cada uno con su contador.',
        'Dentro de cada grupo los avisos se ordenan por tipo y fecha. Cada tarjeta muestra el título, la fecha (o "Vencido · fecha" en rojo) y un mensaje claro.',
        'Cada aviso tiene botones para actuar ahí mismo (por ejemplo, "Registrar pago" o "Registrar cobro").'
      ]
    },
    {
      id: 'al-filter',
      title: 'Filtrar los avisos',
      steps: [
        'En "Avisos" elegí "Tipo de aviso", "Responsable" (titular o inquilino) y "Bien".',
        'Tocá "Filtrar".'
      ]
    },
    {
      id: 'al-types',
      title: 'Tipos de aviso',
      text: '¿Qué aviso estás viendo?',
      options: [
        { label: 'Obligaciones vencidas, Próximos vencimientos o Pagos parciales', next: 'al-t-obl' },
        { label: 'Comprobantes pendientes de inquilinos', next: 'al-t-tenant' },
        { label: 'Alquileres pendientes de cobro', next: 'al-t-rent' },
        { label: 'Cheques por cobrar', next: 'al-t-cheque' },
        { label: 'Cuotas (cheques, crédito o tarjeta)', next: 'al-t-inst' },
        { label: 'Contratos por vencer o Ajustes de alquiler', next: 'al-t-contract' },
        { label: 'Documentos pendientes', next: 'al-t-docs' },
        { label: 'Saldo insuficiente en cuentas', next: 'acc-forecast' }
      ]
    },
    {
      id: 'al-t-obl',
      title: 'Vencimientos de obligaciones',
      steps: [
        '"Obligaciones vencidas": un vencimiento impago con fecha pasada.',
        '"Próximos vencimientos": vence dentro de la anticipación (por defecto 7 días).',
        '"Pagos parciales": se pagó menos que el importe.',
        'Acciones: "Registrar pago", "Adjuntar comprobante" o "Ver obligación".'
      ],
      tip: 'Si la obligación la paga el inquilino, el aviso será "Comprobantes pendientes de inquilinos" y se usa "Resolver".'
    },
    {
      id: 'al-t-tenant',
      title: 'Comprobantes pendientes de inquilinos',
      steps: [
        'Aparece cuando la parte del inquilino de una obligación no tiene resolución.',
        'Pedile el comprobante al inquilino y tocá "Resolver" para registrarlo.',
        'También podés "Adjuntar comprobante" o "Ver obligación".'
      ]
    },
    {
      id: 'al-t-rent',
      title: 'Alquileres pendientes de cobro',
      steps: [
        'Un mes de alquiler sin cobrar, vencido o dentro de los días de aviso (por defecto 5).',
        'Tocá "Registrar cobro" para cobrar solo ese mes.',
        'Con "Ver bien" vas a la ficha del inmueble.'
      ]
    },
    {
      id: 'al-t-cheque',
      title: 'Cheques por cobrar',
      steps: [
        'Un cobro de alquiler con cheque cuya fecha de cobro llega pronto (por defecto 7 días) o ya pasó.',
        'Cuando el cheque se acredite, tocá "Marcar como cobrado" y confirmá.',
        'También tenés "Ver cobro" y "Ver bien".'
      ],
      tip: 'Si lo marcaste por error, deshacelo desde "Perfil" > "Logs".'
    },
    {
      id: 'al-t-inst',
      title: 'Avisos de cuotas',
      steps: [
        '"Cuotas con cheque por confirmar": un cheque pendiente que vence pronto. Tocá "Confirmar imputación" cuando se acredite o debite, o "Ver movimiento".',
        '"Próximas cuotas de crédito": recordatorio de una cuota con tarjeta que llega. Solo informa ("Ver movimiento").',
        '"Cuotas de tarjeta" (planes anteriores): tocá "Contabilizar cuota" o "Ver transacciones".'
      ]
    },
    {
      id: 'al-t-contract',
      title: 'Contratos y ajustes',
      steps: [
        '"Contratos por vencer": un contrato que termina dentro de la anticipación (por defecto 30 días).',
        '"Ajustes de alquiler": se acerca la fecha de un ajuste (por defecto 30 días).',
        'Tocá "Ver bien" y desde la ficha usá "Ver alquiler" > "Actualizar alquiler" o "Finalizar alquiler" según corresponda.'
      ]
    },
    {
      id: 'al-t-docs',
      title: 'Documentos pendientes',
      steps: [
        'Un vencimiento pagado en los últimos días (por defecto 60) que no tiene comprobante.',
        'Tocá "Adjuntar comprobante" y elegí el archivo: el aviso desaparece.',
        'Si el pago estaba mal, desde ahí mismo podés "Revertir pago" (pide motivo).'
      ]
    },
    {
      id: 'al-config',
      title: 'Cambiar cuándo aparece un aviso',
      steps: [
        'Andá a "Configuración" > "Avisos".',
        'En "Anticipación por tipo de aviso" cambiá los "Días antes" de cada tipo (0 a 365). "Documentos pendientes" se mide en días hacia atrás.',
        'Tocá "Guardar". Vas a ver "Preferencias de avisos guardadas".'
      ],
      tip: 'Obligaciones vencidas y pagos parciales figuran como "Siempre visible". "Los días deben ser un número entero entre 0 y 365".'
    },
    {
      id: 'al-exception',
      title: 'Excepción de anticipación',
      steps: [
        'Andá a "Configuración" > "Avisos" > "Excepciones específicas".',
        'Elegí el "Tipo de aviso", en "Aplica a" el alcance (Inmueble/Bien, Obligación o Cuenta), el "Elemento" y los días.',
        'Tocá "Agregar" y después "Guardar".',
        'Para quitarla, eliminá la excepción de la lista y tocá "Guardar".'
      ],
      tip: 'Prioridad: obligación > bien > cuenta > tipo de aviso > valor por defecto.'
    },
    {
      id: 'al-missing',
      title: 'Un aviso no aparece o no se va',
      steps: [
        'Revisá los filtros de "Avisos" ("Todos los tipos", "Todos los responsables", "Todos los bienes").',
        'Revisá la anticipación en "Configuración" > "Avisos": quizás todavía no entró en los días configurados.',
        'Los vencimientos cancelados o resueltos no generan avisos. Los avisos se calculan hasta 90 días adelante.',
        'Si sigue aunque lo resolviste: un pago parcial mantiene el aviso hasta completar; un pago sin comprobante genera "Documentos pendientes".'
      ]
    },
    {
      id: 'al-badge',
      title: 'El número rojo del menú',
      steps: [
        'El número sobre "Avisos" es la cantidad de avisos (hasta "99+").',
        'El punto rojo sobre "Configuración" indica avisos de saldo o de alquiler.',
        'Se actualizan al navegar entre pantallas.'
      ]
    },

    // ───────────────────────── 7. Configuración ─────────────────────────
    {
      id: 'setup',
      title: 'Configuración',
      text: '"Configuración" tiene las secciones Cuentas, Avisos, Titular, Inquilino, Proveedor y Categorías. ¿Qué necesitás?',
      options: [
        { label: 'Titulares, inquilinos y proveedores', next: 'set-parties' },
        { label: 'Categorías', next: 'set-cat' },
        { label: 'Avisos y avisos de saldo', next: 'set-alerts' },
        { label: 'Cuentas', next: 'acc' }
      ]
    },
    {
      id: 'set-parties',
      title: 'Titulares, inquilinos y proveedores',
      text: '¿Qué querés hacer?',
      options: [
        { label: 'Agregar un titular', next: 'set-p-owner' },
        { label: 'Agregar un inquilino', next: 'set-p-tenant' },
        { label: 'Agregar un proveedor', next: 'set-p-provider' },
        { label: 'Usar un registro existente con otro rol', next: 'set-p-existing' },
        { label: 'Ver o editar un registro', next: 'set-p-edit' },
        { label: 'Eliminar un registro', next: 'set-p-delete' }
      ]
    },
    {
      id: 'set-p-owner',
      title: 'Agregar un titular',
      steps: [
        'Andá a "Configuración" > "Titular" y tocá "Agregar titular".',
        'Elegí el "Tipo": "Persona" (Nombre y Apellido obligatorios, DNI, Teléfono, Correo electrónico) u "Organización" (Razón social obligatoria, CUIL/CUIT, Teléfono, Correo electrónico, Dirección).',
        'Revisá los "Roles" (al menos uno) y las "Notas generales".',
        'Tocá "Crear". Verás "Registro creado".'
      ],
      tip: 'Los titulares se usan en cuentas y bienes. "Nombre y apellido son obligatorios" o "La razón social es obligatoria" indican qué falta.'
    },
    {
      id: 'set-p-tenant',
      title: 'Agregar un inquilino',
      steps: [
        'Andá a "Configuración" > "Inquilino" y tocá "Agregar inquilino".',
        'Completá los datos de la persona u organización como en un titular.',
        'Tocá "Crear". Ya lo podés elegir al "Declarar alquiler".'
      ],
      tip: 'Si el inquilino ya está cargado como titular, en "¿Nuevo o existente?" elegí "Elegir un titular existente" para no duplicarlo.'
    },
    {
      id: 'set-p-provider',
      title: 'Agregar un proveedor',
      steps: [
        'Andá a "Configuración" > "Proveedor" y tocá "Agregar proveedor".',
        'Completá los datos y marcá una o varias "Categorías de gasto" (al menos una para organizaciones proveedoras).',
        'Tocá "Crear". La primera categoría se precarga al crear obligaciones con ese proveedor.'
      ],
      tip: 'Si dice "Primero creá una categoría de gastos en Configuración → Categorías.", creá una categoría antes.'
    },
    {
      id: 'set-p-existing',
      title: 'Un registro con varios roles',
      steps: [
        'En la sección donde querés sumarlo (Titular, Inquilino o Proveedor), tocá "Agregar ...".',
        'En "¿Nuevo o existente?" elegí la opción de registro existente (por ejemplo, "Elegir un titular existente" en Inquilino).',
        'Elegí el registro en "Elegí el registro" y guardá.',
        'Se le agrega el rol al mismo registro, sin duplicarlo: figura en las dos secciones.'
      ]
    },
    {
      id: 'set-p-edit',
      title: 'Ver o editar un registro',
      steps: [
        'En la sección correspondiente tocá "Ver ficha" para ver datos, documentos y notas.',
        'Tocá "Editar", cambiá los datos y tocá "Guardar cambios".'
      ]
    },
    {
      id: 'set-p-delete',
      title: 'Eliminar un registro',
      steps: [
        'En la sección correspondiente tocá "Eliminar" y confirmá.'
      ],
      tip: 'No se puede eliminar un registro en uso en cuentas, bienes, contratos, obligaciones o documentos. Quitá primero esas referencias.'
    },
    {
      id: 'set-cat',
      title: 'Categorías',
      text: '¿Qué querés hacer con las categorías?',
      options: [
        { label: 'Crear una categoría', next: 'set-cat-new' },
        { label: 'Crear una subcategoría', next: 'set-cat-sub' },
        { label: 'Editar una categoría', next: 'set-cat-edit' },
        { label: 'Eliminar una categoría', next: 'set-cat-delete' }
      ]
    },
    {
      id: 'set-cat-new',
      title: 'Crear una categoría',
      steps: [
        'Andá a "Configuración" > "Categorías" y tocá "+ Nueva".',
        'Escribí el "Nombre" (obligatorio). Dejá "Categoría padre (opcional)" en "Ninguna (categoría principal)".',
        'Elegí un "Color" y tocá "Crear".'
      ],
      tip: 'Las cuentas nuevas empiezan sin categorías. Los ingresos no usan categoría.'
    },
    {
      id: 'set-cat-sub',
      title: 'Crear una subcategoría',
      steps: [
        'En "Configuración" > "Categorías", tocá el botón ➕ ("Agregar subcategoría") de la categoría principal.',
        'Escribí el nombre, elegí el color y tocá "Crear".'
      ],
      tip: 'Hay un solo nivel: no se crean subcategorías de una subcategoría.'
    },
    {
      id: 'set-cat-edit',
      title: 'Editar una categoría',
      steps: [
        'En "Configuración" > "Categorías", tocá el botón ✏️ ("Editar").',
        'Cambiá el nombre, la categoría padre o el color y tocá "Guardar".'
      ]
    },
    {
      id: 'set-cat-delete',
      title: 'Eliminar una categoría',
      steps: [
        'En "Configuración" > "Categorías", tocá el botón 🗑️ ("Eliminar") de la categoría y confirmá.'
      ],
      tip: 'No se puede eliminar una categoría con transacciones o comisiones de transferencias asociadas: cambiá primero la categoría de esos movimientos.'
    },
    {
      id: 'set-alerts',
      title: 'Avisos y avisos de saldo',
      text: '¿Qué querés configurar?',
      options: [
        { label: 'La anticipación de cada tipo de aviso', next: 'al-config' },
        { label: 'Una excepción para un elemento puntual', next: 'al-exception' },
        { label: 'Avisos de saldo y pronóstico', next: 'set-al-balance' }
      ]
    },
    {
      id: 'set-al-balance',
      title: 'Avisos de saldo',
      steps: [
        'Andá a "Configuración" > "Avisos" > "Avisos de saldo".',
        'Elegí el "Horizonte de pronóstico (días)" (1 a 365; por defecto 30) y si querés la "Revisión diaria" en el servidor.',
        'Abajo ves los avisos de saldo activos y el pronóstico de cada cuenta conciliada.',
        'Tocá "Guardar".'
      ],
      tip: 'Son avisos internos: no se envían correos ni se ejecutan pagos. Solo funcionan con cuentas conciliadas.'
    },

    // ───────────────────────── 8. Perfil, Logs y acceso ─────────────────────────
    {
      id: 'profile',
      title: 'Perfil, Logs, deshacer y acceso',
      text: '¿Qué necesitás?',
      options: [
        { label: 'Entrar, contraseña y cuenta de usuario', next: 'pr-access' },
        { label: 'Apariencia, foto y experiencia', next: 'pr-look' },
        { label: 'Logs (registro de actividad)', next: 'pr-logs' },
        { label: '¿Cómo deshago algo que hice?', next: 'pr-undo' },
        { label: 'Cómo usar este asistente', next: 'pr-help' }
      ]
    },
    {
      id: 'pr-access',
      title: 'Acceso y cuenta de usuario',
      text: '¿Qué querés hacer?',
      options: [
        { label: 'Iniciar sesión', next: 'pr-login' },
        { label: 'Crear una cuenta (Registrarse)', next: 'pr-register' },
        { label: 'Olvidé mi contraseña', next: 'pr-forgot' },
        { label: 'Cambiar mi contraseña', next: 'pr-password' },
        { label: 'Cambiar mi email', next: 'pr-email' },
        { label: 'Cerrar sesión', next: 'pr-logout' },
        { label: 'Eliminar mi cuenta', next: 'pr-delete' }
      ]
    },
    {
      id: 'pr-login',
      title: 'Iniciar sesión',
      steps: [
        'En la pantalla de acceso elegí la pestaña "Iniciar sesión".',
        'Escribí tu "Nombre de usuario" (no el email) y la "Contraseña".',
        'Tocá "Iniciar sesión".'
      ],
      tip: '"Credenciales inválidas": revisá el usuario y la contraseña (mayúsculas incluidas). La sesión dura 7 días y se renueva con el uso.'
    },
    {
      id: 'pr-register',
      title: 'Registrarse',
      steps: [
        'En la pantalla de acceso elegí la pestaña "Registrarse".',
        'Completá "Nombre" (será tu nombre de usuario), "Email" y "Contraseña" (mínimo 6 caracteres).',
        'Tocá "Crear cuenta": la sesión se inicia sola.'
      ],
      tip: 'El nombre de usuario y el email no pueden estar en uso. La cuenta nueva empieza sin categorías.'
    },
    {
      id: 'pr-forgot',
      title: 'Olvidé mi contraseña',
      steps: [
        'En la pantalla de acceso tocá "¿Olvidaste tu contraseña?".',
        'Escribí tu email y tocá "Enviar enlace". Siempre verás "Si el email existe, recibirás un enlace".',
        'Abrí el enlace del correo: escribí la "Nueva contraseña" (mínimo 6) y tocá "Restablecer".'
      ],
      tip: 'El enlace vale 1 hora y se usa una sola vez. Si venció, pedí otro. Revisá también la carpeta de spam.'
    },
    {
      id: 'pr-password',
      title: 'Cambiar la contraseña',
      steps: [
        'Andá a "Perfil" y tocá "Acciones de cuenta".',
        'Elegí "Cambiar contraseña".',
        'Escribí la "Contraseña actual", la "Nueva contraseña" (mínimo 6) y "Repetir nueva contraseña".',
        'Tocá "Guardar". Verás "Contraseña actualizada".'
      ],
      tip: '"Las contraseñas no coinciden": escribí la misma en los dos campos nuevos.'
    },
    {
      id: 'pr-email',
      title: 'Cambiar el email',
      steps: [
        'Andá a "Perfil" > "Acciones de cuenta" > "Cambiar email".',
        'Escribí el "Nuevo email" y tu contraseña actual para confirmar.',
        'Tocá "Guardar". Verás "Email actualizado".'
      ],
      tip: 'El email no puede estar en uso por otra cuenta.'
    },
    {
      id: 'pr-logout',
      title: 'Cerrar sesión',
      steps: [
        'Andá a "Perfil".',
        'Tocá "Cerrar sesión" (abajo de todo).'
      ]
    },
    {
      id: 'pr-delete',
      title: 'Eliminar mi cuenta',
      steps: [
        'Andá a "Perfil" > "Acciones de cuenta" > "Eliminar mi cuenta".',
        'Escribí ELIMINAR en "Escribí ELIMINAR para confirmar" y confirmá.'
      ],
      tip: 'Es irreversible: borra la cuenta y todos sus datos, incluidos los documentos.'
    },
    {
      id: 'pr-look',
      title: 'Apariencia, foto y experiencia',
      text: '¿Qué querés cambiar?',
      options: [
        { label: 'Modo oscuro o claro', next: 'pr-theme' },
        { label: 'Experiencia Móvil o Escritorio', next: 'pr-experience' },
        { label: 'Foto de perfil', next: 'pr-photo' },
        { label: 'La aplicación parece desactualizada', next: 'pr-cache' }
      ]
    },
    {
      id: 'pr-theme',
      title: 'Modo oscuro o claro',
      steps: [
        'Andá a "Perfil" > "Apariencia".',
        'Elegí "Modo oscuro" o "Modo claro". Se aplica al instante y se recuerda en este dispositivo.'
      ]
    },
    {
      id: 'pr-experience',
      title: 'Experiencia Móvil o Escritorio',
      steps: [
        'La experiencia se elige en la pantalla de acceso, arriba: "Móvil" o "Escritorio".',
        'Si ya iniciaste sesión: "Perfil" > "Cerrar sesión", elegí la experiencia y volvé a entrar.',
        'Se recuerda en este dispositivo. Si no elegiste nada, se usa Escritorio.'
      ],
      tip: 'En Escritorio el menú queda a la izquierda y se carga con "Nueva transacción"; en Móvil, abajo y con "+".'
    },
    {
      id: 'pr-photo',
      title: 'Foto de perfil',
      steps: [
        'Andá a "Perfil" y tocá "Cambiar foto".',
        'Elegí una imagen de hasta 2 MB (se recorta cuadrada).',
        'Para quitarla, tocá "Eliminar foto".'
      ],
      tip: '"La imagen no puede superar 2MB": elegí una imagen más liviana.'
    },
    {
      id: 'pr-cache',
      title: 'La aplicación parece desactualizada',
      steps: [
        'La aplicación se actualiza sola al publicarse una versión nueva.',
        'Si igual ves una versión vieja: cerrá sesión ("Perfil" > "Cerrar sesión").',
        'En la pantalla de acceso tocá "Limpiar caché y recargar".'
      ],
      tip: 'Sin conexión la aplicación abre, pero los datos no se cargan ("Sin conexión").'
    },
    {
      id: 'pr-logs',
      title: 'Logs',
      text: '¿Qué querés hacer en Logs?',
      options: [
        { label: 'Ver todo lo que hice', next: 'pr-logs-view' },
        { label: 'Buscar y filtrar acciones', next: 'pr-logs-filter' },
        { label: 'Deshacer desde Logs', next: 'pr-logs-undo' }
      ]
    },
    {
      id: 'pr-logs-view',
      title: 'Ver los Logs',
      steps: [
        'Andá a "Perfil" y tocá "Logs".',
        'Cada renglón muestra a la izquierda la fecha y hora (dd-mm-aaaa hh:mm) y a la derecha qué hiciste. Lo más nuevo aparece primero.',
        'Si una acción falló se agrega "· No se completó".',
        'Con "← Perfil" volvés.'
      ],
      tip: 'Las entradas se conservan 12 meses.'
    },
    {
      id: 'pr-logs-filter',
      title: 'Buscar y filtrar en Logs',
      steps: [
        'En "Logs" escribí en "Buscar" (no distingue mayúsculas ni acentos).',
        'Usá "Desde" / "Hasta" para un rango de días y los filtros "Bien", "Titular", "Inquilino" y "Categoría".',
        '"Limpiar filtros" quita todo.'
      ],
      tip: '"La fecha "Desde" no puede ser posterior a "Hasta"". Las acciones anteriores a la versión 1.15.0 no aparecen al filtrar por bien, titular, inquilino o categoría.'
    },
    {
      id: 'pr-logs-undo',
      title: 'Deshacer desde Logs',
      steps: [
        'En "Logs" buscá el pago, la resolución, el cobro de alquiler o el cheque.',
        'Tocá "Deshacer".',
        'Escribí el "Motivo" (obligatorio) y confirmá.'
      ]
    },
    {
      id: 'pr-undo',
      title: '¿Cómo deshago algo?',
      steps: [
        'Pago de una obligación: "Revertir pago" (pide motivo).',
        'Resolución de un inquilino: "Anular resolución".',
        'Cobro de alquiler: "Deshacer cobro" (pide motivo).',
        'Confirmación de un cheque: "Deshacer confirmación". Cheque marcado como cobrado: "Deshacer" en "Logs".',
        'Ocurrencia recurrente: "Omitir ocurrencia". Gasto, ingreso o reembolso común: "Eliminar".',
        'Desde "Logs" y desde el historial del bien también hay un botón "Deshacer".'
      ],
      tip: 'Eliminar un bien y revertir un pago no se pueden deshacer: hay que volver a cargarlo.'
    },
    {
      id: 'pr-help',
      title: 'Cómo usar este asistente',
      steps: [
        'Escribí el número de la opción y tocá "Enviar", o tocá directamente el botón de la opción.',
        '9 (o "atrás") vuelve al paso anterior. 0 (o "menú") vuelve al menú principal.',
        'El botón "—" minimiza la ventana sin perder la conversación; tocá la burbuja "Ayuda" para volver. La tecla Escape también minimiza.',
        'El botón "✕" cierra la ventana: la conversación se guarda en el historial (panel izquierdo, botón "Historial") y la próxima vez empezás una nueva.',
        'Podés cambiar el tamaño arrastrando la esquina superior izquierda de la ventana.'
      ]
    }
  ];

  const nodes = {};
  NODES.forEach(node => { nodes[node.id] = node; });

  return {
    ROOT_ID: 'root',
    BACK_KEY: '9',
    MENU_KEY: '0',
    MAX_OPTIONS: 8,
    nodes,
    list: NODES
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = HelpTree;
