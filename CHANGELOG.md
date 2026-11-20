# Changelog

## [1.19.0] - 2026-11-20

### Added
- Configuración > Inquilino > **Agregar inquilino**: además de crear uno nuevo, se puede **Elegir un titular existente**. Se le agrega el rol Inquilino al mismo registro (sin duplicarlo) y figura en las dos listas. La misma opción existe en Titular (desde inquilinos o proveedores) y en Proveedor (desde titulares o inquilinos).
- **Gasto espejo automático**: al registrar un cobro de alquiler cuyo inquilino es un titular, se crea también el **gasto del inquilino** con el mismo importe, moneda, fecha (con cheque, la fecha de cobro del cheque) y medio de cobro, título "Alquiler pagado — <bien> <mes/año>" y categoría Alquiler si existe.
- Formulario de cobro: **Cuenta del inquilino (titular)** (solo si el inquilino es titular) con sus cuentas activas en la moneda de la línea y la nota "Se registrará el gasto del inquilino <nombre> con su crédito fiscal". Sin cuenta en esa moneda, el cobro se bloquea hasta crearla.
- **IVA por titular**: en un cobro A con IVA, el gasto espejo lleva el mismo IVA a nombre del titular-inquilino, que lo ve como **crédito fiscal** en "IVA mensual por titular"; el titular que cobra mantiene su débito fiscal. Las líneas B no llevan IVA.
- Inicio: el gasto espejo figura como **Gasto espejo del cobro de alquiler**, con **Ver** y sin Editar ni Eliminar.

### Changed
- **Deshacer cobro** también elimina el gasto espejo (y lo indica en Logs).
- Un titular **no puede alquilar su propio bien**: la declaración o el contrato se rechazan con un mensaje claro, y la lista de inquilinos de la declaración no muestra a los titulares vigentes del inmueble.

## [1.18.2] - 2026-11-20

### Changed
- Actualizar alquiler: ahora se puede aplicar de forma **retroactiva** desde uno de los **últimos 3 vencimientos pasados**. Los períodos ya cobrados conservan su importe; los pasados sin cobrar toman el nuevo valor.
- Todas las ventanas (modales) son un **30% más anchas** (en el celular siguen ocupando el ancho de la pantalla).
- Configuración > Proveedor: un proveedor puede tener **varias categorías de gasto** (selección múltiple con casillas; al menos una para organizaciones). La tarjeta muestra todas y la primera se precarga al crear obligaciones.

### Fixed
- Declaración de alquiler: una obligación creada desde el modal mostraba "Sin proveedor" aunque el proveedor estaba asignado (el dato se guardaba bien). Ahora se muestra el nombre del proveedor.

## [1.18.1] - 2026-11-20

### Added
- Configuración > Cuentas: campo **Últimos 4 dígitos** (opcional, exactamente 4 números) al crear o editar una cuenta. La tarjeta de la cuenta muestra **Dígitos: xxxx** debajo de "Titular".

- Bienes: **reordenar las tarjetas con drag and drop** desde el agarre ⋮⋮ (mouse o pantalla táctil; también con las flechas ↑/↓). El orden se guarda.
- Bienes: nuevo tipo de inmueble **Local**; al alquilarlo, el contrato se crea como comercial.

### Changed
- Inicio: las **sub-cuentas** se muestran debajo de su cuenta (con "↳"), en lugar de al lado.

## [1.18.0] - 2026-11-20

