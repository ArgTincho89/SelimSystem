# SelimSystem — Sistema de diseño

Documento de sistema de diseño de SelimSystem, **reconstruido por lectura directa del código** del repositorio (rama `master`). Describe tokens, componentes, layouts, gráficos, iconografía, motion, accesibilidad y el contrato de implementación necesarios para reproducir la interfaz actual en estructura, tokens y comportamiento, partiendo solo del documento funcional (`docs/DOCUMENTO-FUNCIONAL.md`) más este documento.

> **Cómo leer este documento.** Cada valor, clase y breakpoint citado existe en el código. Cuando algo es una **convención inferida** (por ejemplo, un espaciado que se repite sin ser token, o una regla deducida del uso repetido) se marca explícitamente con la etiqueta **[inferencia]**. Las inconsistencias detectadas se agrupan en la sección 12, **Deudas y riesgos del sistema actual**.

---

## 1. Principios y alcance

SelimSystem es una PWA de finanzas personales, monolingüe en español, multiusuario y con prioridad de uso móvil. La interfaz se implementa en JavaScript vanilla (sin framework), CSS plano con custom properties (sin Tailwind ni preprocesador) y gráficos en `<canvas>` dibujados a mano. Estas restricciones técnicas definen el estilo de la interfaz.

Criterios de diseño deducidos del código:

| Criterio | Evidencia en el código |
|---|---|
| **Tema único oscuro** | No hay selector de tema, ni `prefers-color-scheme`, ni clases de tema. Todas las variables de color son oscuras y se declaran una sola vez en `:root` (`public/css/variables.css`). |
| **Mobile-first** | `public/index.html` fija `viewport` sin ancho de escritorio; la navegación principal es una barra inferior fija; el layout base está limitado a `max-width: 600px` centrado (`#page-content` en `base.css`). |
| **Densidad media, orientada a tarjetas** | El contenido se organiza en tarjetas (`.card`, `.stat-card`, `.chart-container`, `.summary-section`, `.goal-card`) con separación de `var(--space-lg)` (24px) o `var(--space-md)` (16px). |
| **Jerarquía por color de dominio** | Los colores de ingreso/gasto/reembolso tienen tokens propios (`--income-color`, `--expense-color`, `--refund-color`) reutilizados en tarjetas, listas y gráficos. |
| **Idioma español, moneda euro** | Toda la copia de interfaz es española; los importes se formatean con sufijo `€` y sin espacio (`formatearEuro` en `public/js/utils/format.js`). |
| **Meses capitalizados** | `formatMonth` y `formatMonthLabel` fuerzan mayúscula inicial ("Agosto 2026"). |
| **Doble experiencia (móvil / escritorio)** | No es un breakpoint responsive clásico: es un **modo de experiencia** persistido en `localStorage` (`pate_experience`) que agrega la clase `desktop-mode` al `<body>`. Ver sección 5. |
| **Sin sistema de iconos vectorial** | La iconografía mezcla **SVG inline** (navbar, acciones de escritorio, formularios puntuales) y **emoji** (listas de categorías, botones de acción, estados vacíos). No existe librería de iconos ni sprite. Ver sección 8. |
| **Gráficos propios** | No se usa Chart.js ni ninguna librería: `public/js/components/charts.js` implementa dona, barras y líneas sobre `<canvas>` 2D. Ver sección 7. |

**Alcance del documento.** Cubre la capa visual y de interacción del cliente (`public/`). No cubre la lógica de negocio ni el cálculo de datos (que vive en el servidor y se documenta en el documento funcional). Las reglas de negocio (por ejemplo, "los reembolsos no son ingresos") no se repiten aquí salvo cuando afectan directamente un elemento visual.

### Notas de inferencia

- **[inferencia] Sistema de espaciado implícito.** Existe un set de tokens de espaciado (`--space-*`), pero en el código se usan además múltiplos directos y valores sueltos (`4px`, `6px`, `8px`, `10px`, `12px`, `16px`) en estilos inline y reglas puntuales. No hay un ritmo de 8px estricto declarado; los valores se eligen caso por caso.
- **[inferencia] Convención de nombres de clase.** No hay documentación de convenciones, pero el patrón observado es BEM-ligero con prefijo de bloque y guiones: `bloque`, `bloque-elemento` (`.stat-card`, `.stat-value`, `.goal-progress-fill`), sufijos de estado en minúscula (`.active`, `.selected`, `.complete`, `.over-limit`) y modificadores de variante (`.btn-primary`, `.btn-ghost`, `.category-child`).
- **[inferencia] El "tema" no está encapsulado.** Los valores de color de dominio se repiten tanto como variable CSS como literal (`#4ECDC4`, `#FF6B6B`, `#FFE66D` aparecen hardcodeados en JS). La convención "usar tokens" es parcial.

---

## 2. Tema y modo

- **Tema:** único, oscuro. No existe modo claro ni conmutador.
- **Mecanismo:** las variables se declaran en el selector `:root` de `public/css/variables.css`, que se carga **primero** en `public/index.html` (antes de `base.css`, `components.css` y `pages.css`). No hay clase de tema ni atributo `data-theme`.
- **`theme-color`:** `#1a1a2e` (igual a `--bg-primary`), declarado en `<meta name="theme-color">` de `public/index.html` y en `theme_color` de `public/manifest.json`.
- **Status bar iOS:** `apple-mobile-web-app-status-bar-style = black-translucent`.
- **Color de fondo PWA:** `background_color` del manifiesto = `#1a1a2e`.
- **Contraste:** el par base texto/fondo (`--text-primary` sobre `--bg-primary`) es de **13.92:1** (AAA). El par de texto secundario baja a **6.17:1** sobre `--bg-secondary` (AA). El texto atenuado (`--text-muted`) cae a **3.08:1** sobre `--bg-secondary` (ver hallazgos en sección 11). Ver la tabla completa de contrastes en la sección 11.
- **Modo de experiencia (no confundir con tema):** el usuario elige entre "Móvil" y "Escritorio" desde la pantalla de login. Se guarda en `localStorage` bajo `pate_experience` (`'mobile'` por defecto). El modo escritorio no cambia el tema, cambia el layout: agrega `desktop-mode` al `<body>` y, en la Home, `desktop-home` (`App.applyExperience`, `Router.handleRoute`).

```js
// public/js/app.js
applyExperience() {
  document.body.classList.toggle('desktop-mode', this.isDesktop());
}
```

---

## 3. Tokens de diseño

Todos los tokens son custom properties CSS declaradas en `:root` (`public/css/variables.css`). Esta tabla es exhaustiva: incluye el 100% de las variables definidas.

### 3.1 Color — fondos y superficies

| Token | Valor exacto | Uso previsto |
|---|---|---|
| `--bg-primary` | `#1a1a2e` | Fondo de la aplicación (`body`), fondo de `#page-content`, color de texto sobre botones de acento. |
| `--bg-secondary` | `#16213e` | Superficie principal de tarjetas: `.card`, `.stat-card`, `.chart-container`, `.summary-section`, `.goal-card`, `.goal-progress-card`, `.navbar`, `.modal` (vía `.card`). |
| `--bg-card` | `#0f3460` | Fondo del toast (`.toast`). Es el único uso directo de este token. |
| `--bg-input` | `#1a1a3e` | Fondo de campos (`.form-control`), riel de barras de progreso (`.goal-progress-track`), riel de barras de categoría (`.category-bar-track`), separador de `.goal-exceeded-over`. |
| `--bg-hover` | `#1a2744` | Fondo de hover para `.btn-ghost`, `.eye-toggle-btn`; fondo activo de `.transaction-item` (`:active`); fondo de chips de clasificación inline. |

### 3.2 Color — textos

| Token | Valor exacto | Uso previsto |
|---|---|---|
| `--text-primary` | `#e8e8e8` | Texto por defecto del `body`; títulos, valores, contenido. |
| `--text-secondary` | `#a0a0b0` | Etiquetas de formulario, subtítulos, `.stat-label`, `.summary-label`, texto de `.btn-ghost`. |
| `--text-muted` | `#6c6c7c` | Texto atenuado: `.transaction-category`, `.transaction-date`, `.day-header`, placeholders, iconos de acción, texto de `.empty-state`. |

### 3.3 Color — acento y estados

| Token | Valor exacto | Uso previsto |
|---|---|---|
| `--accent` | `#4ECDC4` | Color de marca. Botones primarios, enlaces, navbar activa, foco (`:focus-visible`), relleno de progreso, series de gráfico, `.fv-legend` (variable). |
| `--accent-hover` | `#3dbdb5` | Hover de `.btn-primary` y de enlaces. |
| `--accent-light` | `rgba(78, 205, 196, 0.15)` | Fondo de estados seleccionados (`.type-btn.active` genérico, `.period-btn.active`, `.goal-duration-tab.active`, `.experience-option[aria-pressed="true"]`, `.desktop-filter-btn.active`) y anillo de foco de `.form-control`. |
| `--danger` | `#FF6B6B` | Botones peligrosos, exceso de límite, ahorro negativo, `.toast.error`, `.icon-btn.danger`. |
| `--danger-hover` | `#e55a5a` | Hover de `.btn-danger`. |
| `--success` | `#4ECDC4` | Meta de ahorro alcanzada, `.toast.success`, `.goal-progress-fill.complete`. **Idéntico a `--accent`.** |
| `--warning` | `#FFE66D` | Estrella de favoritos (`.desktop-favorite-toggle.selected`, `.analytics-favorite-toggle.selected`); coincide con `--refund-color`. |

### 3.4 Color — dominio financiero

| Token | Valor exacto | Uso previsto |
|---|---|---|
| `--income-color` | `#4ECDC4` | Ingresos: icono de transacción, `.transaction-amount.income`, `.type-btn[data-type="income"].active`, punto de leyenda. |
| `--expense-color` | `#FF6B6B` | Gastos: `.transaction-amount.expense`, `.type-btn[data-type="expense"].active`, punto de leyenda. |
| `--refund-color` | `#FFE66D` | Reembolsos: `.transaction-amount.refund`, `.type-btn[data-type="refund"].active`, punto de leyenda. |

> Los tres colores de dominio se **repiten como literales** en JavaScript (`#FF6B6B`, `#4ECDC4`, `#FFE66D`) para series de gráficos y leyendas. Ver deudas en sección 12.

### 3.5 Color — bordes y sombras

| Token | Valor exacto | Uso previsto |
|---|---|---|
| `--border` | `#2a2a4a` | Bordes de tarjetas, inputs, navbar, separadores (`border-bottom`), línea de grilla de gráficos (replicada como literal `#2a2a4a` en canvas). |
| `--shadow` | `0 2px 8px rgba(0, 0, 0, 0.3)` | Sombra base de `.card`. |
| `--shadow-lg` | `0 4px 16px rgba(0, 0, 0, 0.4)` | Sombra elevada: `.login-card`, `.fab`, `.toast`. |

### 3.6 Radios

