# Arquitectura del Sistema — PortalJob

Este documento describe la arquitectura técnica diseñada para **PortalJob** (incluyendo el simulador de habilidades blandas **HaSociaJob**) bajo el estándar **C4**, asegurando escalabilidad progresiva desde Lima hacia Arequipa, Piura y cobertura nacional en 18 meses, con altos estándares de ciberseguridad y protección de datos.

---

## 1. Vista de Contexto (C4 Nivel 1)

PortalJob opera como un ecosistema **B2B2C** con cuatro pilares integrados: simulación técnica sectorial (**Administración, Logística, Ventas**), entrenamiento de habilidades blandas (**HaSociaJob**), **certificación laboral verificable** e **intermediación laboral**.

```mermaid
flowchart TB
    CAND["👤 Talento Joven (B2C)<br/>Lima, Arequipa, Piura y Nacional"]
    PARTNER["🏢 Empresa Aliada (B2B)<br/>Cartera de Talento y Retos"]
    VERIFIER["🏛️ Validador / Co-Certificador<br/>(Empleador o Entidad Aliada)"]

    subgraph PJ["PortalJob Platform (Architecture Blueprint)"]
        APP["Next.js 16 Web App & BFF<br/>Simuladores 3D + HaSociaJob + Dashboard"]
        ENG["Motor Determinista TypeScript<br/>Scoring, KPIs, SLA y Certificación"]
    end

    SUPA[("Supabase Cloud<br/>GoTrue Auth + PostgreSQL + RLS")]
    LLM["Servicio LLM Externo<br/>Retroalimentación Personalizada"]

    CAND -->|"HTTPS (Entrenamiento, Progreso, Opt-in)"| APP
    PARTNER -->|"HTTPS (Retos, Cartera por Región/Competencia)"| APP
    VERIFIER -->|"HTTPS (Consulta por Código de Certificado)"| APP
    APP -->|"Ejecución Server-Side pura"| ENG
    APP -->|"JWT + RLS / Service Role controlado"| SUPA
    APP -->|"HTTPS Server-Side (Solo brechas y métricas)"| LLM
```

### Fronteras de Responsabilidad
1. **Cliente (Navegador):** Ejecuta la interfaz interactiva de los módulos de **Administración, Logística, Ventas** y **HaSociaJob**, sincronizando checkpoints y telemetría discreta mediante llaves de idempotencia. No tiene autoridad para calcular ni modificar notas.
2. **Next.js 16 App Router (BFF):** Centraliza autenticación JWT, validación Zod, ejecución determinista del scoring, emisión de certificados verificables y cuotas del servicio IA.
3. **Supabase (PostgreSQL + RLS):** Fuente única de verdad con aislamiento multi-tenant por fila, trazabilidad de evaluaciones y resguardo de consentimientos explícitos.

---

## 2. Vista de Contenedores (C4 Nivel 2)

```mermaid
flowchart TB
    subgraph Browser["Navegador del Usuario"]
        UI["Next.js 16 Client UI<br/>Catálogo, Progreso, Certificados, B2B"]
        SIM_TECH["Simuladores 3D Sectoriales<br/>(Admin, Logística, Ventas)"]
        SIM_SOFT["Simulador HaSociaJob<br/>(Comunicación, Liderazgo, Adaptabilidad)"]
        BUF["Sync Manager<br/>Queue + Idempotency Keys"]
        UI --> BUF
        SIM_TECH --> BUF
        SIM_SOFT --> BUF
    end

    subgraph NextBFF["Next.js 16 App Router (Stateless Server)"]
        MW["Auth & Tenant Context Gate"]
        H_SESS["Route Handler:<br/>/api/v1/simulations/sessions/*"]
        H_CERT["Route Handler:<br/>/api/v1/certificates/*"]
        H_PROG["Route Handler:<br/>/api/v1/progress/me"]
        H_B2B["Route Handler:<br/>/api/v1/partner/talent"]
        H_AI["Route Handler:<br/>/ai-feedback (Rate Limited)"]
        ENGINE["packages/simulation-engine<br/>Pure TypeScript Core"]

        MW --> H_SESS
        MW --> H_CERT
        MW --> H_PROG
        MW --> H_B2B
        MW --> H_AI
        H_SESS --> ENGINE
    end

    subgraph Supabase["Supabase Infrastructure"]
        AUTH["GoTrue Auth (JWT Claims)"]
        PG[("PostgreSQL 15+<br/>RLS + Triggers + Ledger Certificados")]
    end

    EXT_AI["External LLM API"]

    BUF -->|"PATCH checkpoint / POST submit"| MW
    UI -->|"GET escenarios / progreso / verify"| MW
    H_SESS --> PG
    H_CERT --> PG
    H_PROG --> PG
    H_B2B --> PG
    H_AI --> PG
    H_AI -->|"Solo server-side"| EXT_AI
    UI -->|"Sign In / Refresh"| AUTH
    AUTH --> PG
```

---

## 3. Capas Lógicas del Backend

```text
app/api/v1/**  (Transporte HTTP + Zod Validation + Auth/Role Gate + Rate Limiting)
      │
      ▼
lib/services/** (Orquestación: Sesiones, Certificación, Feedback IA, Cartera B2B)
      │
      ├─────────────────────────────────────────┐
      ▼                                         ▼
packages/simulation-engine/**            lib/repositories/**
(Reglas puras TS: Admin/Log/Ventas/      (Queries tipadas + RPC transaccional
 HaSociaJob — 0 I/O, 0 Red, 0 LLM)       en Supabase/PostgreSQL)
```

---

## 4. Ciberseguridad, Protección de Datos y Escalabilidad Nacional

| Requisito de PortalJob | Solución Arquitectónica Diseñada |
| :--- | :--- |
| **Protección de datos juveniles (Ley N.º 29733 — Perú)** | Principio de mínimo privilegio en RLS (`002_rls_policies.sql`), consentimiento explícito y revocable (`talent_opt_ins`) antes de exponer perfil a empresas en la cartera de talento. |
| **Integridad de certificaciones laborales** | Cada certificado se vincula a una evaluación inmutable (`evaluation_id`), incluye `verification_code` único e `input_hash` reproducible; verificación pública vía RPC controlada sin listar usuarios. |
| **Cobertura Lima → Arequipa → Piura → Nacional (18 meses)** | BFF *stateless* escalable horizontalmente, campo `region` indexado en `profiles` y `partner_orgs` para segmentar demanda laboral local y minimizar consultas costosas. |
| **Resiliencia ante conectividad móvil limitada** | Persistencia incremental en `state_snapshot` (`state_version` optimista) y eventos idempotentes que evitan pérdida de progreso en zonas fuera de Lima metropolitana. |
| **Control de presupuesto tecnológico (Infraestructura USD 13k–16.5k)** | Scoring determinista ejecutado en `< 5 ms` sin llamadas a GPUs/LLMs externas; la IA solo redacta feedback post-evaluación bajo cuota diaria cacheable. |
