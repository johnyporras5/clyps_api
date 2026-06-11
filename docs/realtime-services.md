# Eventos de tiempo real — Servicios, Precios y Categorías (CLYP-244)

Cada mutación de servicio o categoría emite su evento desde el service
correspondiente. Sobre global: `{ type, entityId, companyId, emittedAt, data }`.
Ni servicios ni categorías contienen datos de cliente → seguro emitir al canal
público `company-public:<id>`.

## Eventos

| Evento | Endpoint | Método | Rooms | `data` |
|--------|----------|--------|-------|--------|
| `service.created` | `POST /services/my-company` | `ServiceService.create()` | `company` + `company-public` | service completo |
| `service.updated` | `PUT /services/my-company/:id` | `ServiceService.update()` | `company` + `company-public` | service completo (incl. `cost`, `percentage`) |
| `service.deleted` | `DELETE /services/my-company/:id` | `ServiceService.remove()` | `company` + `company-public` | `{ serviceId }` |
| `category.changed` | `POST` / `PUT` / `DELETE /service-categories/...` | `ServiceCategoryService.create/update/remove()` | `company` + `company-public` | category |

- "service completo" = shape de `GET /services/my-company/:id`
  (`findOneWithWorkers` → `{ ...service, workersInfo }`), que incluye `cost` y
  `percentage` (el cambio de precio queda reflejado en el payload).
- `category.changed` se emite igual para crear, editar y eliminar categorías; en
  el caso de delete, `data` es la categoría tal como estaba antes de borrarse.

## Criterios de aceptación

- ✅ Crear/editar/eliminar servicio emite el evento con el cambio de precio
  reflejado en el payload (`cost`/`percentage` en service completo).
- ✅ Cambios de categoría emiten `category.changed`.

## Archivos

- [`src/service/service.service.ts`](../src/service/service.service.ts) — `service.created/updated/deleted`.
- [`src/service_category/service_category.service.ts`](../src/service_category/service_category.service.ts) — `category.changed`.
