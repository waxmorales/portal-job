# Arquitectura de Base de Datos y Seguridad RLS — Portal Job

Este documento especifica el modelo de datos en **PostgreSQL (Supabase)** diseñado para **Portal Job**, cubriendo el diagrama entidad-relación, contratos de tablas, estrategia de indexación, triggers de consistencia y matriz completa de políticas **Row Level Security (RLS)**.

> El DDL completo y las políticas SQL se encuentran en [`supabase/migrations/`](../supabase/migrations/001_init_schema.sql).

---

## 1. Diagrama Entidad–Relación (ERD)

```mermaid
erDiagram
    PROFILES {
        uuid id PK
        text role
        text full_name
        text email
        integer total_xp
        integer current_level
        boolean is_open_to_work
        timestamptz created_at
    }

    PARTNER_ORGS {
        uuid id PK
        text name
        text slug
        text industry
        boolean verified
        timestamptz created_at
    }

    PARTNER_MEMBERSHIPS {
        uuid id PK
        uuid org_id FK
        uuid user_id FK
        text member_role
        timestamptz created_at
    }

    CAREER_TRACKS {
        uuid id PK
        text code
        text title
        text vertical
        boolean is_active
    }

    SCENARIOS {
        uuid id PK
        uuid track_id FK
        uuid partner_org_id FK
        text slug
        text title
        text difficulty
        integer target_sla_seconds
        integer base_xp_reward
        jsonb rubric_config
        boolean is_published
    }

    SIMULATION_SESSIONS {
        uuid id PK
        uuid user_id FK
        uuid scenario_id FK
        text status
        integer state_version
        integer current_step
        jsonb state_snapshot
        timestamptz started_at
        timestamptz last_checkpoint_at
        timestamptz submitted_at
    }

    SESSION_EVENTS {
        uuid id PK
        uuid session_id FK
        integer sequence_num
        text idempotency_key
        text event_type
        jsonb payload
        timestamptz occurred_at
    }

    EVALUATION_RESULTS {
        uuid id PK
        uuid session_id FK
        uuid user_id FK
        text engine_version
        text input_hash
        numeric final_score
        boolean passed
        integer xp_awarded
        jsonb kpi_breakdown
        jsonb rule_violations
        jsonb ai_feedback
        timestamptz evaluated_at
    }

    CANDIDATE_SKILL_PROGRESS {
        uuid id PK
        uuid user_id FK
        text skill_code
        integer xp_points
        integer completed_scenarios
        numeric best_score
        timestamptz updated_at
    }

    TALENT_OPT_INS {
        uuid id PK
        uuid user_id FK
        uuid partner_org_id FK
        uuid scenario_id FK
        text consent_status
        timestamptz consented_at
    }

    PROFILES ||--o{ PARTNER_MEMBERSHIPS : "pertenece"
    PARTNER_ORGS ||--o{ PARTNER_MEMBERSHIPS : "agrupa"
    PARTNER_ORGS ||--o{ SCENARIOS : "patrocina (opcional)"
    CAREER_TRACKS ||--o{ SCENARIOS : "contiene"
    PROFILES ||--o{ SIMULATION_SESSIONS : "ejecuta"
    SCENARIOS ||--o{ SIMULATION_SESSIONS : "instancia"
    SIMULATION_SESSIONS ||--o{ SESSION_EVENTS : "registra"
    SIMULATION_SESSIONS ||--o| EVALUATION_RESULTS : "produce"
    PROFILES ||--o{ EVALUATION_RESULTS : "posee"
    PROFILES ||--o{ CANDIDATE_SKILL_PROGRESS : "acumula"
    PROFILES ||--o{ TALENT_OPT_INS : "autoriza"
    PARTNER_ORGS ||--o{ TALENT_OPT_INS : "consulta"
    SCENARIOS ||--o{ TALENT_OPT_INS : "califica_en"
```

---

## 2. Dominios del Modelo de Datos

### A. Identidad y Multi-Tenancy (`profiles`, `partner_orgs`, `partner_memberships`)
* **`profiles`:** Extiende `auth.users` con `role` (`candidate`, `partner_recruiter`, `platform_admin`), XP acumulado y bandera `is_open_to_work`.
* **`partner_orgs` & `partner_memberships`:** Permiten que múltiples reclutadores pertenezcan a una misma empresa aliada sin mezclar permisos entre empresas competidoras.

### B. Catálogo Formativo y Retos 3D (`career_tracks`, `scenarios`)
* **`career_tracks`:** Verticales laborales (ej. `LOGISTICS`, `HR`, `OPERATIONS`).
* **`scenarios`:** Define cada misión 3D gamificada, incluyendo `partner_org_id` nullable (escenarios base de Portal Job vs. retos patrocinados por una empresa aliada), `target_sla_seconds` y `rubric_config` (`jsonb`) consumido por el motor TypeScript.

### C. Persistencia de Estado y Telemetría (`simulation_sessions`, `session_events`)
* **`simulation_sessions`:**
  * Mantiene la máquina de estados: `in_progress`, `paused`, `submitted`, `evaluated`, `abandoned`, `expired`.
  * **`state_version` (`integer`):** Impide sobrescritura silenciosa cuando llegan dos peticiones concurrentes (control de concurrencia optimista).
  * **`state_snapshot` (`jsonb`):** Almacena la posición lógica de la misión 3D (inventario en carrito, orden de despacho, candidatos revisados, paso actual) para reanudación exacta.
