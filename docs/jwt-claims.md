# Contrato del JWT — Claims de tiempo real (CLYP-247)

> Dependencia bloqueante del epic de WebSockets. Estos claims permiten al
> Gateway (CLYP-240) meter cada socket en sus *rooms* durante el handshake
> **sin una query extra a BD por conexión**.

## Puntos que firman tokens

| Punto | Archivo | Estado |
|-------|---------|--------|
| `POST /auth/login` | `src/auth/auth.service.ts` → `login()` | ✅ con claims |
| Registro admin (auto-firma) | `src/auth/auth.service.ts` → `registerAdmin()` | ✅ con claims |

> Worker y client **no** reciben token en su registro (no aplican).

## Shape del payload por rol

El payload se firma con `JwtService.sign(payload)`. Campos comunes: `email`, `sub`, `userType`, `iat`, `exp`.

### Admin (`adm`)
```jsonc
{
  "email": "admin@empresa.com",
  "sub": 12,                 // user.id
  "userType": "adm",
  "companyId": 4,            // Company.userId === user.id
  "companyWorkerId": null
}
```

### Worker (`wrk`)
```jsonc
{
  "email": "worker@empresa.com",
  "sub": 33,
  "userType": "wrk",
  "companyId": 4,            // CompanyWorker.companyId
  "companyWorkerId": 87      // CompanyWorker.id  → room worker:<companyWorkerId>
}
```

### Client (`cli`)
```jsonc
{
  "email": "cliente@correo.com",
  "sub": 55,
  "userType": "cli",
  "companyId": null,         // pertenece a varias empresas
  "companyWorkerId": null
}
```

## Rooms que derivan de estos claims (referencia para CLYP-240)

| Room | Quién entra | Claim usado |
|------|-------------|-------------|
| `company:<companyId>` | admin y workers de la empresa | `companyId` |
| `worker:<companyWorkerId>` | un worker específico | `companyWorkerId` |
| `client:<clientId>` | un cliente específico | `sub` → resolver `clientId` |

## Estrategia de transición para tokens viejos — Opción (b)

Los tokens emitidos **antes** de este cambio no traen `companyId` / `companyWorkerId`
(llegan como `null`). Para no romper sesiones activas se adopta la **opción (b)**:

- El JWT nuevo trae los claims firmados → **camino rápido** (sin I/O en el handshake).
- Si el Gateway recibe un token con `companyId == null` para un rol `adm`/`wrk`,
  **resuelve por BD una sola vez** en el handshake llamando a
  `AuthService.buildCompanyClaims(user)` (misma fuente de verdad que el login).
- No se fuerza re-login. Los tokens viejos se renuevan naturalmente al expirar
  (`JWT_EXPIRES_IN`, por defecto 24h) o al volver a iniciar sesión.

> El fallback se **conecta** en CLYP-240 (Gateway). El método reutilizable ya
> existe: `AuthService.buildCompanyClaims()`.

## Notas para el frontend

- No requiere cambios para que el token funcione; los claims nuevos son aditivos.
- Si el frontend decodifica el token, puede leer `companyId` / `companyWorkerId`
  directamente en lugar de pedirlos por REST.
- Tras desplegar, conviene invitar a re-login para que todos migren al token nuevo
  (opcional; (b) cubre el periodo de transición).
