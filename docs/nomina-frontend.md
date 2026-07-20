# Nómina — Guía de integración para Frontend

Épico CLYP-284 (PAY-1 … PAY-11). Backend listo en `feature/payroll-foundation`.

La nómina es un **libro mayor de ganancias + registro de pagos**. No calcula impuestos ni prestaciones (eso lo hace el contador). Lo que hace: acumula lo que cada proveedor va ganando, deja al dueño aprobarlo, y registra cuándo se le pagó.

---

## 1. Las tres reglas que hay que entender antes de tocar un endpoint

### Regla 1 — Todos los montos vienen en **céntimos de bolívares** (enteros)

Cualquier campo que termine en `Minor` es un entero de céntimos de Bs. **No es un decimal.**

```ts
// Backend manda:  { "netMinor": 755706 }
// Se muestra:     7.557,06 Bs

const formatBs = (minor: number) =>
  (minor / 100).toLocaleString('es-VE', { minimumFractionDigits: 2 }) + ' Bs';
```

Al **enviar** montos (conceptos manuales, pagos) es al revés: se manda en **Bs decimales normales**, no en céntimos.

```jsonc
// POST — aquí sí van bolívares con decimales
{ "amount": 250.50 }   // ✅ doscientos cincuenta bolívares con cincuenta
{ "amount": 25050 }    // ❌ esto son veinticinco mil bolívares
```

> **Por qué:** los decimales flotantes pierden céntimos al sumar. Guardando enteros, las cuentas cuadran siempre. La conversión de USD/EUR a Bs ya la hizo el backend con la tasa del día del cobro, y esa tasa queda congelada para siempre.

### Regla 2 — Un periodo pasa por 5 estados y **no se puede retroceder**

```
open  →  review  →  approved  →  paid  →  closed
 │         │           │          │
 │         │           │          └─ se registran los pagos
 │         │           └─ 🔒 LOS TOTALES SE CONGELAN AQUÍ
 │         └─ el dueño está revisando
 └─ las comisiones siguen entrando solas
```

El campo **`totalsFrozen`** (booleano) viene en casi todas las respuestas y es la señal para la UI:

| `totalsFrozen` | Significa | La UI debe |
|---|---|---|
| `false` (open/review) | Los totales se calculan **en vivo** y crecen con cada cita pagada | Permitir agregar conceptos, aprobar |
| `true` (approved/paid/closed) | Los totales son una **foto inmutable** | Bloquear edición; solo permitir registrar pagos |

> **Rotación automática:** un periodo puede pasar solo a `review` sin que el dueño toque nada. Cuando se cobra una cita cuya fecha ya cayó fuera del periodo abierto, el backend cierra ese periodo a `review` y abre el del ciclo nuevo. Consecuencia para la UI: un periodo puede aparecer en `review` "de la nada" — es normal, queda esperando aprobación como cualquier otro.

### Regla 3 — Lo aprobado **jamás se edita**

Si hay un error en un periodo ya aprobado, no se corrige ahí. Se crea una **reversión**: un concepto de ajuste que nace en el periodo **abierto actual**. El histórico nunca miente.

---

## 2. Endpoints

Todos cuelgan de `/payroll` y todos requieren `Authorization: Bearer <token>`.

| # | Método | Ruta | Rol |
|---|---|---|---|
| 0 | `GET` | **`/payroll/periods/current`** ← *empieza por aquí* | `adm` |
| 1 | `GET` | `/payroll/config` | `adm` |
| 2 | `PATCH` | `/payroll/config` | `adm` |
| 3 | `GET` | `/payroll/periods/:id/summary` | `adm` |
| 4 | `PATCH` | `/payroll/periods/:id/status` | `adm` |
| 5 | `POST` | `/payroll/period-details/:id/concepts` | `adm` |
| 6 | `POST` | `/payroll/concepts/:id/reverse` | `adm` |
| 7 | `POST` | `/payroll/period-details/:id/payouts` | `adm` |
| 8 | `GET` | `/payroll/period-details/:id/statement` | `adm` |
| 9a | `GET` | **`/payroll/me/periods`** ← *"Mi nómina" empieza aquí* | **`wrk`** |
| 9b | `GET` | `/payroll/me/periods/:id` | **`wrk`** |
| 10 | `GET` | `/payroll/periods` | `adm` |
| 11 | `GET` | `/payroll/periods/:id/export.csv` | `adm` |

