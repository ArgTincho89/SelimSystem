# SelimSystem: el camino completo, de la idea al teléfono

> **Estado actual (2026-11-08):** el hosting de SelimSystem aún no está configurado. La cuenta, la aplicación y el flujo de despliegue se crearán por separado para SelimSystem. Las instrucciones y diagramas de Fly.io de este documento son heredados y no deben usarse para aprovisionar ni desplegar.

**Propósito**: documento histórico de línea base para la presentación. Los diagramas de Fly.io describen una configuración heredada; el CI actual ejecuta pruebas únicamente y SelimSystem aún no tiene hosting configurado.

> **Nota de contexto**: este documento describe la línea base del flujo actual. La estrategia de calidad integral (verificación E2E, lint, typecheck, cobertura, etc.) será auditada, definida e implementada en la próxima fase por el **agente Patesi**; al cierre de esa iniciativa se documentará el flujo final comparativo.

---

## Vista general del flujo

```
Tú (solicitud en lenguaje natural, en español)
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  Gentle-AI (orquestador con SDD)                        │
│  gates → planificación → implementación → verificación  │
└─────────────────────────────────────────────────────────┘
        │  commit + push (rama master)
        ▼
┌─────────────────────────────────────────────────────────┐
│  GitHub (repositorio)                                   │
│  └─ GitHub Actions: pipeline CI/CD automático           │
└─────────────────────────────────────────────────────────┘
        │  build + deploy (solo si las verificaciones pasan)
        ▼
┌─────────────────────────────────────────────────────────┐
│  Fly.io (runtime + almacenamiento persistente)          │
│  └─ servidor Node.js/Express + base de datos JSON       │
└─────────────────────────────────────────────────────────┘
        │  HTTP/HTTPS
        ▼
┌─────────────────────────────────────────────────────────┐
│  Tu teléfono (PWA instalada)                            │
│  └─ Service Worker detecta la versión nueva y actualiza │
└─────────────────────────────────────────────────────────┘
```

---

## Etapa 1 — La solicitud entra a Gentle-AI

Gentle-AI es el asistente de IA que orquesta el desarrollo. No "escribe código a los ponchazos": sigue un proceso estructurado y delegado.

### 1.1. Gates iniciales

1. **Preflight SDD**: antes de arrancar, se definen cuatro parámetros con el usuario:
   - Modo de ejecución: automático (las fases corren en cadena) o interactivo (pausa entre fases). Por defecto: automático.
   - Dónde se guardan los artefactos del cambio: memoria persistente del proyecto (Engram). Por defecto: Engram.
   - Estrategia de PRs: consultar si hay riesgo, PR único, o encadenar PRs.
   - Presupuesto de revisión: máximo de líneas cambiadas antes de frenar a pedir aprobación del reviewer.

2. **Init guard**: se verifica en la memoria persistente que el proyecto ya tenga contexto inicializado (stack, convenciones, capacidades de testing). Si no, se inicializa primero.

### 1.2. Selección de la ruta según el tamaño del cambio

No todo requiere el mismo proceso:

| Tamaño del cambio | Ruta |
|---|---|
| Cambio chico y ya entendido (1 archivo, sin investigación) | Implementación directa |
| 2+ archivos o requiere entender el código | Tarea delegada a un sub-agente especializado |
| Cambio grande / ambiguo / de alto alcance | **SDD (Spec-Driven Development)** |

SDD es el flujo estructurado: nada se implementa sin especificación previa, y cada fase la ejecuta un sub-agente con contexto fresco y la valida el orquestador antes de pasar a la siguiente.

### 1.3. Fases de SDD (cuando corresponde)

| Fase | Qué produce | Rol del orquestador |
|---|---|---|
| `explore` | Investigación del código sin modificar nada | — |
| `propose` | Propuesta: qué, por qué, alcance, riesgos | Recomienda preguntas de negocio antes de validar |
| `spec` | Requisitos y escenarios concretos | Gatekeeper: la spec no excede la propuesta |
| `design` | Diseño técnico y arquitectura | Gatekeeper: el diseño responde la propuesta |
| `tasks` | Desglose en tareas + pronóstico de líneas | Gatekeeper: las tasks cubren spec y diseño |
| `apply` | Implementación del código con sus tests | Gatekeeper: verifica artefactos y coherencia |
| `verify` | Verificación de la implementación contra las specs | — |
| `archive` | Cierre del cambio y persistencia del estado final | — |

