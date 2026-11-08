# SelimSystem

Herramienta de finanzas personales multiusuario. PWA instalable.

## Desarrollo local

```bash
# Instalar dependencias
npm install

# Crear archivo .env
cp .env.example .env
# Editar .env con tus valores

# Iniciar en modo desarrollo
npm run dev
```

La app corre en http://localhost:3000

## Variables de entorno

| Variable | Descripción | Default |
|---|---|---|
| `SESSION_SECRET` | Secreto para firmar cookies | (dev fallback) |
| `APP_URL` | URL base de la app | http://localhost:3000 |
| `DATA_DIR` | Directorio de la DB JSON | ./data |
| `PORT` | Puerto del servidor | 3000 |
| `SMTP_HOST` | Host SMTP | smtp.gmail.com |
| `SMTP_PORT` | Puerto SMTP | 587 |
| `SMTP_USER` | Usuario SMTP | |
| `SMTP_PASS` | Password SMTP | |
| `SMTP_FROM` | Email remitente | no-reply@selimsystem.com |

## Tests

```bash
npm test                    # Ejecutar tests
npm run test:coverage       # Con cobertura
```

## Hosting

El hosting de SelimSystem aún no está configurado. La cuenta, la aplicación y el flujo de despliegue se crearán por separado para SelimSystem; los cambios en `master` ejecutan únicamente CI.

## Estructura

```
src/
  server.js        # Entry point
  app.js           # Express config
  config.js        # Env vars
  db/jsondb.js     # DB JSON plana
  db/seed.js       # Categorías default
  middleware/       # Auth + error handler
  routes/          # API REST
  services/        # Email + cron
public/
  index.html       # SPA shell
  css/             # Estilos (custom properties)
  js/              # Frontend vanilla JS
    pages/         # Páginas (login, home, summary, trends)
    components/    # Componentes reutilizables
    utils/         # Helpers
tests/             # Jest + Supertest
```
