# Hallazgos de UI detectados durante el desarrollo de smoke tests E2E

> Estos hallazgos están en el código de la aplicación (`public/`). No fueron corregidos porque el alcance de Patesi en SelimSystem es solo lectura fuera de `e2e/`.

## UI-01: La interfaz no expone `data-testid` en ningún elemento interactivo relevante

**Riesgo:** Medio-Alto (fragilidad de la suite E2E)

**Descripción:**
Todos los selectores de los Page Objects deben apuntar a IDs, clases o textos visibles. Ningún elemento clave del flujo de smoke tiene un atributo `data-testid`:

- Formularios de login/registro: `#login-form`, `#register-form`, `#login-nombre`, etc.
- Tabs de autenticación: atributo `data-tab` (aceptable, pero no es `data-testid`).
- Navbar: `#navbar` y `.navbar-item`.
- Home: `.stats-row`, `.stat-card`, `.fab`, `.transaction-item`, `.transaction-title`.
- Modal de transacción: `.modal-overlay`, `.type-btn[data-type="expense"]`, selectores por texto "Guardar".
- Resumen: `.stat-card` + texto visible "Ingresos"/"Gastos"/"Ahorro".
- Perfil: botón por texto "Cerrar sesión".

**Impacto concreto:**
- Un refactor de CSS o un cambio de copy puede romper los tests sin modificar funcionalidad.
- Los selectores por texto (ej. `button:has-text("Guardar")`, `button:has-text("Cerrar sesión")`) son especialmente frágiles ante internacionalización o ajustes de UX.
- Los selectores posicionales (`select.form-control`).first()`, `input[type="number"]').first()`) asumen un orden de campos que puede cambiar.

**Recomendación para quien desarrolla:**
Agregar `data-testid` estables en los puntos de interacción principales. Ejemplos mínimos para estabilizar el smoke:

- `data-testid="login-tab"`, `data-testid="register-tab"`
- `data-testid="login-nombre"`, `data-testid="login-password"`, `data-testid="login-submit"`
- `data-testid="register-nombre"`, `data-testid="register-email"`, `data-testid="register-password"`, `data-testid="register-submit"`
- `data-testid="navbar"`, `data-testid="nav-home"`, `data-testid="nav-summary"`, `data-testid="nav-profile"`
- `data-testid="new-transaction-button"`, `data-testid="transaction-modal"`
- `data-testid="transaction-type-expense"`, `data-testid="transaction-category"`, `data-testid="transaction-title"`, `data-testid="transaction-amount"`, `data-testid="transaction-date"`, `data-testid="transaction-save"`
- `data-testid="summary-ingresos"`, `data-testid="summary-gastos"`, `data-testid="summary-ahorro"`
- `data-testid="logout-button"`

## UI-02: Formularios de login y registro comparten la misma página con visibilidad controlada por CSS

**Riesgo:** Bajo-Medio

**Descripción:**
Ambos formularios viven en `/login`. El formulario activo se muestra/oculta mediante la clase `.active` sobre `.login-form` (ver `public/css/pages.css` líneas 61-67). Esto obliga a los tests a hacer click en el tab correcto antes de interactuar con los campos.

**Impacto concreto:**
- Si un test intenta llenar `#register-nombre` sin hacer click en `[data-tab="register"]` primero, el campo está en el DOM pero no es visible/interactivo para el usuario.
- Las animaciones/transition del tab pueden hacer que `fill` sea intermitente en headless; el `LoginPage` actual usa `page.evaluate` como workaround.

**Recomendación para quien desarrolla:**
- Mantener la URL única `/login` está bien, pero exponer `data-testid` en los tabs y en los formularios activos simplifica los tests.
- Considerar deshabilitar transiciones en modo test (`NODE_ENV=test`) para reducir flaky tests.

## UI-03: El botón FAB de "nueva transacción" no tiene identificador semántico

**Riesgo:** Medio

**Descripción:**
El botón flotante de acción principal en Home usa solo la clase `.fab` (línea 172-180 de `public/js/pages/home.js`). No tiene `aria-label` ni `data-testid`.

**Impacto concreto:**
- `.fab` es un nombre de clase corto y genérico; puede colisionar con otros estilos o cambiar.
- Sin `aria-label`, el botón no es accesible para lectores de pantalla.

**Recomendación para quien desarrolla:**
- Agregar `data-testid="new-transaction-button"` y `aria-label="Agregar transacción"` al FAB.

## UI-04: Modal de transacción usa selectores por orden de campo

**Riesgo:** Medio

**Descripción:**
El formulario de transacción renderiza dinámicamente campos según el tipo seleccionado. Para llenar categoría, título, monto y fecha, el Page Object usa `select.form-control`).first()`, `input[type="text"]').first()`, etc.

**Impacto concreto:**
- Si se reordena el formulario o se agrega un campo nuevo del mismo tipo, los tests se rompen.
- La categoría se selecciona por label de opción (`Supermercado Smoke`), lo cual depende del nombre mostrado.

**Recomendación para quien desarrolla:**
- Asignar `data-testid` a cada campo del modal: tipo, categoría, título, monto, fecha, clasificación, IVA, recurrente, guardar, cancelar.

## UI-05: Logout solo está disponible desde la página de Perfil

**Riesgo:** Bajo

**Descripción:**
No hay un botón de logout directo en la navbar. El usuario debe navegar a `/profile` y hacer click en "Cerrar sesión".

**Impacto concreto:**
- El smoke test de logout depende de la página de Perfil, no solo de la navbar.
- Si el flujo de logout se mueve o rediseña, hay más superficie de rotura.

**Recomendación para quien desarrolla:**
- Considerar un menú de usuario en la navbar con `data-testid="logout-button"` para hacer el cierre de sesión accesible desde cualquier página.
