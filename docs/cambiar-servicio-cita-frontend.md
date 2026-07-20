# Cambiar el servicio de una cita agendada — Guía para Frontend

Backend listo en `feature/payroll-foundation`.

Permite **cambiar el servicio de un detalle ya agendado** de una cita. Ejemplo típico: la cita se agendó con "Corte + Barba" y el cliente decide dejarlo en "Corte". En lugar de cancelar y volver a crear, se cambia el servicio de esa línea y el backend recalcula todo (precio, duración, reparto y totales de la cita).

---

## 1. Las 3 ideas que hay que entender antes de tocar el endpoint

### Idea 1 — Una cita tiene "detalles", y cada detalle es un servicio

Una cita (`session`) es la cabecera. Cada servicio de la cita es una fila aparte llamada **detalle** (`sessionDetail`), con su propio `detailId`, su trabajador, su hora y su precio. Este endpoint cambia el servicio de **un** detalle, identificado por su `detailId`.

> El `detailId` **no cambia** al cambiar el servicio. Es el mismo id de siempre; sigue sirviendo para referenciar esa línea.

### Idea 2 — El trabajador y la hora de inicio NO se tocan

El cambio **conserva el mismo trabajador y la misma hora de inicio** del detalle. Lo único que cambia es *qué* servicio se hace. Como consecuencia, el backend **recalcula solo**:

- **Precio** del detalle (según el nuevo servicio / oferta).
- **Duración** (y por tanto la hora de **fin** del bloque).
- **Reparto** trabajador / compañía (`totalWorker` / `totalCompany`).
- **Totales de la cita** (`totalCost` y `totalTime`).

El frontend **no** manda ninguno de esos valores: solo manda el nuevo `serviceId`. Todo lo demás lo calcula el backend.

### Idea 3 — Solo se cambia mientras la línea sigue "Agendada"

Este endpoint es para reprogramar lo que aún no ha pasado. Si el servicio ya empezó, ya se completó, o la cita está pagada/cancelada, el cambio se rechaza (ver validaciones abajo).

---

## 2. El endpoint

```
PATCH /sessions/:sessionId/details/:detailId/service
Authorization: Bearer <token>
Roles: adm | wrk
```

| Parámetro de ruta | Qué es |
|---|---|
| `sessionId` | Id de la cita |
| `detailId` | Id del detalle (la línea de servicio) que se quiere cambiar |

### Body

```jsonc
{
  "serviceId": 42,   // requerido: el NUEVO servicio
  "offerId": 7       // opcional: aplicar una oferta a ese nuevo servicio
}
```

- **`serviceId`** (requerido) — el servicio al que se quiere cambiar. Debe ser distinto del actual y pertenecer a la misma compañía.
- **`offerId`** (opcional) — si el nuevo servicio tiene una oferta vigente y se quiere aplicar. Si se omite, el precio es el normal (`worker.cost ?? service.cost`).

### Respuesta `200 OK`

```jsonc
{
  "message": "Servicio del detalle 315 cambiado a \"Corte\" exitosamente",
  "detail": { /* el sessionDetail ya actualizado (mismo id, nuevo serviceId, nuevos montos) */ },
  "previousServiceId": 88,
  "newServiceId": 42,
  "newTotals": {
    "totalCost": 15.00,   // total de la cita recalculado
    "totalTime": 30       // minutos totales de la cita recalculados
  },
  "calculation": {
    "serviceName": "Corte",
    "cost": 15.00,            // precio del detalle
    "totalTime": 30,          // duración del detalle en minutos
    "totalWorker": 9.00,      // parte del trabajador
    "totalCompany": 6.00,     // parte de la compañía
    "workerPercentage": 60,
    "companyPercentage": 40,
    "isOffer": false,         // true si se aplicó una oferta
    "appliedOfferId": null,   // id de la oferta aplicada, o null
    "offerName": null
  }
}
```

`newTotals` es lo que la UI debe usar para refrescar el encabezado de la cita (costo y duración totales). `calculation` es el desglose de la línea que cambió, por si se quiere mostrar "antes/después".

---

## 3. Las validaciones (por qué te puede dar `400`/`403`)

El backend rechaza el cambio en estos casos. Todos vienen como error con un `message` legible que **se puede mostrar tal cual** al usuario.

### Permisos (`403`)
- **Admin:** solo si el detalle pertenece a una cita de **su** compañía.
- **Trabajador:** solo puede cambiar el servicio de un detalle que esté **asignado a él** (y estar activo en la compañía).

