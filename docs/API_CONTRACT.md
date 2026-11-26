# Contratos de API (Next.js 16 App Router BFF) — Portal Job

Todas las rutas se exponen bajo `/api/v1/*` como **Route Handlers** en Next.js 16 (App Router). Los payloads se validan en el borde mediante **Zod** antes de tocar Supabase o ejecutar el motor determinista.

---

## 1. Convenciones Generales

### Autenticación
* **Header:** `Authorization: Bearer <supabase_access_token>` o cookie de sesión SSR gestionada por `@supabase/ssr`.
* Todas las rutas privadas derivan `user_id` **exclusivamente** del JWT verificado por Supabase Auth, nunca del cuerpo JSON del request.

### Formato Estándar de Errores
```json
{
  "error": {
    "code": "CONFLICT_STATE_VERSION",
    "message": "La sesión fue actualizada por otra petición concurrente.",
    "requestId": "req_01J...",
    "details": {
      "expectedVersion": 4,
      "currentVersion": 5
    }
  }
}
```

| Código HTTP | `error.code` | Significado |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Payload inválido según esquema Zod |
| `401` | `UNAUTHORIZED` | Token ausente, expirado o inválido |
| `403` | `FORBIDDEN_TENANT_ACCESS` | Violación de aislamiento B2B/B2C o rol insuficiente |
| `404` | `RESOURCE_NOT_FOUND` | Sesión, escenario o recurso inexistente o inaccesible por RLS |
| `409` | `CONFLICT_STATE_VERSION` | Colisión de concurrencia optimista (`state_version` desactualizado) |
| `422` | `INVALID_SESSION_TRANSITION` | Intento de enviar o mutar una sesión ya evaluada o expirada |
| `429` | `RATE_LIMIT_EXCEEDED` | Cuota diaria de IA Mentor o límite de frecuencia excedido |

---

## 2. Endpoints de Infraestructura y Catálogo

### `GET /api/v1/health`
Verifica disponibilidad del BFF y conectividad con PostgreSQL sin exponer información sensible.

**Response `200 OK`**
```json
{
  "status": "ok",
  "service": "portal-job-bff",
  "engineVersion": "1.0.0",
  "database": "connected",
  "timestamp": "2026-11-26T04:50:00Z"
}
```

---

### `GET /api/v1/scenarios?vertical=logistics&difficulty=beginner`
Retorna los escenarios 3D publicados junto con el progreso resumido del candidato autenticado en cada uno.

**Response `200 OK`**
```json
{
  "items": [
    {
      "id": "scn_log_001",
      "slug": "picking-fifo-almacen-central",
      "title": "Picking FIFO y Control de Despacho Bajo SLA",
      "vertical": "logistics",
      "difficulty": "beginner",
      "targetSlaSeconds": 480,
      "baseXpReward": 250,
      "partnerOrg": {
        "name": "Operador Logístico Aliado",
        "verified": true
      },
      "userBestScore": 91.5
    }
  ]
}
```

---

## 3. Endpoints del Simulador 3D y Persistencia de Estado

### `POST /api/v1/simulations/sessions`
Inicia una nueva sesión para un escenario o devuelve la sesión `in_progress` / `paused` existente (gracias al índice único parcial `ux_active_session_per_user_scenario`).

**Request**
```json
{
  "scenarioId": "uuid",
  "resumeIfActive": true
}
```

**Response `201 Created` (nueva) / `200 OK` (reanudada)**
```json
{
  "session": {
    "id": "uuid",
    "scenarioId": "uuid",
    "status": "in_progress",
    "stateVersion": 1,
    "currentStep": 0,
    "stateSnapshot": {
      "schemaVersion": 1,
      "vertical": "logistics",
      "elapsedSeconds": 0,
      "completedCheckpoints": []
    },
    "startedAt": "2026-11-26T05:00:00Z"
  },
  "resumed": false
}
```

---

### `PATCH /api/v1/simulations/sessions/[id]/checkpoint`
Persiste el snapshot lógico del simulador 3D y un lote de eventos discretos de forma **idempotente** y con **concurrencia optimista**.

