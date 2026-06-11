# Eventos de tiempo real — Reseñas / Feedbacks (CLYP-242)

Al crear una reseña se emite su evento **incluyendo las estadísticas agregadas
recalculadas** (promedio + totales + conteo por estrella), para que las cards de
worker/admin se actualicen sin recálculo en cliente.

La emisión vive **dentro de cada `create()`** del service correspondiente
(reusa sus métodos de stats ya existentes). Es best-effort: si falla, no rompe
el POST. Todos los eventos viajan en el sobre global
`{ type, entityId, companyId, emittedAt, data }`.

## Tabla de eventos

| Evento | Endpoint | Rooms | `data` |
|--------|----------|-------|--------|
| `review.worker_created` | `POST /workerfeedbacks/worker/:workerId` | `worker:<companyWorkerId>`, `company:<companyId>` | `{ feedback, stats }` |
| `review.company_created` | `POST /companyfeedbacks/company/:companyId` | `company:<companyId>` | `{ feedback, stats }` |
| `review.service_created` | `POST /servicefeedbacks/service/:serviceId` | `company:<companyId>` | `{ feedback, stats }` |

## `stats` (shape)

Recalculadas en cada emisión sobre el conjunto agregado de la entidad reseñada
(`WorkerFeedbackStatsDto`):

```ts
{
  averageStars: number,    // promedio
  totalFeedbacks: number,  // total de reseñas (== "totalReviews")
  fiveStarCount: number,
  fourStarCount: number,
  threeStarCount: number,
  twoStarCount: number,
  oneStarCount: number,
}
```

## Resolución de rooms

- **worker**: el `:workerId` del endpoint es `Worker.id`. Se mapea a
  `companyWorkerId` + `companyId` vía `CompanyWorker`. Si el worker pertenece a
  varias compañías, se emite a cada `worker:<companyWorkerId>` y su
  `company:<companyId>`.
- **company**: `companyId` es el parámetro del endpoint.
- **service**: `companyId` se toma de `service.companyId` (la compañía dueña del
  servicio).

## Criterios de aceptación

- ✅ Crear reseña emite el evento a las rooms correctas.
- ✅ El payload incluye las stats agregadas actualizadas de la entidad reseñada.

## Archivos

- [`src/worker_feedback/worker_feedback.service.ts`](../src/worker_feedback/worker_feedback.service.ts) — `review.worker_created`.
- [`src/company_feedback/company_feedback.service.ts`](../src/company_feedback/company_feedback.service.ts) — `review.company_created`.
- [`src/service_feedback/service_feedback.service.ts`](../src/service_feedback/service_feedback.service.ts) — `review.service_created`.
