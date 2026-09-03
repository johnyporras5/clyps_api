# CI/CD setup

Todo el pipeline vive en un solo archivo: `.github/workflows/ci-cd.yml`.

## Flujo de ramas

```
feature/*  ──PR──▶  development  ──PR──▶  main
                        │                   │
                        │                   └─ migraciones + deploy a wellnessme (production)
                        └─ migraciones + deploy a vita_dev (development)
```

- `feature/*` y `fix/*`: ramas de trabajo. No despliegan nada.
- PR hacia `development` o `main`: corre `verify` (build + tests), `lint` (informativo) y
  `docker` (build de la imagen sin push, para validar el Dockerfile).
- Push a `development` o `main` — que es lo que pasa al mergear un PR: corre `verify` y
  después `deploy`. **Un merge de una rama nueva a `development` ejecuta las migraciones
  exactamente igual que un merge de `development` a `main`**, solo que contra la app y la
  base de desarrollo.

## Jobs

| Job | Cuándo | Qué hace |
|---|---|---|
| `verify` | siempre | `npm run build` + `npm test -- --ci --runInBand`. Bloquea el merge y el deploy. |
| `lint` | siempre | `npm run lint:ci` con `continue-on-error: true`. Informativo mientras se limpia la deuda de ESLint. |
| `docker` | solo PRs | Build del `Dockerfile` sin push. App Platform construye con ese mismo Dockerfile. |
| `deploy` | push a `development` / `main` | Migraciones → `doctl apps create-deployment --wait` → health check a `/ping`. |

El job `deploy` sólo corre si el ref es `refs/heads/development` o `refs/heads/main`, así un
`workflow_dispatch` sobre una rama suelta no despliega por accidente.

## Orden del deploy

1. **Migraciones desde el runner** (`npm run migration:run`, contra `src/`, con ts-node).
   Si una migración falla, el job se corta acá: no se dispara ningún deployment y el
   contenedor viejo sigue sirviendo tráfico intacto.
2. `doctl apps create-deployment --wait`: App Platform buildea desde el `Dockerfile` del
   commit y espera a que el deployment termine.
3. Health check: hasta 12 intentos (2 min) de `GET $APP_URL/ping` esperando un 200.

> Nota: el `entrypoint.sh` del contenedor también corre `migration:run:prod` al arrancar.
> Es idempotente (TypeORM lleva la tabla `migrations`), así que no rompe nada, pero una vez
> que confíes en el paso de CI conviene poner `SKIP_MIGRATIONS=true` en las env vars de la
> app para que el arranque sea más rápido y determinista.

## Environments en GitHub

Settings → Environments. Hay dos, y los secrets se llaman igual en ambos: GitHub inyecta los
del environment que le toque según la rama.

| Environment | Rama | App de DO |
|---|---|---|
| `development` | `development` | `vita_dev` |
| `production` | `main` | `wellnessme` |

**Secrets por environment:**

| Secret | Para qué |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` | Migraciones desde el runner |
| `DIGITALOCEAN_ACCESS_TOKEN` | Token de DO con scopes `app read/create/update` |
| `DO_APP_ID` | UUID de la app en DO |

**Variables por environment** (Variables, no Secrets):

| Variable | Para qué |
|---|---|
| `APP_URL` | Base URL pública, sin barra final. Ej: `https://vita-dev-xxxx.ondigitalocean.app` |

En `production` conviene activar *Required reviewers* para que el deploy a `main` quede en
pausa hasta que alguien lo apruebe.

## Requisito de red

El runner de GitHub tiene IP dinámica. Para que el paso de migraciones pueda conectarse, la
base tiene que aceptar conexiones desde fuera de DO (trusted sources abiertos, o abrirlos y
cerrarlos con `doctl databases firewalls` dentro del job). Si no quieres eso, la alternativa
es borrar el paso `Migraciones` y dejar que corran en el `entrypoint` del contenedor como
antes.

## Env vars en DigitalOcean

Panel de DO → App → Settings → App-Level Environment Variables (marcar `Encrypt` en las
sensibles): `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`,
`NODE_ENV=production`, `PORT=4000`, `JWT_SECRET`, `JWT_EXPIRATION`, `CORS_ORIGINS`,
`RESEND_*`, `FIREBASE_CREDENTIALS_BASE64`, `SUBSCRIPTION_*`, `ONBOARDING_*`, etc.
Ver `.env.example` para la lista completa.

## Probar el flujo localmente

```bash
npm run docker:up                  # MySQL local
docker build -t clyps-api .        # build como en prod
docker run --rm -p 3001:81 --env-file .env clyps-api
curl http://localhost:3001/ping
```
