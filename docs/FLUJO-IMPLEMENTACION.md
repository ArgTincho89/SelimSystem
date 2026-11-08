# Flujo de implementación: del pedido a la PWA

> **Estado actual (2026-11-08):** el hosting de SelimSystem aún no está configurado. La cuenta, la aplicación y el flujo de despliegue se crearán por separado para SelimSystem. Este documento contiene instrucciones heredadas de Fly.io que ya no son vigentes; no las uses para aprovisionar ni desplegar.

Documento histórico del flujo de SelimSystem. Las secciones de hosting y despliegue describen una configuración heredada y no representan el estado actual.

---

## Camino rápido

1. Se pide un cambio en lenguaje natural al asistente.
2. El asistente implementa el cambio, corre los gates locales y hace `git push` a `master`.
3. GitHub Actions ejecuta únicamente los tests unitarios (Jest) y end-to-end (Playwright + TypeScript) definidos en `.github/workflows/ci.yml`.
4. El hosting y el despliegue de SelimSystem aún no están configurados; se establecerán por separado para SelimSystem.

---

## 1. Objetivo y alcance

**Qué documenta este documento**

- El flujo histórico anterior de implementación y despliegue, para referencia; las instrucciones de hosting no son vigentes.
- La verificación CI vigente, que ejecuta pruebas únicamente mediante `.github/workflows/ci.yml`, y los gates locales (`.husky/pre-push`).
- Deudas y riesgos verificados en el repositorio, y las diferencias con el documento de línea base `presentacion-flujo-ia.md`.

**Qué NO documenta**

- No es un manual de desarrollo local: no explica el modelo de datos, la arquitectura interna de Express, ni cómo se construye una pantalla.
- No documenta funcionalidad del producto (eso está en `docs/DOCUMENTO-FUNCIONAL.md` y `docs/DESIGN-SYSTEM.md`).
- No documenta el proceso interno de razonamiento del asistente ni sus fases SDD: describe el **efecto** de esa etapa sobre el repositorio, porque en el repositorio no hay nada ejecutable que la represente (ver sección 4).
- No incluye valores de secretos. Las credenciales se mencionan **solo por nombre**.

**Regla de este documento**: toda afirmación es rastreable a un archivo del repositorio. Cuando algo depende de una semántica externa (Fly.io, GitHub) se indica explícitamente la fuente. Cuando algo del flujo **no** está automatizado hoy, se dice que no lo está.

---

## 2. Resumen en una imagen

```
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  1. PEDIDO                                                                │
  │  Usuario (Windows + carpeta OneDrive)                                     │
  │  Ejemplo: "agregar favoritos en las tarjetas de analíticas"               │
  └──────────────────────────────┬────────────────────────────────────────────┘
                                 │  lenguaje natural
                                 ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  2. ASISTENTE DE IA / ORQUESTADOR                                         │
  │  Interpreta el pedido, elige la ruta (directo / delegado / SDD),          │
  │  edita el código y ejecuta comandos en la máquina del usuario             │
  └──────────────────────────────┬────────────────────────────────────────────┘
                                 │  git commit  (conventional commit)
                                 ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  3. GIT LOCAL + HOOK PRE-PUSH (Husky)                                     │
  │  Si el diff toca src/  → jest --changedSince=origin/master --coverage     │
  │  Si no                 → jest --coverage (suite completa)                 │
  │  El push se aborta si el gate local falla                                 │
  └──────────────────────────────┬────────────────────────────────────────────┘
                                 │  git push origin master
                                 ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  4. GITHUB  (repo público ArgTincho89/SelimSystem)                         │
  │  Evento: push a master  (o workflow_dispatch manual)                      │
  └──────────────────────────────┬────────────────────────────────────────────┘
                                 │  dispara el workflow "Deploy to Fly.io"
                                 ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  5. GITHUB ACTIONS  (runner ubuntu-latest, Node 22)                       │
  │                                                                           │
  │   [job 1] unit-tests .... npm ci + npm test                    (Jest)     │
  │        │ needs                                                           │
  │        ▼                                                                  │
  │   [job 2] e2e-tests ..... npm ci + npm ci (e2e) + playwright install      │
  │        │                  + npm run test:e2e + artifact del reporte       │
  │        │ needs                                                            │
  │        ▼                                                                  │
  │   [job 3] deploy ........ npm version patch  →  push del bump [skip ci]   │
  │                           flyctl deploy --remote-only (FLY_API_TOKEN)     │
  └──────────────────────────────┬────────────────────────────────────────────┘
                                 │  contexto de build (fuera del runner)
                                 ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  6. FLY.IO  (app "selimsystem", región iad)                                │
  │  Builder remoto: Dockerfile → node:22-alpine + src/ + public/             │
  │  Máquina shared-cpu-1x, 1 GB RAM, 1 CPU                                   │
  │  Health check GET /health cada 10 s → sin check OK no recibe tráfico      │
  │  Volumen persistente selimsystem_data montado en /data (base JSON)         │
  └──────────────────────────────┬────────────────────────────────────────────┘
                                 │  HTTPS
                                 ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  7. TELÉFONO  (PWA instalada)                                             │
  │  Al reabrir: pide /sw.js → si cambió, instala el SW nuevo, borra el       │
  │  caché viejo, precachea assets nuevos y recarga la página                 │
  └───────────────────────────────────────────────────────────────────────────┘

  Servicios auxiliares fuera de la línea principal:
  · Gmail SMTP (Nodemailer)  → correo de restablecimiento de contraseña
  · Cron interno de la app   → definido pero NO activado (ver sección 14)
  · GitHub Secrets           → FLY_API_TOKEN (usado); PATESI_TESTS_TOKEN (legado)
```

---

## 3. Actores y servicios