| Token | Valor exacto | Uso previsto |
|---|---|---|
| `--radius-sm` | `6px` | Radios pequeños internos: `.version-toggle`, botones de favoritos de escritorio, `.chart-tooltip`. |
| `--radius` | `10px` | Radio por defecto: botones, inputs, tarjetas de transacción, `.modal` interno, chips, `.type-btn`. |
| `--radius-lg` | `16px` | Radio de contenedores: `.card`, `.stat-card`, `.chart-container`, `.summary-section`, `.goal-card`, `.login-card`, `.modal`. |
| `--radius-full` | `50%` | Elementos circulares: `.fab`, `.transaction-icon`, `.category-dot`, `.color-option`, `.avatar-img`, `.avatar-placeholder`, puntos de leyenda. |

> **[inferencia]** El nombre `--radius-full` sugiere "radio completo/píldora" pero su valor es `50%`, por lo que solo sirve para círculos, no para píldoras (las píldoras usan radios numéricos: `border-radius: 20px` en `.trend-filter-btn` y `10px`/`5px`/`4px` en chips y barras).

### 3.7 Espaciado

| Token | Valor exacto | Uso previsto |
|---|---|---|
| `--space-xs` | `4px` | Separaciones mínimas (gap de navbar-item, margen bajo labels, padding vertical de filas). |
| `--space-sm` | `8px` | Gaps de botones y grupos, padding compacto, separadores de fila. |
| `--space-md` | `16px` | Padding de tarjetas y de `#page-content`, separación entre bloques. |
| `--space-lg` | `24px` | Padding de tarjetas grandes (`.card`, `.chart-container`), separación entre secciones. |
| `--space-xl` | `32px` | Padding de `.empty-state` y `.loading`, padding de `.login-card`, padding inferior de `#page-content` en escritorio. |

### 3.8 Tipografía (tamaños)

Ver detalle de familias y jerarquía en la sección 4.

| Token | Valor exacto (≈px a 16px base) | Uso previsto |
|---|---|---|
| `--font-xs` | `0.7rem` (≈11.2px) | `.stat-label`, fecha de changelog, porcentaje de leyenda `.fv-legend-pct`, textos de navbar en escritorio, badges pequeños. |
| `--font-sm` | `0.85rem` (≈13.6px) | Texto secundario, etiquetas de formulario, `.transaction-category`, `.transaction-date`, botones `.btn-sm`, subtítulos de tarjeta. |
| `--font-base` | `1rem` (16px) | Texto por defecto, `.transaction-title`, `.transaction-amount`, botones `.btn`. |
| `--font-md` | `1.1rem` (≈17.6px) | Título de gráfico (`.chart-title`), iconos de transacción, `.icon-btn`. |
| `--font-lg` | `1.3rem` (≈20.8px) | `.section-title`, `.modal-title`, título de `.month-nav` (con clamp), flechas de mes. |
| `--font-xl` | `1.6rem` (≈25.6px) | `.page-title`, `.login-logo h1` (en realidad `--font-2xl`), botón de cierre de modal. |
| `--font-2xl` | `2rem` (32px) | Título de login, `.avatar-placeholder`, techo de `.stat-value` en escritorio. |

### 3.9 Dimensiones y layout

| Token | Valor exacto | Uso previsto |
|---|---|---|
| `--navbar-height` | `64px` | Altura de la barra inferior y del padding inferior reservado de `#page-content`. |
| `--desktop-nav-width` | `88px` | Ancho de la barra lateral en modo escritorio. |
| `--header-height` | `56px` | **[sin uso]** Declarado pero no referenciado en ningún CSS ni JS. |
| `--touch-min` | `44px` | Altura mínima táctil aplicada a inputs, botones, filas de listas e iconos. |
| `--safe-bottom` | `env(safe-area-inset-bottom, 0px)` | Área segura inferior (notch/gestos iOS) sumada a navbar y FAB. |

### 3.10 Transición

| Token | Valor exacto | Uso previsto |
|---|---|---|
| `--transition` | `0.2s ease` | Transición estándar para `all` en botones, colores, bordes, fondos. |

### 3.11 Tokens de dominio en JS (no son custom properties)

Estos valores viven en JavaScript y actúan como "tokens" de facto para datos y gráficos:

| Concepto | Valor | Fuente |
|---|---|---|
| Paleta de categorías | `#FF6B6B`, `#4ECDC4`, `#FFE66D`, `#95E1D3`, `#AA96DA`, `#F38181`, `#A8D8EA`, `#FFA07A`, `#DDA0DD`, `#98D8C8`, `#F7DC6F`, `#85C1E9` | `CategoriesPage.createColorPicker()` (`public/js/pages/categories.js`) |
| Color de respaldo de categoría | `#6c6c7c` (= `--text-muted`) | Usado cuando una categoría no tiene color asignado, en `summary.js`, `trends.js`. |
| Zonas de la barra de límite general | verde `--success`, amarillo `#F0AD4E`, naranja `#E8740E`, rojo `--danger` | `.goal-progress-fill.zone-*` (`public/css/components.css`) |
| Colores de burn rate | actual `#4ECDC4`, promedio `#6c6c7c`, marca "Hoy" `#FF6B6B` | `SummaryPage.drawBurnRateChart` + `.burn-legend-dot-*` |
| Colores de series de resumen | gastos `#FF6B6B`, ingresos `#4ECDC4`, reembolsos `#FFE66D`, IVA `#FFE66D` | `trends.js`, `summary.js` |

---

## 4. Tipografía

### 4.1 Familia

- **Familia de la interfaz:** system stack, declarada en `body` (`public/css/base.css`):
  ```css
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  ```
  No se cargan webfonts (no hay `<link>` a Google Fonts ni `@font-face`; el service worker no precachea fuentes).
- **Familia de gráficos:** los canvas usan un stack **propio y reducido**, hardcodeado en cada dibujo: `-apple-system, sans-serif`. No incluye `BlinkMacSystemFont`, `Segoe UI` ni `Roboto`.
- **Suavizado:** `-webkit-font-smoothing: antialiased` en `body`.
- **Tamaño raíz:** `html { font-size: 16px }` con `-webkit-text-size-adjust: 100%`.
- **Line-height base:** `1.5` en `body`.

### 4.2 Escala tipográfica y jerarquía por pantalla

| Rol visual | Tamaño | Peso | Extra |
|---|---|---|---|
| Marca (login) | `var(--font-2xl)` | 700 | color `--accent` |
| Título de página (`.page-title`) | `var(--font-xl)` | 700 | — |
| Título de sección (`.section-title`) | `var(--font-lg)` | 700 | `border-bottom` |
| Título de modal (`.modal-title` y `h3` de modal) | `var(--font-lg)` | 700 | — |
| Título de gráfico (`.chart-title`) | `var(--font-md)` | 600 | — |
| Título de tarjeta de meta (`.goal-card-title` / `.goal-progress-label`) | `var(--font-base)` / `var(--font-sm)` | 700 / 600 | — |
| Valor de estadística (`.stat-value`) móvil | `clamp(1.3rem, 5vw, var(--font-2xl))` | 700 | color según métrica; `text-overflow: ellipsis` |
| Valor de estadística escritorio | `clamp(1.25rem, 2vw, 1.8rem)` | 700 | `font-variant-numeric: tabular-nums` |
| Etiqueta de estadística (`.stat-label`) móvil | `var(--font-xs)` | 400 | uppercase, `letter-spacing: 0.5px` |
| Etiqueta de estadística escritorio | `var(--font-sm)` | 600 | `letter-spacing: 0.04em` |
| Título de transacción (`.transaction-title`) | `var(--font-base)` | 600 | `nowrap` + ellipsis |
| Monto de transacción (`.transaction-amount`) | `var(--font-base)` | 700 | color de tipo |
| Texto secundario (`.transaction-category`, `.transaction-date`) | `var(--font-sm)` | 400 | `--text-muted` |
| Encabezado de día (`.day-header`) | `var(--font-sm)` | 600 | uppercase, `border-bottom` |
| Etiqueta de formulario | `var(--font-sm)` | 500 | `--text-secondary` |
| Input/select (`.form-control`) | `16px` **fijo** | 400 | `font-size: 16px` literal (evita zoom iOS) |
| Botón (`.btn`) | `var(--font-base)` | 600 | — |
| Botón pequeño (`.btn-sm`) | `var(--font-sm)` | 600 | — |
| Navbar (`.navbar-item`) | `var(--font-xs)` | 400 | 0.65rem en escritorio |

### 4.3 Transformaciones de texto

- **Uppercase:** `.stat-label` y `.day-header` usan `text-transform: uppercase`.
- **Letter-spacing:** `0.5px` en `.stat-label` móvil; `0.04em` en la etiqueta de escritorio.
- **Números tabulares:** `font-variant-numeric: tabular-nums` en valores de tarjetas de escritorio y montos de transacción de escritorio.
- **Capitalización de meses:** forzada por código (ver 4.4).

### 4.4 Formato de números, moneda y fechas (funciones reales)

Todas viven en `public/js/utils/format.js`:

| Función | Comportamiento exacto |
|---|---|
| `formatearEuro(cantidad)` | Usa `Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })` sobre `Math.abs(cantidad)` y agrega el signo y el sufijo: `` `${cantidad < 0 ? '-' : ''}${formatted}€` ``. Ejemplos: `1234.5` → `1.234,5€`; `-10` → `-10€`; `0` → `0€`. **Sin espacio** antes del `€`. Separador de miles `.` y decimal `,` (locale `es-AR`). |
| `parseFecha(fechaStr)` | Convierte `YYYY-MM-DD` a `Date` local (`new Date(y, m-1, d)`). |
| `formatFechaLarga(fechaStr)` | `toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })`. Ej.: "martes, 12 de agosto". |
| `formatFechaCorta(fechaStr)` | `toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })`. Ej.: "12 ago". |
| `formatMonth(monthStr)` | Mes + año con **mayúscula inicial**: `toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })` y `charAt(0).toUpperCase()`. Ej.: "Agosto 2026". |
| `formatMonthLabel(monthStr)` | Igual que `formatMonth` pero explícito: "Agosto 2026". |
| `getCurrentMonth()` | Devuelve `YYYY-MM` del mes actual. |
| `getToday()` | Devuelve `YYYY-MM-DD` de hoy. |
| `addMonths(monthStr, delta)` | Suma/resta meses devolviendo `YYYY-MM`. |
| `groupTransactionsByDate(transactions)` | Agrupa por `fecha`, orden **descendente** por fecha (`b.localeCompare(a)`), devuelve `[{ fecha, items }]`. |

> **Nota de locale:** hay una mezcla deliberada de locales. Los **importes** usan `es-AR` (separador de miles con punto), mientras que las **fechas** usan `es-ES`. Es una inconsistencia real del código, no un error de esta transcripción.

---

## 5. Layout y responsive

### 5.1 Estructura del documento

`public/index.html` define tres nodos raíz bajo `#app`:

```html
<div id="app">
  <div id="navbar"></div>
  <main id="page-content"></main>
  <div id="modal-root"></div>
</div>
```

