# SelimSystem — Documento funcional

Documento de especificación funcional de SelimSystem. Describe qué hace el producto, cómo se comporta para el usuario y qué reglas de negocio gobiernan el cálculo, sin necesidad de leer el código fuente.

> **Estado de hosting:** SelimSystem aún no está alojado. La cuenta, la aplicación y el flujo de despliegue se configurarán por separado para SelimSystem; las referencias de hosting heredadas de este documento no describen la configuración actual.

---

## 1. Identificación y propósito

SelimSystem es una aplicación web progresiva (PWA) de finanzas personales, **multiusuario** y autocontenida. Permite registrar gastos, ingresos y reembolsos, organizarlos en categorías (con subcategorías), proyectar gastos recurrentes, controlar el gasto mediante metas mensuales y analizar la evolución financiera con gráficos.

- **Público objetivo**: personas que desean llevar un registro manual y simple de sus finanzas personales, sensibles a la privacidad de sus datos.
- **Alcance**: finanzas personales multiusuario con aislamiento total de datos entre cuentas. No incluye banca en línea, sincronización con bancos, impuestos ni multiusuario compartido (una cuenta = un usuario).
- **Estado actual**: versión **1.11.9** (según `package.json`). Nota: la versión mostrada en la pantalla de login y en `public/version.json` sigue siendo 1.11.2 (ver sección 9, deudas conocidas).
- **Tecnología en una línea**: backend Node.js/Express con base de datos JSON plana, frontend SPA en JavaScript vanilla y PWA instalable. Hosting aún no configurado.

---

## 2. Arquitectura funcional de alto nivel

La aplicación se divide en dos partes que colaboran vía HTTP:

| Capa | Qué hace | Dónde vive |
|---|---|---|
| **Cliente (SPA)** | Interfaz completa en una sola página: pantallas, formularios, gráficos, navegación por hash (`#/home`, `#/resumen`...), registro del service worker | `public/` — JavaScript vanilla, sin frameworks |
| **Servidor (API REST)** | Autenticación, validación, persistencia y todo el cálculo de resúmenes, tendencias y metas | `src/routes/` — Express |

Reglas generales de la división:

- El **cliente** muestra datos y envía formularios; no guarda información financiera localmente (solo preferencias de interfaz en `localStorage`, como ocultar importes).
- El **servidor** valida y persiste todo; el cálculo de resumen, tendencias, burn rate y progreso de metas ocurre **en el servidor** y se entrega como JSON.
- El usuario interactúa a través de un **navegador moderno**; la app es instalable como PWA y prioriza el uso móvil.
- El acceso a datos de usuario requiere sesión iniciada; cada usuario solo ve y modifica sus propios datos.

---

## 3. Modelo de datos funcional

La persistencia es un **conjunto de archivos JSON** dentro de un directorio de datos (`DATA_DIR`, `/data` en producción):

```
<DATA_DIR>/
  users.json                      # Cuentas de todos los usuarios
  <id-de-usuario>/
    categories.json               # Categorías de ese usuario
    transactions.json             # Transacciones de ese usuario
    goals.json                    # Metas de ese usuario
```

Esto significa que los datos de cada usuario viven en archivos separados: el borrado de una cuenta elimina físicamente su carpeta completa.

### 3.1 Usuarios

| Campo | Descripción |
|---|---|
| `id` | Identificador único (UUID) |
| `email` | Email único, normalizado a minúsculas |
| `nombre` | Nombre de usuario único; es la credencial de acceso |
| `password` | Hash bcrypt (12 rondas) de la contraseña |
| `photo` | Foto de perfil como data URL `data:image/...` (máx. 500 KB) o `null` |
| `resetToken` / `resetTokenExpires` | Token y vencimiento de recuperación de contraseña (1 hora) |

### 3.2 Categorías (por usuario)