| # | Servicio / componente | Rol en el flujo | Cuenta o plan requerido | Credencial o clave | Dónde vive esa credencial | Qué pasa si falta |
|---|---|---|---|---|---|---|
| 1 | **Máquina del usuario**: Windows, carpeta sincronizada por OneDrive | Origen del cambio; ejecuta el asistente, Git y los gates locales | Ninguna | Ninguna (para editar); credenciales de GitHub para el push | Keyring del sistema (`gh auth`), no en el repo | No se puede desarrollar ni hacer push |
| 2 | **Asistente de IA / orquestador** | Interpreta el pedido, decide la ruta, escribe código y ejecuta comandos locales | Cuenta del proveedor del modelo (fuera del repo) | Ninguna referenciada en el repositorio | — | El trabajo vuelve a ser 100% manual |
| 3 | **Git local** (v2.37.0 en esta máquina) | Control de versiones, hook `pre-push`, `push` a `origin` | Ninguna | Credenciales de GitHub del usuario (`gh` con scopes `repo`, `workflow`) | Keyring del sistema operativo | Sin credenciales, el `push` falla |
| 4 | **GitHub — repositorio** `ArgTincho89/SelimSystem` (público, rama `master`) | Fuente de verdad del código y del historial | Cuenta gratuita de GitHub | Ninguna para clonar (repo público); credenciales para escribir | — | Sin repositorio no hay CI ni deploy |
| 5 | **GitHub Actions — runners** (`ubuntu-latest`) | Ejecuta los gates de calidad y el deploy | Incluido en la cuenta de GitHub (minutos gratuitos e ilimitados en repos públicos) | `GITHUB_TOKEN`, inyectado automáticamente por la plataforma | Generado por Actions en cada corrida | Sin runner no hay pipeline |
| 6 | **GitHub Secrets** | Guarda el token de deploy de Fly y (legado) el token de tests externo | Cuenta de GitHub con permiso de administración del repo | `FLY_API_TOKEN` (en uso), `PATESI_TESTS_TOKEN` (legado, sin uso en el pipeline actual) | Repositorio → Settings → Secrets and variables → Actions | El job `deploy` falla al autenticarse contra Fly |
| 7 | **Fly.io — app** `selimsystem`, región `iad` (N. Virginia) | Hosting del runtime Node/Express, HTTPS y health checks | Cuenta de Fly.io (la app usa una VM `shared-cpu-1x` con 1 GB) | Token de despliegue (`FLY_API_TOKEN`) o sesión de `flyctl` (`fly auth login`) | GitHub Secrets (para CI); sesión local para uso manual | No hay deploy |
| 8 | **Fly.io — volumen** `selimsystem_data` montado en `/data` | Almacena la base JSON (usuarios y colecciones por usuario) | Recurso de la app en Fly | Ninguna adicional | Definido en `fly.toml` (`[mounts]`) y creado con `fly volumes create` | La app escribe en un directorio efímero: los datos se pierden en cada redeploy |
| 9 | **Gmail SMTP vía Nodemailer** | Envía el correo de restablecimiento de contraseña | Cuenta de Gmail con verificación en dos pasos y App Password | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Secretos de Fly en producción (procedimiento en `README.md`); `.env` local (ver sección 14) | El envío falla en silencio: el error solo queda en el log del contenedor (`[EMAIL] Error enviando email`) |
| 10 | **PWA instalada en el teléfono** | Cliente final del cambio | Ninguna (usa el navegador) | Ninguna | — | El usuario accede por el navegador en lugar de la app instalada |
| 11 | **Playwright + Chromium (en CI)** | Motor de los tests end-to-end | Open source | Ninguna | Se instala dentro del job `e2e-tests` | El job `e2e-tests` falla y el deploy no corre |
| 12 | **Husky (local)** | Dispara el gate de tests antes de que el push salga de la máquina | Open source | Ninguna | `.husky/pre-push` + `core.hooksPath` apuntando a `.husky/_` | Los gates locales no se ejecutan; el push sale sin verificación previa |
| 13 | **GitHub Actions — artefactos** | Guarda el reporte HTML/JSON de la suite E2E | Incluido en la cuenta | `GITHUB_TOKEN` | Generado por la plataforma | No queda reporte E2E descargable desde la corrida |

**Nombres de variables de entorno del contrato local** (`.env.example`): `SESSION_SECRET`, `APP_URL`, `DATA_DIR`, `PORT`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `ONESIGNAL_APP_ID`, `ONESIGNAL_API_KEY`.

---

## 4. Del pedido a la idea de cambio

El pedido entra en **lenguaje natural** (por ejemplo: "las tarjetas de analíticas deberían poder marcarse como favoritas"). El asistente lo traduce a un cambio en el repositorio y decide la ruta según el tamaño y la incertidumbre:

| Tamaño del cambio | Ruta |
|---|---|
| Cambio chico y bien entendido (un archivo, sin investigación) | Implementación directa |
| Dos o más archivos, o requiere entender código existente | Tarea delegada a un sub-agente especializado |
| Cambio grande, ambiguo o de alto alcance | SDD (Spec-Driven Development): explore → propose → spec → design → tasks → apply → verify → archive |

**Advertencia de alcance**: esta etapa **no está automatizada en el repositorio**. No existe ningún archivo, script ni workflow que represente la clasificación de la ruta ni las fases de SDD. Es una convención de trabajo del asistente, descripta como línea base en `presentacion-flujo-ia.md` (sección "Etapa 1"). Lo que sí queda como evidencia verificable en el repositorio es el resultado: los commits convencionales y, cuando corresponde, los tests que los acompañan.

Lo que **sí** es determinista y verificable es lo que ocurre a partir del commit: secciones 5 a 7.

---

## 5. Implementación y gates locales

### 5.1 Qué se produce

- Cambios en `src/` (backend Express, rutas, middleware, DB JSON) y/o `public/` (frontend vanilla JS, CSS, `sw.js`), y tests en `tests/`.
- Los tests unitarios/de API viven en `tests/**/*.test.js` (Jest 29 + Supertest). Hay **11 archivos `.test.js`** en el árbol local; el repositorio documenta **234 tests** a la altura de v1.11.2 (`docs/testing/HALLAZGOS-Y-ACCIONES.md`).
- La suite E2E vive en `e2e/` (Cucumber + Playwright + TypeScript): **19 archivos `.feature`** en `e2e/features/`.
- `jest.config.js` define `maxWorkers: 1`, `forceExit: true` y `detectOpenHandles: true`.

### 5.2 Convención de commits

Formato observado en `git log`: `tipo(scope): descripción`, con tipos `feat`, `fix`, `chore`, `test`, `ci`, `docs`. Ejemplos reales:

```
597cb2a fix(ui): refine desktop analytics favorites
26a42eb fix(ui): compact analytic favorites and month navigation
cba025b feat(ui): add analytic card favorites and tooltips
9cc68b5 test(auth): allow slow password change test
```

La convención **no está forzada por ningún hook**: en `.husky/` solo existen `_` (shims) y `pre-push`. No hay `commit-msg` ni `pre-commit`. La versión **no** se escribe a mano en los commits (ver sección 15).

### 5.3 El hook `pre-push` (`.husky/pre-push`)

Toda la lógica del gate local vive en 11 líneas:

```sh
changed=$(git diff --name-only origin/master...HEAD 2>/dev/null)

if printf '%s\n' "$changed" | grep -qE '^src/'; then
  npm run test:coverage:diff
else
  npm run test:coverage
fi
```

| Situación | Qué corre | Comando exacto |
|---|---|---|
| El diff contra `origin/master` toca al menos un archivo bajo `src/` | Gate rápido, solo archivos cambiados, con cobertura | `npm run test:coverage:diff` → `jest --changedSince=origin/master --coverage --forceExit --detectOpenHandles` |
| El diff no toca `src/` (solo tests, frontend, config) | Suite completa con cobertura | `npm run test:coverage` → `jest --forceExit --detectOpenHandles --coverage` |
| El diff no se puede calcular (por ejemplo, `origin/master` no existe: `2>/dev/null` descarta el error y deja la variable vacía) | Suite completa con cobertura (cae en el `else`) | `npm run test:coverage` |

Notas verificadas:

- La suite **E2E no corre en el hook local**; solo está en CI (y disponible a mano con `npm run test:e2e`).
- El hook ejecuta Jest, no `npm test`: la diferencia es la cobertura (`--coverage`).
- El umbral de cobertura **solo se hace cumplir localmente**. El pipeline ejecuta `npm test`, sin cobertura (ver sección 7).

### 5.4 Umbrales de cobertura (`jest.config.js`)

Cobertura calculada sobre `src/**/*.js`, excluyendo `src/server.js`, `src/services/cron.js`, `src/services/email.js` y `src/db/seed.js`.

| Ámbito | Branches | Functions | Lines | Statements |
|---|---|---|---|---|
| Global | 60 | 60 | 60 | 60 |
| `src/routes/auth.js` | 68 | 70 | 68 | 68 |
| `src/routes/transactions.js` | 85 | 85 | 90 | 90 |
| `src/routes/summary.js` | 70 | 80 | 90 | 90 |
| `src/routes/trends.js` | 75 | 75 | 80 | 80 |
| `src/routes/goals.js` | 75 | 75 | 80 | 80 |
| `src/routes/categories.js` | 75 | 75 | 80 | 80 |
| `src/db/jsondb.js` | 78 | 80 | 80 | 80 |
| `src/middleware/**/*.js` | 80 | 80 | 85 | 85 |