| Nodo | Rol | Estilo |
|---|---|---|
| `#app` | Contenedor flex column a altura completa (`100dvh`). En escritorio pasa a `display: block` con `overflow: hidden`. | base.css |
| `#navbar` | Barra de navegación (inferior en móvil, lateral en escritorio). Se rellena por JS (`App.renderNavbar`). | pages.css + base.css |
| `#page-content` | Contenido de la pantalla. `padding: var(--space-md)`, `padding-bottom` = `navbar-height + safe-bottom + space-xl`, `max-width: 600px`, centrado. | base.css |
| `#modal-root` | Anclaje de diálogos. | modal.js |

### 5.2 Comportamiento móvil

- `#page-content` limitado a `max-width: 600px`, centrado con `margin: 0 auto`, `width: 100%`.
- Barra inferior fija (`position: fixed; bottom: 0`), altura `64px + safe-area-inset-bottom`, `z-index: 100`, con `backdrop-filter: blur(10px)`.
- FAB (`+`) fijo arriba de la navbar, `bottom: navbar-height + safe-bottom + space-md`, `right: space-md`.
- Reserva de espacio inferior para no tapar contenido con la navbar.

### 5.3 Breakpoints reales

| Breakpoint | Condición | Cambios |
|---|---|---|
| `min-width: 768px` | Media query en `base.css`, `components.css` y `pages.css` | `#page-content` pasa a `padding: var(--space-lg)` (y `padding-bottom` sin safe-area); `.stats-row` pasa a `gap: var(--space-md)`; `.stat-value` a `var(--font-2xl)`; `.stat-label` a `var(--font-sm)`; los modales se centran verticalmente (`align-items: center`, `max-height: 80vh`, radio completo). |
| `max-width: 900px` | `pages.css` | Compacta el workspace de escritorio: columnas `minmax(0,·)` y `gap: var(--space-sm)`, controles de Home en una sola columna, month selector a la segunda fila, tarjetas de estadística más compactas. |
| `max-width: 820px` | `pages.css` | Compacta aún más el workspace y controles; fuerza visibilidad de los botones de favoritos; iconos y montos de transacción de escritorio más chicos. |
| `prefers-reduced-motion: reduce` | `pages.css` | Desactiva la transición de `.analytics-favorite-toggle` y `.desktop-favorite-toggle`. |

> **Importante:** el **modo escritorio no se activa por media query**. Es un estado explícito (`body.desktop-mode`), elegido por el usuario y persistido. En este modo la navbar se convierte en una barra lateral de `--desktop-nav-width` (88px), `#page-content` ocupa `calc(100% - 88px)` con padding `var(--space-lg) var(--space-xl)`, y `body.desktop-home` organiza la Home en dos columnas (transacciones a la izquierda, analítica a la derecha).

### 5.4 Patrones de layout por tipo de pantalla

| Pantalla | Patrón | Clases clave |
|---|---|---|
| **Login / registro / reset** | Tarjeta centrada, ancho máx. 400px, sobre fondo de app. La navbar está oculta (`navbar.style.display = 'none'`). | `.login-page`, `.login-card`, `.login-logo`, `.login-tabs`, `.login-form`, `.experience-picker`, `.version-section` |
| **Home** | Selector de mes, fila de 3 tarjetas de estadística (`grid` 3 columnas), lista de transacciones agrupada por día, FAB. | `.month-nav`, `.stats-row`, `.day-header`, `.transaction-item`, `.fab` |
| **Home (escritorio)** | Columna de controles (acciones + selector de mes centrado), fila de estadísticas, workspace de dos columnas con paneles de scroll independientes y pestañas de analítica. | `.desktop-home-stats`, `.desktop-home-controls`, `.desktop-home-workspace`, `.desktop-home-transactions`, `.desktop-home-analytics`, `.desktop-analytics-tabs` |
| **Resumen** | Secuencia vertical de bloques: stats, tarjetas de meta, burn rate, donut de categorías, desglose por categoría, fijo vs variable, A vs B, badge IVA. | `.stats-row`, `.goal-progress-card`, `.chart-container`, `.summary-section`, `.category-badge` |
| **Estadísticas** | Título, selector de mes, resumen del mes (barras + dona), divisor "Tendencias", selector de período, chips de categoría, gráficos de tendencia. | `.period-selector`, `.trend-filters`, `.trend-filter-btn`, `.chart-container` |
| **Metas** | Lista de tarjetas de meta (tipo + método + rango de meses) + botón full-width de creación. | `.goals-header`, `.goal-card`, `.goal-card-header`, `.goal-card-detail`, `.goal-card-range` |
| **Categorías** | Encabezado con botón "+ Nueva", lista jerárquica (padre con hijas indentadas). | `.page-header`, `.category-list`, `.category-item`, `.category-child` |
| **Perfil** | Sección de avatar + sección de datos + acciones de cuenta + cerrar sesión. | `.profile-section`, `.profile-avatar`, `.avatar-img`, `.avatar-placeholder`, `.profile-info-row` |

### 5.5 Área segura y navegación inferior

- La navbar reserva la franja segura inferior: `height: calc(var(--navbar-height) + var(--safe-bottom))` y `padding-bottom: var(--safe-bottom)`.
- El FAB y el toast también suman `--safe-bottom` a su `bottom`.
- `#page-content` compensa la navbar con `padding-bottom: calc(var(--navbar-height) + var(--safe-bottom) + var(--space-xl))` en móvil.
- `overscroll-behavior: none` en `body` y scrollbars ocultas en móvil (`::-webkit-scrollbar { display: none }` y `scrollbar-width: none`).

---

## 6. Componentes

Convenciones: "móvil" = experiencia por defecto; "escritorio" = `body.desktop-mode`. Los bloques de markup son los **mínimos reales** producidos por el código.

### 6.1 Botones

**Base (`.btn`):** `inline-flex`, centrado, `gap: var(--space-sm)`, `padding: 12px 20px`, `min-height: var(--touch-min)` (44px), sin borde, `border-radius: var(--radius)`, `font-weight: 600`, `font-size: var(--font-base)`, `transition: all var(--transition)`.

| Variante | Clases | Reglas |
|---|---|---|
| Primario | `.btn .btn-primary` | `background: var(--accent)`, `color: var(--bg-primary)`; hover `--accent-hover`. |
| Peligro | `.btn .btn-danger` | `background: var(--danger)`, `color: white`; hover `--danger-hover`. |
| Fantasma | `.btn .btn-ghost` | `background: transparent`, `color: var(--text-secondary)`, `border: 1px solid var(--border)`; hover `--bg-hover` + `--text-primary`. |
| Filtro | `.btn .btn-sm .btn-ghost .btn-filter` | Como fantasma + `border-color: var(--accent)`, `color: var(--accent)`. Con filtros activos el JS fuerza `color: var(--accent)` y el texto cambia a "Filtrando". |
| Tamaño pequeño | `.btn-sm` | `padding: 8px 14px`, `min-height: 36px`, `font-size: var(--font-sm)`. |
| Ancho completo | `.btn-full` | `width: 100%`. |

**Estados:**
- `:active`: `transform: scale(0.97)` (feedback táctil en todos los botones `.btn`).
- `:hover`: cambio de fondo/color por variante.
- `:focus-visible`: outline global de `2px solid var(--accent)` con `outline-offset: 3px` (definido en `base.css`).
- **`disabled`:** sin estilo definido (deuda, sección 12).

```html
<button class="btn btn-primary">Guardar</button>
<button class="btn btn-ghost">Cancelar</button>
<button class="btn btn-danger">Eliminar</button>
<button class="btn btn-sm btn-ghost btn-filter">Filtrar</button>
```

**Botones de icono** (sin `.btn`): `.icon-btn` (40px mín., `font-size: var(--font-md)`, color `--text-muted`, hover `--text-primary`, `.danger:hover` → `--danger`), `.modal-close` (igual pero `--text-muted`, `--font-xl`), `.month-nav button` (color `--accent`, `--font-lg`), `.eye-toggle-btn` (borde `--border`, opacidad 0.6 → 1 al hover), `.version-toggle`, `.desktop-favorite-toggle`, `.analytics-favorite-toggle`.

### 6.2 Inputs, selects y formularios

```html
<div class="form-group">
  <label>Monto (€)</label>
  <input class="form-control" type="number" step="0.01" min="0.01" placeholder="0.00">
</div>
```

| Elemento | Clases | Reglas |
|---|---|---|
| Grupo | `.form-group` | `margin-bottom: var(--space-md)`. |
| Etiqueta | `label` | `display: block`, `margin-bottom: var(--space-xs)`, `font-size: var(--font-sm)`, `color: var(--text-secondary)`, `font-weight: 500`. |
| Campo | `.form-control` | `width: 100%`, `padding: 12px 14px`, `min-height: var(--touch-min)`, `background: var(--bg-input)`, `border: 1px solid var(--border)`, `border-radius: var(--radius)`, `color: var(--text-primary)`, `font-size: 16px`, `transition: border-color var(--transition)`. |
| Select | `select.form-control` | `appearance: none` + flecha SVG embebida (`data:image/svg+xml`) en `right 12px center`, `padding-right: 36px`. El color de la flecha (`#a0a0b0`) coincide con `--text-secondary`. |
| Checkbox | `.form-checkbox` | 20×20px, `accent-color: var(--accent)`. |
| Etiqueta de checkbox | `.checkbox-label` | flex, `gap: var(--space-sm)`, `min-height: var(--touch-min)`, `font-weight: 500`. |

**Estados:**
- `:focus`: `outline: none`, `border-color: var(--accent)`, `box-shadow: 0 0 0 2px var(--accent-light)`.
- `::placeholder`: color `--text-muted`.
- **Disponibles:** `min-height: var(--touch-min)` para `input[type=text|email|password|number|date]` y `select` (definido en `base.css`).
- **`disabled`:** sin estilo propio (deuda, sección 12). En recurrencia se simula con `opacity: 0.4` inline en el input de fecha fin.

**Tipos de input usados:** `text`, `email`, `password`, `number`, `date` y `month` (este último en Metas).

**Datepickers:** no hay datepicker custom; se usan los controles nativos del navegador (`input[type="date"]` y `input[type="month"]`), estilizados solo por `.form-control`.

**Selectores jerárquicos de categoría:** `select` con opciones padre y, para hijas, prefijo textual `"  └ "` + nombre.

```html
<select class="form-control">
  <option>Supermercado</option>
  <option>  └ Verdulería</option>
</select>
```

### 6.3 Segmented control / selector de tipo

Genera un grupo de botones mutuamente excluyentes (tipo de transacción, período, duración de meta).

```html
<div class="type-selector">
  <button class="type-btn active" data-type="expense">Gasto</button>
  <button class="type-btn" data-type="income">Ingreso</button>
  <button class="type-btn" data-type="refund">Reembolso</button>
</div>
```