### Estado de la cita / del detalle (`400`)
- La cita **no** puede estar **Pagada (4)**, **Cancelada (5)** ni **Calificada (6)**.
- El detalle debe seguir en estado **Agendado (1)**. Si ya está "En proceso", "Completado", etc., se rechaza.
- Si el admin tomó el control de la cita (`statusLocked`), el **trabajador** no puede cambiar el servicio (el admin sí).

### La regla del trabajador habilitado (`400`) ⭐
Si el nuevo servicio tiene una **lista de trabajadores habilitados** (`service.workers[]`), el trabajador asignado al detalle **debe estar en esa lista**. Si no, error del tipo:

> *"Ana Pérez no puede realizar el servicio Corte. Trabajadores habilitados: Luis, María."*

> **Recomendación UX:** para no ofrecer servicios que van a fallar, al armar el selector de "cambiar servicio" filtra el catálogo a los servicios que **ese trabajador** puede hacer. El backend ya expone esa lista en `GET /sessions/worker/my-services` (worker) o con `?workerId=` (admin).

### Otras validaciones (`400`)
- El **nuevo servicio** debe existir y ser de la misma compañía.
- No puede ser el **mismo servicio** que ya tiene el detalle.
- El trabajador no puede quedar con el **mismo servicio dos veces** en la misma cita.
- **Solapamiento → arrastre automático (ripple):** si el nuevo servicio **dura más** y pisaría las citas **agendadas** siguientes de ese trabajador, el backend **las corre hacia abajo** automáticamente (lo justo para quitar el cruce, respetando huecos). No se rechaza. Ver sección 4.
- **Servicios extra:** este endpoint **no** aplica a servicios agregados como "extra" (`isExtra`). Para esos, usar quitar + volver a agregar con los endpoints de extra-services (`DELETE`/`POST /sessions/:id/extra-services`). Si se intenta, el error lo indica.

---

## 4. Arrastre (ripple) y notificaciones

### Qué pasa si el nuevo servicio dura más

Cuando el nuevo servicio es **más largo** que el anterior, su bloque se extiende y puede pisar las citas **agendadas** siguientes de ese mismo trabajador. En lugar de rechazar, el backend **corre esas citas hacia abajo** automáticamente (igual que al reprogramar): las empuja lo justo para quitar el cruce, respetando los huecos que ya haya.

Detalles del arrastre:
- Solo mueve citas **Agendadas (status 1)** de **ese mismo trabajador**, en **el mismo día**.
- **No** mueve las que ya empezaron/completaron/pagaron, ni las canceladas, ni las de otros trabajadores.
- Si una cita ya iniciada bloquea el paso, no la mueve (puede quedar un solape con esa; es una decisión de negocio, igual que en reprogramar).

### Quién se entera (sin polling)

Tras un cambio exitoso el backend dispara, best-effort:

| Evento / aviso | A quién | Qué |
|---|---|---|
| realtime `appointment.extra_services_changed` | compañía + trabajador + cliente de **esta** cita | Sesión completa + `newTotals` para refrescar |
| realtime `appointment.status_changed` | por **cada** cita que el arrastre movió | Refresca esa cita en el calendario |
| push + correo "Tu cita cambió de hora" | **cliente** de cada cita movida | Avisa que su cita se corrió |
| push "La agenda cambió de hora" | **trabajador** de la agenda **+ admin** de la compañía | Avisa que se corrieron N cita(s) por el cambio de servicio |

> El actor que hizo el cambio **no** se auto-notifica (si el worker cambió el servicio, no se manda push a sí mismo).

Si ya escuchas `appointment.extra_services_changed` y `appointment.status_changed` (los mismos de add/remove de extras y de reprogramar), el calendario se refresca solo; no hace falta recargar a mano.

---

## 5. Flujo recomendado en la UI

1. En el detalle de una cita **agendada**, botón "Cambiar servicio" en la línea del servicio.
2. Abrir un selector con los servicios que **ese trabajador** puede hacer (usar `GET /sessions/worker/my-services`).
3. (Opcional) Si el servicio elegido tiene oferta vigente, permitir aplicarla → mandar `offerId`.
4. `PATCH /sessions/:sessionId/details/:detailId/service` con `{ serviceId }`.
5. Con la respuesta: actualizar la línea con `calculation` y el encabezado de la cita con `newTotals`. (O simplemente esperar el evento realtime.)
6. Ante un `400`/`403`, mostrar el `message` del backend tal cual (ya viene en español y explica la causa).