### Added
- Formulario de transacción: **Cheques en cuotas** para gastos e ingresos nuevos con medio Cheque. "Cuotas" (1 a 24) y una fila por cheque con **Vencimiento cuota Nº x**, **Monto** y **Nº cheque** (obligatorio, hasta 30 caracteres: letras, números y guiones). Los montos se reparten en partes iguales y deben sumar exactamente el Monto.
- Cada cuota con cheque se registra **Pendiente de confirmación** y no cuenta en ningún total hasta usar **Confirmar imputación** (desde Avisos o desde Inicio). **Deshacer confirmación** pide un motivo. Ambas acciones quedan en Logs.
- Formulario de transacción: **Compras en cuotas con crédito** para gastos nuevos con medio Crédito: "Cuotas" (1 a 36), "Interés (%)" y la vista previa "N cuotas de $X (total $Y)". Con más de una cuota se crea un gasto por cuota el mismo día de los meses siguientes.
- Avisos: **Cuotas con cheque por confirmar** (muestra el Nº de cheque; a cargo del inquilino si es un ingreso de un bien alquilado) y **Próximas cuotas de crédito**.
- Configuración > Avisos: **Anticipación por tipo de aviso** para cada tipo y **Excepciones específicas** por inmueble/bien, obligación o cuenta (por ejemplo, ajustes de alquiler con 15 días en general y 30 para un inmueble).

### Changed
- "Nueva transacción" se abre desde arriba, con el selector de tipo a la vista (antes se abría desplazada hasta "Título").
- "Medio de pago reutilizable" pasa a llamarse **Medio de pago** y es una lista fija: Transferencia, Efectivo, Débito, Crédito (solo gastos) y Cheque (gastos e ingresos). Los valores antiguos se conservan al editar.
- Inicio muestra la insignia "Pendiente de confirmación" y el Nº de cheque en las cuotas con cheque.
- Todas las ventanas (modales) se cierran solo con la **X** o con sus propios botones: hacer clic fuera de la ventana o presionar Escape ya no la cierra.
- Logs: el título queda centrado sobre el registro de acciones.
- Cobros de alquiler sin clasificación guardada: se completa la clasificación A/B según el contrato, para que el gráfico A vs B coincida con la ficha del alquiler.
- Los avisos usan la anticipación de Configuración > Avisos; el formulario de obligaciones ya no pide "Aviso" y "Avisar con anticipación" se reemplaza por la anticipación por tipo.
- El formulario de transacción ya no crea planes de tarjeta; los planes existentes siguen en Inicio y Avisos.

## [1.17.1] - 2026-11-18

### Changed
- Bienes > filtros: quedan **Tipo de bien**, **Tipo de inmueble** (aparece al elegir Inmueble, con los tipos ya creados), **Titular legal** y **Estado** (Alquilado / No alquilado). Se quitan Buscar, Uso y Ubicación.
- Inicio > Analítica: "IVA mensual por titular" ya no tiene la estrella para fijarlo como favorito; si estaba fijado, deja de mostrarse en el encabezado.
- Logs: los filtros (Buscar, Desde, Hasta, Bien, Titular, Inquilino, Categoría y Limpiar filtros) quedan en una sola barra compacta, en una fila en pantallas anchas.
- Modo claro: la sección activa del menú se resalta con fondo de color, texto en negrita y una barra de acento.
- Tarjetas de Bienes: nombres de los datos en negrita (**Inmueble**, **Tipo**, **Ubicación**, **Estado**, **Titular**); el Estado muestra Alquilado o No alquilado en lugar de Activo.

## [1.17.0] - 2026-11-18

### Added
- Gastos con factura: campo opcional "IVA (%) de la factura" y "Factura a nombre de" (por defecto, el titular de la cuenta). Ese IVA es crédito fiscal del titular.
- Etiquetas visibles encima de cada campo en los buscadores de Bienes, Obligaciones y Avisos.

### Changed
- Inicio > "IVA mensual por titular": cuatro columnas **Titular**, **Débito fiscal** (IVA de ingresos A), **Crédito fiscal** (IVA de gastos con factura) y **Saldo** (crédito fiscal − débito fiscal; en rojo si hay IVA a pagar, en verde si hay saldo a favor).
- La API de resumen y tendencias devuelve `debit`, `credit` y `balance` por titular en `ivaByHolder` (`amount` sigue siendo el débito).

## [1.16.0] - 2026-11-17

