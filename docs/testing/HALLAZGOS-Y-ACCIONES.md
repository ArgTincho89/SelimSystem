# Hallazgos y acciones — SelimSystem

> Documento vivo de la intervención de QA. Registra, **en el orden en que fue trabajado**, lo que se encontró y cómo se resolvió, para poder reconstruir el estado del proyecto antes y después.

Fecha de inicio: 2026-08-30
Modo: **B — Personal** (proyecto personal, una persona). Framework: ISTQB (núcleo).

---

## Resumen ejecutivo

| Hallazgo | Gravedad | Estado |
|----------|----------|--------|
| La suite de tests de Jest **no corre** en el repo (0 tests encontrados) — causa raíz OneDrive | Crítico (P1) | Resuelto / mitigado |
| No existe endpoint para **eliminar la cuenta** (`DELETE /api/auth/account`) | Alto (brecha de producto) | Implementado |
| La suite completa **pasa en verde** (234 tests) cuando el repo está fuera de OneDrive | — | Verificado |
| No había **tests E2E de frontend/Ui** | Medio | Implementado (Playwright + Cucumber + POM) |
| **Suite E2E lista para CI**: 10 escenarios / 30 pasos en verde | — | Verificado |
| **CI dependía de un repo externo** (`PatesiTests`) para E2E | Medio | Reemplazado por el E2E integrado en `e2e/` |

---

## 1. Hallazgo crítico: `npm test` no descubre los tests en el repo

### Estado antes (síntoma)

Ejecutar `npm test` (Jest) en el repo reportaba:

```
No tests found, exiting with code 1
In C:\Users\marti\OneDrive\Escritorio\Martin\IA\SelimSystem
  1 file checked.
  testMatch: **/tests/**/*.test.js - 0 matches
```

Es decir: **0 tests encontrados**, aunque existen 11 archivos `*.test.js` con 234 tests.

### Lo que se investigó (evidencia)

Se descartaron sistemáticamente las causas:

1. **¿Faltan archivos?** No. `Get-ChildItem -Recurse` de PowerShell y `fs.readdirSync` de Node puro listan los 11 archivos `.test.js` perfectamente.
2. **¿Config de Jest rota?** No. El `jest.config.js` ya tenía un workaround de OneDrive (`haste: { enableSymlinks: true }`). Probar `enableSymlinks: false` no cambió nada.
3. **¿Cache corrupta?** `npx jest --clearCache` no lo arregló.
4. **¿Junction fuera de OneDrive?** Se creó una junction `C:\patejest\SelimSystem` → repo. Jest seguía reportando **0 tests**, porque resuelve el realpath de la junction de vuelta al path de OneDrive.
5. **Copia física FUERA de OneDrive (robocopy)** → **Jest descubre los 11 archivos y la suite pasa completa: 234 tests en verde.**

### Causa raíz

El **crawler de archivos de Jest (`jest-haste-map`)** no puede enumerar los subdirectorios del árbol del proyecto cuando el path está bajo OneDrive en Windows. Los *reparse points* de OneDrive (para archivos "en la nube") hacen que la enumeración recursiva del crawler devuelva árboles vacíos. No es problema del código de la app ni de las configuraciones de Jest: es una incompatibilidad de Jest + OneDrive + Windows.

> Nota: PowerShell `Copy-Item -Recurse` también copió árboles vacíos desde OneDrive (los subdirectorios llegaron sin archivos), mientras que `robocopy` (API de copia de más bajo nivel) copió todo correctamente. Esto refuerza que el problema está en el acceso a subdirectorios bajo OneDrive desde ciertas APIs de archivos.

### Cómo se resolvió / mitigó

**La solución definitiva y recomendada: trabajar (clonar / mover) el repositorio fuera de OneDrive.** No es un defecto corregible con una flag de Jest; es el storage de OneDrive. Cualquier herramienta que use `realpath`/crawler (Jest, webpack watches, etc.) se va a seguir topando con esto.

Acciones concretas:
- Cierra el repo fuera de OneDrive, p. ej. `C:\Users\marti\dev\SelimSystem`.
- Se agregó un script `npm run test:local` **documentado** (no puede resolver OneDrive por completo, pero deja la intención clara en el package.json; ver más abajo).

### Verificación (estado después)

En una copia física fuera de OneDrive (sin tocar el código):

```
Test Suites: 11 passed, 11 total
Tests:       234 passed, 234 total
Time:        60.94 s
```

**Estado final: `npm test` → la suite completa pasa en verde en un directorio fuera de OneDrive.**

---

## 2. Hallazgo: no existe la funcionalidad de "eliminar cuenta"

### Estado antes

Analizando el backend (`src/routes/auth.js`) y el frontend (`public/js/pages/profile.js`) para diseñar el flujo E2E pedido ("finalizar con la eliminación de la cuenta"), se detectó que **el producto no tiene eliminación de cuenta**:

- No hay `DELETE /api/auth/account` ni equivalente en `src/routes/auth.js`.
- En Perfil (`profile.js`) solo se puede: cambiar email, cambiar contraseña, cerrar sesión. **No hay botón de eliminar cuenta.**
- `JsonDB` no tiene un método para borrar un usuario ni sus datos.

Esto es una **brecha de producto legítima** (una app de finanzas personales sin "darme de baja" deja datos huérfanos para siempre) y, además, un bloqueo para cumplir el flujo E2E solicitado.

### Lo que se hizo

1. **Backend:** se agregó el endpoint `DELETE /api/auth/account` (requiere autenticación) que:
   - Borra al usuario de `users.json`.
   - Borra todos sus datos (directorio del usuario: categorías, transacciones, metas).
   - Destruye la sesión.
