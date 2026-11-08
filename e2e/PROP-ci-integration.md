# Propuesta: integración E2E al CI

> Propuesta histórica: la integración E2E descrita aquí ya está en `.github/workflows/ci.yml`, que ejecuta pruebas únicamente y no despliega.

## Objetivo

Agregar un job `e2e-tests` que:

1. Instale dependencias de `e2e/`.
2. Instale browsers de Playwright.
3. Levante el servidor aislado.
4. Ejecute la suite E2E/API.
5. Genere y suba el reporte HTML como artifact.

## Pasos para el job `e2e-tests`

A continuación, el fragmento sugerido para integrar E2E al CI.

```yaml
  e2e-tests:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: unit-tests
    env:
      E2E_PORT: 3001
      DATA_DIR: ./e2e/reports/e2e-data
      NODE_ENV: test

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install root dependencies
        run: npm ci

      - name: Install E2E dependencies
        working-directory: ./e2e
        run: npm ci

      - name: Install Playwright browsers
        working-directory: ./e2e
        run: npx playwright install --with-deps chromium

      - name: Start E2E server
        run: |
          npm run start:e2e &
          npx wait-on http://localhost:${{ env.E2E_PORT }}/health --timeout 60000

      - name: Run E2E tests
        working-directory: ./e2e
        run: npx playwright test
        env:
          E2E_PORT: ${{ env.E2E_PORT }}
          E2E_BASE_URL: http://localhost:${{ env.E2E_PORT }}
          SKIP_WEBSERVER: 1
          DATA_DIR: ${{ env.DATA_DIR }}

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: E2E Tests v${{ github.ref_name }}
          path: |
            e2e/reports/html-report
            e2e/reports/test-results
            e2e/reports/junit-results.xml
          retention-days: 7
```

## Explicación

### Instalación

- `npm ci` en la raíz instala dependencias del backend y del proyecto.
- `npm ci` en `e2e/` instala Playwright, TypeScript y `wait-on`.
- `npx playwright install --with-deps chromium` instala el browser y sus dependencias de sistema.

### Servidor aislado

- `npm run start:e2e` usa `cross-env` para setear `PORT=3001`, `DATA_DIR=./e2e/reports/e2e-data` y `NODE_ENV=test`.
- `wait-on` espera a que `/health` responda antes de continuar.
- `SKIP_WEBSERVER=1` evita que Playwright intente levantar otro servidor.

### Ejecución

- `npx playwright test` corre todos los tests en `e2e/`.
- La variable `E2E_BASE_URL` garantiza que los tests apunten al servidor levantado manualmente.

### Artifact

- El reporte HTML queda en `e2e/reports/html-report`.
- Los resultados de tests (screenshots, videos, trazas) quedan en `e2e/reports/test-results`.
- El resultado JUnit queda en `e2e/reports/junit-results.xml`.
- El nombre del artifact usa el tag/versión actual: `E2E Tests v{x.y.z}`.

## Nombre del artifact con la versión del proyecto

Si el workflow ya dispone de la versión del `package.json`, se puede usar:

```yaml
      - name: Get package version
        id: pkg
        run: echo "version=$(node -p \"require('./package.json').version\")" >> $GITHUB_OUTPUT

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: E2E Tests v${{ steps.pkg.outputs.version }}
          path: |
            e2e/reports/html-report
            e2e/reports/test-results
            e2e/reports/junit-results.xml
          retention-days: 7
```

## Orden de jobs

Asegurarse de que `e2e-tests` dependa de `unit-tests`:

```yaml
jobs:
  unit-tests:
    ...

  e2e-tests:
    needs: unit-tests
    ...
```

## Notas adicionales

- Es recomendable agregar `e2e/reports/e2e-data`, `e2e/reports/html-report` y `e2e/reports/test-results` al `.gitignore` raíz.
- Si se desea correr en paralelo dentro de CI, se puede incrementar `workers` en `playwright.config.ts` una vez que se verifique que no hay contaminación de datos entre tests.