### Added
- Registrar cobro: pagos parciales. Si el importe es inferior al total pendiente se pregunta si es un pago parcial; el período queda "Parcialmente cancelado" y muestra el saldo pendiente en Períodos, en el historial del bien y en la ventana del alquiler.
- Registrar cobro: medio de cobro "Cheque" con "Días" obligatorio; el ingreso se registra en la fecha de cobro del cheque.
- Avisos: "Cheques por cobrar" cuando faltan 7 días o menos para cobrar un cheque (o ya venció), con bien, inquilino, período e importe, y la acción "Marcar como cobrado" (se puede deshacer desde Logs).
- Comprobantes en cada registro de pago o ingreso: Registrar cobro, Registrar pago y Resolver de obligaciones, y el formulario de ingresos y gastos. El detalle del movimiento permite "Adjuntar comprobante".
- Visor de documentos: "Ver documento" abre el archivo en una ventana con "Acercar", "Alejar" y "Restablecer", y "Descargar" en todos los objetos con un documento adjunto.
- Logs: mensajes descriptivos para cobros parciales, cobros con cheque, cheques cobrados y comprobantes adjuntados.

### Changed
- "Ocultar importes" de Configuración oculta solo los saldos de las cuentas; las tarjetas de Ingresos, Gastos y Ahorro de Inicio responden solo al ojo de Inicio.
- Selector de mes: la ventana se ajusta a su contenido sin cortar nombres ni desplazarse en horizontal, y el año se elige en una lista desplegable con desplazamiento centrada en el año elegido.
- Al eliminar un movimiento se eliminan los comprobantes que solo le pertenecían.

### Fixed
- Los períodos de alquiler cobrados en parte se muestran como "Parcialmente cancelado" en lugar de "Parcial".

## [1.15.0] - 2026-11-16

### Added
- Deshacer con motivo: un único diálogo "Deshacer" (motivo obligatorio de 1 a 500 caracteres) para revertir pagos, anular resoluciones y deshacer cobros de alquiler, desde el historial del bien, Obligaciones, Períodos y Logs. El motivo se guarda y se muestra en el detalle.
- Logs: mensajes descriptivos (bien, importe, vencimiento, cuota y motivo), filtros por Bien, Titular, Inquilino y Categoría con "Limpiar filtros", y botón "Deshacer" en pagos, resoluciones y cobros.
- Cuentas: marcar una cuenta como principal al crearla, y elegir la "Nueva cuenta principal" al desmarcar la principal; siempre queda exactamente una.
- Bienes: tipos de inmueble propios con "Agregar tipo…" en el formulario.
- Bienes: "Eliminar" en la ficha y en la edición, con confirmación; solo si el bien no tiene movimientos, obligaciones, alquileres, documentos, notas, gastos a recuperar ni planes de cuotas.
- Contratos del alquiler: "Ver documento" y "Descargar documento" cuando el contrato tiene un documento adjunto.
- Protección contra doble clic: los botones y formularios se bloquean mientras la acción está en curso y no se envían escrituras idénticas duplicadas.

### Changed
- Las notas son obligatorias al registrar un pago (hasta 1000 caracteres) y al resolver una obligación del inquilino (hasta 2000 caracteres).
- Categorías pasó a Configuración > Categorías; el botón de la barra de navegación ya no existe y /categories redirige a la nueva sección.
- Inicio: el IVA mensual se muestra por titular para el mes elegido (con 0 para los titulares sin IVA).
- Al resolver una obligación, el inquilino sale del contrato de la obligación o del alquiler vigente del bien, con el primero preseleccionado.
- En Contratos del alquiler ya no aparece "Registrar cobro" (queda en Resumen y Períodos) y las alertas de alquiler vencido se muestran en rojo y negrita.

### Fixed
- El formulario de proveedor siempre carga las categorías de gasto y avisa cuando no hay ninguna.
- La cuenta que ya es principal ya no ofrece "Hacer principal".

## [1.14.0] - 2026-11-16

