# Estrategia de testing: SelimSystem

> Proyecto personal de una persona. Modo **B — Personal** (núcleo ISTQB). Se aplican las 5 secciones del núcleo + automatización (porque hay tests hoy). Se omiten **Entorno** (un solo entorno local) y **Roles** (una persona). **Riesgos/mitigaciones** se fusionan con la sección 4.

---

## 1. Alcance

### Dentro del alcance
- **Backend (API Express)**: auth (registro, login, sesión, eliminación de cuenta), transacciones (CRUD, IVA, split mixto, recurrente, trimestral), summary, categorías, metas (goals), tendencias.
- **Lógica de negocio pura**: `utils/income.js` (IVA, desglose A/B), `utils/recurring.js` (regeneración de recurrentes).
- **Persistencia** (`db/jsondb.js`) y `config.js`.
- **Middleware**: `requireAuth`, `errorHandler`.
- **Frontend (PWA)**: flujos de UI críticos vía E2E (registro, login, alta de transacciones, categorías, metas, summary, perfil, eliminación de cuenta).

### Fuera del alcance
- **Cron jobs** (`services/cron.js`) y **email real** (`services/email.js`): ya excluidos de la cobertura; el email se prueba con enfoque local/mock cuando haga falta.
- **Service worker / PWA offline** (`sw.js`): verificación manual periódica, no automatización.
- **Performance de carga**: proyecto de una persona, sin presión de carga; se revisa solo si escala.
- **Seguridad avanzada (pentesting)**: cubierta con checklist + pruebas de flujos críticos, no suite dedicada.

---

## 2. Niveles de testing

| Nivel | Aplicado | Justificación |
|-------|---------|-----------|
| Componente | ✅ | Tests unit de lógica pura y jsondb/config. Rápidos, sin HTTP. |
| Integración | ✅ | Tests de rutas con supertest: auth+DB, transacciones+IVA, summary. Nivel de mayor valor. |
| Sistema | ✅ | Flujo end-to-end de negocio vía API y vía navegador (E2E nuevo). |
| Aceptación | ⚠️ parcial | Los criterios de aceptación están implícitos en commits; los escenarios Gherkin E2E los hacen explícitos y verificables. |

## 3. Tipos de testing

| Tipo | Aplicado | Justificación |
|------|---------|-----------|
| Funcional | ✅ | Núcleo: happy + unhappy + corner de cada funcionalidad. |
| No funcional (performance) | ❌ por ahora | Volumen personal, sin presión de carga. |
| No funcional (seguridad) | ⚠️ checklist | Auth con bcrypt/sesión/helmet ya presentes. Pendiente: rate limiting en login, validación robusta, aislamiento multiusuario (ver riesgos). |
| No funcional (usabilidad) | ⚠️ manual | UI vanilla JS; se verifica manual en smoke de release. |
| Estructural | ✅ | Cobertura configurada; falta fijar umbral(es). |
| Regresión | ✅ | Suite integración + E2E nuevo. Fundamental por releases frecuentes. |

## 4. Priorización basada en riesgos

| Área de riesgo | Nivel | Impacto si falla | Enfoque de testing |
|-----------|-------|--------|------------|
| Transacciones + IVA + split mixto + trimestral | **Alto** | Errores de dinero = datos contables incorrectos. | BVA en montos/IVA, split mixto, recurrencia. Lógica más densa y reciente. |
| Auth / sesión / multiusuario / eliminación de cuenta | **Alto** | Fuga/borrado de datos entre usuarios. | Aislamiento entre usuarios, sesión expirada, ENDPOINT de borrado verifica que borra todo. |
| Summary / tendencias | Medio | Cálculos incorrectos = malas decisiones. | Rangos de fecha, meses sin datos, mezcla ingreso/gasto. |
| Persistencia JSON (jsondb) | Medio | Corrupción = pérdida de todos los datos. | Lectura/escritura, archivo corrupto/ausente, idempotencia. |
| Recurrencia (recurring) | Medio | Recurrentes mal generadas en cascada. | BVA en fechas (fin de mes, bimestres, anuales). |
| Metas (goals) | Bajo-Medio | Feature simple, poco impacto financiero directo. | Happy path + límites (100%, excedente). |

## 5. Criterios de entrada y salida

### Criterios de entrada
- [ ] `npm test` descubre y pasa la suite (requiere repo fuera de OneDrive — ver Hallazgos).
- [ ] El entorno de datos de test es aislado (NO toca `data/` real).
- [ ] La app está corriendo para los E2E (o arrancada por el propio runner).