⚠️ **El proveedor (`wrk`) solo tiene el endpoint 9.** Todos los demás le responden **403**. Los permisos se resuelven desde el token, así que un proveedor no puede leer lo de otro ni mandando el id ajeno.

---

### 0 · Periodo en curso — *la puerta de entrada*

```http
GET /payroll/periods/current
```

Devuelve **exactamente el mismo formato que el endpoint 3** (`summary`), pero del periodo abierto — sin necesidad de conocer su `id`. Es con lo que se pinta la pantalla principal de Nómina.

Devuelve el periodo **en el que el dueño está trabajando**, por esta prioridad:

1. El periodo **abierto**, si hay uno.
2. Si no, el más reciente que siga **pendiente** (`review`, `approved` o `paid`).
3. Solo si no queda nada pendiente, **abre uno nuevo** y lo devuelve.

Por eso **mandar un periodo a revisión no cambia la pantalla**: se sigue viendo el mismo periodo, ahora con `status: "review"`. Siempre responde con un periodo, nunca vacío — la pantalla no necesita un estado "no hay periodo".

De aquí sale el `period.id` para aprobar, y los `periodDetailId` de cada empleado para conceptos y pagos.

---

### 1–2 · Frecuencia de pago

```http
GET /payroll/config
→ { "frequency": "quincenal", "configured": false }

PATCH /payroll/config
{
  "frequency": "quincenal" | "semanal" | "mensual",
  "startDate": "2026-07-16"    // opcional, solo en el PRIMER arranque
}
→ { "frequency": "quincenal", "realigned": true }
```

El cambio de frecuencia aplica al **próximo** periodo — el abierto actual conserva la suya. La primera vez que se guarda, se crea automáticamente el primer periodo a partir del `startDate`.

**`startDate` — la nómina arranca en limpio desde el día que elija el admin.**

En el **onboarding** (primera vez) el admin abre un **calendario, elige un día (hoy o a futuro)** y ese día es el **inicio exacto** del primer periodo. La nómina **no cuenta nada antes de esa fecha** — los cobros anteriores simplemente no entran.

- El periodo arranca **justo en el día elegido** y corre lo que dure la frecuencia, sin alinear al calendario:
  - `startDate: "2026-07-30"` + semanal → **30 jul – 5 ago** (7 días), luego 6–12 ago, etc.
  - `startDate: "2026-07-30"` + quincenal → **30 jul – 13 ago** (15 días).
- De ahí en adelante los periodos **encadenan solos** (cada uno empieza donde terminó el anterior). No hay huecos ni periodos a medias.
- **Cobros anteriores al día elegido → no cuentan.** Si eliges el 1 de agosto, lo que se cobre hasta el 31 de julio no entra en la nómina.
- Formato `YYYY-MM-DD`. **Solo hoy o a futuro** — una fecha pasada responde **409** (*"no puede ser anterior a hoy"*); formato inválido → **400**.
- **Se usa una sola vez.** Una vez que existe el primer periodo, `startDate` se ignora; de ahí en más el admin **solo cambia la frecuencia** (la estructura ya quedó guardada).

**¿Cómo sabe el front si es el onboarding?** Con el flag **`configured`** de `GET /payroll/config`:

