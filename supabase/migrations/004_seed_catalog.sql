-- =============================================================================
-- 004_seed_catalog.sql — Tracks & 3D Simulator Scenarios (Logistics & HR)
-- =============================================================================

insert into public.career_tracks (code, title, vertical, description, is_active)
values
  (
    'LOGISTICS_CORE',
    'Operaciones Logísticas y Almacén 3D',
    'logistics',
    'Entrenamiento práctico en picking FIFO/FEFO, seguridad EPP, control de inventario y despacho bajo SLA.',
    true
  ),
  (
    'HR_TALENT_CORE',
    'Gestión de Talento y Selección Objetiva',
    'hr',
    'Simulación de filtrado curricular sin sesgos, priorización de incidencias laborales y cumplimiento normativo.',
    true
  )
on conflict (code) do nothing;

insert into public.scenarios (
  track_id,
  partner_org_id,
  slug,
  title,
  description,
  difficulty,
  target_sla_seconds,
  base_xp_reward,
  passing_score,
  skill_code,
  rubric_config,
  is_published
)
select
  ct.id,
  null,
  'picking-fifo-almacen-central',
  'Picking FEFO y Despacho Seguro Bajo Presión de SLA',
  'Ejecuta una orden de despacho en almacén 3D verificando EPP, seleccionando lotes por vencimiento FEFO y cumpliendo el tiempo objetivo.',
  'beginner',
  480,
  250,
  70.00,
  'WAREHOUSE_FEFO_OPERATIONS',
  '{
    "vertical": "logistics",
    "weights": { "accuracy": 0.45, "sla": 0.30, "protocol": 0.25 },
    "requiredSafetyChecks": ["ppe_helmet", "ppe_vest"],
    "expectedItems": [
      { "sku": "SKU-104", "expectedBatch": "LOT-2026-01", "requiredQty": 2 },
      { "sku": "SKU-209", "expectedBatch": "LOT-2026-02", "requiredQty": 1 }
    ],
    "penalties": {
      "missingPpe": 25,
      "wrongBatchRotation": 15
    },
    "minPlausibleSeconds": 20
  }'::jsonb,
  true
from public.career_tracks ct
where ct.code = 'LOGISTICS_CORE'
on conflict (slug) do nothing;

insert into public.scenarios (
  track_id,
  partner_org_id,
  slug,
  title,
  description,
  difficulty,
  target_sla_seconds,
  base_xp_reward,
  passing_score,
  skill_code,
  rubric_config,
  is_published
)
select
  ct.id,
  null,
  'hr-screening-compliance-operativo',
  'Pre-selección Ética y Resolución de Incidencias RRHH',
  'Evalúa perfiles operativos en entorno simulado siguiendo criterios técnicos objetivos, descartando sesgos y escalando alertas críticas.',
  'intermediate',
  600,
  300,
  75.00,
  'ETHICAL_TALENT_SCREENING',
  '{
    "vertical": "hr",
    "weights": { "accuracy": 0.45, "sla": 0.25, "protocol": 0.30 },
    "expectedDecisions": [
      { "caseId": "CASE-01", "expectedAction": "SHORTLIST" },
      { "caseId": "CASE-02", "expectedAction": "ESCALATE_COMPLIANCE" },
      { "caseId": "CASE-03", "expectedAction": "REJECT_TECHNICAL_GAP" }
    ],
    "penalties": {
      "biasCriterionUsed": 30,
      "missedComplianceEscalation": 20
    },
    "minPlausibleSeconds": 30
  }'::jsonb,
  true
from public.career_tracks ct
where ct.code = 'HR_TALENT_CORE'
on conflict (slug) do nothing;