### Added
- Perfil > Apariencia: elegir entre "Modo oscuro" y "Modo claro". La elección se guarda en el dispositivo y también ajusta los gráficos.
- Selector de mes de Inicio (y Resumen): al tocar el mes se abre un selector de mes, y al tocar el año, un selector de año.

## [1.13.3] - 2026-11-16

### Changed
- Los placeholders de los campos de texto y el texto de los selectores ya no se cortan: si no entran en el componente, la tipografía se achica hasta que entren.

### Fixed
- En los filtros de Períodos, el texto de los selectores ya no queda debajo de la flecha.

## [1.13.2] - 2026-11-16

### Changed
- La tabla de Períodos (y la ficha mensual) muestra líneas grises finas entre celdas.
- Los filtros de Períodos se ordenan en una grilla más compacta, con controles más chicos y separados de los resultados.
- Las ventanas abiertas sobre otra muestran un botón "← Atrás" arriba a la izquierda para volver a la anterior.

## [1.13.1] - 2026-11-16

### Changed
- La tabla de "Ver historial" del bien muestra líneas grises finas entre celdas y un encabezado sombreado en pantallas anchas.

## [1.13.0] - 2026-11-16

### Added
- Historial del bien tipado (obligaciones, alquileres, ajustes, eventos y reversiones) con selector de año y de mes, detalle de cada registro y estados con texto e ícono.
- Ficha del bien rediseñada: encabezado, obligaciones, tarjeta de alquiler, documentos y notas, y economía del bien.
- Ventana del alquiler con pestañas Resumen, Períodos, Contratos, Documentos y Notas, y un encabezado fijo con el estado, la vigencia y las acciones del alquiler.
- Pestaña Períodos: una fila por mes con las modalidades, las obligaciones del titular y del inquilino, el total por moneda, el estado consolidado y las acciones de cobro.
- Vista previa de "Actualizar alquiler" (los períodos ya cobrados no se modifican) y "Finalizar contrato" de una sola modalidad.
- Histórico de alquileres del inmueble, edición segura de un alquiler finalizado y eliminación con confirmación e impacto.
- Documentos y notas del alquiler: eliminar documentos, editar y eliminar notas, título de la nota, filtros por nombre, tipo y fechas, y quién cargó cada documento.
- Ficha mensual como ventana secundaria con filtros, totales por moneda y las mismas acciones que Períodos.
- Avisos separados en "A cargo de titulares" y "A cargo de inquilinos", con filtro por responsable.
- "Revertir pago" para corregir un pago de obligación (con motivo opcional, comprobantes conservados y registro en Logs), disponible en cinco lugares.
- Estados de carga, vacío y error compartidos, y una pasada de diseño adaptable para celulares.

### Changed
- Los ajustes de alquiler omiten los períodos ya cobrados.
- Finalizar un contrato de una modalidad liquida el alquiler y no usa más la edición del contrato.
- Eliminar un alquiler con cobros sin deshacer queda bloqueado.
- Las confirmaciones de eliminar obligación, anular resolución, eliminar medio de pago y editar una obligación con pagos usan la ventana de confirmación compartida.
- Los mensajes de error de los pagos de obligaciones remiten a "Revertir pago".

## [1.12.0] - 2026-11-15

### Added
- Pantalla de Logs (botón en Perfil) con búsqueda sin distinguir acentos, filtros opcionales Desde/Hasta y la fecha y hora a la izquierda de cada acción.
- Historial de obligaciones del bien: selector de mes (o todos desde la creación), agrupado por mes y tipo, con detalle de cada registro y visor de comprobantes con zoom.
- Tipo de transacción "Transferencia" entre cuentas (cuenta de salida, cuenta de ingreso, monto, título y nota): afecta los saldos pero no ingresos, gastos ni ahorro.
- Registro de pago de obligaciones con título, notas, medio de pago precargado y comprobante opcional.

