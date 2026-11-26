-- =============================================================================
-- 001_init_schema.sql — PortalJob & HaSociaJob (Supabase / PostgreSQL Blueprint)
-- Multi-tenant B2B2C schema covering:
--   • Regionalized youth talent profiles (Lima -> Arequipa / Piura -> National)
--   • Partner orgs & institutional ecosystem co-endorsement
--   • 4 simulation verticals (administration, logistics, sales, hasociajob)
--   • Checkpointed simulation state & append-only telemetry
--   • Deterministic evaluation ledger, verifiable certificates & B2B talent opt-ins
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Identity, Regionalization & B2B Multi-Tenancy
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'candidate'
    check (role in ('candidate', 'partner_recruiter', 'platform_admin')),
  full_name text not null,
  email text not null,
  region text not null default 'Lima',
  total_xp integer not null default 0 check (total_xp >= 0),
  current_level integer not null default 1 check (current_level >= 1),
  is_open_to_work boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  industry text not null,
  org_type text not null default 'corporate'
    check (org_type in ('corporate', 'public_entity', 'ecosystem_partner')),
  region text not null default 'Lima',
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.partner_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.partner_orgs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'recruiter'
    check (member_role in ('recruiter', 'admin')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

-- -----------------------------------------------------------------------------
-- 2. Thematic Tracks & Simulators (Admin, Logistics, Sales, HaSociaJob)
-- -----------------------------------------------------------------------------

create table if not exists public.career_tracks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  vertical text not null
    check (vertical in ('administration', 'logistics', 'sales', 'hasociajob')),
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.career_tracks(id) on delete restrict,
  partner_org_id uuid references public.partner_orgs(id) on delete set null,
  slug text not null unique,
  title text not null,
  description text not null,
  difficulty text not null check (difficulty in ('beginner', 'intermediate', 'advanced')),
  target_sla_seconds integer not null check (target_sla_seconds > 0),
  base_xp_reward integer not null check (base_xp_reward > 0),
  passing_score numeric(5, 2) not null default 70.00
    check (passing_score >= 0 and passing_score <= 100),
  skill_code text not null,
  rubric_config jsonb not null,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3. Simulator State Persistence & Append-Only Action Telemetry
-- -----------------------------------------------------------------------------

create table if not exists public.simulation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scenario_id uuid not null references public.scenarios(id) on delete restrict,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'paused', 'submitted', 'evaluated', 'abandoned', 'expired')),
  state_version integer not null default 1 check (state_version >= 1),
  current_step integer not null default 0 check (current_step >= 0),
  state_snapshot jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  last_checkpoint_at timestamptz not null default now(),
  submitted_at timestamptz
);

create table if not exists public.session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.simulation_sessions(id) on delete cascade,
  sequence_num integer not null check (sequence_num >= 1),
  idempotency_key text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (session_id, idempotency_key),
  unique (session_id, sequence_num)
);

-- -----------------------------------------------------------------------------
-- 4. Deterministic Evaluation Ledger, Verifiable Certificates & Talent Pool
-- -----------------------------------------------------------------------------

create table if not exists public.evaluation_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.simulation_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  engine_version text not null,
  input_hash text not null,
  final_score numeric(5, 2) not null check (final_score >= 0 and final_score <= 100),
  passed boolean not null,
  xp_awarded integer not null check (xp_awarded >= 0),
  kpi_breakdown jsonb not null,
  rule_violations jsonb not null default '[]'::jsonb,
  ai_feedback jsonb,
  evaluated_at timestamptz not null default now()
);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null unique references public.evaluation_results(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  scenario_id uuid not null references public.scenarios(id) on delete restrict,
  co_endorser_org_id uuid references public.partner_orgs(id) on delete set null,
  verification_code text not null unique,
  credential_title text not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  issued_at timestamptz not null default now()
);

create table if not exists public.candidate_skill_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill_code text not null,
  xp_points integer not null default 0 check (xp_points >= 0),
  completed_scenarios integer not null default 0 check (completed_scenarios >= 0),
  best_score numeric(5, 2) not null default 0 check (best_score >= 0 and best_score <= 100),
  updated_at timestamptz not null default now(),
  unique (user_id, skill_code)
);

create table if not exists public.talent_opt_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  partner_org_id uuid not null references public.partner_orgs(id) on delete cascade,
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  consent_status text not null default 'granted'
    check (consent_status in ('granted', 'revoked')),
  consented_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, partner_org_id, scenario_id)
);

-- -----------------------------------------------------------------------------
-- 5. Performance & Integrity Indexes
-- -----------------------------------------------------------------------------

create unique index if not exists ux_active_session_per_user_scenario
  on public.simulation_sessions (user_id, scenario_id)
  where status in ('in_progress', 'paused');

create index if not exists ix_sessions_user_recent
  on public.simulation_sessions (user_id, started_at desc);

create index if not exists ix_session_events_ordered
  on public.session_events (session_id, sequence_num asc);

create index if not exists ix_eval_user_score
  on public.evaluation_results (user_id, evaluated_at desc);

create index if not exists ix_scenarios_published_track
  on public.scenarios (track_id, difficulty)
  where is_published = true;

create index if not exists ix_profiles_region_open
  on public.profiles (region, is_open_to_work)
  where role = 'candidate';

create index if not exists ix_certificates_user_issued
  on public.certificates (user_id, issued_at desc);

create index if not exists ix_optins_partner_status
  on public.talent_opt_ins (partner_org_id, consent_status, scenario_id);

create index if not exists ix_partner_memberships_user
  on public.partner_memberships (user_id, org_id);
