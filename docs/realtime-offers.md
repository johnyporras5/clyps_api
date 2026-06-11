# Eventos de tiempo real — Ofertas + Job de vencimiento (CLYP-243)

Cada mutación de oferta emite su evento desde el `OfferService`, y un **job
(cron)** diario emite las transiciones por tiempo (vencimiento/activación) sin
acción de usuario. Sobre global: `{ type, entityId, companyId, emittedAt, data }`.

Las ofertas **no contienen datos de cliente**, por lo que es seguro emitir al
canal público `company-public:<id>` (a diferencia de sessions).

## Eventos por mutación

| Evento | Endpoint | Rooms | `data` |
|--------|----------|-------|--------|
| `offer.created` | `POST /offers/my-company` | `company:<id>`, `company-public:<id>` | offer completa |
| `offer.updated` | `PUT /offers/my-company/:id` | `company` + `company-public` | offer completa |
| `offer.activated` / `offer.deactivated` | `PATCH /offers/my-company/:id/activate` \| `/inactivate` | `company` + `company-public` | offer completa |
| `offer.deleted` | `DELETE /offers/my-company/:id` | `company` + `company-public` | `{ offerId }` |

- "offer completa" = el shape de `GET /offers/my-company/:id` (`findOne` →
  `serviceOffers` + `serviceOffers.service` + `logoUrl`).
- `setStatus(id, 1)` → `offer.activated`; `setStatus(id, 0)` → `offer.deactivated`.

## Job de vencimiento/activación (cron)

`OfferExpirationTask` corre **a diario** (`5 0 * * *`, `America/Caracas`) y
delega en `OfferService.processScheduledOfferTransitions()`.

**Estrategia: notify-only (decisión CLYP-243).** El cron **NO cambia el `status`
en BD** — el `status` es el switch manual del admin; la vigencia es por fecha
(como ya funcionaban las queries de ofertas activas). Usa una **ventana de un
día**:

| Evento | Condición | Rooms | `data` |
|--------|-----------|-------|--------|
| `offer.expired` | `status=1` y `endDate` cayó **ayer** (acaba de vencer) | `company` + `company-public` | `{ offerId }` |
| `offer.activated` | `status=1`, `startDate` es **hoy** y `endDate >= hoy` | `company` + `company-public` | offer completa |

### Caveat documentado (deuda menor)

Al ser notify-only con ventana diaria, si una ejecución del cron se pierde
(servidor caído a esa hora) se pierden los eventos de transición de ese día. Las
queries REST de ofertas activas siguen siendo correctas (filtran por fecha), solo
se omite la notificación push de ese día. Para robustez total habría que
persistir un marcador de "ya notificado" (requiere migración) o flip de status.

## Criterios de aceptación

- ✅ Las 4 mutaciones de oferta emiten su evento.
- ✅ Existe un job (cron) que detecta ofertas que vencen (`endDate` pasada) o se
  activan (`startDate` llegada) y emite el evento correspondiente, sin acción de
  usuario.

## Archivos

- [`src/Offer/offer.service.ts`](../src/Offer/offer.service.ts) — emisión en mutaciones + `processScheduledOfferTransitions()`.
- [`src/tasks/offer-expiration.task.ts`](../src/tasks/offer-expiration.task.ts) — cron diario.
- Registro del task en [`src/app.module.ts`](../src/app.module.ts).