### Changed
- Obligaciones: estados "Pendiente" (naranja dentro del mes de vencimiento) y "Vencido" (rojo y negrita), sin "Confirmar" ni "Previsto".
- Tarjeta de obligación con etiquetas en negrita (Tipo, Inmueble, Proveedor, Responsabilidad, Cuenta, Monto estimado, Frecuencia, Aviso), y acciones Editar, Eliminar y Registrar pago.
- Bienes: "Ver historial" abre el historial de obligaciones; la ficha completa pasa al botón "Ficha".
- Inicio: se quitó el bloque "Movimientos entre cuentas".

## [1.11.17] - 2026-11-05

### Added
- Configuración de cuentas: cuentas múltiples con moneda propia, saldo independiente y cuenta principal.
- Transferencias y conversiones entre cuentas, con comisión opcional contabilizada una sola vez.
- Resumen, tendencias, objetivos y proyecciones calculados por moneda.
- Alertas internas de saldo bajo con recálculo diario y al abrir la aplicación.
- Migración idempotente: el histórico existente queda asociado a la cuenta principal en EUR sin reescribir importes.

### Changed
- Los movimientos heredan la moneda de su cuenta; la moneda principal solo actúa como valor por defecto.
- La versión mostrada en el login se lee del `package.json` desplegado en lugar de un archivo estático.

## [1.11.2] - 2026-08-23

### Changed
- Resumen: el gráfico Ingresos A vs B se muestra al final, debajo de Fijo vs Variable.
- Resumen: IVA acumulado se muestra como último elemento de la página.


## [1.11.1] - 2026-08-23

### Added
- Desglose Mixto autocompleta B con el saldo restante al ingresar A.


## [1.11.0] - 2026-08-23

### Added
- Campo opcional `IVA (%)` en el formulario de ingresos, aplicable al importe A o a la parte A de ingresos Mixtos.
- "IVA acumulado" en el Resumen mensual y gráfico "IVA acumulado por mes" en Estadísticas.

### Changed
- Clasificación de ingresos por defecto ahora es A (antes B).

## [1.10.0] - 2026-08-23

### Added
- Frecuencia trimestral (`quarterly`) para transacciones recurrentes.
- Clasificación de ingresos A, B y Mixto con validación de desglose.
- Desglose A/B y porcentajes en resumen y tendencias.

## [1.5.2] - 2026-07-13

### Fixed
- Fly.io deployment 502 error: added `/health` endpoint for Fly proxy health checks
- Added `APP_URL` and `SESSION_SECRET` env vars to fly.toml for production CORS and session security

### Changed
- Service worker cache version bumped to v3

## [1.5.1] - 2026-07-12

### Added
- Foto de perfil guardada en el servidor (persiste entre sesiones, browsers y dispositivos)
- Endpoints `PUT /api/auth/photo` y `DELETE /api/auth/photo` para gestión de foto
- Campo `photo` en respuestas de login, registro y perfil
- Paso de tests en GitHub Actions antes del deploy (CI gate)

### Fixed
- Scroll en Estadísticas: al cambiar período (3m/6m/12m) o categoría en Tendencias, la página mantiene la posición del scroll
- Foto de perfil ahora persiste entre sesiones (antes se almacenaba en localStorage y se perdía al limpiar caché)

### Removed
- Sección "Por categoría" de la pantalla Inicio (ya existe en Estadísticas y Resumen)

## [1.5.0] - 2026-07-12

### Added
- Botón "Filtrar" en la pantalla Inicio, al lado derecho del título "Transacciones"
- Modal de filtros con: Tipo, Categoría, Clasificación, Texto libre, Monto mínimo/máximo, Fecha desde/hasta
- Botón "Limpiar" para resetear todos los filtros
- Badge "Filtrando" cuando hay filtros activos

### Changed
- Título de transacción ahora es opcional — si se deja vacío, se usa el nombre de la categoría o subcategoría seleccionada
- Backend valida menos campos obligatorios al crear transacción

## [1.4.0] - 2026-07-12