- `.type-selector`: `display: flex; gap: var(--space-sm)`. `.type-btn`: `flex: 1`, `padding: 10px`, `min-height: var(--touch-min)`, borde `--border`, radio `--radius`, fondo transparente, color `--text-secondary`, `font-weight: 600`.
- `.type-btn.active` genérico: borde/color `--accent`, fondo `--accent-light`.
- Variantes por tipo: `[data-type="expense"].active` → `--expense-color` + `rgba(255,107,107,0.15)`; `[data-type="income"].active` → `--income-color` + `rgba(78,205,196,0.15)`; `[data-type="refund"].active` → `--refund-color` + `rgba(255,230,109,0.15)`.

**Primos del mismo patrón:** `.period-btn` (período 3/6/12 meses), `.goal-duration-tab` (Mes único / Múltiples meses), `.login-tab` (tabs de login con `border-bottom`), `.desktop-analytics-tab` (tabs de analítica de escritorio). Todos comparten la estructura `padding: 10px`, `min-height: 44px`, `border: 1px solid var(--border)`, estado `.active` con borde/color acento y fondo `--accent-light`.

### 6.4 Chips y badges

```html
<div class="category-badge">
  <span class="category-dot" style="background:#4ECDC4"></span>
  Supermercado (120€)
</div>
```

| Clase | Reglas |
|---|---|
| `.category-badge` | `inline-flex`, `gap: 6px`, `font-size: var(--font-sm)`, `color: var(--text-secondary)`. Se usa para leyendas de gráficos, desglose e IVA. |
| `.category-dot` | `8px × 8px`, `border-radius: var(--radius-full)`, `flex-shrink: 0`. En Categorías se sobrescribe a 12×12 inline. |

Chips de filtro de categoría en Estadísticas: `.trend-filter-btn` (`padding: 8px 16px`, radio `20px`, borde `--border`, `white-space: nowrap`; `.active` → fondo `--accent`, texto `--bg-primary`) dentro de un contenedor `.trend-filters` con scroll horizontal.

### 6.5 Tarjetas

| Clase | Descripción |
|---|---|
| `.card` | Superficie genérica: `background: var(--bg-secondary)`, radio `--radius-lg`, `padding: var(--space-lg)`, `box-shadow: var(--shadow)`. Entre tarjetas: `.card + .card { margin-top: var(--space-md) }`. |
| `.stat-card` | Tarjeta de métrica: `background: var(--bg-secondary)`, radio `--radius-lg`, `padding: var(--space-md) var(--space-sm)`, centrada, `overflow: hidden`, `min-width: 0`. |
| `.stats-row` | Grid de 3 columnas `1fr` con `gap: 6px` y `margin-bottom: var(--space-lg)`. |
| `.goal-card` / `.goal-progress-card` | Tarjetas de meta (listado y progreso) con `background: var(--bg-secondary)`, radio `--radius-lg`, `padding: var(--space-lg)`. |
| `.chart-container` | Contenedor de gráfico: `background: var(--bg-secondary)`, radio `--radius-lg`, `padding: var(--space-lg)`, `margin-bottom: var(--space-lg)`. |
| `.summary-section` | Bloque de resumen con mismo tratamiento que `.chart-container`. |
| `.profile-section` | Bloque de perfil centrado. |

### 6.6 List items de transacción

```html
<div class="transaction-item">
  <div class="transaction-icon" style="background:#FF6B6B22;color:#FF6B6B">💸</div>
  <div class="transaction-info">
    <div class="transaction-title">Alquiler</div>
    <div class="transaction-category">Vivienda</div>
  </div>
  <div class="transaction-amount expense">-800€</div>
</div>
```

- `.transaction-item`: `flex`, `gap: var(--space-md)`, `padding: var(--space-md)`, `background: var(--bg-secondary)`, radio `--radius`, `min-height: var(--touch-min)`; `:active` → `background: var(--bg-hover)`. Es clickeable (JS asigna `cursor: pointer` y un handler).
- `.transaction-icon`: 40×40, círculo, `font-size: var(--font-md)`. En móvil el fondo se compone como `color + '22'` (alfa ~13%); el emoji depende del tipo: gasto `💸`, ingreso `💰`, reembolso `↩️`.
- `.transaction-info`: `flex: 1`, `min-width: 0`.
- `.transaction-title`: `font-weight: 600`, `nowrap` + ellipsis.
- `.transaction-category`: `--font-sm`, `--text-muted`. El texto cambia según tipo: ingreso → `Ingreso (A|B|Mixto)`; reembolso → `Reembolso`; gasto → nombre de la categoría o "Sin categoría".
- `.transaction-amount`: `font-weight: 700`, `nowrap`; clases `.income` / `.expense` / `.refund` aplican el token de color. Signo `+`/`-` según tipo (en escritorio se usa el signo menos tipográfico `−`).
- **Agrupación:** encabezados `.day-header` por fecha, en orden descendente.
- **Escritorio:** variante `.desktop-transaction-item` (bloque, `margin-bottom: 6px`, `padding: 10px`, fondo `rgba(255,255,255,0.025)`, `role="button"`, navegable con teclado, icono SVG en lugar de emoji).

### 6.7 Tabs

- **Login:** `.login-tabs` (flex, `border-bottom`) con `.login-tab` (flex 1, `border-bottom: 2px solid transparent`); `.active` → color y borde `--accent`. El formulario activo se controla con `.login-form.active { display: block }` (los demás `display: none`).
- **Analítica de escritorio:** `.desktop-analytics-tabs` (`role="tablist"`) con `.desktop-analytics-tab` (`role="tab"`). El estado activo se marca con `aria-selected="true"` → `border-bottom-color: var(--accent)` + color acento. Los paneles usan `.desktop-analytics-tab-panel[hidden] { display: none }`.
- **Duración de meta:** `.goal-duration-tabs` + `.goal-duration-tab` (`flex: 1`, `.active` → borde/color acento + fondo `--accent-light`).

### 6.8 Modales

Se generan con el objeto `Modal` (`public/js/components/modal.js`). **El modal no usa las clases `.modal-content`/`.modal-header`/`.modal-title`/`.modal-close` del CSS**: construye un `div.modal-overlay` con estilos inline y, dentro, un `div.card.fade-in`.

Estructura real producida:

```html
<div class="modal-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:150;padding:16px">
  <div class="card fade-in" style="width:100%;max-width:440px;max-height:90vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-size:var(--font-lg);font-weight:700">Título</h3>
      <button style="...">✕</button>
    </div>
    <!-- contenido (string o nodo) -->
    <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end"> <!-- footer --> </div>
  </div>
</div>
```

| Aspecto | Comportamiento |
|---|---|
| Backdrop | `.modal-overlay` con `background: rgba(0,0,0,0.6)` (inline), `z-index: 150`. |
| Ancho | `max-width: 440px`; `width: 100%`; `padding: 16px` en el overlay. |
| Alto | `max-height: 90vh` con `overflow-y: auto`. |
| Cierre | Botón `✕`, click en el backdrop (`e.target === overlay`) o `Modal.hide()` (vacía `#modal-root`). |
| Animación | Entrada del overlay con `.fade-in` (clase sobre el `card`); el CSS define `slideUp` para `.modal-content`, pero como no se usa esa clase, el modal entra con `fadeIn` de 0.3s. |
| Escritorio | `.modal-overlay { align-items: center }` (≥768px) y `.modal-content { border-radius: var(--radius-lg); max-height: 80vh }` (no aplicable al modal real). |

**Pie de acciones estándar:** `div` con `display: flex; gap: 8px`; layout por defecto alineado a la derecha (`justify-content: flex-end` en el footer interno de `Modal.show`), con botón fantasma "Cancelar" y botón primario/peligro de acción. En varios modales (perfil, metas) el pie se alinea a la izquierda (`justify-content` por defecto del contenedor `form`).

### 6.9 Navegación

**Barra inferior (móvil):** `.navbar` + `.navbar-item`.

```html
<button class="navbar-item" data-route="/home">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">…</svg>
  <span>Inicio</span>
</button>
```

- `.navbar`: `position: fixed; bottom: 0`, `height: calc(var(--navbar-height) + var(--safe-bottom))`, `background: var(--bg-secondary)`, `border-top: 1px solid var(--border)`, flex alrededor, `z-index: 100`, `backdrop-filter: blur(10px)`.
- `.navbar-item`: columna centrada, `gap: 2px`, color `--text-muted`, `font-size: var(--font-xs)`, `min-width: 56px`, `min-height: var(--touch-min)`; `.active` → color `--accent`; `svg` 22×22.
- Ítems: **Inicio** (`/home`), **Resumen** (`/summary`), **Categorías** (`/categories`), **Metas** (`/goals`), **Estadísticas** (`/estadisticas`), **Perfil** (`/profile`).
- El ítem activo se marca en `Router.updateNavbar` comparando `data-route` con la ruta actual.

**Barra lateral (escritorio):** `body.desktop-mode #navbar` se fija a la izquierda (`width: var(--desktop-nav-width)`, 88px, `height: 100dvh`, `flex-direction: column`, `border-right`); los ítems ocupan el ancho total (`min-height: 64px`, `font-size: 0.65rem`). El ítem **Resumen** (`data-route="/summary"`) se oculta en escritorio porque su contenido se integra en las pestañas de analítica de la Home.

### 6.10 Selector de mes

```html
<div class="month-nav">
  <button title="Mes anterior">&lt;</button>
  <h2>Agosto 2026</h2>
  <button title="Mes siguiente">&gt;</button>
</div>
```

- `.month-nav`: flex `space-between`, `margin-bottom: var(--space-md)`.
- `h2`: `font-size: clamp(1rem, 5vw, var(--font-xl))`, `font-weight: 700` (texto vía `formatMonth`).
- `button`: sin fondo, color `--accent`, `--font-lg`, mín. 44×44.
- Navegación mes a mes con `addMonths`; cuando el mes actual no admite futuro y se está en el mes presente, el botón "siguiente" se oculta con `visibility: hidden` (`allowFuture: false`). En Inicio, Resumen y Estadísticas se usa `allowFuture: true`.
- Variante escritorio: `.desktop-month-selector` (grid de `40px · 1fr · 40px`, ancho 280px, centrado).

### 6.11 Tooltips de gráfico

No es un tooltip CSS: es un `div.chart-tooltip` creado por JS dentro del contenedor del canvas.

- `.chart-tooltip`: `position: absolute`, `max-width: min(240px, calc(100% - 16px))`, `padding: 7px 10px`, borde `--border`, radio `--radius-sm`, `background: #101a31`, sombra `0 4px 14px rgba(0,0,0,0.3)`, `font-size: var(--font-xs)`, `pointer-events: none`, `z-index: 4`. Atributos: `role="status"`, `aria-live="polite"`, `hidden` cuando no se muestra.
- Se posiciona con `left`/`top` clampeados al contenedor. Se activa con `pointermove` (se oculta en `pointerleave`/`blur`) y por teclado (flechas, Enter, Escape).
- El canvas es foco-able (`tabIndex = 0`) con `aria-keyshortcuts="ArrowLeft ArrowRight Enter Escape"` y `aria-description` que explica la interacción.

