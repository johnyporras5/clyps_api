# CI/CD setup

## Flujo de ramas

```
feature/*  ──PR──▶  development  ──PR──▶  main  ──auto deploy──▶  DigitalOcean
                       │                    │
                       └─ CI (tests)        └─ CI + CD (build, push, deploy con migraciones)
```

- `feature/*` y `fix/*`: ramas de trabajo. Se mergean a `development` via PR.
- `development`: integración. CI corre lint + build + tests + migraciones contra MySQL efímero.
- `main`: producción. CI + CD: además de tests, builda la imagen, la sube a GHCR y dispara deploy a DigitalOcean App Platform.

## Workflows

- `.github/workflows/ci.yml` — corre en cualquier PR hacia `development`/`main` y en push a esas ramas.
- `.github/workflows/cd.yml` — corre sólo en push a `main` (después de un merge).

## Migraciones

Las migraciones corren en un **Pre-Deploy Job** de DigitalOcean App Platform (`.do/app.yaml`).
Esto significa: cuando se dispara un deploy, DO primero corre `npm run migration:run:prod` contra la BD de prod
desde la red interna de DO (no necesita whitelist de IP), y sólo si el job termina sin error, levanta la app nueva.
Si las migraciones fallan, el deploy se aborta y queda corriendo la versión anterior.

El script `migration:run:prod` usa las migraciones compiladas en `dist/database/migrations/*.js` (no `ts-node`),
porque la imagen de producción no incluye `src/`.

## Secrets que necesitas configurar

### En GitHub (Settings → Secrets and variables → Actions → New repository secret)

| Secret | Para qué |
|---|---|
| `DIGITALOCEAN_ACCESS_TOKEN` | Token personal de DO con permiso sobre la app. Crear en DO → API → Personal access tokens (scope `apps:read` y `apps:write`). |
| `DIGITALOCEAN_APP_ID` | UUID de tu app en DO. Lo obtienes con `doctl apps list` o en la URL del panel: `cloud.digitalocean.com/apps/<APP_ID>`. |

`GITHUB_TOKEN` no hay que configurarlo — GitHub lo provee automáticamente para push a GHCR.

### En DigitalOcean App Platform (Settings → App-Level Environment Variables)

Marcar todos como **Encrypted**:

| Variable | Valor |
|---|---|
| `DB_HOST` | host de tu MySQL gestionado (interno de DO si lo tienes en la misma cuenta) |
| `DB_PORT` | `3306` (o el que corresponda) |
| `DB_USERNAME` | usuario de la BD |
| `DB_PASSWORD` | password |
| `DB_DATABASE` | nombre de la BD |

Además los secretos de la app que ya estés usando: `JWT_SECRET`, `RESEND_API_KEY`, `AWS_*`, etc.

## Cómo aplicar el `app.yaml`

Una sola vez, sincronizar el spec con tu app existente:

```bash
# Instalar doctl: https://docs.digitalocean.com/reference/doctl/how-to/install/
doctl auth init

# Encuentra el ID de tu app
doctl apps list

# Aplicar el spec (reemplaza <APP_ID>)
doctl apps update <APP_ID> --spec .do/app.yaml
```

Despues, cada push a `main` disparará el flujo: tests → build → deploy → migraciones → app nueva.

> ⚠️ El `app.yaml` actual incluye solo lo mínimo (api + job de migración + envs de BD). Si tu app actual tiene
> dominios personalizados, alertas, workers extra, etc., revisa con `doctl apps spec get <APP_ID>` el spec actual
> y mergea las diferencias antes de aplicar.

## Cómo probar localmente que las migraciones del CI funcionan

```bash
# Levantar MySQL local
npm run docker:up

# En otra terminal:
NODE_ENV=development npm run migration:run
```

## Si necesitas agregar staging más adelante

1. Crea una segunda DO App apuntando a la rama `development` (con su propia BD).
2. Duplica `.do/app.yaml` como `.do/app.staging.yaml` y cambia `branch: development`.
3. Añade un job en `cd.yml` que dispare en push a `development` con `DIGITALOCEAN_STAGING_APP_ID`.