| Campo | Descripción |
|---|---|
| `id`, `userId` | Identificador y propietario |
| `nombre` | Nombre visible |
| `color` | Color de la categoría (paleta fija de 12 colores) |
| `orden` | Posición de ordenamiento |
| `parentId` | `null` para categoría principal; id de otra categoría para subcategoría. **Solo existe un nivel de jerarquía** (no se permiten subcategorías de subcategorías) |

### 3.3 Transacciones (por usuario)

| Campo | Descripción |
|---|---|
| `id`, `userId` | Identificador y propietario |
| `tipo` | `expense` (gasto), `income` (ingreso) o `refund` (reembolso) |
| `monto` | Importe positivo, redondeado a 2 decimales; moneda **euro (€)** |
| `titulo` | Texto libre **opcional**; si se omite, se usa el nombre de la categoría seleccionada |
| `categoryId` | Categoría asociada. **Obligatoria** para gastos y reembolsos; no aplica a ingresos |
| `fecha` | Fecha del movimiento en formato `YYYY-MM-DD`; por defecto el día actual |
| `recurrente` | Booleano. Solo disponible para **gastos** |
| `frecuencia` | `monthly` (mensual), `bimonthly` (bimensual), `quarterly` (trimestral), `semiannual` (semestral) o `annual` (anual) |
| `fechaFin` | Fecha tope de la recurrencia; puede quedar **indefinida** ("Indeterminado" en el formulario) |
| `clasificacion` | Para gastos: `fijo` o `variable` (por defecto `variable`). Para ingresos: `A`, `B` o `Mixto` (por defecto `A`) |
| `montoA`, `montoB` | Desglose de ingresos clasificados como `Mixto` (A + B = monto total) |
| `ivaPorcentaje` | Porcentaje de IVA (0–100) aplicable solo a la parte A de un ingreso (clasificación `A` o `Mixto`) |

**Recurrencia en la práctica**: las transacciones recurrentes **no generan registros duplicados** en el archivo. Al consultar un mes, el servidor calcula "sobre la marcha" si la recurrencia tiene una instancia en ese mes (mismo día del mes original, dentro del rango inicio–fin, y en un periodo que cumpla la frecuencia). Por eso las instancias recurrentes impactan en resúmenes, estadísticas y tendencias sin existir físicamente.

### 3.4 Metas (por usuario)

| Campo | Descripción |
|---|---|
| `id`, `userId` | Identificador y propietario |
| `tipo` | `ahorro_mensual` (meta de ahorro), `gasto_categoria` (límite de gasto por categoría), `gasto_general` (límite de gasto general) |
| `modo` | Cómo se calcula el objetivo: `monto_fijo` (€/mes), `porcentaje_salario` (% de un salario estimado) o `porcentaje_ingresos_dinamico` (% de los ingresos reales del mes) |
| `categoryId`, `categoryName` | Categoría/etiqueta asociada (solo para `gasto_categoria`) |
| `montoFijo` / `porcentaje` / `salarioEstimado` | Parámetros según el modo |
| `meses` | Lista de meses (`YYYY-MM`) en los que la meta está activa; puede ser un mes único o un rango |

### 3.5 Sesiones

- El servidor mantiene sesiones por cookie (`connect.sid`, httpOnly, `SameSite=Lax`, duración 7 días).
- **Estado actual verificado**: las sesiones se guardan en memoria del proceso (sin store en disco), por lo que un reinicio del servidor cierra las sesiones activas.

---

## 4. Reglas de negocio

### 4.1 Cálculo del resumen mensual

Dado un mes (`YYYY-MM`), el resumen se computa sobre todas las transacciones del mes (incluidas instancias recurrentes generadas):

| Concepto | Fórmula |
|---|---|
| Ingresos | Suma de transacciones `income` |
| Gastos | Suma de transacciones `expense` |
| Reembolsos | Suma de transacciones `refund` |
| **Gasto neto** | `gastos − reembolsos` |
| **Ahorro** | `ingresos − gasto neto` (puede ser negativo) |
| Gastos fijos / variables | Suma de gastos según `clasificacion = fijo` / `variable` |
| IVA acumulado | Suma del IVA calculado sobre la parte A de los ingresos con IVA |