El propio archivo documenta que los umbrales por módulo reflejan la realidad medida en v1.11.8 y no un objetivo aspiracional, para que el gate local no quede permanentemente en rojo.

### 5.5 Limitación conocida de esta máquina

En la copia de trabajo dentro de OneDrive, **Jest no descubre ningún test**:

```
> node node_modules/jest/bin/jest.js --listTests
(sin salida)   exit=0
> node node_modules/jest/bin/jest.js --showConfig   →  rootDir y testMatch correctos
```

Los archivos del árbol tienen el atributo `ReparsePoint` de OneDrive (Files On-Demand), y `jest.config.js` ya incluye un intento de compatibilidad (`haste: { enableSymlinks: true }`, `watchman: false`, comentado como "OneDrive compatibility"). El mismo binario de Jest, con la misma configuración, en un directorio fuera de OneDrive, sí lista el test. El propio repositorio ya había documentado este comportamiento en `docs/testing/HALLAZGOS-Y-ACCIONES.md` ("0 tests encontrados, aunque existen 11 archivos `*.test.js` con 234 tests"; copia física fuera de OneDrive: "la suite pasa completa: 234 tests en verde"). Detalle y consecuencias en la sección 14.

---

## 6. Push y disparo del pipeline

| Aspecto | Detalle |
|---|---|
| Qué se pushea | El commit (o los commits) de la rama local `master` |
| Rama destino | `master` (única rama de trabajo; `gh repo view` confirma `defaultBranchRef.name = master`) |
| Remoto | `origin` → `https://github.com/ArgTincho89/SelimSystem.git` |
| Eventos que disparan el workflow | `push` sobre `master` y `workflow_dispatch` (ejecución manual desde la UI de GitHub) |
| Eventos que NO disparan nada | `pull_request`, otros branches y los tags no están contemplados en el workflow |
| Archivos de trabajo que no llegan a CI | `data/`, `coverage/`, `.env`, `node_modules/`, `.e2e-data/`, `e2e/reports/` están en `.gitignore` |

Consecuencia práctica: **no existe etapa de pull request**. El pipeline corre después del push, sobre `master`. La protección contra un cambio roto es el gate local previo más los dos jobs de tests en CI (el deploy no corre si alguno falla).

---

## 7. GitHub Actions en detalle, job por job

Workflow único: `.github/workflows/fly-deploy.yml` (nombre: `Deploy to Fly.io`, 116 líneas). Triggers:

```yaml
on:
  push:
    branches: [master]
  workflow_dispatch:
```

El workflow **no** declara un bloque `permissions` global: los jobs 1 y 2 usan los permisos por defecto del repositorio, y el job 3 los amplía a `contents: write`. No hay `concurrency` (dos pushes seguidos pueden correr en paralelo) ni `env` global.

### 7.1 Job 1 — `unit-tests`

| Campo | Valor |
|---|---|
| Propósito | Gate de regresión de la lógica de backend |
| Runner | `ubuntu-latest` |
| Dependencias (`needs`) | Ninguna: es el primer eslabón |
| Timeout | No declarado (aplica el máximo por defecto de Actions: 360 minutos) |
| Permisos especiales | Ninguno |
| Artefactos | Ninguno |

Pasos, en orden:

| Orden | Paso | Comando / acción exacta |
|---|---|---|
| 1 | Checkout | `actions/checkout@v4` |
| 2 | Setup Node.js | `actions/setup-node@v4` con `node-version: '22'` y `cache: 'npm'` |
| 3 | Instalar dependencias | `npm ci` |
| 4 | Correr tests unitarios | `npm test` → `jest --forceExit --detectOpenHandles` |

Qué verifica: la suite de `tests/**/*.test.js` (rutas de API, middleware, capa de datos y utilidades). Si falla, el workflow se marca como fallido y **los jobs 2 y 3 no se ejecutan** (por `needs`). El push ya quedó en `master`: el código roto está en el repositorio, pero no en producción.

### 7.2 Job 2 — `e2e-tests`

| Campo | Valor |
|---|---|
| Propósito | Gate funcional completo (auth, transacciones, resumen, metas, categorías y un health check de UI) contra un servidor real y aislado |
| Runner | `ubuntu-latest` |
| Dependencias (`needs`) | `unit-tests` |
| Timeout | `timeout-minutes: 20` |
| Permisos especiales | Ninguno |
| Artefactos | `E2E Tests v{versión}` ← carpeta `e2e/reports/`, `retention-days: 14`, subido con `if: ${{ !cancelled() }}` (se sube incluso si la suite falla) |

Pasos, en orden:

| Orden | Paso | Comando / acción exacta |
|---|---|---|
| 1 | Checkout | `actions/checkout@v4` |
| 2 | Setup Node.js | `actions/setup-node@v4`, Node 22, `cache: 'npm'` |
| 3 | Dependencias del backend | `npm ci` |
| 4 | Dependencias del E2E | `npm ci` con `working-directory: e2e` |
| 5 | Navegador de Playwright | `npx playwright install --with-deps chromium` (en `e2e/`) |
| 6 | Correr la suite E2E | `npm run test:e2e` → `npm run --prefix e2e test` → `cucumber-js` |
| 7 | Leer versión de la app | `node -p "require('./package.json').version"` → salida `version` en `$GITHUB_OUTPUT` |
| 8 | Subir el reporte E2E | `actions/upload-artifact@v4` con el nombre `E2E Tests v${{ steps.version.outputs.version }}` |

Cómo funciona la suite por dentro (verificado en `e2e/`):

- `e2e/cucumber.js` carga `support/**/*.ts` y `steps/**/*.ts` con `ts-node/register` y escribe los reportes JSON y HTML en `e2e/reports/`.
- `e2e/support/hooks.ts` levanta su propio servidor si no hay uno ya respondiendo en `/health`: `spawn('node', ['src/server.js'])` con `E2E_PORT` (3001 por defecto), `DATA_DIR` (por defecto un directorio temporal) y `NODE_ENV=test`. Espera hasta 120 s a que el servidor esté listo y falla si no arranca.
- Cada escenario abre un contexto de navegador con `devices['Desktop Chrome']` y **`serviceWorkers: 'block'`**, para que el Service Worker no interfiera en los tests. Verifica además que no haya `pageerror` ni errores de consola (excepto el 401 esperado en `/login`) y adjunta un screenshot cuando un escenario falla.
- Al terminar cada escenario borra la cuenta creada (limpieza best-effort).

Nota: la versión que aparece en el nombre del artefacto es la de `package.json` en el commit que se está probando, **antes** del bump del job 3 (ver 7.3 y sección 14).

### 7.3 Job 3 — `deploy`

| Campo | Valor |
|---|---|
| Propósito | Bump automático de versión y deploy a Fly.io |
| Runner | `ubuntu-latest` |
| Dependencias (`needs`) | `[unit-tests, e2e-tests]` |
| Timeout | No declarado (máximo por defecto de Actions) |
| Permisos especiales | `permissions: contents: write` — necesario para que el job pueda pushear el commit de versión |
| Artefactos | Ninguno |

Pasos, en orden:

| Orden | Paso | Comando / acción exacta |
|---|---|---|
| 1 | Checkout | `actions/checkout@v4` con `token: ${{ secrets.GITHUB_TOKEN }}` |
| 2 | Setup Node.js | `actions/setup-node@v4`, Node 22, `cache: 'npm'` |
| 3 | Bump de versión | `git config user.name "github-actions[bot]"`, `git config user.email "github-actions[bot]@users.noreply.github.com"`, `npm version patch -m "chore(release): bump v%s [skip ci]"`, luego lee la versión a `$GITHUB_OUTPUT` y ejecuta `git push` |
| 4 | Instalar flyctl | `superfly/flyctl-actions/setup-flyctl@master` |
| 5 | Deploy | `flyctl deploy --remote-only` con `FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}` |

**El bump automático de versión**:

- `npm version patch` incrementa el patch en `package.json` y en `package-lock.json` (verificado: ambos quedan en la misma versión), crea el commit con el mensaje `chore(release): bump vX.Y.Z [skip ci]` y lo pushea a `master` con el `GITHUB_TOKEN` del job.
- **Por qué `[skip ci]`**: ese push lo hace un bot dentro del propio workflow disparado por `master`. Sin la marca, GitHub lanzaría una nueva corrida del pipeline por ese commit, encadenando corridas indefinidamente. GitHub Actions interpreta `[skip ci]` en el mensaje y omite la ejecución.
- `npm version patch` crea además un tag local `vX.Y.Z` en el runner, pero **no se pushea**: el paso usa `git push` sin `--follow-tags`, y `git ls-remote --tags origin` no devuelve ningún tag. En el repositorio hoy **no hay tags de release**.
- El bump ocurre **antes** del deploy: si el deploy falla, la versión ya avanzó y quedó pusheada.

**El deploy**:

- `flyctl deploy --remote-only` sube el contexto de build y Fly construye la imagen **en su builder remoto**, no en el runner. Por eso el runner no necesita Docker ni caché de capas.
- La autenticación usa `FLY_API_TOKEN` (GitHub Secret), que solo existe como variable de entorno de ese paso.

**Quality gate en cadena**: el job 3 declara `needs: [unit-tests, e2e-tests]`. Si cualquiera de los dos jobs previos falla, el deploy **no corre**: no hay bump de versión, no hay release en Fly.io y producción no se toca. En la UI de GitHub, el job `deploy` aparece como omitido (`skipped`) porque no se cumple su condición de dependencia.

---

## 8. Fly.io: build y runtime

### 8.1 `fly.toml` parámetro por parámetro

| Parámetro | Valor | Significado |
|---|---|---|
| `app` | `selimsystem` | Nombre de la aplicación en Fly.io |
| `primary_region` | `iad` | Región primaria: N. Virginia (EE. UU.) |
| `[build]` | (vacío) | Sin configuración extra: Fly usa el `Dockerfile` del repositorio |
| `[env] PORT` | `3000` | Puerto en el que escucha Express dentro de la máquina |
| `[env] NODE_ENV` | `production` | Modo producción (activa `secure` en la cookie de sesión, ver `src/app.js`) |
| `[env] APP_URL` | `https://selimsystem.fly.dev` | URL base pública; se usa para CORS (`cors({ origin: config.appUrl })`) y para construir el link del correo de reseteo |
| `[env] SESSION_SECRET` | (valor hexadecimal de 64 caracteres) | Secreto de firma de las cookies de sesión, **definido en claro dentro del archivo versionado** (ver secciones 11 y 14) |
| `internal_port` | `3000` | Puerto interno que Fly usa para enrutar el tráfico hacia la máquina |
| `force_https` | `true` | Todo el tráfico HTTP se redirige a HTTPS |
| `auto_stop_machines` | `true` | Fly Proxy puede apagar máquinas cuando no hay tráfico y sobra capacidad |
| `auto_start_machines` | `true` | Fly Proxy vuelve a arrancar una máquina cuando llega una petición |
| `min_machines_running` | `1` | Mínimo de máquinas encendidas en la región primaria, incluso en reposo (semántica documentada por Fly.io) |
| `concurrency.type` | `connections` | El límite de concurrencia se mide en conexiones |
| `concurrency.soft_limit` / `hard_limit` | `200` / `250` | Fly Proxy usa el soft limit para detectar exceso de capacidad y el hard limit como techo |
| `http_service.checks` | `GET /health`, `interval 10s`, `timeout 5s` | Health check contra el endpoint `/health` que expone `src/app.js` (`res.status(200).json({ status: 'ok' })`) |
| `[vm] memory` | `1gb` | Memoria de la máquina |
| `[vm] cpu_kind` / `cpus` | `shared` / `1` | Una vCPU compartida |
| `[mounts] source` | `selimsystem_data` | Nombre del volumen persistente |
| `[mounts] destination` | `/data` | Punto de montaje del volumen dentro de la máquina |

**Sobre auto stop/start**: con una sola máquina desplegada y `min_machines_running = 1`, el apagado por inactividad no puede dejar la app en cero: siempre hay una máquina en marcha. En la práctica, el efecto de ahorro de `auto_stop_machines` es limitado mientras se mantenga un mínimo de una máquina.

**Qué pasa si la app no responde sana**: Fly Proxy deja de enviar tráfico a una máquina que falla sus health checks (la máquina puede seguir viva para depurar, pero queda fuera de rotación). Si **todas** las máquinas fallan, los usuarios reciben 503 (semántica documentada por Fly.io). En el flujo de deploy, el paso `flyctl deploy` es el que refleja el resultado: si la máquina nueva no llega a estar sana, el deploy falla y el job `deploy` de GitHub aparece en rojo. Fly no hace rollback automático a la release anterior.

### 8.2 Build de la imagen (`Dockerfile`)

| Instrucción | Efecto |
|---|---|
| `FROM node:22-alpine` | Base liviana; misma major de Node que usa CI (22) |
| `WORKDIR /app` | Directorio de trabajo del contenedor |
| `COPY package.json package-lock.json* ./` + `RUN npm ci --omit=dev` | Solo dependencias de producción: Jest, Supertest, Husky y el resto de devDependencies **no viajan** a la imagen |
| `COPY src/ ./src/` y `COPY public/ ./public/` | Únicamente backend y frontend. Tests, `e2e/`, `coverage/`, `data/` y documentación quedan fuera de la imagen |
| `RUN mkdir -p /data` | Crea el punto de montaje del volumen |
| `ENV NODE_ENV=production`, `ENV DATA_DIR=/data`, `ENV PORT=3000` | Configuración de producción dentro de la imagen |
| `EXPOSE 3000` | Documenta el puerto (el mapeo real lo define `internal_port` en `fly.toml`) |
| `CMD ["node", "src/server.js"]` | Punto de entrada |

`.dockerignore` excluye `node_modules`, `tests`, `coverage`, `.git`, `.env` y `*.md` del contexto de build. No excluye `e2e/` ni los archivos de datos de test (`e2e/node_modules`, `.e2e-data`): el contexto que se envía al builder remoto puede ser más pesado de lo necesario, aunque nada de eso termina dentro de la imagen porque el `Dockerfile` no lo copia.

### 8.3 Dónde vive la base de datos

- No hay base externa. La persistencia es el volumen `selimsystem_data` montado en `/data`, y `DATA_DIR=/data` (definido en el `Dockerfile` como variable de imagen y también en la lista de secretos documentada en el `README.md`). El valor por defecto de `src/config.js` es `data/` dentro del proyecto, y es el que aplica en local.
- `src/app.js` instancia `new JsonDB(config.dataDir)` y lo expone en `app.locals.db`.
- `src/db/jsondb.js` escribe en `users.json` (a nivel raíz de `DATA_DIR`) y, por colección y usuario, en `<DATA_DIR>/<userId>/<coleccion>.json`. Las escrituras son atómicas: escribe un `.tmp` y luego hace `rename`.