2. **Frontend:** se agregó el botón **"Eliminar mi cuenta"** en la página Perfil, con doble confirmación (modal).
3. **E2E:** el último scenario del flujo navega a Perfil y elimina la cuenta vía la UI, verificando que la sesión termina y que el usuario ya no puede volver a ingresar.

### Estado después

La app de producto ahora soporta eliminación de cuenta, y la automatización E2E la ejerce al final del flujo, dejando la base de datos limpia.

---

## 3. Hallazgo: no existían tests E2E de frontend

### Estado antes
Solo existían tests de backend con Jest + supertest (11 suites / 234 tests). La UI (vanilla JS + PWA) no tenía automatización.

### Lo que se hizo
Se creó un framework E2E **independiente** en `e2e/`:
- **Cucumber.js** (`@cucumber/cucumber`) como runner BDD → escenarios Gherkin legibles.
- **Playwright** como motor de automatización del navegador.
- **Page Object Model** (POM) en TypeScript.
- **cucumber-html-reporter** para reporte HTML visual de resultados.
- Evidencia automática (screenshot + video) al fallar.
- Flujo completo: **crear usuario → ejecutar los casos de prueba → eliminar cuenta**.

Ver `docs/testing/ESTRATEGIA.md` y `e2e/README.md` para los detalles.

---

## 4. Avances del framework E2E y su integración al CI

### Estado: la suite E2E corre en verde de forma estable

La suite de `e2e/` (Playwright + Cucumber + POM) quedó en **10 escenarios / 30 pasos en verde**, en corridas repetidas contra un server aislado (server propio en `E2E_PORT` con `DATA_DIR` dedicado, sin tocar `data/` real).

### Correcciones de framework que hicieron falta (lecciones que valen para cualquier E2E de esta app)

1. **Modales residuales que interceptan clics (`#modal-root`)**: cuando un escenario falla a mitad de un modal, el `.modal-overlay` queda abierto y **bloquea los clics** de los escenarios siguientes (el click aterriza en el overlay, no en el elemento). Se resolvió limpiando `#modal-root` en el hook `After` de cada escenario. Sin esto, los fallos se encadenan y enmascaran la causa real.
2. **Selectores con strict mode**: `fillDate` y `fillAmount` del `TransactionModal` resolvían a 2 elementos cuando había un modal residual. Se acotó con `.first()` *además* de la limpieza del punto 1.
3. **Validación HTML5 que frena el submit antes del server**: el escenario de "contraseña corta" asumía un toast del server, pero el `<input minlength="6">` bloquea el submit nativamente (nunca llega al backend). El escenario ahora verifica que la app **permanece en login sin redirigir**, que es el comportamiento real correcto.
4. **Aserciones acopladas al formato de moneda regional**: la app renderiza con `Intl.NumberFormat('es-AR')` ("2.000€", "120,5€", coma decimal). Comparar substrings crudos era frágil y fallaba (e.g. "2000" vs "2.000€"). Se creó `e2e/utils/money.ts` que normaliza a número y deja las aserciones desacopladas del formato.
5. **Escenario con valor esperado incorrecto**: el feature afirmaba "IVA acumulado = 21", pero 21 es el *porcentaje* de IVA; el monto acumulado para un ingreso de 2000 al 21% es **420€**. Se corrigió el valor esperado del escenario (el código del producto estaba bien).

### Integración al CI (reemplazo del repo externo `PatesiTests`)

**Antes**: el job `e2e-tests` de `.github/workflows/fly-deploy.yml` clonaba el repositorio externo `PATESI_TESTS_REPO` (`PatesiTests`) con un token secreto dedicado, corría Playwright ajeno al repo y subía un reporte propio. Esto duplicaba esfuerzo, dependía de un repo/secret separado y no reutilizaba el framework local.

**Después**: el job `e2e-tests` usa **el E2E integrado** (`e2e/`):
- Checkout del repo + `npm ci` (deps backend) + `npm ci` en `e2e/` + `npx playwright install --with-deps chromium`.
- Arranca el **server E2E aislado** (`npm run server` en `e2e/` = server en `E2E_PORT=3001` con `DATA_DIR=.e2e-data`), esperando `wait-on http://localhost:3001/`.
- Corre `cucumber-js` y genera el reporte HTML (`cucumber-html-reporter`), que se sube como artifact.

**Quality gates (justificación)**:
- **`unit-tests`** antes que todo: regresión de lógica de negocio barata y rápida (Jest + supertest).
- **`e2e-tests`** (needs unit-tests): valida el ciclo de vida completo del usuario y las validaciones de auth contra un server real y aislado.
- El CI ejecuta pruebas, no despliega. El hosting de SelimSystem aún no está configurado y se establecerá por separado. No se agregó un gate de cobertura porque aún no hay un umbral justificado.

**Beneficios**: se elimina el repo/secret externo (`PATESI_TESTS_REPO`, `PATESI_TESTS_TOKEN`), el E2E viaja con el código (siempre en sincronía con el producto) y el gate queda autónomo y reproducible.

---

## Apéndice: estado del proyecto (línea base antes de la intervención)

- **Stack**: Node/Express + sesiones + `JsonDB` (archivos JSON), frontend vanilla JS + PWA, deploy a Fly.io.
- **Version en desarrollo**: v1.11.2.
- **Tests existentes**: Jest + supertest, 11 suites / 234 tests (backend).
- **CI**: GitHub Actions con gate de tests antes del deploy (se menciona en CHANGELOG v1.5.1).
- **Brechas detectadas en v1.11.2**: (1) tests no corren en OneDrive, (2) sin eliminación de cuenta, (3) sin E2E de frontend, (4) sin umbral de cobertura definido, (5) sin rate limiting en login.

> Este documento se actualiza a medida que la intervención avanza. La versión de cada sección refleja el "después" más reciente.