**El reembolso no es un ingreso**: los reembolsos reducen el gasto de la categoría a la que pertenecen y el gasto total del mes, pero jamás suman a la columna de ingresos. Solo los ingresos (`income`) alimentan el cálculo de ahorro.

### 4.2 Totales por categoría

- Cada categoría acumula `gastos` y `reembolsos` propios; el valor neto de la categoría es `gastos − reembolsos`.
- **Las categorías padre incluyen automáticamente los montos de sus subcategorías** en sus totales.
- Solo aparecen categorías con movimiento (gastos o reembolsos > 0), ordenadas de mayor a menor neto.

### 4.3 Desglose de ingresos A / B / Mixto

- `A`: el monto completo se imputa a A.
- `B`: el monto completo se imputa a B.
- `Mixto`: el monto se divide en `montoA` + `montoB`; la suma **debe coincidir** con el monto total (validado en servidor).
- El formulario, en modo Mixto, autocompleta B con el saldo restante al ingresar A.
- Del desglose se derivan los porcentajes A vs B del mes.
- **IVA**: solo se calcula para ingresos con clasificación `A` o `Mixto`, y se aplica sobre la parte A (`parteA × ivaPorcentaje / 100`). Los ingresos históricos sin clasificación se reportan como B.

### 4.4 Categorías al registrarse

Falta aclarar un punto clave: **los usuarios nuevos no reciben categorías por defecto**. El código contiene una lista de categorías sugeridas (`src/db/seed.js`), pero esa función **no se invoca en ninguna parte** del producto. Cada usuario comienza con cero categorías y las crea a mano (o con la subcategoría que desee).

### 4.5 Recurrencia (gastos)

- Solo los gastos pueden marcarse como recurrentes.
- Frecuencias: mensual, bimensual, trimestral, semestral, anual.
- La instancia cae en el mismo día del mes de la fecha original y se genera si: el mes consultado es posterior o igual a la fecha de inicio, no supera la fecha de fin (si existe) y cumple el período de la frecuencia.
- La fecha de fin es opcional: existe la opción "Indeterminado".
- Los gastos recurrentes impactan en el resumen, estadísticas, tendencias y metas del mes consultado.

### 4.6 Metas

- **Tipos**: meta de ahorro mensual, límite de gasto por categoría/subcategoría, límite de gasto general.
- **Métodos de cálculo del objetivo**:
  - Monto fijo: `montoFijo` €/mes.
  - Porcentaje del salario: `salarioEstimado × porcentaje / 100`.
  - Porcentaje de ingresos dinámico: `ingresos del mes × porcentaje / 100`.
- **Cálculo de progreso**:
  - Ahorro: progreso = ahorro del mes; se muestra % completo y "Meta alcanzada" si ahorro ≥ objetivo.
  - Límite por categoría: progreso = neto de la categoría vs objetivo; se marca rojo al exceder y muestra límite, gasto actual y excedente.
  - Límite general: progreso = gasto neto del mes vs objetivo, con barra de 4 zonas (verde 0–49 %, amarillo 50–75 %, naranja 76–99 %, rojo ≥ 100 %).
- Una meta aplica sólo a los meses listados en `meses`. **No pueden existir dos metas del mismo tipo con meses solapados**: el formulario detecta el conflicto y pregunta si se reemplaza la anterior.
- **Nota verificada**: la edición de una meta se implementa borrando y recreando la meta (no existe endpoint de actualización).

### 4.7 Ritmo de gasto (burn rate)