**Gatekeeper entre fases** (modo automático): después de cada fase, el orquestador valida que el artefacto exista y sea legible, que no haya "alucinaciones" (paths o símbolos que no existen), que no haya desviación del alcance aprobado y que la ruta recomendada siga el orden del flujo. Si una fase falla, se re-ejecuta una vez con correcciones puntuales; si falla de nuevo, se detiene la cadena y se reporta al usuario.

### 1.4. Calidad que aporta el proceso de IA

- Ningún cambio grande se escribe sin spec, diseño y desglose de tareas previos.
- Cada fase la ejecuta un sub-agente especializado con contexto fresco (no se arrastra la conversación entera).
- Los artefactos quedan persistidos (memoria del proyecto), recuperables entre sesiones.
- La verificación final compara la implementación contra las specs originales, no contra la memoria de la conversación.

---

## Etapa 2 — Desarrollo del código y sus prácticas de calidad

En esta etapa se produce el código. Prácticas de calidad **reales** presentes hoy:

| Práctica | Detalle |
|---|---|
| **Tests unitarios y de integración de API** | Jest 29 + Supertest. **11 archivos de test** que cubren rutas de la API (auth, categorías, transacciones, summary, trends, metas), middleware y la capa de datos. Scripts: `npm test` y `npm test:coverage`. |
| **Convención de commits** | Conventional commits **en español**, con scope y versión: `feat(income): IVA tracking... (v1.11.2)`. Historial legible y versionado. |
| **Versionado manual de release** | Cada release sube la versión en `package.json` y `public/version.json`. |
| **Versionado del Service Worker** | El cache name de la PWA se bumpea en cada release (`selimsystem-v13`), lo que fuerza la actualización en el teléfono. |
| **Despliegue atómico por rama** | Todo el trabajo se integra en `master`; la rama principal es la única fuente de verdad de lo que llega a producción. |

**Transparencia (lo que NO existe hoy):** no hay linter (ESLint/Prettier), no hay typecheck (el proyecto es JavaScript puro, sin TypeScript) y no hay umbral de cobertura configurado. Son justamente brechas que la próxima auditoría del agente Patesi deberá relevar y cubrir con una estrategia de calidad.

---

## Etapa 3 — Commit y push

Terminada la implementación y verificación local:

1. Se crea el/los commit(s) con mensajes convencionales descriptivos (qué y por qué, no cómo).
2. Se hace push a `master` del repositorio `github.com/ArgTincho89/SelimSystem`.

El simple acto de hacer push dispara la etapa siguiente: **no hay despliegue manual**.

---

## Etapa 4 — CI/CD en GitHub Actions (en profundidad)

El pipeline vive en un único workflow: `.github/workflows/fly-deploy.yml` ("Deploy to Fly.io").

### 4.1. Disparadores

- `push` a la rama `master` (flujo normal: cada cambio aprobado se prueba y despliega solo).
- `workflow_dispatch`: ejecución manual desde la UI de GitHub, sin necesidad de un push.

### 4.2. Jobs del pipeline

Todo corre en runners `ubuntu-latest` con **Node.js 22** y **caché de dependencias npm** (npm cache habilitado por `actions/setup-node`).

```
┌──────────────┐
│ unit-tests   │  Verificación automática
└──────┬───────┘
       │ needs (deploy solo si unit-tests pasa)
       ▼
┌──────────────┐
│ deploy       │  Build + deploy a Fly.io
└──────────────┘
```

**Job 1 — `unit-tests` (gate de calidad):**

1. Checkout del código (`actions/checkout@v4`).
2. Configuración de Node.js 22 con caché npm (`actions/setup-node@v4`).
3. `npm ci` — instalación reproducible y determinista (borra y reinstala exactamente lo que define `package-lock.json`; más estricto que `npm install`).
4. `npm test` — suite completa **Jest + Supertest** (11 archivos de test).

**Job 2 — `deploy` (depende de `unit-tests`):**

1. Checkout del código.
2. Instalación del CLI de Fly.io (`superfly/flyctl-actions/setup-flyctl@master`).
3. `flyctl deploy --remote-only` — el build de la imagen se hace **en los servidores de Fly.io**, no en el runner; solo se envía el contexto de build. Autenticación con el secreto `FLY_API_TOKEN`.

