# Eventos de tiempo real — Citas / Sessions (CLYP-241)

Cada mutación de `session` emite su evento vía `SessionRealtimeEmitter`, que el
`SessionController` invoca tras la mutación (no se toca `SessionService`). El
payload "session completa" reusa el shape de `GET /sessions/:id`
(`findOneWithDetails` → `SessionResponse`).

Todos los eventos viajan en el sobre global:
`{ type, entityId, companyId, emittedAt, data }`.

## Tabla de eventos

| Evento | Endpoints disparadores | Rooms | `data` |
|--------|------------------------|-------|--------|
| `appointment.created` | `POST /sessions/create-with-detail`, `POST /sessions/client/create` | `company:<id>`, `worker:<asignados>` | session completa |
| `appointment.status_changed` | `PUT /sessions/:id/status`, `PUT /sessions/details/:id/status` | `company:<id>`, `worker:<id>`, `client:<id>` | session completa |
| `appointment.cancelled` | `PATCH /sessions/:id/cancel`, `PATCH /sessions/client/:id/cancel` | `company:<id>`, `worker:<id>`, `client:<id>` | `{ session, cancellationReason, cancelledBy }` |
| `appointment.workers_assigned` | `PATCH /sessions/:id/assign-workers` | `company:<id>`, `worker:<nuevo>`, `worker:<previo>` | `{ session, updates }` |
| `appointment.extra_services_changed` | `POST /sessions/:id/extra-services`, `DELETE /sessions/:id/extra-services/:detailId` | `company:<id>`, `worker:<id>`, `client:<id>` | `{ session, newTotals }` |
| `availability.changed` | en cada **create** y **cancel** de cita | `company-public:<id>` | `{ companyId, date, companyWorkerIds }` |

## Reglas de canal

- **`company-public` solo recibe `availability.changed`** (decisión CLYP-241):
  los eventos `appointment.*` con la session completa (que incluye datos del
  cliente) van **únicamente** a rooms privadas. El canal público nunca ve datos
  de cliente.
- `availability.changed` lleva la **fecha** (`YYYY-MM-DD`) y los
  `companyWorkerIds` afectados → el front bloquea esos slots (evita doble reserva).
- En **reasignación de workers**, se notifica al worker **previo** y al **nuevo**
  (de `updates[].previousCompanyWorkerId` y `updates[].companyWorkerId`).
- `client:<userId>` se resuelve mapeando `session.clientId → Client.userId`.

## Criterios de aceptación

- ✅ Cada endpoint listado emite su evento a las rooms correctas con la session
  completa (shape de `GET /sessions/:id`).
- ✅ Crear o cancelar emite además `availability.changed` para esa fecha/worker.
- ✅ El worker previo y el nuevo reciben el evento al reasignar.

## Hueco conocido (deuda técnica)

La **auto-cancelación** nocturna (`AutoCancelSessionsTask` →
`cancelExpiredScheduledSessions()`) cancela en lote y retorna solo conteos, no
los IDs de las sesiones afectadas. Por eso **no emite** `appointment.cancelled`
ni `availability.changed`. Para cubrirlo habría que hacer que el método retorne
los `sessionId` cancelados y emitir por cada uno. Fuera del alcance de la tabla
de CLYP-241 (endpoints de usuario); se deja anotado.

## Archivos

- [`src/session/session-realtime.emitter.ts`](../src/session/session-realtime.emitter.ts) — emisor de los 6 eventos.
- [`src/session/session.controller.ts`](../src/session/session.controller.ts) — invoca el emisor tras cada mutación.