- `configured: false` → **la nómina aún no arrancó** (no hay periodo). Mostrar el **onboarding**: date-picker (desde hoy) + selector de frecuencia. El `frequency` que viene es solo un default para pre-seleccionar el dropdown.
- `configured: true` → ya arrancó. Mostrar **solo el selector de frecuencia** (sin date-picker). Cualquier `startDate` que se mande aquí se ignora.

Así el front no tiene que adivinar mirando periodos: el backend le dice explícitamente en qué modo está.

**Excepción — el campo `realigned`:** si el periodo abierto todavía **no tiene ni una cita cobrada**, se reajusta a la nueva frecuencia en el momento (cubre el caso "me equivoqué al elegir"). En cuanto tiene dinero adentro ya no se toca.

- `realigned: true` → el periodo actual cambió de fechas. **Hay que refrescar la pantalla** (volver a llamar al endpoint 0) y conviene un toast: *"Se ajustó el periodo en curso"*.
- `realigned: false` → el periodo actual siguió igual; el cambio entra en el próximo.

---

### 3 · Resumen del periodo — *la pantalla principal del dueño*

```http
GET /payroll/periods/:id/summary
```

```jsonc
{
  "period": {
    "id": 28,
    "label": "1–15 julio 2026",
    "status": "open",
    "frequency": "quincenal",
    "startsAt": "2026-07-01T04:00:00.000Z",
    "endsAt": "2026-07-15T04:00:00.000Z",
    "approvedAt": null,
    "approvedByUserId": null,
    "totalsFrozen": false          // ← la señal para la UI
  },
  "totals": {
    "earnedMinor": 1355706,        // devengado
    "deductedMinor": 0,            // deducciones (positivo, ya restado del neto)
    "netMinor": 1355706,           // a pagar
    "paidMinor": 1155706,          // ya pagado
    "balanceMinor": 200000,        // pendiente
    "employees": 2,
    "servicesCount": 2
  },
  "employees": [
    {
      "periodDetailId": 41,        // ← ESTE es el id para conceptos y pagos
      "companyWorkerId": 1,
      "workerName": "Carlos Rodríguez",
      "pictureURL": "https://.../worker_photo/worker-2-fc6a....jpg",   // null si no tiene
      "servicesCount": 1,
      "earnedMinor": 855706,
      "deductedMinor": 0,
      "netMinor": 855706,
      "paidMinor": 855706,
      "balanceMinor": 0
    }
  ]
}
```

**Ojo con `periodDetailId`:** es el id de la fila "este empleado en este periodo". Es el que se usa en los endpoints 5, 7 y 8 — **no** el `companyWorkerId`.

Mientras el periodo esté `open`/`review`, la lista incluye a **todos los proveedores activos**, incluso los que aún no han generado nada (aparecen en cero). Así siempre hay un `periodDetailId` al que asignarle un bono.

---

### 4 · Avanzar el periodo

```http
PATCH /payroll/periods/:id/status
{ "status": "review" }
```

Solo se admite el paso siguiente. Saltarse uno (`open → approved`) responde **409**.

**Única marcha atrás: `review → open`.** Sirve para deshacer un "enviar a revisión" hecho por error. Pero **solo se puede si no hay ya otro periodo abierto**: si el periodo pasó a `review` por rotación automática (porque el siguiente ciclo ya arrancó), el tiempo avanzó y no hay vuelta atrás.

Para saber si mostrar el botón *"Volver a abrir"*, usa el campo **`period.canReopen`** del summary (endpoint 3 / 0): `true` solo cuando el periodo está en `review` y no hay otro abierto. Si el front igual manda `review → open` con otro periodo abierto, el backend responde **409** con el motivo (no un 500). Desde `approved` en adelante nunca hay vuelta atrás.

> 🔑 **`review → approved` es el paso importante:** congela los totales de todos los empleados en una sola transacción. Después de esto, una cita que se pague tarde y caiga en ese periodo **ya no mueve el neto aprobado**. Conviene un modal de confirmación explicando que es irreversible.

---

### 5 · Concepto manual (bono / deducción / ajuste)