---

## 9. Producción y actualización del teléfono

### 9.1 Qué sirve el servidor

- URL pública: **https://selimsystem.fly.dev** (`APP_URL` en `fly.toml`).
- Express (`src/app.js`) sirve, en este orden: rutas de API bajo `/api/*`, el health check `GET /health`, los estáticos de `public/` y, por último, un catch-all `app.get('*')` que devuelve `public/index.html` (SPA con router por hash).
- Los endpoints de API registrados son `/api/auth`, `/api/categories`, `/api/transactions`, `/api/summary`, `/api/trends` y `/api/goals`.
- Seguridad base: `helmet` (con CSP desactivada en la app) y `cors` restringido al `APP_URL`. La sesión usa `express-session` con cookie `httpOnly`, `sameSite: 'lax'`, `secure` en producción y 7 días de vida.

### 9.2 Cómo se compone la PWA

| Archivo | Rol |
|---|---|
| `public/manifest.json` | Metadatos de la app instalable: nombre `SelimSystem`, `start_url: "/"`, `display: "standalone"`, orientación vertical, colores e iconos 192 y 512 |
| `public/sw.js` | Service Worker escrito a mano, sin Workbox. `CACHE_NAME = 'selimsystem-v13'` (se cambia a mano). Precachea una lista fija `STATIC_ASSETS` que incluye `index.html`, todos los CSS y JS, `manifest.json`, los iconos y `version.json` |
| `public/js/app.js` | Registra el Service Worker (`navigator.serviceWorker.register('/sw.js')`) y recarga la página ante el evento `controllerchange` |
| `public/version.json` | `{ "version": "1.11.2" }`. Lo lee la pantalla de login para mostrar el banner de novedades |

Dos comportamientos del `sw.js` que definen cómo se actualiza el teléfono:

- En `install` precachea todo y llama a `self.skipWaiting()`; en `activate` borra los cachés que no sean el actual y llama a `self.clients.claim()`. Combinado con la recarga por `controllerchange` en `app.js`, la versión nueva se aplica sin que el usuario tenga que cerrar la app.
- Para estáticos, la estrategia es **cache-first** (`caches.match` y, si no hay, red). Para `/api/*` va directo a red, con fallback offline que responde `503 { error: "Sin conexión" }`.

### 9.3 Secuencia exacta de actualización en el teléfono

1. El deploy termina y Fly sirve los archivos nuevos (`index.html`, `sw.js`, JS, CSS).
2. El usuario abre la PWA instalada. El navegador pide `/sw.js` al servidor por red (el `sw.js` no está en la lista de precache).
3. **Si el contenido de `sw.js` cambió** (en la práctica, porque se subió `CACHE_NAME`), el navegador instala el Service Worker nuevo. El `install` precachea los assets nuevos en un caché nuevo y `skipWaiting()` lo activa.
4. El `activate` borra los cachés anteriores. `clients.claim()` toma el control de la página.
5. Se dispara `controllerchange` en `app.js`, que ejecuta `window.location.reload()`. El usuario ve la versión nueva en esa misma sesión.
6. Si el contenido de `sw.js` **no** cambió, el Service Worker sigue sirviendo los assets precacheados (cache-first): aunque el servidor tenga archivos nuevos, el teléfono puede seguir mostrando los viejos.

Consecuencia operativa (verificada en el código y desarrollada en la sección 14): **cambiar el frontend requiere subir a mano `CACHE_NAME` en `public/sw.js`**. El pipeline no lo hace: el bump automático del job `deploy` solo toca `package.json` y `package-lock.json`.

Salida de emergencia para el usuario: la pantalla de login tiene un botón de limpiar caché (`#clear-cache-btn`) que borra todos los cachés, desregistra los Service Workers, limpia `localStorage` y `sessionStorage` y recarga. Es la vía manual para forzar la versión más reciente si el teléfono quedó con assets viejos.

---

## 10. Rollback y re-deploy manual

**Re-ejecutar el workflow (re-deploy sin cambiar código)**

- GitHub → pestaña Actions → workflow "Deploy to Fly.io" → "Run workflow" sobre la rama `master` (`workflow_dispatch`).
- Efecto: vuelve a correr unit-tests y e2e-tests, y si pasan, deploya el mismo commit que hoy está en `master` **con un bump de versión nuevo** (`npm version patch` corre igual). Es decir, re-desplegar avanza la versión, no la repite.

**Revertir un cambio**

- `git revert <sha>` sobre el commit problemático, commit del revert y push a `master`. Se dispara el pipeline completo y, si los gates pasan, se publica el revert. La versión vuelve a subir (nunca baja).
- Si el revert deshace un cambio de `sw.js`, el contenido de `sw.js` cambia otra vez, lo que fuerza la reinstalación del Service Worker en el teléfono. Si el revert no toca `sw.js`, el frontend revertido **no** llegará a la PWA instalada hasta que se suba `CACHE_NAME`.

**Qué NO se pierde**

- El volumen `selimsystem_data` es persistente y está montado en `/data` (`fly.toml`): sobrevive a reinicios y a re-deploys. Los usuarios, transacciones, categorías y metas guardados en JSON no se tocan durante el deploy.
- Lo que **sí** se pierde en cada reinicio o deploy: las sesiones, porque no hay store persistente configurado (ver sección 14). Los usuarios deben volver a iniciar sesión.

**Requisito local**: en esta máquina `flyctl` no está en el `PATH` (verificado). Un deploy manual desde la máquina no es el camino documentado: el camino es el workflow `workflow_dispatch` en GitHub, donde la autenticación la resuelve `FLY_API_TOKEN`.

---

## 11. Requisitos para cada servicio (checklist de credenciales)

### 11.1 GitHub — repositorio y token de deploy

| Ítem | Detalle |
|---|---|
| Para qué sirve | Hospedar el repositorio y ejecutar el pipeline |
| Cómo se obtiene | Crear la cuenta y el repositorio; asignarle el remoto `origin` |
| Dónde se guarda | La cuenta: no aplica. El token de deploy: como GitHub Secret del repositorio |
| Nombre del secreto | `FLY_API_TOKEN` |
| Cómo se genera | Con la CLI de Fly: `fly tokens create deploy` (token de deploy de la organización) o un token acotado a la app. **Este comando no figura en el repositorio**: es la vía documentada por Fly.io |
| Permisos necesarios | El token debe poder construir y publicar releases de la app `selimsystem` |
| Cómo se verifica que funciona | Correr el workflow (`workflow_dispatch`) y ver el paso "Deploy to Fly.io" en verde |
| Requisito adicional | El job `deploy` necesita que el `GITHUB_TOKEN` del workflow tenga permiso de escritura de contenido: el propio job lo pide con `permissions: contents: write`. Si la configuración del repositorio fuerza el token en modo solo lectura, el paso de bump falla al hacer `git push` y el deploy no corre |

Nota: en el repositorio también existe el secreto `PATESI_TESTS_TOKEN`. **Hoy no lo usa ningún archivo del workflow**: era parte del enfoque anterior, que clonaba un repositorio de tests externo. El reemplazo por el E2E dentro del repo está documentado en `docs/testing/HALLAZGOS-Y-ACCIONES.md`.

### 11.2 Fly.io — cuenta, app, volumen y secretos