### Criterios de salida
- [ ] Todos los casos P1/P2 pasan (unit + integración + E2E).
- [ ] Sin defectos críticos de seguridad abiertos (auth/multiusuario/borrado).
- [ ] Flujo E2E completo: crea usuario → ejecuta casos → elimina cuenta, en verde y con reporte.
- [ ] Smoke suite pasa antes de cada release.
- [ ] Umbral de cobertura definido y cumplido en rutas críticas (Pendiente de fijar; objetivo sugerido ≥70% en auth y transactions).

---

## 7. Estrategia de automatización

| Área | ¿Automatizar? | Framework | Prioridad |
|------|-----------|-----------|----------|
| Lógica pura (income, recurring, config, jsondb) | Sí | Jest unit | Alta |
| Rutas/API (auth, transactions, summary, goals, categories) | Sí | Jest + supertest | Alta |
| **Frontend E2E (flujo completo usuario)** | **Sí (nuevo)** | **Playwright + Cucumber + POM** | **Alta** |
| Smoke de release | Sí | Script que corre suite filtrada | Media |

### Criterios para la automatización E2E
- **Automatizar (E2E)**: el flujo íntegro del usuario (crear cuenta → operar la app → eliminar cuenta) porque es de alto riesgo y repetitivo.
- **Solo manual**: usabilidad fina, service worker/offline, ad-hoc.

### Decisiones de diseño (E2E)
- **Runner**: Cucumber.js (BDD) → escenarios Gherkin legibles como especificaciones ejecutables.
- **Motor**: Playwright (Chromium por defecto, ampliable a Firefox/WebKit).
- **Patrón**: Page Object Model en TypeScript (separa localizadores/acciones de los steps).
- **Aislamiento de datos**: corriendo con un `DATA_DIR` y `PORT` dedicados para E2E; no toca `data/` real de producción local.
- **Reporte visible**: `cucumber-html-reporter` genera un HTML navegable; además screenshot y video automáticos al fallar para "ver" qué pasó.
- **Orden del flujo**: un usuario de prueba por corrida, creado al inicio y eliminado al final (endpoint nuevo), garantizando el ciclo pedido: **crear → probar → eliminar**.
- **Integración al CI**: la suite E2E vive en `e2e/` y es la que corre el job `e2e-tests` del CI (reemplazó al repo externo `PatesiTests`). Bootea su propio server aislado (`E2E_PORT=3001`, `DATA_DIR=.e2e-data`) y sube el reporte HTML como artifact.

### Quality gates del CI (`.github/workflows/ci.yml`)

| Gate | Cuándo | Justificación |
|------|--------|---------------|
| `unit-tests` (Jest) | antes de E2E | Regresión de lógica de negocio, rápido y determinista. |
| `e2e-tests` (Playwright + Cucumber) | depende de unit-tests | Ciclo de vida completo del usuario + validación de auth contra un server real y aislado. Gate de mayor valor. |

El workflow ejecuta únicamente pruebas y sube el reporte E2E como artifact. El hosting de SelimSystem aún no está configurado y se establecerá por separado.

No se incluye aún un gate de **cobertura** porque no hay umbral justificado definido (ver riesgos/recomendaciones). Un gate de cobertura sin umbral real es fragilidad sin valor de calidad.

---

## 9. Riesgos y mitigaciones (fusionado)

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| **Suite de tests no corre en OneDrive** | Alta (confirmado) | Crítico | Trabajar el repo fuera de OneDrive (ver Hallazgos). |
| Broken access control / borrado entre usuarios | Media | Alto | Tests de aislamiento multiusuario; el borrado de cuenta verifica que limpia SOLO ese usuario. |
| Error de cálculo de IVA/split | Media | Alto | BVA + casos específicos (v1.11.x). |
| Corrupción de la DB JSON | Media | Alto | Tests de jsondb con archivo corrupto/ausente + backups. |
| Sin umbral de cobertura | Alta | Medio | Fijar ≥70% en rutas críticas y subirlo de forma incremental. |
| Regresión en releases frecuentes | Media | Medio | Smoke por tag + suite de integración + E2E como red de seguridad. |
| E2E flaky (tiempos/datos) | Media | Medio | Usuarios únicos por corrida, waits explícitos, limpieza de modales residuales en el `After`, vídeo/screenshot para diagnóstico. Ya **estabilizado**: 10/10 escenarios en verde en corridas repetidas. |

---

## Recomendaciones priorizadas

1. **Mover el repo fuera de OneDrive** (P1) — el único bloqueo crítico de testing local (Jest no descubre tests bajo OneDrive). En CI esto no aplica (checkout normal en Linux).
2. **Robustecer seguridad NFR**: rate limiting en login + verificación de aislamiento de datos por usuario.
3. **Fijar umbral de cobertura** ≥70% en auth y transactions y hacerlo cumplir en CI (aún sin gate de cobertura).
4. **Extender E2E a Firefox/WebKit** cuando la cobertura Chromium, ya estable e integrada al CI, se consolide.