```http
POST /payroll/period-details/:periodDetailId/concepts
{
  "type": "bonus" | "deduction" | "adjustment",
  "label": "Bono puntualidad",
  "amount": 300,                    // Bs, no céntimos
  "note": "acordado con el dueño"   // opcional
}
```

- `bonus` → siempre **suma** (se toma el valor absoluto)
- `deduction` → siempre **resta** (se toma el valor absoluto)
- `adjustment` → **el signo lo da el monto**: `-150` resta, `150` suma

Solo funciona si el periodo está `open` o `review`. Si ya se aprobó → **409**.

---

### 6 · Revertir un concepto

```http
POST /payroll/concepts/:conceptId/reverse
{ "reason": "se cargó al proveedor equivocado" }   // opcional
```

No borra nada. Crea un concepto `adjustment` de signo contrario **en el periodo abierto actual**, con `metadata.reversalOf` apuntando al original. La respuesta es el concepto de reversión nuevo.

Sirve tanto para corregir algo del periodo actual como algo de un periodo ya cerrado — en ambos casos el ajuste cae en el periodo abierto de hoy.

---

### 7 · Registrar un pago

```http
POST /payroll/period-details/:periodDetailId/payouts
{
  "amount": 7557.06,                        // Bs
  "method": "efectivo" | "transferencia" | "otro",
  "reference": "SPEI-9911"                  // opcional
}
```

Admite **pagos parciales** (se puede pagar en varias partes). El backend bloquea la fila mientras calcula, así que dos pagos simultáneos no pueden sobrepasar el saldo.

| Situación | Respuesta |
|---|---|
| El periodo aún no está aprobado | **409** |
| El monto excede el saldo pendiente | **422** con el saldo real en el mensaje |

Sugerencia de UX: precargar el campo con el `balanceMinor` del empleado, pero dejarlo editable.

---

### 9a · Lista de periodos del proveedor — *la puerta de "Mi nómina"*

```http
GET /payroll/me/periods?page=1&limit=12        (rol: wrk)
```

Los periodos del proveedor, del más reciente al más viejo. **Incluye el periodo abierto** — a diferencia del histórico del admin (endpoint 10), porque el punto de esta pantalla es que el trabajador vea **lo que va ganando ahora**.

