# Flujos de Usuario, Estado y Datos — Portal Job

Este documento detalla los flujos operativos end-to-end que garantizan la coherencia entre la experiencia gamificada 3D, la persistencia en backend y el valor B2B para empresas aliadas.

---

## 1. Máquina de Estados de una Sesión de Simulación

```mermaid
stateDiagram-v2
    [*] --> in_progress : "POST /sessions (Nueva misión)"
    in_progress --> in_progress : "PATCH /checkpoint (Auto-guardado periódico)"
    in_progress --> paused : "Usuario sale o pausa"
    paused --> in_progress : "POST /sessions (Reanuda desde state_snapshot)"
    in_progress --> expired : "Timeout de inactividad (> TTL)"
    paused --> abandoned : "Usuario descarta intento"
    in_progress --> submitted : "POST /submit (Cierre solicitado)"
    submitted --> evaluated : "Motor TS calcula KPIs + XP + RLS commit"
    evaluated --> [*] : "Inmutable (solo admite ai_feedback)"
```

### Invariantes de Transición
* Una sesión en estado `evaluated`, `abandoned` o `expired` **no puede volver** a `in_progress`.
* El índice único parcial `ux_active_session_per_user_scenario` garantiza que un candidato solo tenga **una** sesión en estado `in_progress` o `paused` por escenario al mismo tiempo.

---

## 2. Flujo de Ejecución, Checkpoints y Evaluación (Candidato B2C)

```mermaid
sequenceDiagram
    autonumber
    actor U as "Candidato Joven"
    participant SIM as "Simulador 3D (Browser)"
    participant BFF as "Next.js 16 BFF (/api/v1)"
    participant ENG as "Motor TS Determinista"
    participant DB as "PostgreSQL + RLS"
    participant AI as "AI Mentor (LLM)"

    U->>SIM: "Inicia misión Logística FIFO"
    SIM->>BFF: "POST /simulations/sessions"
    BFF->>DB: "Busca sesión activa o crea nueva (RLS)"
    DB-->>BFF: "Sesión + state_snapshot + state_version=1"
    BFF-->>SIM: "Estado inicial / reanudado"

    loop "Durante la simulación 3D (cada checkpoint o acción clave)"
        U->>SIM: "Equipa EPP, recoge SKU y valida lote"
        SIM->>BFF: "PATCH /sessions/{id}/checkpoint (expectedVersion, events[])"
        BFF->>DB: "Valida state_version e inserta eventos idempotentes"
        DB-->>BFF: "newStateVersion = N+1"
        BFF-->>SIM: "200 OK (checkpoint confirmado)"
    end

    U->>SIM: "Finaliza misión"
    SIM->>BFF: "POST /sessions/{id}/submit"
    BFF->>DB: "Lee sesión + todos los session_events ordenados"
    BFF->>ENG: "evaluateSimulation(rubric, events)"
    ENG-->>BFF: "Score, KPIs, ruleViolations, XP, inputHash"
    BFF->>DB: "Transacción: actualiza estado='evaluated', inserta evaluation_results, suma XP"
    DB-->>BFF: "Commit confirmado"
    BFF-->>SIM: "Resultados verificados"

    SIM->>BFF: "POST /sessions/{id}/ai-feedback"
    BFF->>DB: "Verifica cuota diaria + lee evaluation_results"
    BFF->>AI: "Solicita feedback pedagógico sobre KPIs reales"
    AI-->>BFF: "Plan de mejora + micro-capacitaciones"
    BFF->>DB: "Guarda ai_feedback en evaluation_results"
    BFF-->>SIM: "Feedback estructurado"
```

---

## 3. Flujo de Visibilidad y Matching B2B (Empresa Aliada)

```mermaid
sequenceDiagram
    autonumber
    actor C as "Candidato"
    actor R as "Reclutador Empresa Aliada"
    participant BFF as "Next.js 16 BFF"
    participant DB as "PostgreSQL + RLS"

    Note over C,DB: "Privacidad por defecto: el reclutador NO ve al candidato sin consentimiento"
    C->>BFF: "Completa reto de Empresa Aliada con score >= 85"
    C->>BFF: "Activa Opt-In para compartir dossier con Empresa X"
    BFF->>DB: "INSERT INTO talent_opt_ins (consent_status = 'granted')"

    R->>BFF: "GET /api/v1/partner/talent?scenarioId=...&minScore=80"
    BFF->>DB: "Ejecuta consulta bajo JWT del reclutador"
    Note over DB: "RLS verifica partner_memberships + talent_opt_ins = 'granted'"
    DB-->>BFF: "Lista filtrada de dossiers verificados (KPIs, XP, badges)"
    BFF-->>R: "Talento pre-evaluado listo para entrevista"
```

---

## 4. Flujo de Recuperación ante Caída de Red

1. **Pérdida momentánea de conexión:** El `Sync Manager` del cliente retiene los eventos locales con su `sequenceNum` e `idempotencyKey` determinístico (UUID v4 generado al ocurrir la acción).
2. **Reconexión o recarga de pestaña:** Al volver, `POST /simulations/sessions` detecta la sesión `in_progress` existente y devuelve `state_snapshot` + último `state_version`.
3. **Envío seguro de pendientes:** Si el cliente reenvía un lote cuyo checkpoint anterior ya había impactado la base de datos pero cuya respuesta HTTP se perdió, `ON CONFLICT (session_id, idempotency_key) DO NOTHING` evita duplicar eventos y el backend responde con el estado sincronizado.