### 4.3. Mecánica de calidad del pipeline

| Mecanismo | Qué aporta |
|---|---|
| **Quality gate en cadena** | El deploy **nunca** corre si la verificación unitaria falla. Cero despliegues rotos por regresión básica. |
| `npm ci` | Instalación reproducible: mismas versiones exactas en cada corrida. |
| Caché npm | Menor tiempo de CI, menos consumo de ancho de banda. |
| `workflow_dispatch` | Permite re-desplegar sin tocar código (rollback/re-deploy manual). |
| Deploy remoto (`--remote-only`) | No depende del runner ni de Docker local; el build es consistente en Fly. |

> **Nota**: se omiten intencionalmente de este documento los detalles de verificación E2E actuales; serán relevados por la auditoría del agente Patesi para definir la estrategia de calidad final.

### 4.4. Secretos y seguridad

- `FLY_API_TOKEN` (GitHub Secrets): token que autoriza a GitHub Actions a desplegar en Fly.io. Nunca aparece en el código ni en los logs.
- El acceso al control de versiones es por la infraestructura de GitHub (rama protegida por flujo, no por configuración externa).

---

## Etapa 5 — Fly.io: runtime, build y almacenamiento (en profundidad)

**SelimSystem NO usa Vercel, Render, Supabase ni ninguna base de datos externa.** Se verificó el repositorio completo: el único servicio de hosting y el único almacenamiento son los de **Fly.io**. El resto de servicios externos son GitHub (repositorio + CI) y Gmail SMTP (emails transaccionales).

### 5.1. Configuración de la aplicación (`fly.toml`)

| Parámetro | Valor | Significado |
|---|---|---|
| `app` | `selimsystem` | Nombre de la aplicación en Fly.io |
| `primary_region` | `iad` | Región: N. Virginia (EE.UU.) |
| `internal_port` | `3000` | Puerto interno donde escucha Express |
| `force_https` | `true` | Todo el tráfico HTTP se redirige a HTTPS |
| `auto_stop_machines` / `auto_start_machines` | `true` | La máquina se apaga con inactividad y arranca sola ante tráfico (ahorro de costo) |
| `min_machines_running` | `1` | Siempre hay al menos una instancia activa |
| Concurrency | soft 200 / hard 250 conexiones | Límites de conexiones concurrentes |
| Health check | `GET /health` cada 10 s, timeout 5 s | Fly solo envía tráfico si la app responde sano; también sirve de detección de caídas |
| VM | 1 vCPU compartida, 1 GB RAM | Tamaño de la máquina |
| Variables de entorno | `PORT=3000`, `NODE_ENV=production`, `APP_URL=https://selimsystem.fly.dev` | Configuración de producción |

### 5.2. Imagen de producción (`Dockerfile`)

- Base: `node:22-alpine` (ligera y segura).
- `npm ci --omit=dev`: instala **solo dependencias de producción** — Jest, Supertest y demás devDependencies no viajan a producción (imagen más chica, menos superficie de ataque).
- Copia solo `src/` y `public/` (código y frontend).
- `ENV DATA_DIR=/data`: la base de datos vive en el volumen persistente.

### 5.3. Persistencia y datos

- **Base de datos**: archivos JSON planos (sin base externa), sobre el volumen `selimsystem_data` montado en `/data`.
- Las **sesiones** se persisten con `connect-loki` también en disco (sobreviven reinicios).
- El volumen sobrevive reinicios y re-despliegues: los datos de usuarios no se pierden al hacer deploy.

### 5.4. Servicios auxiliares reales

| Servicio | Rol | Detalle |
|---|---|---|
| **GitHub** | Control de versiones + CI/CD | Repositorio `ArgTincho89/SelimSystem` + GitHub Actions |
| **Fly.io** | Hosting + almacenamiento | Runtime Node.js + volumen persistente + HTTPS |
| **Gmail SMTP** (vía Nodemailer) | Emails transaccionales | **Reseteo de contraseña** (link con token válido 1 h). Config en `SMTP_*`. |
| **Cron local (dentro de la app)** | Backup automático | Todos los domingos 03:00 (zona Buenos Aires) crea backup JSON completo y **rota conservando los últimos 4 backups**. Local en el volumen, no se envía por email. |