**Request**
```json
{
  "expectedVersion": 1,
  "currentStep": 2,
  "elapsedSeconds": 134,
  "status": "in_progress",
  "stateSnapshot": {
    "schemaVersion": 1,
    "vertical": "logistics",
    "elapsedSeconds": 134,
    "currentZone": "Aisle-B",
    "carriedItems": [{ "sku": "SKU-104", "batch": "LOT-01", "qty": 2 }],
    "completedCheckpoints": ["ppe_check_passed", "zone_a_picked"]
  },
  "events": [
    {
      "sequenceNum": 1,
      "idempotencyKey": "evt_01J_ppe",
      "eventType": "SAFETY_PPE_EQUIPPED",
      "payload": { "helmet": true, "vest": true },
      "occurredAt": "2026-11-26T05:00:18Z"
    },
    {
      "sequenceNum": 2,
      "idempotencyKey": "evt_01J_pick_1",
      "eventType": "ITEM_PICKED",
      "payload": { "sku": "SKU-104", "batch": "LOT-01", "expectedBatch": "LOT-01" },
      "occurredAt": "2026-11-26T05:02:14Z"
    }
  ]
}
```

**Response `200 OK`**
```json
{
  "sessionId": "uuid",
  "newStateVersion": 2,
  "acceptedEventsCount": 2,
  "lastCheckpointAt": "2026-11-26T05:02:15Z"
}
```

> **Comportamiento ante reintento:** Si el cliente reintenta con el mismo `idempotencyKey` tras un timeout de red, la DB ignora duplicados (`ON CONFLICT (session_id, idempotency_key) DO NOTHING`) evitando corrupción de métricas.

---

### `POST /api/v1/simulations/sessions/[id]/submit`
Cierra la sesión, carga la bitácora completa de `session_events` desde PostgreSQL, ejecuta el **motor determinista TypeScript** en el servidor, persiste `evaluation_results` y actualiza `candidate_skill_progress` y `profiles.total_xp` de forma atómica.

**Request**
```json
{
  "expectedVersion": 5,
  "finalStateSnapshot": {
    "schemaVersion": 1,
    "elapsedSeconds": 412
  }
}
```

**Response `200 OK`**
```json
{
  "evaluation": {
    "sessionId": "uuid",
    "engineVersion": "1.0.0",
    "inputHash": "sha256:9f84c2...",
    "finalScore": 92.5,
    "passed": true,
    "xpAwarded": 288,
    "kpiBreakdown": {
      "accuracyPct": 96.5,
      "slaCompliancePct": 91.0,
      "protocolAdherencePct": 100.0,
      "efficiencyMultiplier": 1.15
    },
    "ruleViolations": []
  },
  "aiFeedbackStatus": "ready_to_request"
}
```

---

### `POST /api/v1/simulations/sessions/[id]/ai-feedback`
Genera retroalimentación formativa y plan de micro-capacitación basado **exclusivamente** en los resultados ya calculados en `evaluation_results`.

**Protecciones Server-Side:**
* Verifica que `evaluation_results` ya exista (`status = 'evaluated'`).
* Revisa cuota diaria (`AI_DAILY_QUOTA_PER_USER`) antes de llamar al LLM.
* Si ya existe `ai_feedback` cacheado y `forceRegenerate` es `false`, retorna la respuesta almacenada sin consumir tokens.

**Response `200 OK`**
```json
{
  "sessionId": "uuid",
  "cached": false,
  "aiFeedback": {
    "summary": "Excelente cumplimiento de protocolo EPP y criterio FEFO.",
    "strengths": ["Cero errores de lote bajo presión de tiempo"],
    "improvementAreas": ["Reducir tiempo de desplazamiento entre zona B y muelle de salida"],
    "recommendedMicroTrainings": ["Optimización de Rutas de Picking en Almacén"]
  }
}
```

---

## 4. Endpoints de Progreso y Pipeline B2B

### `GET /api/v1/progress/me`
Devuelve el perfil consolidado de empleabilidad del candidato: XP acumulado, nivel actual, progreso por competencia, historial reciente de simulaciones y opt-ins activos.

### `GET /api/v1/partner/talent?scenarioId=uuid&minScore=80`
Endpoint B2B exclusivo para miembros verificados en `partner_memberships`.

**Reglas de Privacidad y Seguridad:**
1. Valida membresía activa del usuario autenticado en `partner_orgs`.
2. PostgreSQL RLS filtra automáticamente para retornar **únicamente** candidatos con `talent_opt_ins.consent_status = 'granted'` para esa organización (o reto específico) y puntaje `>= minScore`.
3. Nunca expone eventos internos privados no autorizados ni datos sensibles de otros candidatos.