### 6.12 Toasts

```js
showToast('Transacción guardada');        // success
showToast(err.message, 'error');          // error
```

- Creados por `showToast(message, type)` en `public/js/utils/dom.js`. Se elimina cualquier `.toast` previo antes de mostrar uno nuevo; se autodestruye a los **3 segundos**.
- `.toast`: fijo, `bottom: navbar-height + safe-bottom + space-lg`, centrado horizontalmente (`left: 50%`, `translateX(-50%)`), `background: var(--bg-card)`, `padding: 12px 24px`, radio `--radius`, `box-shadow: var(--shadow-lg)`, `z-index: 200`, `font-weight: 500`, `max-width: 90vw`, animación `fadeIn 0.3s ease`.
- Variantes por borde izquierdo de 4px: `.toast.error` (borde `--danger`), `.toast.success` (borde `--success`). Tipo por defecto: `success`.

### 6.13 Spinners, skeletons y carga

- **No hay spinner ni skeleton.** El estado de carga es un texto dentro de `.loading`, insertado al inicio de cada render:
  ```html
  <div class="loading">Cargando...</div>
  ```
  `.loading`: flex centrado, `padding: var(--space-xl)`, color `--text-muted`. En la analítica de escritorio se usa el texto "Cargando evolución…".
- **Transición de entrada de contenido:** `#page-content` puede usar `.page-content-fade` (`opacity: 0; transition: opacity 0.12s ease`) y `.visible` (`opacity: 1`) para un fade breve tras cargar (Home, Estadísticas).

### 6.14 Estados vacíos

```html
<div class="empty-state">
  <div class="empty-state-icon">📊</div>
  <p class="empty-state-text">No hay transacciones este mes</p>
</div>
```

- `.empty-state`: centrado, `padding: var(--space-xl) var(--space-md)`, color `--text-muted`.
- `.empty-state-icon`: `font-size: 48px`, `margin-bottom: var(--space-md)`, `opacity: 0.5`. Es un emoji.
- `.empty-state-text`: `font-size: var(--font-base)`.

**Textos de estado vacío reales:** "No hay transacciones este mes" (icono 📊), "No hay transacciones con estos filtros", "No hay datos este mes" (📊), "No hay datos en este período" (📈), "No hay gastos este mes", "No tenés categorías creadas" (📁), "No tenés metas configuradas" (🎯), "No hay metas configuradas para este período.", "No hay datos de resumen para este período.", "Este análisis no tiene datos en el período actual.".

**Estados de error:** cada `catch` de render inserta `<div class="empty-state"><p>Error: {mensaje}</p></div>`.

### 6.15 Barras de progreso (metas)

```html
<div class="goal-progress-card">
  <div class="goal-progress-header">
    <span class="goal-progress-label">Meta de ahorro</span>
    <span class="goal-progress-pct complete">100%</span>
  </div>
  <div class="goal-progress-track">
    <div class="goal-progress-fill complete" style="width:100%"></div>
  </div>
  <div class="goal-progress-details">…</div>
</div>
```

- `.goal-progress-track`: `height: 10px`, fondo `--bg-input`, radio `5px`, `overflow: hidden`.
- `.goal-progress-fill`: `height: 100%`, fondo `--accent`, radio `5px`, `transition: width 0.5s ease`.
- Estados: `.complete` (fondo/color `--success`), `.over-limit` (fondo/color `--danger`), y zonas `zone-green` (`--success`), `zone-yellow` (`#F0AD4E`), `zone-orange` (`#E8740E`), `zone-red` (`--danger`).
- Detalle de exceso: `.goal-progress-exceeded`, `.goal-exceeded-line` (label/valor a los extremos), `.goal-exceeded-over` (color `--danger`, `font-weight 600`, separado por `border-top: 1px solid var(--bg-input)`).

**Barra de categoría** (Resumen, proporcional):

```html
<div class="category-bar">
  <div class="category-bar-header">…</div>
  <div class="category-bar-track">
    <div class="category-bar-fill" style="width:42%;background:#4ECDC4"></div>
  </div>
</div>
```

- `.category-bar-track`: `height: 8px`, fondo `--bg-input`, radio `4px`, `overflow: hidden`.
- `.category-bar-fill`: `height: 100%`, radio `4px`, `transition: width 0.5s ease`, color = color de la categoría.
- `.category-bar.category-bar-child` (variante hija): `margin-top: var(--space-sm)`.

### 6.16 Color picker (Categorías)

```html
<div class="color-picker" data-selected="#FF6B6B">
  <button class="color-option selected" style="background:#FF6B6B"></button>
  …
</div>
```

- `.color-picker`: flex wrap, `gap: var(--space-sm)`.
- `.color-option`: 36×36, círculo, borde `2px solid transparent`; `.selected` → `border-color: white` y `transform: scale(1.15)`.
- La selección se persiste en `dataset.selected`.

### 6.17 Avatar (Perfil)

- Con foto: `img.avatar-img` (80×80, círculo, `object-fit: cover`, `border: 2px solid var(--accent)`).
- Sin foto: `.avatar-placeholder` (80×80, círculo, fondo `--accent`, color `--bg-primary`, inicial del usuario en `--font-2xl` / 700).

### 6.18 Filas de información (`.profile-info-row`, `.summary-row`, `.fixed-expense-row`)

Patrón repetido: `flex` `space-between`, `padding: var(--space-sm) 0`, `border-bottom: 1px solid var(--border)` (la última fila sin borde). En `.summary-row` el borde es superior (`+ .summary-row`). Etiqueta a la izquierda (`.profile-info-label`/`.summary-label`, color `--text-secondary`), valor a la derecha en negrita (`.profile-info-value`/`.summary-value`, `font-weight: 700`).

### 6.19 Pestañas de analítica de escritorio (paneles y favorito)

- El contenedor del panel (`.desktop-analytics-tab-panel`) envuelve tarjetas (`.chart-container`, `.summary-section`, `.goal-progress-card`) con un estilo propio (`background: #182743`, borde translúcido `rgba(153,177,208,0.1)`, radio `--radius`, `padding: var(--space-md)`).
- Botón de favorito `.analytics-favorite-toggle` (estrella `☆`/`★`, 36×36, oculto hasta hover/foco, `.selected` en color `--warning`) sobre cada bloque `[data-favorite-type][data-favorite-key]`.
- La tarjeta favorita se refleja en la fila de estadísticas como `.desktop-favorite-card.desktop-favorite-replica`, con layout compacto por tipo (`.desktop-favorite-donut`, `-line`, `-bar`, `-burn-rate`, `-goal`) y una leyenda recortada a 2 entradas + "+N más".

---

## 7. Gráficos y visualización de datos

### 7.1 Implementación

No hay librería. Todo se dibuja en **`<canvas>` 2D** desde `public/js/components/charts.js` (objeto `Charts`) y desde `SummaryPage.drawBurnRateChart`. Los gráficos son nítidos en pantallas retina porque el canvas se escala por `devicePixelRatio` (`canvas.width = w * dpr` y `ctx.scale(dpr, dpr)`).

- Los gráficos se redibujan con `Charts.redraw(container)` y se exponen `canvas.__chartRender` / `canvas.__chartDraw` (usado para clonar canvas en las tarjetas favoritas y para redibujar tras resize).
- Contenedor: `.chart-title` (título) + `<canvas class="chart-canvas">` (o sin clase cuando el wrapper ya centra el canvas). `role="img"` con `aria-label` descriptivo en cada canvas de datos.
- Dimensiones efectivas: el canvas toma el ancho del contenedor menos 48px (móvil) o 16px (compacto). Alturas: dona `size` por defecto 200 y límite al ancho del contenedor; barras 180 (o `options.height`); líneas 200/220 (`options.height`); burn rate 200. En modo compacto (tarjetas favoritas): dona 60, barras y líneas 54, burn rate 46.

### 7.2 Tipos de gráfico

| Tipo | Función | Uso |
|---|---|---|
| **Dona** | `Charts.drawDonut(canvas, segments, size)` | Distribución de gastos por categoría, Fijo vs Variable, Ingresos A vs B, Distribución del mes (Estadísticas). |
| **Barras** | `Charts.drawBarChart(canvas, data, options)` | Resumen del mes (Gastos/Ingresos/Reembolsos), IVA acumulado por mes. |
| **Líneas** | `Charts.drawLineChart(canvas, datasets, labels, options)` | Evolución del ahorro, evolución por categoría, evolución porcentual A vs B. |
| **Líneas de burn rate** | `SummaryPage.drawBurnRateChart` | Ritmo de gasto (acumulado del mes, promedio histórico y marca "Hoy"). |

### 7.3 Paleta por serie (colores exactos)

| Serie | Color | Fuente |
|---|---|---|
| Distribución por categoría | color de la categoría, o `#6c6c7c` si no tiene | `summary.js` / `trends.js` |
| Fijo | `#FF6B6B` | `summary.js` |
| Variable | `#4ECDC4` | `summary.js` |
| Ingreso A | `#4ECDC4` | `summary.js` / `trends.js` |
| Ingreso B | `#FF6B6B` | `summary.js` / `trends.js` |
| Barras del mes — Gastos / Ingresos / Reembolsos | `#FF6B6B` / `#4ECDC4` / `#FFE66D` | `trends.js` |
| IVA acumulado | `#FFE66D` | `trends.js` |
| Ahorro (línea) | `#4ECDC4` | `trends.js` |
| Burn rate — actual | `#4ECDC4` | `summary.js` |
| Burn rate — promedio histórico | `#6c6c7c` | `summary.js` |
| Burn rate — marca "Hoy" | `#FF6B6B` | `summary.js` |

### 7.4 Ejes, etiquetas y valores

- **Grilla:** líneas horizontales en `#2a2a4a` (replica de `--border`), `lineWidth: 1`. Pasos: 4 en tamaño normal, 2 en compacto.
- **Eje de valores:** etiquetas a la derecha del eje izquierdo (`textAlign: right`), color `#6c6c7c`, fuente 10px normal / 8px compacto. El formato es `formatearEuro(valor)` (líneas admiten `options.valueFormatter`, p. ej. porcentajes con `${value.toFixed(0)}%`).
- **Eje de categorías/meses:** etiquetas debajo (`textAlign: center`), color `#6c6c7c`. En barras, si una etiqueta supera 6 caracteres se recorta a 5 + `.`; en líneas, se saltan etiquetas según el ancho (`labelStep`).
- **Padding normal:** `{ top: 10, right: 10, bottom: 40, left: 60 }`. **Compacto:** `{ top: 4, right: 4, bottom: 18, left: 32 }` (burn rate compacto: `{ top: 3, right: 4, bottom: 12, left: 30 }`).
- **Barras:** ancho `min(chartW / n * 0.6, 40)`, esquina superior redondeada (radio máx. 4).
- **Líneas:** `lineWidth: 2`, puntos con `arc` (radio 4 normal / 2 compacto). El eje de valores considera mínimos negativos (`minVal = Math.min(0, ...)`).
- **Dona:** radio exterior `size/2 - 10`, radio interior `0.55 × exterior`, arranque en `-π/2`. En el centro, el total en `formatearEuro` (16px bold `#e8e8e8`) y la palabra "Total" (11px `#a0a0b0`); en compacto, 8px/7px.
- **Burn rate:** líneas de acumulado por día; el "hoy" se marca con línea vertical punteada (`setLineDash([4,4])`, `#FF6B6B`) y el texto "Hoy" (9px `#FF6B6B`). El promedio histórico se calcula agrupando por día y promediando.

