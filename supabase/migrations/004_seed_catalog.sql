-- =============================================================================
-- 004_seed_catalog.sql — Tracks & Scenarios for PortalJob & HaSociaJob
-- Covers Administration, Logistics, Sales & HaSociaJob Soft Skills.
-- =============================================================================

insert into public.career_tracks (code, title, vertical, description, is_active)
values
  (
    'LOGISTICS_CORE',
    'Logística, Almacén y Seguridad y Salud en el Trabajo (SST)',
    'logistics',
    'Simulación práctica basada en tareas reales de practicantes: picking FEFO, control de inventario y protocolos SST/EPP bajo SLA.',
    true
  ),
  (
    'ADMIN_CORE',
    'Administración, Redacción Documental y Gestión de Datos',
    'administration',
    'Redacción de documentos, gestión de reportes operativos, conciliación de datos, habilidades digitales y resguardo de confidencialidad.',
    true
  ),
  (
    'SALES_CORE',
    'Ventas, Atención al Cliente y Ética Comercial',
    'sales',
    'Diagnóstico de necesidades, manejo de objeciones comerciales y cierre efectivo sin promesas engañosas.',
    true
  ),
  (
    'HASOCIAJOB_SOFT',
    'Ha.Socia.Job — Habilidades Blandas, Liderazgo y Pensamiento Crítico',
    'hasociajob',
    'Simulador situacional para fortalecer comunicación efectiva, liderazgo, trabajo colaborativo, pensamiento crítico y adaptabilidad.',
    true
  )
on conflict (code) do nothing;

-- 1. Logística
insert into public.scenarios (
  track_id, partner_org_id, slug, title, description, difficulty,
  target_sla_seconds, base_xp_reward, passing_score, skill_code, rubric_config, is_published
)
select
  ct.id, null,
  'picking-fefo-seguridad-almacen',
  'Picking FEFO y Protocolos de Seguridad Laboral',
  'Prepara un despacho en almacén 3D verificando EPP obligatorio, rotación FEFO por lote y cumplimiento de SLA.',
  'beginner', 480, 250, 70.00, 'WAREHOUSE_FEFO_SAFETY',
  '{
    "vertical": "logistics",
    "weights": { "accuracy": 0.45, "sla": 0.30, "protocol": 0.25 },
    "requiredSafetyChecks": ["ppe_helmet", "ppe_vest"],
    "expectedItems": [
      { "sku": "SKU-104", "expectedBatch": "LOT-2026-01", "requiredQty": 2 },
      { "sku": "SKU-209", "expectedBatch": "LOT-2026-02", "requiredQty": 1 }
    ],
    "penalties": { "missingPpe": 25, "wrongBatchRotation": 15 },
    "minPlausibleSeconds": 20
  }'::jsonb,
  true
from public.career_tracks ct where ct.code = 'LOGISTICS_CORE'
on conflict (slug) do nothing;

-- 2. Administración
insert into public.scenarios (
  track_id, partner_org_id, slug, title, description, difficulty,
  target_sla_seconds, base_xp_reward, passing_score, skill_code, rubric_config, is_published
)
select
  ct.id, null,
  'admin-gestion-reportes-digitales',
  'Gestión de Reportes Operativos y Habilidades Digitales',
  'Audita registros administrativos, concilia discrepancias en reportes y aplica buenas prácticas de seguridad documental.',
  'beginner', 540, 260, 75.00, 'ADMIN_REPORTING_DIGITAL',
  '{
    "vertical": "administration",
    "weights": { "accuracy": 0.50, "sla": 0.25, "protocol": 0.25 },
    "expectedChecks": [
      { "recordId": "INV-101", "expectedStatus": "RECONCILED" },
      { "recordId": "INV-102", "expectedStatus": "FLAG_DISCREPANCY" },
      { "recordId": "INV-103", "expectedStatus": "RECONCILED" }
    ],
    "requiredDigitalActions": ["export_pivot_summary", "mask_pii_fields"],
    "penalties": { "unverifiedReportSubmitted": 20, "dataExposureRisk": 30 },
    "minPlausibleSeconds": 25
  }'::jsonb,
  true
from public.career_tracks ct where ct.code = 'ADMIN_CORE'
on conflict (slug) do nothing;

-- 3. Ventas
insert into public.scenarios (
  track_id, partner_org_id, slug, title, description, difficulty,
  target_sla_seconds, base_xp_reward, passing_score, skill_code, rubric_config, is_published
)
select
  ct.id, null,
  'ventas-diagnostico-objeciones-cierre',
  'Diagnóstico Comercial y Manejo de Objeciones',
  'Atiende a un cliente simulado, identifica su necesidad real, responde objeciones con transparencia y logra el cierre.',
  'intermediate', 420, 280, 75.00, 'CONSULTATIVE_SALES_ETHICS',
  '{
    "vertical": "sales",
    "weights": { "accuracy": 0.45, "sla": 0.25, "protocol": 0.30 },
    "requiredDiscoverySteps": ["ask_budget_need", "verify_use_case"],
    "expectedObjectionResponses": [
      { "objectionId": "OBJ-PRICE", "expectedStrategy": "VALUE_ROI_BREAKDOWN" },
      { "objectionId": "OBJ-SUPPORT", "expectedStrategy": "SLA_WARRANTY_PROOF" }
    ],
    "penalties": { "misleadingSalesClaim": 35, "skippedDiscovery": 15 },
    "minPlausibleSeconds": 20
  }'::jsonb,
  true
from public.career_tracks ct where ct.code = 'SALES_CORE'
on conflict (slug) do nothing;

-- 4. HaSociaJob (Habilidades Blandas)
insert into public.scenarios (
  track_id, partner_org_id, slug, title, description, difficulty,
  target_sla_seconds, base_xp_reward, passing_score, skill_code, rubric_config, is_published
)
select
  ct.id, null,
  'hasociajob-liderazgo-comunicacion-equipo',
  'HaSociaJob: Liderazgo Colaborativo y Resolución de Conflictos',
  'Resuelve tensiones en un equipo multidisciplinario aplicando comunicación efectiva, adaptabilidad y liderazgo constructivo.',
  'beginner', 600, 300, 75.00, 'HASOCIAJOB_LEADERSHIP_COMM',
  '{
    "vertical": "hasociajob",
    "weights": { "accuracy": 0.45, "sla": 0.20, "protocol": 0.35 },
    "expectedSituations": [
      { "situationId": "SIT-TEAM-CONFLICT", "expectedAction": "ACTIVE_LISTENING_MEDIATION" },
      { "situationId": "SIT-SCOPE-CHANGE", "expectedAction": "ADAPTIVE_REPRIORITIZATION" },
      { "situationId": "SIT-BOTTLENECK", "expectedAction": "CONSTRUCTIVE_DELEGATION" }
    ],
    "penalties": { "nonCollaborativeEscalation": 25, "leadershipAvoidance": 20 },
    "minPlausibleSeconds": 25
  }'::jsonb,
  true
from public.career_tracks ct where ct.code = 'HASOCIAJOB_SOFT'
on conflict (slug) do nothing;