- Compara el gasto acumulado del día actual del mes en curso contra el promedio del (los) mes(es) anterior(es).
- La interfaz usa la comparación contra el mes previo; la API admite 1, 3, 6 o 12 meses históricos.
- Devuelve un indicador textual ("+N% vs promedio", "-N% vs promedio", "Igual al promedio") y un gráfico de líneas: acumulado del mes actual, promedio histórico y línea vertical "Hoy".
- El acumulado diario considera gastos positivos y reembolsos negativos.

### 4.8 Tendencias

- Serie mensual entre un mes inicial y uno final (la UI ofrece períodos de 3, 6 o 12 meses terminando en el mes actual).
- Por mes entrega ingresos (con desglose A/B y porcentajes), IVA acumulado, gastos, reembolsos, gasto neto, ahorro y desglose por categoría.
- Opcionalmente filtra la evolución de una única categoría (gastos/reembolsos/neto por mes).

### 4.9 Otras reglas de validación

- Montos siempre positivos y redondeados a 2 decimales.
- Gastos y reembolsos exigen categoría; los ingresos no la usan.
- Importes A/B solo válidos para ingresos Mixto; IVA solo para ingresos.
- El título es opcional (si se omite, se copia el nombre de la categoría).
- Una categoría no puede borrarse si tiene transacciones asociadas.
- Una categoría no puede ser padre de sí misma ni convertirse en subcategoría si ya tiene subcategorías.

---

## 5. Módulos y pantallas

La navegación es por hash dentro de la SPA. La **barra de navegación inferior** (visible en todas las pantallas autenticadas) ofrece: **Inicio, Resumen, Categorías, Metas, Estadísticas y Perfil**. Los selectores de mes permiten navegar a **meses futuros** en Inicio, Resumen y Estadísticas (para prever gastos recurrentes).

### 5.1 Login y registro (pantalla pública)

**Objetivo**: autenticar o crear la cuenta; punto de entrada de la app.

- **Iniciar sesión** por **nombre de usuario** y contraseña.
- **Registrarse** con nombre de usuario, email y contraseña (mínimo 6 caracteres). El registro inicia sesión automáticamente.
- **Recuperar contraseña**: modal que pide el email; envía un enlace de restablecimiento por correo (válido 1 hora). La respuesta es idéntica exista o no la cuenta (no revela usuarios registrados).
- **Pantalla de restablecimiento** (`#/reset-password?token=...`): ingresa la nueva contraseña.
- **Desplegable de versión** con el changelog histórico del producto.
- **Botón "Limpiar caché y recargar"**: borra cachés del service worker, desregistra el SW y limpia almacenamiento local; útil ante versiones estancadas.

### 5.2 Inicio (Home)

**Objetivo**: visión diaria del mes seleccionado con las acciones más frecuentes.

- **Selector de mes** (atrás/adelante, admite meses futuros).
- **Tarjetas de estadísticas**: Ingresos, Gastos (netos), Ahorro (con signo y color según sea positivo o negativo).
- **Botón de ojo**: oculta/muestra Ingresos y Ahorro (preferencia recordada en `localStorage`; no recarga la página).
- **Lista de transacciones del mes**, agrupadas por día, con icono/color según tipo (gasto, ingreso, reembolso) y clasificación para gastos (Fijo/Variable).
- **Botón "Filtrar"**: abre modal de filtros — tipo, categoría/subcategoría, clasificación, texto libre en el título, monto mínimo/máximo y rango de fechas. Con filtros activos el botón muestra "Filtrando". Botón "Limpiar" para resetear.
- **Click en una transacción**: abre modal con sus datos y acciones **Editar** (abre el formulario precargado) o **Eliminar**.
- **Botón flotante "+"** (FAB): abre el formulario de nueva transacción (ver 5.8).

### 5.3 Resumen

**Objetivo**: análisis completo del mes elegido.

