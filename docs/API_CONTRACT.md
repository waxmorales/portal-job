# Contratos de API (Next.js 16 App Router BFF) — PortalJob

Todas las rutas se exponen bajo `/api/v1/*` como **Route Handlers** en Next.js 16 (App Router) con validación Zod en el borde, derivación de identidad desde JWT de Supabase Auth y separación entre cálculo determinista e interpretación IA.

---

## 1. Convenciones Generales y Códigos de Error

* **Autenticación:** `Authorization: Bearer <supabase_access_token>` o cookie `@supabase/ssr`.
* **Formato estándar de error:**

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

| HTTP | `error.code` | Significado |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Payload inválido según esquema Zod |
| `401` | `UNAUTHORIZED` | Token ausente, expirado o inválido |
| `403` | `FORBIDDEN_TENANT_ACCESS` | Violación de aislamiento multi-tenant o rol insuficiente |
| `404` | `RESOURCE_NOT_FOUND` | Recurso inexistente o bloqueado por RLS |
| `409` | `CONFLICT_STATE_VERSION` | Colisión de concurrencia optimista (`state_version`) |
| `422` | `INVALID_SESSION_TRANSITION` | Transición de estado inválida o intento en sesión terminal |
| `429` | `RATE_LIMIT_EXCEEDED` | Cuota diaria de IA Mentor excedida |

---

## 2. Infraestructura y Catálogo

### `GET /api/v1/health`
Comprueba disponibilidad del BFF, conexión a PostgreSQL y versión activa del motor determinista.

### `GET /api/v1/scenarios?vertical=hasociajob&difficulty=beginner`
Lista los escenarios publicados para las cuatro verticales reales:
`administration` | `logistics` | `sales` | `hasociajob`.

---

## 3. Simulador Interactivo y Persistencia de Estado

### `POST /api/v1/simulations/sessions`
Crea una nueva sesión en `in_progress` o reanuda la sesión activa/pausada existente (respaldado por `ux_active_session_per_user_scenario`).

### `PATCH /api/v1/simulations/sessions/[id]/checkpoint`
Guarda el snapshot de progreso y un lote de eventos discretos (`idempotencyKey`, `sequenceNum`, `eventType`, `payload`) validando `expectedVersion` optimista.

### `POST /api/v1/simulations/sessions/[id]/submit`
Cierra la sesión, carga todos los `session_events` desde PostgreSQL, ejecuta el **motor determinista en TypeScript puro** en servidor y llama transaccionalmente a `commit_deterministic_evaluation(...)`.
Si `passed == true`, el servidor emite automáticamente el registro en `certificates` con su `verification_code` único.

**Response `200 OK`**
```json
{
  "evaluation": {
    "sessionId": "uuid",
    "engineVersion": "1.1.0",
    "inputHash": "fnv1a64:8b12c...",
    "finalScore": 91.5,
    "passed": true,
    "xpAwarded": 282,
    "kpiBreakdown": {
      "accuracyPct": 95.0,
      "slaCompliancePct": 100.0,
      "protocolAdherencePct": 100.0,
      "efficiencyMultiplier": 1.15
    },
    "ruleViolations": []
  },
  "certificate": {
    "issued": true,
    "verificationCode": "PJ-2026-A94F21C0",
    "credentialTitle": "Certificado Práctico: Picking FEFO y Despacho Seguro"
  },
  "aiFeedbackStatus": "ready_to_request"
}
```

---

## 4. Retroalimentación Personalizada con IA

### `POST /api/v1/simulations/sessions/[id]/ai-feedback`
Genera retroalimentación personalizada (fortalezas, áreas de mejora y acciones recomendadas) consumiendo **exclusivamente** el registro inmutable de `evaluation_results`. Incluye caché en base de datos y cuota diaria (`AI_DAILY_QUOTA_PER_USER`).

---

## 5. Progreso, Certificación Verificable e Intermediación Laboral B2B

### `GET /api/v1/progress/me`
Retorna XP total, nivel, competencias acumuladas (`candidate_skill_progress`), historial de simulaciones y certificados emitidos.

### `GET /api/v1/certificates/verify/[code]`
Permite a empleadores y entidades verificar la autenticidad de una certificación laboral usando el `verification_code` (invoca `verify_certificate(code)` en PostgreSQL sin exponer datos masivos).

**Response `200 OK`**
```json
{
  "valid": true,
  "verificationCode": "PJ-2026-A94F21C0",
  "credentialTitle": "Certificado Práctico: Picking FEFO y Despacho Seguro",
  "candidateName": "Juan Pérez",
  "vertical": "logistics",
  "finalScore": 91.5,
  "issuedAt": "2026-11-26T05:10:00Z",
  "coEndorser": null
}
```

### `GET /api/v1/partner/talent?vertical=logistics&region=Piura&minScore=80`
Endpoint B2B de **Intermediación Laboral (Cartera de Talento Capacitado)** exclusivo para miembros activos en `partner_memberships`, permitiendo además supervisar el progreso en tiempo real de candidatos con consentimiento vigente.

**Filtros soportados:**
* `vertical`: `administration` | `logistics` | `sales` | `hasociajob`
* `region`: `Lima` | `Piura` | `Lambayeque` | `Arequipa` (soporta despliegue gradual y cobertura nacional en 18 meses)
* `minScore`: umbral mínimo verificado en `evaluation_results`

**Garantía RLS:** Solo retorna candidatos con `talent_opt_ins.consent_status = 'granted'` para la organización solicitante y `profiles.is_open_to_work = true`.