```jsonc
{
  "data": [
    {
      "periodId": 35,              // ← con este id se abre el detalle (9b)
      "periodDetailId": 64,
      "companyId": 1,
      "companyName": "Urban Style",                 // para el caso multi-empresa
      "companyLogoURL": "https://.../company_logo/company-1-....jpg",
      "label": "20–26 julio 2026",
      "status": "open",
      "startsAt": "2026-07-20T04:00:00.000Z",
      "endsAt": "2026-07-27T04:00:00.000Z",
      "totalsFrozen": false,
      "servicesCount": 1,
      "earnedMinor": 736930,
      "deductedMinor": 0,
      "netMinor": 736930,          // 7.369,30 Bs
      "paidMinor": 0,
      "balanceMinor": 736930,
      "settled": false             // ← badge "Pagado" cuando sea true
    }
  ],
  "meta": { "page": 1, "limit": 12, "total": 1, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

**El periodo en curso siempre aparece**, aunque el proveedor todavía no haya generado nada (sale en `0,00 Bs`). No hace falta manejar el caso "no hay periodos" salvo que la empresa nunca haya configurado nómina.

Si el proveedor trabaja en **varias empresas**, la lista trae los periodos de todas — por eso viene `companyName` (y `companyLogoURL`) en cada fila, para poder mostrar de qué negocio es cada periodo.

---

### 8–9b · Estado de cuenta del empleado

Misma forma de respuesta, dos puertas distintas:

```http
GET /payroll/period-details/:id/statement    → el admin ve a un empleado suyo
GET /payroll/me/periods/:periodId            → el proveedor ve LO SUYO
```

En la ruta del proveedor se manda el **id del periodo** (no del detail) — el backend deduce cuál fila le toca a partir de su token.

```jsonc
{
  "period": { "id": 28, "label": "1–15 julio 2026", "status": "approved", "totalsFrozen": true },
  "employee": {
    "periodDetailId": 41, "companyWorkerId": 1, "workerName": "Carlos Rodríguez",
    "pictureURL": "https://.../worker_photo/worker-2-fc6a....jpg"   // null si no tiene
  },
  "totals": {
    "earnedMinor": 855706,
    "deductedMinor": 100000,
    "netMinor": 755706,
    "paidMinor": 755706,
    "balanceMinor": 0,
    "settled": true                 // ← true = cobrado completo (para el badge "Pagado")
  },
  "breakdown": [                    // agrupado por tipo, monto YA CON SIGNO
    { "type": "commission", "count": 12, "amountMinor": 715373 },
    { "type": "tip",        "count": 8,  "amountMinor": 110333 },
    { "type": "bonus",      "count": 1,  "amountMinor": 30000 },
    { "type": "deduction",  "count": 1,  "amountMinor": -100000 }
  ],
  "concepts": [                     // el detalle línea por línea
    {
      "id": 903, "type": "commission", "label": "Comisión — Corte de cabello",
      "sign": 1, "amountMinor": 715373,
      "sourceType": "appointment",   // ← trazabilidad
      "sourceId": 88001,             // ← id del session_detail que lo generó
      "metadata": { "rateBps": 4000, "currency": "USD", "exchangeRate": 36.5 },
      "createdAt": "2026-07-08T15:22:10.000Z"
    }
  ],
  "payouts": [
    { "id": 12, "amountMinor": 755706, "method": "transferencia",
      "reference": "SPEI-9911", "paidAt": "2026-07-16T18:00:00.000Z" }
  ]
}
```

**Detalles útiles para la pantalla:**

- En `breakdown`, el monto **ya trae el signo** — las deducciones vienen negativas. Se pintan directo, sin invertir nada.
- `metadata.rateBps` es el **porcentaje de comisión en basis points**: `4000` = 40 %. Para mostrarlo: `rateBps / 100 + '%'`.
- `sourceType` + `sourceId` permiten enlazar cada comisión con **la cita que la generó**. Es lo que evita la discusión "¿por qué gané esto?".
- `settled: true` significa neto cobrado por completo → badge verde "Pagado".

---

### 10 · Histórico de periodos

```http
GET /payroll/periods?year=2026&page=1&limit=12
```

Devuelve los periodos **`review`, `approved`, `paid` y `closed`** — el abierto no aparece (todavía no es historia). Los de `review` se incluyen para que un periodo enviado a revisión nunca quede fuera de todas las pantallas; conviene distinguirlos con un badge *"Pendiente de aprobar"*, porque sus totales aún no están congelados.

```jsonc
{
  "data": [
    {
      "id": 28,
      "label": "1–15 julio 2026",
      "status": "paid",
      "frequency": "quincenal",
      "startsAt": "2026-07-01T04:00:00.000Z",
      "endsAt": "2026-07-15T04:00:00.000Z",
      "approvedAt": "2026-07-16T12:00:00.000Z",
      "employees": 2,
      "servicesCount": 2,
      "netMinor": 1355706,
      "paidMinor": 1155706
    }
  ],
  "meta": { "page": 1, "limit": 12, "total": 3, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

Ordenado del más reciente al más antiguo. `year` es opcional (sin él trae todos los años). `limit` máximo 100, por defecto 12.

**Filtro por estado (`?status=`)** — separados por coma. Sirve para armar la pantalla en dos secciones:

- **Arriba, los que siguen vivos:** `GET /payroll/periods?status=review,approved,paid` → periodos pendientes de aprobar/pagar/cerrar, cada uno con su neto (en vivo si aún no está congelado). El periodo `open` en curso lo trae aparte `/periods/current`.
- **Abajo, el historial:** `GET /payroll/periods?status=closed` → solo los cerrados.

Sin `?status`, devuelve `review+approved+paid+closed` (como antes). Un estado inválido responde **400**.

Para desplegar el detalle de una fila del histórico, se usa el endpoint 3 (`summary`) con ese `id` — al estar congelado, devuelve el snapshot inmutable.

---

### 11 · Exportar a CSV

```http
GET /payroll/periods/:id/export.csv
```

Devuelve el archivo directamente (`Content-Disposition: attachment`, nombre tipo `nomina-1-15-julio-2026.csv`). Una fila por empleado más una de totales.

**No es JSON** — hay que manejarlo como descarga, no con el cliente HTTP normal:

```ts
const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
const blob = await res.blob();
// web: crear un object URL y disparar el click
// mobile: guardar el blob y abrirlo con el visor del sistema
```

Va con `;` como separador y BOM UTF-8, para que Excel en Windows lo abra en columnas y con los acentos bien.

> **PDF:** por ahora **no está en backend**. La exportación en PDF requeriría instalar una librería nueva y quedó pendiente de decisión. Si el diseño lo pide, se puede generar en el cliente con los datos del `summary`, que ya trae todo lo necesario. Avisen si lo prefieren en backend.

---

## 3. De dónde salen las comisiones y propinas

**No hay ningún endpoint que crear conceptos automáticos — pasa solo.**

Cuando se llama a `POST /sessions/:id/payment` (marcar cita como pagada), el backend:

1. Abre el periodo del ciclo si no había ninguno abierto.
2. Crea un concepto `commission` por cada servicio pagado, convertido a Bs con la tasa de ese cobro.
3. Crea un concepto `tip` por cada propina que **pasó por la empresa**.

Dos cosas importantes:

- **El disparador es el PAGO, no el "completado".** Marcar una cita como completada no genera nada; hay que registrar el cobro.
- **La propina que el cliente le da directo en mano al proveedor NO se registra.** Solo entra a la nómina la que se cobró a través de la empresa (porque es la que la empresa le debe). Si el diseño tenía una fila informativa para la propina directa, se quita.
- Es **idempotente**: reintentar el mismo pago no duplica conceptos.

---

## 4. Errores

| Código | Cuándo | Qué mostrar |
|---|---|---|
| **403** | Rol equivocado, o intentar leer otra empresa/empleado | "No tienes permiso" |
| **404** | El periodo o detalle no existe (o no es de tu empresa) | "No encontrado" |
| **409** | Transición de estado inválida, o editar un periodo aprobado | El `message` del backend explica el estado actual — **mostrarlo tal cual**, es informativo |
| **422** | Monto inválido, o pago que excede el saldo | El `message` trae el saldo real en Bs — **mostrarlo tal cual** |

Los mensajes de 409 y 422 están redactados en español y pensados para el usuario final. Vale la pena mostrarlos directamente en vez de un texto genérico.

---

## 5. Checklist de implementación sugerido

1. **Helper de formato** `formatBs(minor)` — antes que nada, para no regar `/100` por todo el código.
2. **Pantalla de periodo actual** → endpoint 0. Es el corazón.
3. **Aprobar** → endpoint 4, con modal de "esto es irreversible".
4. **Registrar pagos** → endpoint 7 desde cada fila de empleado.
5. **Conceptos manuales** → endpoint 5.
6. **Vista del proveedor** → endpoint 9a (lista) y 9b (detalle). Ojo: rol `wrk`, ningún botón de edición.
7. **Histórico** → endpoint 10, con selector de año.
8. **Exportar** → endpoint 11 como descarga.
9. **Config de frecuencia** → endpoints 1–2.
10. **Reversiones** → endpoint 6 (lo menos urgente).

Cualquier duda sobre un contrato, me escriben. 🙌
