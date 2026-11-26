# Flujos de Usuario, Certificación y Cartera de Talento — PortalJob

Este documento detalla los flujos operativos end-to-end de **PortalJob** (incluyendo **HaSociaJob**, certificación verificable e intermediación laboral regional).

---

## 1. Máquina de Estados de una Sesión de Simulación

```mermaid
stateDiagram-v2
    [*] --> in_progress : "POST /sessions (Nueva misión)"
    in_progress --> in_progress : "PATCH /checkpoint (Auto-guardado)"
    in_progress --> paused : "Usuario pausa o cierra sesión"
    paused --> in_progress : "POST /sessions (Reanuda desde state_snapshot)"
    in_progress --> expired : "Timeout de inactividad"
    paused --> abandoned : "Usuario descarta intento"
    in_progress --> submitted : "POST /submit (Cierre de misión)"
    submitted --> evaluated : "Motor TS calcula KPIs + XP + Certificado"
    evaluated --> [*] : "Registro inmutable (solo admite ai_feedback)"
```

---

## 2. Flujo Integral: Simulación → Motor TS → Certificado → Mentor IA

```mermaid
sequenceDiagram
    autonumber
    actor U as "Joven (Lima / Piura / Lambayeque / Arequipa)"
    participant SIM as "Simulador (Admin/Log/Ventas/HaSociaJob)"
    participant BFF as "Next.js 16 BFF (/api/v1)"
    participant ENG as "Motor TS Determinista"
    participant DB as "PostgreSQL + RLS"
    participant AI as "IA Retroalimentación"

    U->>SIM: "Inicia módulo HaSociaJob o Simulador Técnico"
    SIM->>BFF: "POST /simulations/sessions"
    BFF->>DB: "Crea o reanuda sesión (RLS + state_snapshot)"
    DB-->>BFF: "Sesión + state_version"
    BFF-->>SIM: "Estado sincronizado"

    loop "Interacción en el simulador"
        U->>SIM: "Completa tareas / decisiones situacionales"
        SIM->>BFF: "PATCH /sessions/{id}/checkpoint (expectedVersion, events[])"
        BFF->>DB: "Valida state_version e inserta session_events idempotentes"
        DB-->>BFF: "newStateVersion"
    end

    U->>SIM: "Envía misión"
    SIM->>BFF: "POST /sessions/{id}/submit"
    BFF->>DB: "Lee sesión + session_events ordenados"
    BFF->>ENG: "evaluateSimulation(rubric, events, elapsedSeconds)"
    ENG-->>BFF: "Score, KPIs, ruleViolations, XP, inputHash"
    BFF->>DB: "RPC commit_deterministic_evaluation -> marca evaluated, suma XP y emite certificate si aprueba"
    DB-->>BFF: "Evaluación + verificationCode"
    BFF-->>SIM: "Resultado verificado + Certificado"

    SIM->>BFF: "POST /sessions/{id}/ai-feedback"
    BFF->>DB: "Verifica cuota diaria + lee métricas verificadas"
    BFF->>AI: "Solicita fortalezas, brechas y acciones de mejora"
    AI-->>BFF: "Feedback personalizado"
    BFF->>DB: "Guarda ai_feedback"
    BFF-->>SIM: "Muestra mentoría IA"
```

---

## 3. Flujo de Intermediación Laboral y Verificación de Certificados (B2B)

```mermaid
sequenceDiagram
    autonumber
    actor C as "Joven Certificado"
    actor R as "Empresa Aliada (ej. BCP / ManPower / Telefónica)"
    participant BFF as "Next.js 16 BFF"
    participant DB as "PostgreSQL + RLS"

    C->>BFF: "Activa Opt-In en Cartera de Talento para Empresa Aliada"
    BFF->>DB: "INSERT INTO talent_opt_ins (consent_status = 'granted')"

    R->>BFF: "GET /api/v1/partner/talent?vertical=logistics&region=Lima&minScore=80"
    BFF->>DB: "Consulta protegida por RLS (partner_memberships + talent_opt_ins)"
    DB-->>BFF: "Lista de candidatos pre-evaluados con KPIs y certificaciones"
    BFF-->>R: "Cartera de talento filtrada"

    R->>BFF: "GET /api/v1/certificates/verify/PJ-2026-A94F21C0"
    BFF->>DB: "CALL verify_certificate('PJ-2026-A94F21C0')"
    DB-->>BFF: "Confirmación criptográfica/verificable del certificado"
    BFF-->>R: "Certificado válido con vertical, puntaje y fecha"
```