| Ítem | Detalle |
|---|---|
| Para qué sirve | Hosting del runtime Node, HTTPS, health checks y almacenamiento persistente |
| Cómo se obtiene | Crear la cuenta en Fly.io e instalar `flyctl` |
| Alta de la app | `fly apps create selimsystem` |
| Alta del volumen | `fly volumes create selimsystem_data --region iad --size 1` |
| Variables a cargar como secretos | `SESSION_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `APP_URL`, `DATA_DIR` (lista textual del `README.md`) |
| Comando | `fly secrets set SESSION_SECRET="..." SMTP_HOST="..." ... --app selimsystem` (el `README.md` muestra el comando completo, generando `SESSION_SECRET` con `openssl rand -hex 32`) |
| Dónde vive cada credencial | En Fly (secretos de la app) y en GitHub Secrets solo el `FLY_API_TOKEN` |
| Cómo se verifica que funciona | `fly status --app selimsystem`; abrir `https://selimsystem.fly.dev/health` y comprobar `{"status":"ok"}` |

Observación verificada: `fly.toml` ya define `SESSION_SECRET`, `APP_URL`, `PORT` y `NODE_ENV` en `[env]`, así que el procedimiento del `README.md` y el archivo conviven: el valor del repositorio es el que quedó versionado en claro (ver sección 14).

### 11.3 Gmail — SMTP

| Ítem | Detalle |
|---|---|
| Para qué sirve | Enviar el correo de restablecimiento de contraseña (único uso real del SMTP en el código: `sendPasswordResetEmail` se invoca desde `src/routes/auth.js`) |
| Cómo se obtiene | Una cuenta de Gmail con verificación en dos pasos y una contraseña de aplicación; `.env.example` la refleja como `SMTP_PASS=tu-app-password` |
| Dónde se guarda | En producción, como secretos de Fly (`SMTP_USER`, `SMTP_PASS` y compañía). En local, en `.env` |
| Cómo se verifica que funciona | Solicitar "olvidé mi contraseña" desde la app y confirmar en los logs del contenedor el mensaje `[EMAIL] Password reset enviado a ...`; si falla, aparece `[EMAIL] Error enviando email:` |

Comportamiento verificado si falta la credencial: `src/services/email.js` captura la excepción y solo escribe en el log. **El usuario nunca recibe el correo y la API igual responde `200`** con el mensaje genérico.

### 11.4 Desarrollo local — `.env`

| Ítem | Detalle |
|---|---|
| Para qué sirve | Proveer valores locales de las variables del contrato |
| Cómo se obtiene | `cp .env.example .env` y completar los valores (`README.md`) |
| Dónde se guarda | `.env` en la raíz del proyecto; está en `.gitignore`, así que no se versiona |
| Validación | Conviene revisar la sección 14 antes de confiar en `.env`: en el código **no hay ningún lector de `.env`** |

---

## 12. Reproducir el flujo desde cero

Checklist ejecutable, en orden:

- [ ] **1. Cuenta de GitHub.** Crear el repositorio `SelimSystem` con la rama `master`.
- [ ] **2. Cuenta de Fly.io** e instalar `flyctl`. Autenticarse con `fly auth login`.
- [ ] **3. Crear la app**: `fly apps create selimsystem`.
- [ ] **4. Crear el volumen**: `fly volumes create selimsystem_data --region iad --size 1`.
- [ ] **5. Cargar los secretos de la app** (procedimiento del `README.md`): `SESSION_SECRET` generado con `openssl rand -hex 32`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `APP_URL="https://selimsystem.fly.dev"`, `DATA_DIR="/data"` con `--app selimsystem`.
- [ ] **6. Generar el token de deploy** (`fly tokens create deploy`) y guardarlo en GitHub → Settings → Secrets and variables → Actions como `FLY_API_TOKEN`.
- [ ] **7. Verificar que el workflow tiene permiso de escritura**: el job `deploy` lo pide explícitamente con `permissions: contents: write`; si el repositorio fuerza el token de solo lectura, el bump de versión no puede pushear.
- [ ] **8. Primer deploy**: `fly deploy` manual, o simplemente pushear a `master` y dejar que el pipeline haga el trabajo.
- [ ] **9. Verificar producción**: abrir `https://selimsystem.fly.dev/health` y esperar `{"status":"ok"}`.
- [ ] **10. Instalar la PWA**: abrir la URL en el teléfono y usar "Agregar a la pantalla de inicio" (`manifest.json` declara `display: standalone`).
- [ ] **11. Verificar el ciclo completo**: hacer un cambio, pushear a `master`, ver el job en verde en Actions y el cambio reflejado en el teléfono.

---

## 13. Tiempos y puntos de observación

### 13.1 Tiempos medidos

Medición real del run `38152314125` (commit `597cb2a`), consultada con `gh run view`:

| Etapa | Inicio (UTC) | Fin (UTC) | Duración |
|---|---|---|---|
| `unit-tests` | 15:41:15 | 15:41:39 | 24 s |
| `e2e-tests` | 15:41:42 | 15:44:36 | 2 min 54 s |
| `deploy` (bump + `flyctl deploy`) | 15:44:39 | 15:45:35 | 56 s |
| **Workflow completo** | 15:41:13 | 15:45:35 | **4 min 22 s** |

Otros runs recientes del mismo workflow: 3 min 35 s, 3 min 48 s y 3 min 56 s. En resumen, un ciclo típico de CI/CD completo está entre **3,5 y 4,5 minutos**.

Tiempos de contexto:

- Entre la creación del commit y el arranque efectivo del workflow pueden pasar alrededor de 2 minutos (incluye el push, el webhook y la cola de runners).
- El commit de bump queda en `master` unos 5 minutos después del push del cambio (por ejemplo, commit `cba025b` a las 16:42:14 y bump `4cbae67` a las 16:47:23).
- La duración del gate local (`pre-push`) depende de la máquina y no se mide en CI. El pipeline **no** ejecuta cobertura; el gate local sí.

Hasta verlo en el teléfono: el deploy queda publicado a los ~4-5 minutos del push; el teléfono lo toma en la siguiente apertura/revalidación del Service Worker. **Si el cambio es de frontend y no se sube `CACHE_NAME` en `sw.js`, ese cambio no llega nunca a la PWA instalada** (sección 9.3).

### 13.2 Dónde mirar el progreso

| Qué observar | Dónde |
|---|---|
| Si el pipeline arrancó y cómo salió | GitHub → pestaña Actions → workflow "Deploy to Fly.io" |
| El log de cada job y cada comando | Dentro de la corrida, expandiendo `unit-tests`, `e2e-tests` o `deploy` |
| El reporte E2E | Artefacto `E2E Tests vX.Y.Z` en la corrida (retención 14 días) |
| Si el bump de versión quedó | `git log --oneline` (commit `chore(release): bump vX.Y.Z [skip ci]`) |
| El estado del deploy y la versión publicada | `fly status --app selimsystem` o el panel de la app en Fly.io |
| Si la app está sana | `https://selimsystem.fly.dev/health` |
| Si el correo de reseteo salió | Logs de la app en Fly (`[EMAIL] ...`) |

---

## 14. Deudas y riesgos conocidos del flujo

Todo lo siguiente está verificado en el repositorio o en datos reales de la cuenta (indicado en cada punto).

**Seguridad**