- **Selector de mes** (admite meses futuros).
- **Tarjetas**: Ingresos, Gastos (netos), Ahorro.
- **Progreso de metas activas del mes** (ahorro, límite por categoría, límite general), con barras de progreso y detalle de excedente cuando corresponde.
- **Ritmo de gasto (burn rate)**: indicador vs el promedio del mes anterior + gráfico de líneas acumuladas.
- **Distribución de gastos**: gráfico de dona por categorías padre (con total en el centro) y leyenda con montos.
- **Desglose por categoría**: filas con barra proporcional por categoría (las subcategorías anidadas bajo su padre, que suma los montos de sus hijas) y porcentaje sobre el gasto neto del mes.
- **Fijo vs Variable**: gráfico de dona y porcentajes de gastos fijos y variables.
- **Ingresos A vs B**: gráfico de dona con el desglose y porcentajes.
- **IVA acumulado**: insignia al final de la página.

### 5.4 Estadísticas

**Objetivo**: evolución mensual y tendencias multi-mes.

- **Selector de mes** (admite meses futuros): resumen del mes — gráfico de barras (Gastos, Ingresos, Reembolsos), dato de Ahorro, dona de distribución por categoría y leyenda.
- **Selector de período** para tendencias: 3, 6 o 12 meses (termina en el mes actual).
- **Filtro por categoría**: botones "Todas" + categorías; filtra la evolución.
- **Gráficos de tendencias**:
  - Evolución del ahorro (línea).
  - Evolución por categoría (líneas, gastos netos por mes).
  - Evolución porcentual A vs B (líneas de porcentajes).
  - IVA acumulado por mes (barras).
- Al cambiar período o categoría, la página **conserva la posición del scroll**.

### 5.5 Metas

**Objetivo**: administrar los objetivos financieros mensuales.

- Lista de tarjetas de metas con: tipo ("Meta de ahorro mensual", "Límite de gasto — [categoría]", "Límite de gasto general"), método de cálculo (monto €/mes, % del salario, % de ingresos) y rango de meses activos.
- Botones de **editar** y **eliminar** por meta.
- **"Crear nueva meta"**: modal con:
  - Tipo de meta; si es límite por categoría, selector jerárquico de categoría/subcategoría.
  - Método de cálculo (monto fijo, % salario con salario estimado, % de ingresos dinámico).
  - Período: mes único o rango de meses (hasta incluido el mes de fin).
  - Detección de conflicto con metas existentes del mismo tipo y meses solapados, con confirmación para reemplazar.
- Editar equivale a borrar y recrear la meta con los nuevos valores.

### 5.6 Categorías

**Objetivo**: administrar la taxonomía propia del usuario.

- Lista jerárquica (categorías padre con sus subcategorías indentadas, indicador con el total de subcategorías y etiqueta del padre en cada hija).
- **Crear categoría**: nombre, categoría padre opcional, color de una paleta fija de 12 colores. También se puede añadir subcategoría desde el botón "➕" de una categoría padre.
- **Editar** nombre, color y padre.
- **Eliminar**: confirmación previa; el servidor la rechaza (409) si la categoría tiene transacciones asociadas.
- Nota: existe un endpoint API de reordenamiento (`PATCH /categories/reorder`), pero actualmente **no hay interfaz que lo use**.

### 5.7 Perfil

**Objetivo**: datos personales, foto y acciones sensibles de la cuenta.

- **Foto de perfil**: avatar con inicial si no hay foto; "Cambiar foto" (selecciona imagen, la recorta a cuadrado 200×200 y la sube como data URL JPEG; límite cliente 2 MB, límite servidor 500 KB) y "Eliminar foto". La foto persiste en el servidor (no en el navegador).
- **Datos de la cuenta**: nombre de usuario y email.
- **"Acciones de cuenta"** (modal):
  - **Cambiar email**: pide el nuevo email y la contraseña actual como confirmación.
  - **Cambiar contraseña**: pide contraseña actual, nueva (mínimo 6) y repetición.
  - **Eliminar mi cuenta**: requiere escribir "ELIMINAR" como confirmación; es irreversible y borra la cuenta y todos sus datos (transacciones, categorías y metas).
