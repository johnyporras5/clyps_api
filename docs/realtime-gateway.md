# RealtimeGateway — Infraestructura WebSockets (CLYP-240)

Base de tiempo real sobre la API NestJS con `socket.io`. Autentica el JWT en el
handshake, mete cada socket en sus rooms según rol y expone un helper de emisión
central reutilizable por los services de dominio.

## Conexión desde el cliente (frontend)

```ts
import { io } from 'socket.io-client';

const socket = io(API_URL, {
  auth: { token: accessToken }, // JWT de /auth/login (sin "Bearer")
  transports: ['websocket'],
});

socket.on('connect', () => console.log('conectado', socket.id));
socket.on('auth_error', (e) => console.warn('rechazado:', e.message));
```

- El token va en `socket.handshake.auth.token`. También se acepta el header
  `Authorization: Bearer <token>` como respaldo.
- Token inválido / expirado / en blacklist → el server emite `auth_error` y hace
  `disconnect()`.

## Rooms (auto-join al conectar)

| Room | Quién entra | Privacidad |
|------|-------------|------------|
| `user:<userId>` | todos | personal |
| `client:<userId>` | clientes (`cli`) | personal |
| `worker:<companyWorkerId>` | workers (`wrk`) | personal |
| `company:<companyId>` | **admin + workers** de la empresa | 🔒 privada |
| `company-public:<companyId>` | cualquier autenticado (join/leave dinámico) | pública |

Los nombres se construyen con los helpers de [`src/realtime/rooms.ts`](../src/realtime/rooms.ts).

## Join / leave dinámico (mensajes del cliente)

```ts
// Ver el canal público de una empresa (cualquiera autenticado)
socket.emit('joinCompanyPublic', { companyId: 4 }, (res) => {});
socket.emit('leaveCompanyPublic', { companyId: 4 }, (res) => {});

// Entrar al canal privado (solo admin/worker miembro de ESA empresa)
socket.emit('joinCompanyPrivate', { companyId: 4 }, (res) => {});
```

Reglas de autorización:
- **Cliente** puede unirse a `company-public:<id>` pero **NUNCA** a `company:<id>`.
- Admin/worker solo entran al privado de **su** empresa (`companyId` del token).
- **Los payloads del canal público no incluyen datos de clientes** (se hace
  cumplir al emitir, en las tareas de dominio 241+).

## Helper de emisión central — `RealtimeService`

Los services de dominio inyectan `RealtimeService` (no el Gateway, para evitar
dependencias circulares) y emiten con el contrato global.

```ts
constructor(private readonly realtime: RealtimeService) {}

// Forma cruda:
this.realtime.emitToRooms(
  [companyRoom(companyId), clientRoom(userId)],
  'session.updated',
  payload,
);

// Forma recomendada (arma el sobre del contrato automáticamente):
this.realtime.emitEntity(companyRoom(companyId), {
  type: 'session.updated',
  entityId: session.id,
  companyId,
  data: session, // objeto completo, shape del GET
});
```

### Contrato global del evento

```ts
{
  type: string,            // 'session.updated', 'offer.expired', ...
  entityId: number|string, // id de la entidad
  companyId: number|null,  // empresa dueña
  emittedAt: string,       // ISO timestamp (lo setea emitEntity)
  data: <objeto completo>  // shape del GET correspondiente
}
```

`emitToRooms` es **no-op seguro** si el server aún no está inicializado: nunca
rompe la mutación REST que lo invoca.

## Redis / multi-instancia (deuda técnica)

Hoy la API es **instancia única** → socket.io corre en memoria, sin Redis.
El punto de integración ya está listo en `RealtimeGateway.setupRedisAdapter()`:

- Si se define `REDIS_URL`, ahí se activará `@socket.io/redis-adapter`.
- Para escalar a multi-instancia: instalar `@socket.io/redis-adapter` + `ioredis`,
  setear `REDIS_URL` y descomentar el bloque documentado en ese método.
- No requiere reescribir el Gateway.

## Archivos

- [`src/realtime/realtime.gateway.ts`](../src/realtime/realtime.gateway.ts) — handshake, auth, rooms, join/leave.
- [`src/realtime/realtime.service.ts`](../src/realtime/realtime.service.ts) — `emitToRooms` / `emitEntity` + contrato.
- [`src/realtime/rooms.ts`](../src/realtime/rooms.ts) — helpers de nombres de rooms.
- [`src/realtime/realtime.module.ts`](../src/realtime/realtime.module.ts) — wiring.