* **`session_events`:**
  * Tabla *append-only* con `UNIQUE (session_id, idempotency_key)` y `UNIQUE (session_id, sequence_num)`.
  * Permite reconstruir la línea temporal exacta de decisiones y detectar anomalías (ej. completar una misión compleja en 3 segundos).

### D. Evaluación Verificada y Pipeline B2B (`evaluation_results`, `candidate_skill_progress`, `talent_opt_ins`)
* **`evaluation_results`:** Guarda el dictamen inmutable del motor determinista (`engine_version`, `input_hash`, `final_score`, `xp_awarded`, `kpi_breakdown`, `rule_violations`) separado del campo `ai_feedback` (`jsonb` nullable).
* **`candidate_skill_progress`:** Tabla de lectura rápida agregada por `(user_id, skill_code)` mantenida transaccionalmente tras cada evaluación aprobada.
* **`talent_opt_ins`:** Registra el consentimiento explícito del candidato para compartir su perfil y métricas de desempeño con una `partner_org` específica.

---

## 3. Estructura de Campos JSONB Clave

### `simulation_sessions.state_snapshot` (Ejemplo Logística)
```json
{
  "schemaVersion": 1,
  "vertical": "logistics",
  "elapsedSeconds": 245,
  "currentZone": "Aisle-B",
  "carriedItems": [
    { "sku": "SKU-104", "batch": "LOT-2026-01", "qty": 2 }
  ],
  "completedCheckpoints": ["ppe_check_passed", "zone_a_picked"],
  "safetyFlags": []
}
```

### `evaluation_results.kpi_breakdown`
```json
{
  "accuracyPct": 96.5,
  "slaCompliancePct": 91.0,
  "protocolAdherencePct": 100.0,
  "efficiencyMultiplier": 1.15,
  "rawDurationSeconds": 412,
  "targetSlaSeconds": 480
}
```

---

## 4. Estrategia de Índices para Escalabilidad

| Índice | Tabla | Propósito |
| :--- | :--- | :--- |
| `ux_active_session_per_user_scenario` | `simulation_sessions` | **Índice único parcial** (`WHERE status IN ('in_progress', 'paused')`): garantiza a nivel de DB que un usuario no abra sesiones duplicadas simultáneas en la misma misión. |
| `ix_sessions_user_recent` | `simulation_sessions` | Acelera el historial del candidato ordenado por fecha (`user_id, started_at DESC`). |
| `ux_session_event_idempotency` | `session_events` | Garantiza idempotencia exacta en reintentos de red (`session_id, idempotency_key`). |
| `ix_eval_user_score` | `evaluation_results` | Acelera consultas de ranking personal y métricas por escenario (`user_id, evaluated_at DESC`). |
| `ix_optins_partner_status` | `talent_opt_ins` | Optimiza el endpoint B2B `/api/v1/partner/talent` filtrando por empresa y estado `granted`. |

---

## 5. Matriz de Seguridad Row Level Security (RLS)

Por defecto, todas las tablas tienen `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. Sin política explícita, PostgreSQL deniega todo acceso (`deny-by-default`).

| Tabla | `SELECT` | `INSERT` | `UPDATE` | `DELETE` |
| :--- | :--- | :--- | :--- | :--- |
| `profiles` | Propio usuario (`auth.uid() = id`) o Partner si existe `talent_opt_ins` con `consent_status = 'granted'` | Solo trigger `on_auth_user_created` | Propio usuario (sin escalar `role`, `total_xp` ni `current_level`) | Denegado |
| `partner_orgs` | Miembros de la org o catálogo verificado | Solo `service_role` / Admin | Admins de la org | Denegado |
| `career_tracks` / `scenarios` | Usuarios autenticados si `is_published = true` (o miembros del partner dueño) | Miembros `admin` del partner o `service_role` | Miembros `admin` del partner o `service_role` | Denegado |
| `simulation_sessions` | Propio usuario (`auth.uid() = user_id`) | Propio usuario con `status = 'in_progress'` | Propio usuario solo en `state_snapshot`/`status` no evaluado; transición a `evaluated` reservada a `service_role` | Denegado (auditoría) |
| `session_events` | Propio usuario (vía `session_id`) | Propio usuario mientras la sesión esté activa (`in_progress`/`paused`) | Denegado (inmutable / *append-only*) | Denegado |
| `evaluation_results` | Propio usuario o Partner con opt-in vigente | **Solo `service_role` (motor servidor)** | **Solo `service_role` (solo columna `ai_feedback`)** | Denegado |
| `candidate_skill_progress` | Propio usuario o Partner con opt-in vigente | **Solo `service_role` / Trigger** | **Solo `service_role` / Trigger** | Denegado |
| `talent_opt_ins` | Propio candidato o miembros de `partner_org_id` | Propio candidato (`auth.uid() = user_id`) | Propio candidato (revocar o reactivar consentimiento) | Propio candidato |