> **Aclaraciones de transparencia**:
> - `OneSignal` figura en configuración (`ONESIGNAL_APP_ID`/`ONESIGNAL_API_KEY`) pero **no tiene uso real en producción** (configuración heredada).
> - El `SESSION_SECRET` está definido dentro de `fly.toml` (no como secreto de Fly) — una deuda técnica que la auditoría debería relevar: debería migrarse a un secreto gestionado.

### 5.5. Qué ocurre cuando impacta en producción

1. Fly.io recibe el build con `flyctl deploy --remote-only`, construye la imagen y la publica.
2. La máquina nueva arranca, pasa el health check (`/health`) y empieza a recibir tráfico HTTPS.
3. La app sirve el frontend (SPA) y la API REST desde el mismo servidor Express.
4. Si algo fallara al arrancar, el health check lo detecta y Fly deja de mandar tráfico a esa instancia.

---

## Etapa 6 — La PWA en tu teléfono

La PWA es **100% manual** (sin plugins ni workbox): se compone de:

- `public/manifest.json` — metadatos de la app instalable (nombre, iconos 192/512, tema).
- `public/sw.js` — Service Worker escrito a mano con cache `selimsystem-v13`:
  - Precachea los assets estáticos al instalar.
  - Cache-first para estáticos (carga instantánea sin red).
  - La API tiene fallback offline (responde `{error: "Sin conexión"}` en lugar de romper).
  - Limpia caches de versiones viejas.
- `public/version.json` — `{"version": "1.11.2"}`; se bumpea a mano en cada release junto con el cache name del SW.

**Secuencia en el teléfono**:

1. Fly.io sirve la versión nueva del frontend.
2. Al abrir la app, el Service Worker viejo detecta el SW nuevo (`selimsystem-v13`).
3. El teléfono descarga el SW nuevo y los assets nuevos en segundo plano.
4. En la siguiente apertura, la app instalada ya muestra la versión nueva.
5. El navegador pide "Actualizar" (o lo hace automático según la estrategia del SW) y el usuario ve el cambio en la app descargada.

---

## Resumen: prácticas de calidad por etapa (línea base)

| Etapa | Prácticas presentes |
|---|---|
| **Planificación (IA)** | SDD: explore → propose → spec → design → tasks → apply → verify → archive; gatekeeper anti-alucinación y anti-drift entre fases; verificación contra specs |
| **Desarrollo** | Tests unitarios + integración API (Jest + Supertest, 11 suites); conventional commits versionados en español; bump manual de versión + Service Worker |
| **Integración (commit/push)** | Rama única `master` como fuente de verdad; mensajes descriptivos por commit |
| **CI/CD (GitHub Actions)** | Quality gate en cadena (deploy solo si los tests pasan); `npm ci` reproducible; caché npm; re-deploy manual por `workflow_dispatch`; deploy remoto |
| **Runtime (Fly.io)** | Health check cada 10 s; HTTPS forzado; auto start/stop; volumen persistente; backups semanales con rotación (4) |
| **Cliente (PWA)** | Cache-first para estáticos; fallback offline; actualización controlada por versión del SW |

### Brechas conocidas (para la próxima fase)

- Sin linter ni formateador (ESLint/Prettier).
- Sin typecheck (JavaScript sin TypeScript).
- Sin umbral de cobertura de tests.
- `SESSION_SECRET` no gestionado como secreto.
- Configuración OneSignal heredada sin uso.

---

## Próxima fase — Auditoría del agente Patesi

Este documento es la **línea base**. El siguiente paso del proyecto es:

1. Pedir al **agente Patesi** una auditoría de extremo a extremo de este flujo.
2. Que genere una **estrategia de calidad** (cubriendo, entre otras: verificación E2E, lint, typecheck, umbrales de cobertura, secretos, CI hardening).
3. Que **implemente las prácticas** de esa estrategia.
4. Documentar el **flujo final comparativo** (antes/después) al cierre de la iniciativa, para poner en valor el aporte del agente.

*Documento generado a partir de una verificación real del repositorio (stack, workflow, configuraciones y tests existentes). Ninguna práctica mencionada fue inventada.*
