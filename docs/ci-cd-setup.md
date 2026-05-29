# CI/CD setup

Todo está definido en código. No requiere configuración manual de DigitalOcean.

## Flujo de ramas

```
feature/*  ──PR──▶  development  ──PR──▶  main  ──auto deploy──▶  DigitalOcean
                       │                    │
                       └─ CI (tests)        └─ CI + CD (build, push, trigger)
```

- `feature/*` y `fix/*`: ramas de trabajo. Se mergean a `development` via PR.
- `development`: integración. CI corre lint + build + tests + migraciones contra MySQL efímero.
- `main`: producción. CI + CD: además de tests, builda la imagen, la sube a GHCR y dispara deploy a DigitalOcean App Platform.

## Workflows

- `.github/workflows/ci.yml` — corre en cualquier PR hacia `development`/`main` y en push a esas ramas. Levanta un MySQL 8 efímero, instala, builda, corre las migraciones contra esa BD y ejecuta tests.
- `.github/workflows/cd.yml` — corre sólo en push a `main`: buildea la imagen Docker, la publica en GHCR y dispara un deploy en DO.

## Cómo se corren las migraciones en producción

Las migraciones se ejecutan **al arrancar el contenedor**, antes de que se levante la app. Está implementado en el `entrypoint.sh` del `Dockerfile`:

```sh
# Run database migrations before starting the app (fail fast if migrations fail)
if [ "${SKIP_MIGRATIONS}" != "true" ]; then
  echo "Running database migrations..."
  cd /app && npm run migration:run:prod
  echo "Migrations finished successfully"
fi
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
```

Comportamiento:
- Cada vez que arranca el contenedor en producción, primero corre `migration:run:prod` (migraciones compiladas en `dist/database/migrations/*.js`).
- Si una migración falla, el script sale con error y el contenedor no arranca → DO marca el deploy como fallido y mantiene la versión anterior corriendo → **no se rompe prod**.
- Las migraciones son idempotentes (TypeORM guarda en la tabla `migrations` cuáles ya corrieron), así que reiniciar el contenedor no causa problemas.
- Si necesitas desactivarlas temporalmente, agrega la env var `SKIP_MIGRATIONS=true` en DO.

## Secrets en GitHub

Necesarios para el workflow CD (Settings → Secrets and variables → Actions):

| Secret | Para qué |
|---|---|
| `DIGITALOCEAN_ACCESS_TOKEN` | Token personal de DO con scopes `app read/create/update` |
| `DIGITALOCEAN_APP_ID` | UUID de la app en DO |

`GITHUB_TOKEN` lo provee automáticamente GitHub para push a GHCR.

## Secrets / Env vars en DigitalOcean

Se configuran en el panel de DO → App → Settings → App-Level Environment Variables (marcar `Encrypt` en todas las sensibles):

`DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `NODE_ENV=production`, `PORT=4000`,
más las que ya estés usando: `JWT_SECRET`, `JWT_EXPIRES_IN`, `RESEND_API_KEY`, `RESEND_DOMAIN`, `RESEND_FROM_EMAIL`,
`ASSETS_BASE_URL`, `DO_SPACES_*`, `OPENAI_API_KEY`, etc.

## Probar el flujo localmente

```bash
# Levantar MySQL local
npm run docker:up

# Build de la imagen como en prod
docker build -t clyps-api .

# Correr con env file de prueba (las migraciones se ejecutan automáticamente al arrancar)
docker run --rm -p 3001:81 --env-file .env clyps-api
```

## Si necesitas agregar staging más adelante

1. Crear una segunda DO App apuntando a la rama `development` (con su propia BD).
2. Agregar un nuevo job en `cd.yml` que se dispare en push a `development` con secrets propios (`DIGITALOCEAN_STAGING_APP_ID`, etc.).
3. Las migraciones de staging corren automáticamente igual que en prod (vía entrypoint del contenedor).
