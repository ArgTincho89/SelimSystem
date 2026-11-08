# Propuesta: ajustes en `package.json` raíz para E2E

> No modificar directamente este archivo. El orquestador debe aplicar los cambios en el `package.json` del proyecto raíz.

## 1. Scripts a agregar en `package.json` raíz

Agregar dentro de la sección `scripts`:

```json
{
  "scripts": {
    "start:e2e": "cross-env PORT=3001 DATA_DIR=./e2e/reports/e2e-data NODE_ENV=test node src/server.js",
    "test:e2e": "cd e2e && npm test",
    "test:e2e:api": "cd e2e && npm run test:api",
    "test:e2e:ui": "cd e2e && npm run test:e2e",
    "test:e2e:report": "cd e2e && npm run test:report",
    "postinstall": "cd e2e && npm install"
  }
}
```

### Justificación

- `start:e2e`: levanta el servidor aislado en el puerto `3001` con `DATA_DIR` apuntando a `e2e/reports/e2e-data`. Esto garantiza que los tests no toquen datos de desarrollo o producción.
- `test:e2e`, `test:e2e:api`, `test:e2e:ui`, `test:e2e:report`: atajos para ejecutar la suite desde la raíz del proyecto.
- `postinstall`: instala automáticamente las dependencias de `e2e/` al correr `npm install` en la raíz.

## 2. Dependencias de desarrollo a agregar en `package.json` raíz

```json
{
  "devDependencies": {
    "cross-env": "^7.0.3"
  }
}
```

## 3. Dependencias de `e2e/package.json` (ya creadas)

```json
{
  "devDependencies": {
    "@playwright/test": "^1.46.0",
    "@types/node": "^20.14.0",
    "cross-env": "^7.0.3",
    "typescript": "^5.5.0",
    "wait-on": "^7.2.0"
  }
}
```

## 4. Instalación de browsers

Después de `npm install`, ejecutar:

```bash
npx playwright install chromium
```

## 5. Cómo levantar el servidor aislado

### Opción A: automática (recomendada)

Playwright levanta el servidor vía `webServer` en `e2e/playwright.config.ts`:

```bash
cd e2e
npx playwright test
```

### Opción B: manual

```bash
npm run start:e2e
```

En otra terminal:

```bash
cd e2e
SKIP_WEBSERVER=1 npx playwright test
```

## 6. Consideraciones

- `DATA_DIR` debe apuntar siempre a un directorio que no sea el de producción ni el de desarrollo local.
- Se recomienda agregar `e2e/reports/e2e-data` y `e2e/reports/html-report` al `.gitignore` raíz.