1. **`SESSION_SECRET` en texto plano dentro de `fly.toml`, en un repositorio público.** El valor real (64 caracteres hexadecimales) está versionado. El repositorio tiene visibilidad `PUBLIC` (verificado con `gh repo view`). Consecuencia: el secreto de firma de sesiones es de conocimiento público, y rotarlo exige un commit nuevo. El `README.md` documenta el camino correcto (`fly secrets set`), pero el valor del archivo sigue en el historial.
2. **Sin store de sesiones.** `connect-loki` figura en `dependencies` pero **no se usa en el código**: `src/app.js` configura `express-session` sin `store`, por lo que las sesiones viven en memoria y se pierden en cada reinicio o deploy. El `CHANGELOG.md` y el documento de línea base afirmaban persistencia en disco; el código dice otra cosa.

**Desincronización de versiones**

3. **`package.json` y `public/version.json` van por caminos distintos.** Al momento de escribir: `package.json` = `1.11.14` local (`1.11.15` en `origin/master`, por el último bump de CI) mientras `public/version.json` sigue en `1.11.2`. El pipeline solo bumpea `package.json` y `package-lock.json`; `version.json` se mantiene a mano.
4. **El `CHANGELOG.md` también quedó atrás**: su última entrada es `1.11.2`. Ningún paso del pipeline lo actualiza.
5. **Los tags de release no llegan al repositorio**: `npm version patch` crea un tag en el runner, pero el `git push` del workflow no lo sube (no usa `--follow-tags`) y `git ls-remote --tags origin` no devuelve tags.
6. **El artefacto E2E lleva la versión previa al bump**: el paso que lee la versión corre en el job `e2e-tests`, antes de que el job `deploy` incremente `package.json`. El nombre del artefacto no coincide con la versión final de la release.

**Frontend / PWA**

7. **La actualización del frontend depende de un bump manual de `CACHE_NAME` en `public/sw.js`.** Con la estrategia cache-first y la lista de precache, un cambio en `public/` que no venga acompañado de un `CACHE_NAME` nuevo puede desplegarse en el servidor y **no** llegar a la PWA instalada. No hay ningún script ni paso de CI que lo automatice. Es un riesgo operativo concreto: el deploy puede quedar en verde y el cambio no verse en el teléfono.
8. **`version.json` está en la lista de precache del Service Worker**, así que su valor también puede quedar congelado hasta que cambie `CACHE_NAME`.

**Funcionalidad definida pero inactiva**

9. **El backup automático no corre.** `src/services/cron.js` define un job semanal (domingos 03:00, zona `America/Argentina/Buenos_Aires`, rotación de 4 copias en `DATA_DIR/backups/`), pero `startCronJobs` **no se invoca desde ningún punto del arranque** (verificado por búsqueda en `src/`). Hoy no se generan copias automáticas.
10. **`sendDailyReminder` nunca se llama**: está implementado en `src/services/email.js` pero no tiene invocador.
11. **Configuración heredada de OneSignal**: `src/config.js` expone `ONESIGNAL_APP_ID` y `ONESIGNAL_API_KEY` y `.env.example` los incluye, pero no hay uso real en el código.

**Pipeline y automatización**

12. **No hay paso de build.** El proyecto no tiene script `build`: el frontend es vanilla JS servido tal cual desde `public/`, y el único "build" es la imagen Docker, que se construye en el builder remoto de Fly. Tampoco hay lint ni typecheck en el pipeline (no existen ESLint ni TypeScript en el proyecto raíz).
13. **El umbral de cobertura no se hace cumplir en CI.** Los umbrales de `jest.config.js` solo corren en el hook local (`--coverage`). El job de CI ejecuta `npm test`, sin cobertura.
14. **No hay gate de pull request.** El workflow solo escucha `push` a `master` y `workflow_dispatch`: no hay `pull_request`. El pipeline verifica **después** de que el commit ya está en `master`.
15. **Un deploy fallido deja la versión ya avanzada.** En el job `deploy`, el bump y el `git push` ocurren antes de `flyctl deploy`: si el deploy falla, la versión igual subió en `master`.
16. **Sin `concurrency`**: dos pushes seguidos pueden lanzar dos corridas en paralelo. Existen commits de merge en el historial (`Merge branch 'master' of https://github.com/ArgTincho89/SelimSystem`) que reflejan la secuencia real de traer el bump de CI antes de poder pushear de nuevo.
17. **Tasa de fallo observada**: de las últimas 53 ejecuciones con conclusión (consultadas con `gh run list`), 44 terminaron en éxito y 9 en fallo (≈84% de éxito). Las fallas consultadas corresponden a correcciones de la propia configuración del pipeline y a una tanda de inestabilidad del E2E (ver `docs/testing/HALLAZGOS-Y-ACCIONES.md`).
18. **`e2e/` no está excluido en `.dockerignore`**: el contexto que se envía al builder remoto puede incluir `e2e/node_modules` y datos de test, aunque nada de eso entra en la imagen final.

**Entorno local**

19. **Jest no descubre tests desde esta copia de trabajo en OneDrive.** Reproducido en esta sesión: `node node_modules/jest/bin/jest.js --listTests` no lista ningún archivo (exit 0) con `rootDir` y `testMatch` correctamente resueltos por `--showConfig`, mientras que el mismo binario de Jest (29.7.0, ya instalado en `node_modules`) sobre un directorio fuera de OneDrive sí lista el test. Los archivos del árbol tienen atributo `ReparsePoint` de OneDrive (Files On-Demand), y `jest.config.js` ya intenta mitigarlo con `haste: { enableSymlinks: true }` y `watchman: false`. El repositorio ya tenía este hallazgo documentado en `docs/testing/HALLAZGOS-Y-ACCIONES.md`: "0 tests encontrados, aunque existen 11 archivos `*.test.js` con 234 tests", atribuido al crawler de Jest (`jest-haste-map`) frente a los reparse points de OneDrive, y con el resultado de que una copia física fuera de OneDrive corre los 234 tests en verde. Efecto: **el gate local `pre-push` no es confiable en esta máquina**; en CI (Ubuntu, clon limpio) la suite se descubre y pasa normalmente (44 corridas exitosas). Este documento no afirma que ocurra en toda instalación de OneDrive: es lo observado en esta máquina.
20. **Divergencia de versión de Node entre local y CI**: local `node -v` = `v24.19.0`; CI usa Node 22 (`setup-node` y `Dockerfile`). El código no fija engines, así que nada garantiza el mismo runtime.
21. **`flyctl` no está instalado en esta máquina** (no hay binario en el `PATH`), por lo que el deploy manual local no es el camino disponible: se usa `workflow_dispatch` desde GitHub.
22. **Documentación sin versionar**: `docs/DESIGN-SYSTEM.md` y `docs/DOCUMENTO-FUNCIONAL.md` existen en la copia de trabajo pero `git status` los muestra como `untracked`, es decir, no están commiteados y no viajan al repositorio ni al contexto de build.
23. **El archivo `.env` local no lo lee nadie.** El `README.md` documenta `cp .env.example .env`, pero en el repositorio no hay `dotenv` en `dependencies`, ninguna carga manual (`fs.readFileSync('.env')`) ni el flag `--env-file` en los scripts (`start` es `node src/server.js` y `dev` es `node --watch src/server.js`). Consecuencia: ese `.env` **no tiene efecto**; en local la app usa los valores por defecto de `src/config.js` (puerto 3000, `SESSION_SECRET` con el fallback `dev-secret-change-in-production`, `DATA_DIR` en la carpeta `data/` del proyecto, SMTP sin credenciales), o bien lo que se defina en el entorno del shell. Si se necesitan variables locales reales, hay que exportarlas en la sesión de terminal o agregar explícitamente `--env-file=.env` a los scripts.

Nota externa: la interpretación de `min_machines_running` frente a `auto_stop_machines` proviene de la documentación de Fly.io, no de archivos del repositorio.

