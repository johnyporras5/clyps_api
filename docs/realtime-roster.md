# Eventos de tiempo real — Roster (Workers / Clientes) (CLYP-246)

Altas, ediciones y bajas de workers y clientes emiten eventos para que la vista
de equipo del admin y la selección de providers del cliente se actualicen en
vivo. Sobre global: `{ type, entityId, companyId, emittedAt, data }`.

## Eventos

| Evento | Disparador | Dónde se emite | Rooms | `data` |
|--------|-----------|----------------|-------|--------|
| `worker.added` | `POST /auth/register/worker` | `AuthService.registerWorker` | `company`, `company-public` | `{ worker, companyWorkerId }` |
| `worker.updated` | `PUT /workers/admin/:id/update` | `WorkerController` | `company`, `company-public` | worker (retorno completo) |
| `worker.removed` | `DELETE /companys/workers/:id/temporary` | `CompanyController` | `company`, `company-public` | `{ companyWorkerId }` |
| `client.added` | `POST /auth/register/client-by-admin` | `AuthService.registerClientByAdmin` | `company` | client |
| `client.removed` | `DELETE /companys/clients/:id/temporary` | `CompanyController` | `company` | `{ clientId }` |

## Decisiones de diseño

### Dónde se emite cada evento (y por qué)
- **Altas (`*.added`)** se emiten desde `AuthService`, donde existe el objeto
  completo (`worker`+`companyWorker`+`company`, o `client`+`company`). El retorno
  de los endpoints de registro no incluye esos objetos.
- **`worker.updated`** desde `WorkerController`: su retorno
  (`{ worker, companyWorker }`) ya trae el worker completo.
- **Bajas (`*.removed`)** desde `CompanyController`: los métodos de remoción
  retornan solo `{ message, canRestore }`, así que el payload es el **id** de la
  entidad (suficiente para que el frontend la quite de la lista).

### Dependencia circular resuelta con forwardRef
Las altas viven en `AuthModule`, pero `RealtimeModule` ya importa `AuthModule`
(el Gateway usa `AuthService`/`TokenBlacklistService`). Para que `AuthService`
pueda inyectar `RealtimeService` se usa **`forwardRef()`** mutuo entre
`AuthModule` y `RealtimeModule` (patrón estándar de Nest). Verificado: la app
arranca sin errores de DI.

> `worker.removed`/`client.removed` se emiten desde el **controller** (no desde
> `CompanyService`) porque `CompanyService` también es provider de `AuthModule`;
> meterle `RealtimeService` reintroduciría el ciclo por otra vía.

### Alcance de bajas
Solo los endpoints `/temporary` emiten `removed` (según la tarjeta). Las bajas
`/permanent` no emiten; agregarlo es trivial si se requiere.

## Criterios de aceptación

- ✅ Alta/edición/baja de worker emite el evento (afecta vista de equipo del
  admin y selección de providers del cliente).
- ✅ Alta/baja de cliente emite el evento al canal de la empresa.

## Archivos

- [`src/auth/auth.service.ts`](../src/auth/auth.service.ts) — `worker.added`, `client.added`.
- [`src/worker/worker.controller.ts`](../src/worker/worker.controller.ts) — `worker.updated`.
- [`src/company/company.controller.ts`](../src/company/company.controller.ts) — `worker.removed`, `client.removed`.
- `forwardRef` en [`src/auth/auth.module.ts`](../src/auth/auth.module.ts) ↔ [`src/realtime/realtime.module.ts`](../src/realtime/realtime.module.ts).