- **Cerrar sesión**.

### 5.8 Formulario de transacción (modal transversal)

Usado desde Inicio (nuevo/editar) y disponible en el mes que se esté viendo:

- Selector de **tipo**: Gasto, Ingreso o Reembolso (los campos se adaptan al tipo).
- **Categoría** (gastos y reembolsos; selector jerárquico), **Título opcional**, **Monto (€)**, **Fecha** (por defecto el día actual).
- Gasto: **Clasificación Fijo/Variable** y opción **Recurrente** con frecuencia (mensual/bimensual/trimestral/semestral/anual) y **fecha fin** o **Indeterminado**.
- Ingreso: **clasificación A / B / Mixto**, desglose A+B en Mixto (B se autocompleta con el saldo) y campo opcional **IVA (%)** (visible para A y Mixto).
- En edición, los datos se precargan; los campos no modificados se conservan. Editar una instancia recurrente edita la transacción original.

---

## 6. Autenticación y seguridad funcional

| Aspecto | Comportamiento verificado |
|---|---|
| **Registro** | Nombre de usuario único y email único (normalizado a minúsculas), contraseña mínima 6 caracteres, email con formato válido. Contraseña hasheada con **bcrypt (12 rondas)**. El registro inicia sesión |
| **Login** | **Por nombre de usuario** + contraseña; respuesta genérica "Credenciales inválidas" si el usuario no existe o la contraseña es incorrecta |
| **Sesión** | Cookie de sesión `httpOnly`, `SameSite=Lax`, duración 7 días; `Secure` en producción (HTTPS). Estado actual: almacenada en memoria del proceso |
| **Cierre de sesión** | Destruye la sesión y elimina la cookie |
| **Recuperación de contraseña** | Solicitud por email → token aleatorio de 256 bits (hex 64) con **validez de 1 hora**, enviado por correo con enlace `/#/reset-password?token=...`. Respuesta neutra si el email no existe. Token de un solo uso: se invalida al usarse |
| **Cambio de contraseña** | Exige la contraseña actual; nueva con mínimo 6 caracteres, hasheada de nuevo |
| **Cambio de email** | Exige la contraseña actual como confirmación; rechaza emails ya usados por otra cuenta |
| **Foto de perfil** | Solo data URLs `data:image/...`, tamaño máximo 500 KB en servidor |
| **Borrado de cuenta** | `DELETE /api/auth/account`: elimina el usuario y **toda su carpeta de datos**, y cierra la sesión |
| **Aislamiento** | Todas las rutas de datos exigen sesión (`requireAuth`); cada consulta se filtra por el id del usuario de la sesión |

---

## 7. PWA (instalación y uso offline)

- **Instalable**: manifiesto con `display: standalone`, orientación retrato, tema oscuro `#1a1a2e` e iconos 192×192 y 512×512.
- **Cache del service worker** (versión actual `selimsystem-v13`):
  - **Precache** en la instalación: HTML, CSS, JS, manifiesto, iconos y versión.
  - **Entrega cache-first** para assets estáticos; cuando no hay cache, descarga y guarda.
  - **API**: siempre intenta red; si no hay conexión responde `503 {"error":"Sin conexión"}` (el shell funciona offline, los datos requieren conexión).
- **Actualización de versión**: el SW usa `skipWaiting` y `clients.claim`; al registrarse, la app recarga automáticamente cuando un SW nuevo toma control. En la pantalla de login hay un botón "Limpiar caché y recargar" para forzar la actualización manualmente.
- **Versión visible**: `public/version.json`, mostrada en el pie del login con changelog desplegable.

---

## 8. Requisitos no funcionales (resumen breve)