### 7.5 Responsive y tema oscuro

- Los gráficos se redimensionan al ancho del contenedor en cada dibujo; en la Home de escritorio un `ResizeObserver` sobre el panel de analítica dispara `Charts.redraw` (con `requestAnimationFrame`).
- No hay re-tematización dinámica: la paleta es oscura por diseño (los colores de grilla/label están pensados para fondo oscuro).
- Los canvas de datos son accesibles por teclado y exponen tooltip con lectura por `aria-describedby`.

---

## 8. Iconografía

### 8.1 Origen de los iconos

No hay librería ni sprite. La iconografía se compone de:

1. **SVG inline** con `stroke="currentColor"` y `stroke-width="2"` (heredan el color del texto), definidos en `public/js/app.js` (navbar), `public/js/pages/home.js` (acciones de escritorio, ojo, transacciones de escritorio), `public/js/pages/login.js` (chevron de versión). Todos comparten `viewBox="0 0 24 24"`, `fill="none"`.
2. **Emoji como icono** en listas, botones de acción y estados vacíos (categorías, transacciones móviles, iconos de estado vacío, cierre de modal).
3. **PNG** para favicon e iconos de instalación PWA.

### 8.2 Inventario de archivos (`public/icons/`)

| Archivo | Formato | Uso |
|---|---|---|
| `public/icons/icon-192.png` | PNG 192×192 | `favicon`, `apple-touch-icon` y `manifest.json` (`192x192`). |
| `public/icons/icon-512.png` | PNG 512×512 | `manifest.json` (`512x512`). |

No existe ningún otro archivo gráfico en `public/`.

### 8.3 Inventario de iconos SVG inline

| Icono | Trazo | Dónde | Tamaño |
|---|---|---|---|
| Inicio (casa) | `M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z` + `polyline 9 22 9 12 15 12 15 22` | navbar | 22×22 (CSS) |
| Resumen (check en círculo) | `M21 12a9 9 0 11-18 0 9 9 0 0118 0z` + `M9 12l2 2 4-4` | navbar | 22×22 |
| Categorías (carpeta) | `M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z` | navbar | 22×22 |
| Metas (dianas concéntricas) | 3 círculos r=10, r=6, r=2 | navbar | 22×22 |
| Estadísticas (línea de actividad) | `polyline 22 12 18 12 15 21 9 3 6 12 2 12` | navbar | 22×22 |
| Perfil (usuario) | `M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2` + círculo r=4 | navbar | 22×22 |
| Ojo abierto | ojos abierto + círculo r=3 | Home (toggle ingresos) | 16×16 / 18×18 |
| Ojo cerrado | variante tachada + `line 1 1 → 23 23` | Home | 16×16 / 18×18 |
| Flecha arriba (ingreso/ahorro) | `M12 19V5M5 12l7-7 7 7` | tarjetas escritorio | 22×22 |
| Flecha abajo (gasto) | `M12 5v14m-7-7 7 7 7-7` | tarjetas/transacción escritorio | 22×22 |
| Moneda (ahorro) | círculo r=9 + `M15 9.5c0-1.1-1.3-2-3-2s-3 .9-3 2 1.3 2 3 2 …M12 6v12` | tarjeta escritorio "Ahorro" | 22×22 |
| Más (+) | `M12 5v14M5 12h14` | botón "Nueva transacción" escritorio | 18×18 |
| Reembolso (flecha curva) | `M9 14l-4-4 4-4M5 10h9a5 5 0 010 10h-2` | transacción escritorio (reembolso) | 19×19 |
| Chevron abajo | `polyline 6 9 12 15 18 9` | toggle de versión (login) | 14×14 |
| Flecha de select | path triangulada embebida en `data:` URI | `select.form-control` | 12×12 |

### 8.4 Inventario de emoji-icono

| Emoji | Uso | Fuente |
|---|---|---|
| `💸` | Icono de transacción — gasto | `home.js` |
| `💰` | Icono de transacción — ingreso | `home.js` |
| `↩️` | Icono de transacción — reembolso | `home.js` |
| `✕` | Botón de cierre de modal | `modal.js` |
| `➕` | Botón "Agregar subcategoría" | `categories.js` |
| `✏️` | Botón "Editar" (categorías, metas) | `categories.js`, `goals.js` |
| `🗑️` | Botón "Eliminar" (categorías, metas) | `categories.js`, `goals.js` |
| `☆` / `★` | Botón de favorito (sin/con marcar) | `home.js` |
| `📊` | Estado vacío — sin datos del mes | `home.js`, `trends.js` |
| `📈` | Estado vacío — sin datos del período | `trends.js` |
| `📁` | Estado vacío — sin categorías | `categories.js` |
| `🎯` | Estado vacío — sin metas | `goals.js` |
| `•` | Viñeta de la lista de changelog (CSS `::before`) | `pages.css` |

> Debilidad de accesibilidad: los emoji no están envueltos en `aria-hidden`; los lectores de pantalla leen su descripción.

---

## 9. Patrones de interacción y motion

### 9.1 Duraciones y easings reales

| Animación | Duración | Easing | Uso |
|---|---|---|---|
| `--transition` | `0.2s` | `ease` | Botones, hover, color de navbar, bordes, fondos, opacidad de toggles. |
| `fadeIn` (`@keyframes`) | `0.3s` | `ease` | `.fade-in` (contenido de modal), `.toast`, `.modal-overlay`. |
| `slideUp` (`@keyframes`) | `0.3s` | `ease` | Definido para `.modal-content` (clase no usada por el modal real). |
| `.page-content-fade` | `0.12s` | `ease` | Fade breve de contenido de la Home al cambiar de mes. |
| Barra de progreso (`.goal-progress-fill`) | `0.5s` | `ease` (transición de `width`) | Relleno de metas. |
| Barra de categoría (`.category-bar-fill`) | `0.5s` | `ease` | Desglose proporcional. |
| Toasts | 3s (temporizador) | — | Autodestrucción. |
| Retardo de transición de mes | 120ms (`setTimeout`) | — | `home.js` espera a que el contenido salga antes de recargar (usa `.page-content-fade`). |

### 9.2 Feedback táctil

- `.btn:active` → `transform: scale(0.97)`.
- `.fab:active` → `scale(0.95)`; `.fab:hover` → `scale(1.05)` + sombra de acento `0 6px 20px rgba(78,205,196,0.3)`.
- `.transaction-item:active` → fondo `--bg-hover`.
- `-webkit-tap-highlight-color: transparent` en `body` y en todos los controles interactivos (evita el flash azul del tap en móvil).

### 9.3 Apertura de modales

Entrada con `fadeIn` (0.3s) sobre el `card` interno; el `modal-overlay` también declara `fadeIn 0.2s` en CSS (aunque el inline no lo repite). Cierre inmediato por `Modal.hide()` (vaciado del `#modal-root`), sin animación de salida.

### 9.4 Cambio de mes / página

- Home: al navegar a un mes distinto, el contenido se desvanece (`.page-content-fade` sin `.visible`), espera 120ms, recarga y vuelve a `.visible` con doble `requestAnimationFrame`.
- Estadísticas: conserva la posición de scroll al cambiar período o categoría (`window.scrollTo(0, savedScroll)`).
- Sin transición entre rutas: el router reemplaza el HTML de `#page-content` directamente.

### 9.5 Actualización de datos

- Tras guardar/editar/eliminar, se cierra el modal, se muestra un toast y se vuelve a renderizar la pantalla (re-fetch).
- Los gráficos se redibujan tras cada render mediante `Charts.redraw`.

### 9.6 Accesibilidad de movimiento

`@media (prefers-reduced-motion: reduce)` desactiva la transición de los botones de favorito; el resto de las animaciones (fade, scale) **no** respetan esta preferencia (deuda, sección 12).

---

## 10. Accesibilidad (estado real)

### 10.1 Contraste de los pares de tokens más usados

Ratios calculados con la fórmula WCAG 2.1 (luminancia relativa) sobre los valores exactos del código:

| Par | Ratio | AA texto normal (4.5) | AA texto grande (3.0) |
|---|---|---|---|
| `--text-primary` sobre `--bg-primary` (`#e8e8e8` / `#1a1a2e`) | **13.92:1** | Pasa (AAA) | Pasa |
| `--text-primary` sobre `--bg-secondary` (`#e8e8e8` / `#16213e`) | **12.97:1** | Pasa (AAA) | Pasa |
| `--text-primary` sobre `--bg-card` (`#e8e8e8` / `#0f3460`) | **10.20:1** | Pasa (AAA) | Pasa |
| `--text-primary` sobre `--bg-input` (`#e8e8e8` / `#1a1a3e`) | **13.59:1** | Pasa (AAA) | Pasa |
| `--text-secondary` sobre `--bg-secondary` (`#a0a0b0` / `#16213e`) | **6.17:1** | Pasa (AA) | Pasa |
| `--text-muted` sobre `--bg-secondary` (`#6c6c7c` / `#16213e`) | **3.08:1** | **Falla** | Pasa |
| `--text-muted` sobre `--bg-primary` (`#6c6c7c` / `#1a1a2e`) | **3.31:1** | **Falla** | Pasa |
| `--accent` sobre `--bg-primary` (`#4ECDC4` / `#1a1a2e`) | **8.82:1** | Pasa (AAA) | Pasa |
| `--bg-primary` (texto) sobre `--accent` (fondo) — botón primario | **8.82:1** | Pasa (AAA) | Pasa |
| `--danger` sobre `--bg-secondary` (`#FF6B6B` / `#16213e`) | **5.73:1** | Pasa (AA) | Pasa |
| `--warning` sobre `--bg-secondary` (`#FFE66D` / `#16213e`) | **12.71:1** | Pasa (AAA) | Pasa |
| **`white` sobre `--danger`** (botón de peligro) | **2.78:1** | **Falla** | **Falla** |
| `--accent` sobre `--bg-secondary` (`#4ECDC4` / `#16213e`) | **8.21:1** | Pasa (AAA) | Pasa |
| `--accent-hover` sobre `--bg-primary` (`#3dbdb5` / `#1a1a2e`) | **7.43:1** | Pasa (AAA) | Pasa |