---

## 15. Cambios respecto de `presentacion-flujo-ia.md`

El documento de línea base describe la misma cadena, pero quedó desactualizado en estos puntos:

| # | `presentacion-flujo-ia.md` dice | El código dice hoy |
|---|---|---|
| 1 | El pipeline tiene **dos** jobs: `unit-tests` → `deploy`. | Hay **tres** jobs: `unit-tests` → `e2e-tests` → `deploy`. El E2E es un gate obligatorio entre los tests unitarios y el deploy. |
| 2 | Se omiten los detalles de E2E "hasta la auditoría". | El E2E está integrado: Cucumber + Playwright dentro de `e2e/`, 19 archivos `.feature`, `timeout-minutes: 20` y artefacto del reporte con 14 días de retención. |
| 3 | "Versionado manual de release": cada release sube la versión en `package.json` **y** `public/version.json`. | El bump es **automático** en CI (`npm version patch` + push con `[skip ci]`) y solo toca `package.json` y `package-lock.json`. `version.json` sigue manual y desincronizado (1.11.2 vs 1.11.15). |
| 4 | Los commits convencionales incluyen la versión: `feat(income): ... (v1.11.2)`. | Los commits de cambio ya no llevan versión; la versión aparece únicamente en el commit del bot: `chore(release): bump vX.Y.Z [skip ci]`. |
| 5 | "No hay umbral de cobertura configurado". | `jest.config.js` define umbral global del 60% más umbrales por archivo (auth 68/70/68/68, transactions 85/85/90/90, entre otros), aplicados por el hook local `pre-push`. |
| 6 | No menciona ningún gate local. | Existe `.husky/pre-push`, que elige entre `test:coverage:diff` y `test:coverage` según el diff contra `origin/master`. |
| 7 | "Las sesiones se persisten con `connect-loki` también en disco (sobreviven reinicios)". | `express-session` no tiene `store` configurado; `connect-loki` es una dependencia sin uso y las sesiones son en memoria. |
| 8 | El cron de backups se presenta como servicio real en producción ("Todos los domingos 03:00 ... crea backup JSON completo y rota conservando los últimos 4"). | El job está definido en `src/services/cron.js`, pero `startCronJobs` no se invoca: hoy no genera copias. |
| 9 | Secuencia del teléfono: "el Service Worker viejo detecta el SW nuevo (`selimsystem-v13`)". | Lo que dispara la detección es que **cambien los bytes de `sw.js`** (en la práctica, subir `CACHE_NAME`); después `skipWaiting()` + `clients.claim()` + `controllerchange` recargan la página. El nombre `selimsystem-v13` es solo el nombre del caché. |
| 10 | No menciona el bump del SW como requisito manual de release del frontend. | El `CACHE_NAME` se sube a mano y **no** está automatizado; sin ese bump, un cambio de frontend puede no llegar a la PWA instalada. |
| 11 | Deja el re-deploy manual como `workflow_dispatch` (correcto) pero no menciona el efecto colateral. | Re-ejecutar el workflow **también** corre el bump de versión: el re-deploy avanza la versión. |
| 12 | Menciona "11 archivos de test" para la suite unitaria. | Sigue habiendo 11 archivos `.test.js` en el árbol; a eso se suman los 19 `.feature` del E2E. |
| 13 | `SESSION_SECRET` en `fly.toml` se marca como deuda técnica. | Se confirma, y se agrega el dato de que el repositorio es **público**, lo que agrava el riesgo. |
| 14 | OneSignal como configuración heredada sin uso. | Sin cambios: sigue sin uso. |

---

## 16. Fuente y cobertura

Documento generado por lectura directa del repositorio y por consulta de datos reales de la cuenta (corridas de Actions, secretos por nombre y visibilidad del repositorio). No se copió ningún valor de secreto.

**Archivos del repositorio leídos**

| Archivo | Aporte |
|---|---|
| `.github/workflows/fly-deploy.yml` | Triggers, los tres jobs, comandos exactos, `needs`, timeout, artefactos y permisos |
| `.husky/pre-push` | Lógica del gate local |
| `package.json` | Versión actual y scripts (`test`, `test:coverage`, `test:coverage:diff`, `test:e2e*`, `prepare`) |
| `package-lock.json` | Confirmación de que el bump actualiza también el lock |
| `jest.config.js` | Configuración de Jest, umbrales de cobertura y compatibilidad con OneDrive |
| `fly.toml` | Todos los parámetros de runtime y el `SESSION_SECRET` versionado |
| `Dockerfile` | Build de la imagen de producción |
| `.dockerignore` | Qué queda fuera del contexto de build |
| `README.md` | Procedimiento documentado de alta de app, volumen, secretos y deploy |
| `.env.example` | Contrato de variables de entorno local (solo nombres) |
| `.gitignore` | Qué no se versiona (`data/`, `.env`, `coverage/`, etc.) |
| `src/config.js` | Consumo de variables de entorno y valores por defecto |
| `src/app.js` | Health check, estáticos, catch-all de la SPA, CORS y sesión sin store |
| `src/server.js` | Punto de entrada y apagado por `SIGTERM` |
| `src/db/jsondb.js` | Layout de la base JSON y escritura atómica |
| `src/routes/auth.js` | Uso real del correo de reseteo y vigencia del token (1 hora) |
| `src/services/email.js` | Nodemailer, configuración SMTP y manejo de errores |
| `src/services/cron.js` | Job de backup semanal y rotación |
| `public/manifest.json` | Metadatos de la PWA |
| `public/sw.js` | `CACHE_NAME`, precache, estrategias y ciclo de vida |
| `public/js/app.js` | Registro del Service Worker y recarga por `controllerchange` |
| `public/js/pages/login.js` | Lectura de `version.json` y botón de limpieza de caché |
| `public/index.html` | Estructura de la SPA y orden de carga de scripts |
| `public/version.json` | Versión manual del frontend (1.11.2) |
| `CHANGELOG.md` | Última entrada (1.11.2) |
| `docker-compose.yml` | Alternativa local con volumen y variables |
| `presentacion-flujo-ia.md` | Documento de línea base para el comparativo de la sección 15 |
| `docs/testing/HALLAZGOS-Y-ACCIONES.md` | Reemplazo del E2E externo por el E2E en el repo y estado base (11 suites / 234 tests en v1.11.2) |
| `e2e/package.json`, `e2e/cucumber.js`, `e2e/support/hooks.ts` | Cómo se ejecuta y cómo se aísla la suite E2E |

**Verificaciones fuera del árbol de archivos**

- `git log`, `git remote -v`, `git status`, `git ls-remote --tags origin`, `git config core.hooksPath`: historial, remoto, estado de la copia y ausencia de tags.
- `gh run list` / `gh run view` / `gh repo view` / `gh secret list`: duraciones reales por job, tasa de éxito, visibilidad del repositorio y nombres de los secretos.
- Ejecución local de Jest (`--listTests`, `--showConfig`) y comparación contra un directorio fuera de OneDrive, para verificar el hallazgo de descubrimiento de tests.
- Documentación de Fly.io (Context7, `/superfly/docs`): semántica de `min_machines_running`, comportamiento del proxy cuando el health check falla.

**Cobertura no incluida**: este documento no verifica el contenido del modelo de datos ni la lógica funcional de las rutas (eso pertenece a `docs/DOCUMENTO-FUNCIONAL.md`), no audita la calidad de los tests, y no describe el proceso interno del asistente de IA, que no está representado por ningún artefacto ejecutable en el repositorio.