| Ámbito | Estado verificado |
|---|---|
| **Multiusuario** | Cuentas independientes con datos aislados por carpeta de usuario |
| **Persistencia** | Archivos JSON en volumen persistente de Fly.io (`/data`, volumen `selimsystem_data`). Escritura atómica (archivo temporal + renombrado). **El backup semanal programado existe en código pero no está activado** (ver sección 9) |
| **HTTPS** | Forzado en producción vía Fly.io (`force_https = true`) |
| **Seguridad base** | Helmet (CSP deshabilitada), cookies `httpOnly`/`SameSite`, contraseñas bcrypt, CORS restringido al dominio de la app |
| **Idioma** | Interfaz íntegramente en español (con algunas expresiones rioplatenses informales en textos de la UI; ver sección 9) |
| **Moneda y formatos** | Euro (€); fechas en formato español; montos con hasta 2 decimales |
| **Despliegue** | GitHub Actions: tests unitarios → tests E2E → bump de versión y deploy a Fly.io solo si todo pasa. Health check `GET /health` cada 10 s. Documentación del flujo CI/CD: `presentacion-flujo-ia.md` |
| **Tests** | Unitarios Jest + Supertest (rutas, middleware, DB, utilidades) y suite E2E Playwright/Cucumber en `./e2e` (UI + API) |

---

## 9. Fuera de alcance y deudas conocidas

Todo lo siguiente está **verificado en el código actual**:

1. **Usuarios nuevos sin categorías**: `src/db/seed.js` define categorías sugeridas pero su función **no se invoca**; no existe alta automática de categorías (el CHANGELOG 1.1.0 confirma el cambio).
2. **Backup semanal inactivo**: `src/services/cron.js` define un job de backup (domingos 03:00, zona `America/Argentina/Buenos_Aires`, conserva las últimas 4 copias en `backups/`), pero `startCronJobs` **no se llama** desde el arranque del servidor; hoy no se generan copias automáticas.
3. **Recordatorio diario por email**: `sendDailyReminder` está implementado pero sin invocar desde ningún flujo.
4. **Sesiones en memoria**: `connect-loki` figura como dependencia y el CHANGELOG 1.5.2 menciona "sesiones persistentes en disco", pero el código no configura ningún store: las sesiones viven en memoria y un reinicio del servidor las invalida.
5. **Desincronización de versión**: `package.json` dice 1.11.9, pero `public/version.json`, el CHANGELOG y el valor por defecto del pie de login muestran 1.11.2.
6. **Secreto de sesión versionado**: el `SESSION_SECRET` de producción está en texto plano en `fly.toml` (archivo versionado). Se recomienda rotarlo a un secreto gestionado de Fly.io.
7. **Configuración sin uso**: bloque `onesignal` en `src/config.js` sin consumidores.
8. **Endpoints sin interfaz**: `PATCH /categories/reorder` y `GET /transactions/recurring-total` existen en la API pero ninguna pantalla los utiliza hoy.
9. **Edición de metas por borrado+recreación**: no hay endpoint de actualización de metas; la edición en la UI borra y recrea.
10. **Registro de IVA**: el IVA es un dato informativo declarado por el usuario; la aplicación no emite facturas ni gestiona obligaciones fiscales.
11. **Fuera de alcance** (intencional): conexión bancaria, multiusuario compartido, roles, notificaciones push, apps nativas.

---

## Fuente

Este documento fue generado mediante **verificación directa del código del repositorio** (rama `master`): rutas del backend (`src/routes/*`, `src/db/*`, `src/services/*`, `src/middleware/*`, `src/utils/*`), frontend (`public/index.html`, `public/js/pages/*`, `public/js/components/*`, `public/js/api.js`, `public/js/router.js`), PWA (`public/manifest.json`, `public/sw.js`, `public/version.json`), despliegue (`fly.toml`, `Dockerfile`, `.github/workflows/fly-deploy.yml`), `package.json`, `README.md`, `CHANGELOG.md` e historial de `git log`. Ninguna funcionalidad fue inferida: todo lo descrito se verificó en el código, y las discrepancias detectadas se documentan en la sección 9.