**Resumen:** el texto principal y secundario cumplen AA con holgura. Los **puntos débiles** son: texto atenuado (`--text-muted`, ~3.1–3.3:1, falla AA para texto normal aunque se usa en textos pequeños como `.transaction-category`, `.transaction-date`, `.day-header`) y el **botón peligro** (`.btn-danger` con `color: white` sobre `--danger`, 2.78:1, falla AA y AAA).

### 10.2 Foco visible

- Regla global: `:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px }` (`base.css`).
- Los campos usan además `border-color: var(--accent)` + `box-shadow: 0 0 0 2px var(--accent-light)` en `:focus`.
- Casos con foco explícito adicional: `summary` del disclosure de categorías (`.desktop-category-disclosure > summary:focus-visible`), canvas de gráficos y botones de favorito (`.analytics-favorite-toggle:focus-visible`, `.desktop-favorite-source canvas:focus-visible`), y `.desktop-transaction-item:focus-visible`.

### 10.3 Labels y ARIA usados

- **Labels de formulario:** correctos y presentes en todos los `form-group` (label visible + input). En el perfil, varios modales construyen `label` + `input` sin `for`/`id` asociados (asociación implícita por anidación en algunos casos, no siempre).
- **ARIA presente:**
  - `role="img"` + `aria-label` en todos los canvas de datos.
  - Canvas de gráficos: `tabindex="0"`, `aria-keyshortcuts`, `aria-description`, `aria-describedby` (tooltip).
  - `.chart-tooltip`: `role="status"`, `aria-live="polite"`.
  - Tabs de escritorio: `role="tablist"` / `role="tab"` / `role="tabpanel"` con `aria-selected`, `aria-controls`, `aria-labelledby` y gestión de foco por teclado (flechas, Home, End).
  - Toggle de métricas: `aria-pressed`, `aria-label`.
  - Botones de favorito: `aria-pressed`, `aria-label`, `title`.
  - Selector de mes de escritorio: `aria-label` y labels por botón.
  - Transacciones de escritorio: `role="button"`, `tabindex`, `aria-label` descriptivo, activación con Enter/Espacio.
  - `experience-picker`: `role="group"` + `aria-label` + `aria-pressed`.
  - Region `section` con `aria-label` ("Transacciones", "Analítica", etc.).
  - Novedades: `#navbar` sin `aria-label` ni `role="navigation"`.

### 10.4 Tamaños táctiles

- Se usa `--touch-min: 44px` como mínimo en inputs, botones, filas de lista, navbar-items, iconos y botones de mes.
- FAB: 56×56.
- Los `.color-option` son de 36×36 (por debajo de 44px; tienen `padding` contenido) y `.desktop-favorite-toggle`/`.analytics-favorite-toggle` de 36×36 (se consideran controles de escritorio).

### 10.5 Deudas de accesibilidad detectadas en código

1. **Zoom bloqueado:** el viewport incluye `maximum-scale=1.0, user-scalable=no`, lo que impide el zoom del usuario (criterio WCAG 1.4.4).
2. **Sin `data-testid`:** confirmado por `e2e/HALLAZGOS-UI.md` (UI-01). No hay ningún `data-testid` en `public/`; los tests dependen de IDs, clases y textos visibles.
3. **FAB sin `aria-label`:** usa solo `title="Agregar transacción"` (`e2e/HALLAZGOS-UI.md`, UI-03).
4. **Emoji-icono sin `aria-hidden`:** los emoji de listas, botones y estados vacíos son leídos por lectores de pantalla.
5. **Logout solo desde Perfil:** no hay acceso en navbar (`e2e/HALLAZGOS-UI.md`, UI-05).
6. **Formularios login/registro con visibilidad por CSS:** los tests deben activar el tab antes de interactuar (`e2e/HALLAZGOS-UI.md`, UI-02).
7. **Íconos de acción sin nombre accesible más allá del `title`:** `.icon-btn` (`➕`, `✏️`, `🗑️`) usan `title` pero no `aria-label`.
8. **`prefers-reduced-motion` cubre solo los toggles de favoritos**; el resto de animaciones no lo respeta.

> Estos hallazgos provienen de `e2e/HALLAZGOS-UI.md` y del propio código; no se inventan nuevos.

---

## 11. Formato y localización

| Aspecto | Estado real |
|---|---|
| **Idioma de la UI** | Español en el 100% de la copia. Hay expresiones rioplatenses informales en textos concretos: "Ingresá tu email" (login), "Ingresá el nuevo email", "Ingresá tu contraseña", "Repetí la contraseña", "Escribí ELIMINAR para confirmar" (perfil), "Seleccioná una categoría", "Ingresá un monto válido", "Ingresá un porcentaje válido", "Ingresá tu salario estimado", "Seleccioná los meses de inicio y fin", "Seleccioná un mes", "No tenés categorías creadas", "No tenés metas configuradas". |
| **Moneda** | Euro (`€`), **sin espacio** y como sufijo. `Intl.NumberFormat('es-AR')` → separador de miles `.`, decimal `,`, hasta 2 decimales sin forzar el `.00`. |
| **Signos** | `+` para ingreso, `-` para gasto (y `−` U+2212 en la lista de escritorio). El ahorro positivo lleva `+` explícito. Reembolsos también muestran `+`. |
| **Fechas** | Largas: `es-ES` con día de semana ("martes, 12 de agosto"). Cortas: "12 ago". Meses en encabezados: capitalizados ("Agosto 2026"). Formato de transporte/persistencia: `YYYY-MM-DD` y `YYYY-MM`. |
| **Mayúsculas** | Forzadas por CSS solo en `.stat-label` y `.day-header`; los meses se capitalizan por JS. |
| **Pluralización** | No hay lógica de pluralización; los textos son fijos ("transacciones", "meses"). El único conteo dinámico es el de subcategorías: `(N)` y el "+N más" de la leyenda de favoritos. |
| **Textos de confirmación visibles (toasts)** | "Transacción guardada", "Transacción actualizada", "Transacción eliminada", "Categoría creada", "Categoría actualizada", "Categoría eliminada", "Meta guardada", "Meta actualizada", "Meta eliminada", "Foto actualizada", "Foto eliminada", "Email actualizado", "Contraseña actualizada", "Cuenta eliminada", "Si el email existe, recibirás un enlace". |
| **Textos de error visibles (toasts)** | "El IVA debe estar entre 0 y 100", "El monto debe ser positivo", "Los importes A y B deben sumar el monto total", "El nombre es obligatorio", "La imagen no puede superar 2MB", "Ingresá el nuevo email", "Ingresá tu contraseña", "Ingresá tu email", "La nueva contraseña debe tener al menos 6 caracteres", "Las contraseñas no coinciden", "Escribí ELIMINAR para confirmar". |
| **Errores de render/API** | `<div class="empty-state"><p>Error: {mensaje}</p></div>`. El cliente muestra el `error` devuelto por el servidor o "Error de servidor". |
| **Títulos de modal** | "Nueva transacción" / "Editar transacción", "Transacción", "Filtrar transacciones", "Nueva categoría" / "Editar categoría" / "Eliminar categoría", "Crear nueva meta" / "Editar meta", "Acciones de cuenta", "Cambiar email", "Cambiar contraseña", "Eliminar mi cuenta", "Recuperar contraseña". |
| **Changelog de login** | Lista desplegable con versiones, fechas (`DD/MM/YYYY`) y bullets. Versión por defecto hardcodeada: `1.11.2`. |

---

## 12. Contrato de implementación

Reglas obligatorias para extender la aplicación sin romper el diseño ni los tests.

### 12.1 Reglas generales

1. **Usar tokens, no valores hardcodeados.** Todo color, radio, espaciado y tamaño que tenga token en `variables.css` debe referenciarse con `var(--token)`. No repetir hexadecimales literales (el código actual lo hace en varios lugares; no debe propagarse).
2. **Respetar la convención de nombres:** `bloque`, `bloque-elemento`, estado en minúscula (`.active`, `.selected`, `.complete`, `.over-limit`), variante con guion (`.btn-primary`, `.category-child`).
3. **No renombrar clases usadas por E2E** (ver 12.3) ni los IDs de formularios y campos.
4. **Mantener el patrón de tarjetas:** toda sección nueva se envuelve en `.chart-container` / `.summary-section` / `.card` con `radius-lg` y `space-lg`, salvo que sea una fila de lista.
5. **Estados obligatorios por componente nuevo:** default, `:hover`, `:active` (si es táctil), `:focus-visible`, vacío (`empty-state`), carga (`loading`) y error (`.empty-state` con "Error: …"). No se admiten `disabled` sin estilo propio (debe definirse si se agrega).
6. **Tamaño táctil mínimo:** `min-height: var(--touch-min)` (44px) en todo control nuevo interactivo.
7. **Los gráficos nuevos** deben: usar `<canvas>` con `role="img"` + `aria-label`, escalar por `devicePixelRatio`, tomar el ancho del contenedor, y registrar `__chartRender`/`__chartDraw` para redibujo y clonado.
8. **Tema:** mantener dark-only; no introducir `prefers-color-scheme` sin actualizar toda la paleta y los gráficos.

### 12.2 Cómo agregar una pantalla nueva

1. Registrar la ruta en `Router.register(...)` dentro de `App.init` (con el guard `if (!this.user) return Router.navigate('/login')`).
2. Crear `public/js/pages/<nombre>.js` con un objeto que exponga `render(params)`.
3. Incluir el script en `public/index.html` (orden antes de `router.js`) **y** en la lista `STATIC_ASSETS` de `public/sw.js` (subir `CACHE_NAME`).
4. Obtener `#page-content` y `#navbar`; aplicar `navbar.style.display = ''`, `content.style.paddingBottom = ''`. Para pantallas públicas, ocultar la navbar (`navbar.style.display = 'none'`).
5. Mostrar estado de carga (`<div class="loading">Cargando...</div>`) antes del fetch y usar `try/catch` con `.empty-state` para error.
6. Componer con los patrones de layout de la sección 5.4 y el helper `create(tag, attrs, children)` de `dom.js`.
7. Si va en la navbar, agregar el `<button class="navbar-item" data-route="...">` en `App.renderNavbar` con su `<span>` de texto.
8. Verificar el modo escritorio si la pantalla debe mostrar layout alternativo (usar `App.isDesktop()`).

### 12.3 Cómo agregar un componente nuevo

1. Definir la clase raíz con prefijo de bloque y agregar sus reglas en `components.css` (componente reutilizable) o `pages.css` (específico de una pantalla).
2. Reutilizar tokens existentes; si hace falta un valor nuevo, evaluar primero si encaja en la escala `--space-*` / `--font-*` / `--radius*`.
3. Cubrir estados (default/hover/active/focus-visible/empty/loading/error) y variantes.
4. Si es interactivo, usar `<button>` (no `<div>` con click) y aportar nombre accesible (`aria-label` o texto).
5. Aportar foco visible (hereda el global, o agregar regla propia si se superpone).

### 12.4 Selectores y contratos que E2E depende (no romper)

La suite E2E (`e2e/pages/*.ts`) usa estos selectores. **Renombrarlos rompe los tests.**

