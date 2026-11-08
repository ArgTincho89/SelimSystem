# SelimSystem E2E/API Test Suite

Suite de pruebas end-to-end y de API para SelimSystem, construida con **Playwright + TypeScript + Cucumber**.

Los escenarios se escriben en **Gherkin en español** y se ejecutan con `@cucumber/cucumber`. Playwright sigue siendo el driver de navegador y API.

## Instalación

Desde la raíz del proyecto:

```bash
npm run test:e2e:install
```

O manualmente dentro de `e2e/`:

```bash
cd e2e
npm ci
```

También se requiere el navegador Chromium de Playwright:

```bash
npm run install:browsers
```

## Cómo correr los tests

Desde la raíz del proyecto:

```bash
npm run test:e2e      # Toda la suite Cucumber
```

Comandos disponibles dentro de `e2e/`:

```bash
npm test              # Toda la suite Cucumber
npm run test:e2e      # Toda la suite Cucumber
npm run test:api      # Solo escenarios taggeados @api
npm run test:ui       # Solo escenarios taggeados @ui
npm run test -- --tags "@regression"  # Solo escenarios de cobertura ampliada
npm run report        # Abrir reporte HTML de Cucumber
npm run ui            # No aplica; Cucumber no tiene modo UI interactivo
npm run install:browsers
```

Cucumber arranca automáticamente el backend en `E2E_PORT` (default `3001`) con `DATA_DIR` en `os.tmpdir()`. No hace falta iniciar el servidor a mano.

## Estructura de la suite

```
e2e/
├── features/           # Escenarios Gherkin en español
│   ├── api/            # Features de API
│   └── ui/             # Features de UI
├── steps/              # Step definitions en TypeScript
│   ├── common/         # Steps compartidos (auth, HTTP)
│   ├── api/            # Steps específicos de API
│   └── ui/             # Steps específicos de UI
├── support/            # World y hooks
│   ├── world.ts
│   └── hooks.ts
├── pages/              # Page Objects reutilizados
├── fixtures/           # Factories y helpers reutilizados
├── reports/            # Reportes generados por Cucumber
├── cucumber.js         # Configuración de Cucumber
└── playwright.config.ts # Legacy; ya no se usa directamente
```

## Reportes

Al ejecutar la suite se generan dos reportes:

- `e2e/reports/cucumber-report.json` — Resultado en formato JSON.
- `e2e/reports/cucumber-report.html` — Reporte HTML navegable.

Para abrir el reporte HTML:

```bash
npm run report
```

### Cómo leer los reportes

- **JSON**: cada elemento del array representa un escenario. Campos clave:
  - `name`: nombre del escenario.
  - `uri`: archivo `.feature`.
  - `elements`: pasos del escenario con `result.status` (`passed`, `failed`, `skipped`).
  - `tags`: etiquetas como `@api`, `@ui`, `@smoke`.
- **HTML**: abre el archivo en navegador, selecciona una feature o escenario y revisa el estado de cada paso, tiempos y posibles attachments (screenshots de fallo).

## Convenciones de la suite

- **Page Object Model (POM)**: los selectores y acciones de UI viven en `pages/`.
- **Aislamiento de datos**: cada escenario crea su propio usuario de prueba y lo elimina en el hook `After`. Los datos residen en `DATA_DIR` bajo `os.tmpdir()`.
- **Escenarios independientes**: no dependen del estado dejado por otro escenario.
- **Tags**:
  - `@api`: escenarios de API.
  - `@ui`: escenarios de interfaz de usuario.
  - `@smoke`: smoke tests críticos.
  - `@regression`: cobertura funcional ampliada (todos los nuevos escenarios UI).
  - `@auth`, `@category`, `@transaction`, `@home`, `@summary`, `@statistics`, `@goals`, `@profile`: agrupan escenarios por funcionalidad.

## Mapeo entre escenarios Gherkin y specs Playwright originales

| Spec original                              | Feature Cucumber                              | Escenarios |
|--------------------------------------------|-----------------------------------------------|------------|
| `api/auth.spec.ts`                         | `features/api/auth.feature`                   | 10         |
| `api/categories.spec.ts`                   | `features/api/categories.feature`             | 4          |
| `api/goals.spec.ts`                        | `features/api/goals.feature`                  | 3          |
| `api/transactions.spec.ts`                 | `features/api/transactions.feature`           | 10         |
| `api/summary.spec.ts`                      | `features/api/summary.feature`                | 5          |
| `e2e/health-check.spec.ts`                 | `features/ui/health-check.feature`            | 1          |
| `e2e/smoke.spec.ts`                        | `features/ui/smoke.feature`                   | 4          |
| `e2e/register-login.spec.ts`               | `features/ui/register-login.feature`          | 1          |
| `e2e/create-expense.spec.ts`               | `features/ui/create-expense.feature`          | 1          |
| `e2e/view-summary.spec.ts`                 | `features/ui/view-summary.feature`            | 1          |
| `e2e/logout.spec.ts`                       | `features/ui/logout.feature`                  | 1          |
| Nuevos — auth UI                           | `features/ui/auth-lifecycle.feature`          | 3          |
| Nuevos — categorías UI                     | `features/ui/categories.feature`              | 3          |
| Nuevos — transacciones UI                  | `features/ui/transactions.feature`            | 9          |
| Nuevos — dashboard home UI                 | `features/ui/home-dashboard.feature`          | 3          |
| Nuevos — resumen UI                        | `features/ui/summary.feature`                 | 5          |
| Nuevos — estadísticas UI                   | `features/ui/statistics.feature`              | 3          |
| Nuevos — metas UI                          | `features/ui/goals.feature`                   | 3          |
| Nuevos — perfil UI                         | `features/ui/profile.feature`                 | 3          |
| **Total**                                  |                                               | **73**     |

Los specs originales fueron migrados a features y retirados del árbol activo. El historial permanece disponible en Git.