### Added
- Editar transacciones: click en una transacción abre modal con opciones Editar/Eliminar, el formulario se pre-llena con los datos actuales
- Campo "Clasificación" (Fijo/Variable) en el formulario de transacciones, con valor por defecto "Variable"
- Gráfico pie "Fijo vs Variable" en la página Resumen, mostrando la distribución de gastos fijos y variables
- Navegación a meses futuros en Resumen para prever gastos recurrentes

### Changed
- Nombres de meses ahora inician con mayúscula en todos los selectores (Inicio, Resumen, Estadísticas)
- Selector de mes más grande y con mayor peso de fuente (`clamp(1rem, 5vw, var(--font-xl))`)
- Modal de opciones de transacción ahora incluye botón "Editar" además de "Eliminar"

### Fixed
- El modal de transacción ahora muestra la clasificación (Fijo/Variable) en los detalles

## [1.3.0] - 2026-07-12

### Fixed
- Transacciones recurrentes NO impactaban en el resumen mensual (Home stat cards)
- Transacciones recurrentes NO impactaban en Estadísticas (resumen del mes y tendencias)
- Causa raíz: summary.js y trends.js solo filtraban por `fecha.startsWith(month)`, ignorando instancias recurrentes generadas on-the-fly

### Changed
- `generateRecurringInstances` extraído a `src/utils/recurring.js` compartido entre transactions, summary y trends
- Nueva función `getMonthTransactions()` centraliza la obtención de transacciones del mes (incluye recurrentes)
- Gráfico de barras en Estadísticas ya no incluye "Ahorro" — se muestra como dato separado debajo del gráfico

## [1.2.0] - 2026-07-12

### Added
- Frecuencia bimensual para transacciones recurrentes
- Checkbox "Indeterminado" para fecha fin de transacciones recurrentes
- Dos datepickers funcionales para fecha inicio y fin en el formulario recurrente

### Changed
- Símbolo de moneda cambiado de "Eur" a "€" en todo el frontend
- Números de stat cards más compactos para evitar desbordamiento
- Botón ojo ahora oculta/muestra tanto Ingresos como Ahorro

### Fixed
- Fecha fin de transacciones recurrentes no era clickeable (input nunca se agregaba al DOM)
- Estadísticas numéricas se desbordaban del contenedor en pantallas pequeñas

## [1.1.0] - 2026-07-12

### Added
- Categorías jerárquicas: crear subcategorías vinculadas a categorías padre
- Selector de "Categoría padre" en el modal de crear/editar categoría
- Transacciones recurrentes: checkbox con frecuencia (mensual, semestral, anual)
- Sección "Gastos fijos" en Home mostrando total de gastos recurrentes del mes
- Página de Perfil: foto de usuario, cambiar email, cambiar contraseña, cerrar sesión
- Botón ojo para ocultar/mostrar ingresos en Home (preferencia guardada)
- Desplegable de versión y changelog en la pantalla de login

### Changed
- Login ahora usa nombre de usuario (no email)
- Registro sin categorías default — el usuario empieza vacío
- Renombrado "Tendencias" a "Estadísticas" con gráfico mensual individual
- Cards de estadísticas en Home ajustadas para no desbordar el contenedor
- UI mobile-first mejorada: áreas táctiles, spacing, safe areas

### Fixed
- Cookie session secure flag para localhost (rompía en HTTP)
- Overflow de tarjetas de gastos/ingresos/ahorro en Home

## [1.0.0] - 2026-07-12

### Added
- Sistema de autenticación completo (registro, login, logout, recuperación de contraseña)
- CRUD de categorías con colores personalizados
- CRUD de transacciones (gasto, ingreso, reembolso)
- Resumen mensual con gráfico donut y barras por categoría
- Tendencias multi-mes (3, 6, 12 meses) con gráficos de líneas
- Dashboard Home con selector de mes, estadísticas y lista de transacciones
- PWA con service worker para uso offline
- Tema oscuro con CSS custom properties
- Backend Express con JSON flat-file database
- Tests con Jest y Supertest
- Deploy automatizado con GitHub Actions a Fly.io