| Selector | Uso |
|---|---|
| `#navbar`, `.navbar-item`, `.navbar-item[data-route="/summary"]` | Navegación |
| `.stats-row`, `.stat-card`, `.stat-value` | Estadísticas de Home/Resumen; filtrado por texto "Ingresos"/"Gastos"/"Ahorro" |
| `.desktop-stat-<id>` (`desktop-stat-ingresos`, `-gastos`, `-ahorro`) | Tarjetas de escritorio |
| `.fab`, `.desktop-new-transaction` | Disparadores de nueva transacción |
| `.modal-overlay`, `.modal-overlay h3` | Detección y título del modal |
| `.type-btn[data-type="expense"]` (y `income`/`refund`) | Selector de tipo |
| `select.form-control` (primero), `input.form-control[type="text"]`, `input.form-control[type="number"]` | Campos del formulario de transacción (posición) |
| `button:has-text("Guardar")`, `button:has-text("Cancelar")` | Acciones del modal |
| `.transaction-item`, `.transaction-title` | Lista de transacciones |
| `.empty-state`, `.empty-state-text` | Estados vacíos |
| `.eye-toggle-btn` | Toggle de métricas |
| `.month-nav`, `.month-nav h2` | Selector de mes móvil |
| `.desktop-home-controls`, `.desktop-month-selector`, `.desktop-home-stats`, `.desktop-home-workspace`, `.desktop-analytics-tabs`, `.desktop-transaction-item`, `.desktop-analytics-empty` | Home de escritorio |
| `.desktop-favorite-card`, `.desktop-favorite-replica`, `.analytics-favorite-toggle`, `.desktop-favorite-legend`, `.desktop-favorite-replica-heading`, `.desktop-favorite-source` | Tarjetas favoritas y toggles |
| `[data-favorite-type]`, `[data-favorite-key]`, `[data-favorite-label]` | Metadatos de bloques favoritos |
| `.chart-title`, `.chart-container`, `.chart-canvas`, `.chart-tooltip` | Gráficos |
| `.fv-legend`, `.category-badge`, `.category-bar-fill` | Leyendas y desglose |
| `.goal-progress-card`, `.goal-card`, `.goal-card-title` | Metas |
| `.period-btn`, `.trend-filters`, `.trend-filter-btn` | Estadísticas de tendencias |
| `#login-form`, `#register-form`, `#login-nombre`, `#login-password`, `#register-nombre`, `#register-email`, `#register-password`, `[data-tab="login"|"register"]`, `#login-form.active` | Login/registro |
| `#account-action-change-email`, `#account-action-change-password`, `#account-action-delete`, `#delete-account-confirm`, `.profile-info-value`, `button:has-text("Cerrar sesión")` | Perfil |
| `.category-item`, `button[title="Agregar subcategoría"|"Editar"|"Eliminar"]`, `.modal-overlay button.btn-primary:has-text("Crear")`, `button.btn-danger:has-text("Eliminar")` | Categorías |
| `#goal-tipo`, `#goal-modo`, `#goal-category`, `#goal-monto`, `#goal-month-single`, `button:has-text("Guardar meta")`, `button[title="Eliminar meta"]` | Metas |
| `body.desktop-mode`, `body.desktop-home`, `#home-analytics-panel-*`, `details.desktop-category-disclosure` | Estado de experiencia y paneles |

> **Recomendación referenciada (no implementada):** `e2e/HALLAZGOS-UI.md` propone agregar `data-testid` estables en los puntos de interacción para desacoplar los tests de clases y textos.

### 12.5 Deudas y riesgos del sistema actual

**CSS muerto y clases no usadas**
- `.modal-content`, `.modal-header`, `.modal-title`, `.modal-close` están definidas en `pages.css` pero `modal.js` no las usa (construye `div.card.fade-in` con estilos inline). La regla `.modal-overlay` sí se usa por clase, pero su `align-items: flex-end` y su falta de `padding` quedan **anulados por los estilos inline** (`align-items: center`, `padding: 16px`).
- `--header-height: 56px` declarada y nunca referenciada.
- Clases declaradas o usadas sin reglas efectivas: `.trend-divider` (se estiliza inline), `.category-parent-badge`, `.category-child-count`, `.recurring-options`, `.classification-options`, `.desktop-trends-content`, `.desktop-favorite-unavailable` (esta última sí estilizada), `.burn-indicator-text` (sin regla propia).

**Duplicación y valores hardcodeados fuera de tokens**
- Utilidades duplicadas entre `base.css` y `components.css`: `.text-center`, `.text-muted` y `.text-success` están definidas en ambos archivos, y `.text-success` difiere (en `base.css` no lleva `font-weight`; en `components.css` es `font-weight: 600`).
- `.desktop-home-workspace` está definida **dos veces** en `pages.css` (una en la zona de componentes con `grid-template-columns: minmax(320px, 0.9fr) minmax(400px, 1.1fr)` y otra más abajo con `minmax(270px, 0.92fr) minmax(0, 1.08fr)`); gana la segunda.
- Colores hardcodeados fuera de tokens: en `charts.js` y `summary.js` (`#e8e8e8`, `#a0a0b0`, `#2a2a4a`, `#6c6c7c`, `#4ECDC4`, `#FF6B6B`); zonas de meta (`#F0AD4E`, `#E8740E`); burn rate y leyendas (`#FF6B6B`, `#4ECDC4`, `#6c6c7c`, `#FFE66D`); gradientes y fondos de escritorio (`#192746`, `#121f39`, `#101a31`, `#263653`, `#182743`, `#1c344a`, `#173f4a`, `#4fcfc6`, `#102333`).
- La familia tipográfica de los gráficos (`-apple-system, sans-serif`) está duplicada y difiere del stack del `body`.

**Estilos por pantalla en vez de por componente**
- Gran parte del layout de Home/Resumen/Estadísticas se arma con **estilos inline** en JS (`display:flex`, `gap`, `marginTop`, `width`, colores) en lugar de clases: el header "Transacciones", los wrappers de canvas, las leyendas, las filas del desglose, los footers de modal, etc. Esto impide reutilizar y hace frágil el mantenimiento.

**Consistencia visual**
- El `font-size: 16px` de `.form-control` es un literal (intencional para evitar el zoom de iOS), no un token.
- El radio de píldoras es un literal (`20px` en `.trend-filter-btn`); no hay token de píldora.
- El estado `disabled` no tiene estilo propio en ningún control.

**Accesibilidad** (detallada en la sección 10.5): zoom bloqueado, `--text-muted` por debajo de AA para texto normal, botón de peligro con `white` sobre `--danger` (2.78:1), emoji sin `aria-hidden`, FAB sin `aria-label`, sin `data-testid`.

**Documental**
- La versión de la UI está desincronizada (`package.json` 1.11.9 vs `public/version.json` 1.11.2), lo que afecta el pie del login y el changelog (ver `docs/DOCUMENTO-FUNCIONAL.md`, sección 9).

---

## 13. Fuente y cobertura

Este documento fue **generado por lectura directa del código** (rama `master`). No se inventó ningún token, clase, color, breakpoint ni selector. Las inferencias están marcadas con **[inferencia]** y las inconsistencias se documentan en la sección 12.

### Archivos fuente leídos

| Archivo | Qué aporta |
|---|---|
| `docs/DOCUMENTO-FUNCIONAL.md` | Contexto de producto, pantallas y reglas de negocio. |
| `public/index.html` | Estructura del documento, meta tags, viewport, `theme-color`, carga de CSS/JS. |
| `public/css/variables.css` | Todos los tokens de diseño. |
| `public/css/base.css` | Reset, estilos base, utilidades, foco, breakpoint 768px, modo escritorio. |
| `public/css/components.css` | Botones, formularios, tarjetas, transacciones, badges, progreso, toasts, empty state. |
| `public/css/pages.css` | Layouts de pantalla, navbar, modal, burn rate, metas, escritorio y breakpoints 900/820px. |
| `public/manifest.json` | PWA: nombre, colores, orientación, iconos. |
| `public/sw.js` | Lista de precache (contrato de assets) y versión de caché. |
| `public/version.json` | Versión mostrada en login. |
| `public/js/app.js` | Navbar (SVG inline), experiencia móvil/escritorio, registro de rutas. |
| `public/js/router.js` | Rutas por hash, estado `desktop-home`, navbar activa. |
| `public/js/api.js` | Endpoints consumidos por las pantallas. |
| `public/js/utils/dom.js` | Helpers de DOM, `showToast`. |
| `public/js/utils/format.js` | Formateo de moneda, fechas y meses; agrupación por fecha. |
| `public/js/components/modal.js` | Estructura real del modal. |
| `public/js/components/monthSelector.js` | Selector de mes. |
| `public/js/components/transactionForm.js` | Formulario de transacción (campos, visibilidad, validaciones). |
| `public/js/components/charts.js` | Dibujo de dona, barras, líneas y tooltips. |
| `public/js/components/navbar.js` | Delegación a `App.renderNavbar`. |
| `public/js/pages/login.js` | Pantalla pública, tabs, changelog, recuperación y reset. |
| `public/js/pages/home.js` | Home, filtros, transacciones, analítica de escritorio, favoritos. |
| `public/js/pages/summary.js` | Resumen, metas en progreso, burn rate, donuts y desglose. |
| `public/js/pages/trends.js` | Estadísticas y gráficos de tendencia. |
| `public/js/pages/goals.js` | CRUD de metas. |
| `public/js/pages/categories.js` | CRUD de categorías y color picker. |
| `public/js/pages/profile.js` | Perfil, avatar y acciones de cuenta. |
| `public/icons/` | Inventario de assets gráficos (2 PNG). |
| `e2e/fixtures/uiHelpers.ts` | Contexto de tests de UI. |
| `e2e/pages/*.ts` | Contrato de selectores usado por los tests (sección 12.4). |
| `e2e/HALLAZGOS-UI.md` | Hallazgos de accesibilidad y testabilidad referenciados. |
| `e2e/HALLAZGOS.md` | Riesgos de testing referenciados. |
| `docs/testing/ESTRATEGIA.md`, `docs/testing/HALLAZGOS-Y-ACCIONES.md` | Contexto de verificación de UI (revisados). |

### Fuera de alcance

- Lógica de backend, cálculo financiero y persistencia (documentados en `docs/DOCUMENTO-FUNCIONAL.md`).
- Configuración de despliegue (`fly.toml`, `Dockerfile`, CI).
- Tokens de las categorías sugeridas en `src/db/seed.js` (función no invocada; no forma parte de la UI actual).
- Comportamiento de correos (recuperación de contraseña) y de la API más allá de lo que afecta a la presentación.

### Cobertura

Se cubrieron **todas** las custom properties declaradas en `variables.css`, **todas** las clases con reglas en los tres archivos CSS, los **cuatro** componentes JS compartidos, las **siete** páginas de la SPA más los dos estados de login, los **tres** tipos de gráfico más el burn rate, la paleta de categorías, la iconografía (SVG + emoji + PNG) y el contrato de selectores E2E.
