# Eventos de tiempo real — Horarios / Schedules (CLYP-245)

Los cambios de horario de empresa o worker emiten su evento, y además disparan
`availability.changed` para esa empresa/worker. Sobre global:
`{ type, entityId, companyId, emittedAt, data }`.

La emisión vive en los **controllers** (no en los services): `CompanyService`
está declarado también como provider de `AuthModule`, y `RealtimeModule` importa
`AuthModule` → meter `RealtimeService` en `CompanyService` crearía una
dependencia circular. Emitir desde el controller la evita y da acceso al DTO
(para saber si cambió el horario) y al retorno (con el calendario).

## Eventos

| Evento | Endpoint | Rooms | `data` | Condición |
|--------|----------|-------|--------|-----------|
| `schedule.company_updated` | `PUT /companys/admin/profile` | `company`, `company-public` | `{ companyId, calendarDetail }` (schedule + exceptions) | solo si `dto.calendarDetail` presente |
| `schedule.worker_updated` | `PUT /workers/admin/:id/update` | `company`, `worker:<companyWorkerId>`, `company-public` | `{ companyWorkerId, workerId, calendar }` | solo si `dto.calendar` presente |
| `availability.changed` | ambos cambios de horario | `company-public` | `{ companyId, date: null, companyWorkerIds }` | junto a cada `schedule.*` |

- El calendario de empresa se guarda en `CalendarCompany.calendarDetail`, que
  **contiene** las `exceptions` (excepciones tipo feriado) dentro → "schedule +
  exceptions" = ese objeto.
- El calendario de worker se guarda en `CompanyWorker.calendar`.
- `availability.changed` por cambio de horario lleva `date: null` (no es de un día
  concreto; cambió la regla de disponibilidad). `companyWorkerIds`: `[]` para la
  empresa, `[companyWorkerId]` para el worker.

## Emisión condicional (importante)

Los eventos se emiten **solo cuando el campo de calendario realmente viene en el
update** (`calendarDetail` para empresa, `calendar` para worker). Los endpoints
también actualizan otros datos del perfil (logo, nombre, foto); en esos casos
**no** se emite `schedule.*` (no hubo cambio de horario).

## Discrepancia documentada con la tarjeta

La tarjeta lista `PUT /workers/profile/update-with-photo` como disparador de
`schedule.worker_updated`. Sin embargo, ese endpoint **no puede cambiar el
horario**: su DTO (`UpdateWorkerDto`) no tiene campo `calendar` y solo actualiza
la tabla `Worker` (nombre, foto, etc.), no `CompanyWorker.calendar`. Por eso
**no emite** `schedule.worker_updated` (no habría cambio de horario que
notificar). Si en el futuro se quiere que el worker edite su propio horario, hay
que extender `UpdateWorkerDto` + `updateProfileWithPhoto` (cambio funcional,
fuera del alcance de esta tarea de WebSockets).

## Criterios de aceptación

- ✅ Cambios de horario de empresa/worker emiten su evento.
- ✅ Un cambio de horario dispara además `availability.changed` para esa
  empresa/worker.

## Archivos

- [`src/company/company.controller.ts`](../src/company/company.controller.ts) — `schedule.company_updated`.
- [`src/worker/worker.controller.ts`](../src/worker/worker.controller.ts) — `schedule.worker_updated`.
