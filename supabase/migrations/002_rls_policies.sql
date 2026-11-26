-- =============================================================================
-- 002_rls_policies.sql — Zero-Trust Row Level Security (PortalJob)
-- Deny-by-default boundary protecting youth data privacy (Ley N. 29733),
-- partner organizations, verifiable certificates, and evaluation integrity.
-- =============================================================================

alter table public.profiles                 enable row level security;
alter table public.partner_orgs             enable row level security;
alter table public.partner_memberships      enable row level security;
alter table public.career_tracks            enable row level security;
alter table public.scenarios                enable row level security;
alter table public.simulation_sessions      enable row level security;
alter table public.session_events           enable row level security;
alter table public.evaluation_results       enable row level security;
alter table public.certificates             enable row level security;
alter table public.candidate_skill_progress enable row level security;
alter table public.talent_opt_ins           enable row level security;

-- -----------------------------------------------------------------------------
-- Helpers: Non-recursive multi-tenant & consent checks
-- -----------------------------------------------------------------------------

create or replace function public.is_partner_member(
  target_org_id uuid,
  allowed_roles text[] default array['recruiter', 'admin']
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.partner_memberships pm
    where pm.org_id = target_org_id
      and pm.user_id = auth.uid()
      and pm.member_role = any(allowed_roles)
  );
$$;

create or replace function public.partner_has_candidate_opt_in(target_candidate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.talent_opt_ins opt
    join public.partner_memberships pm on pm.org_id = opt.partner_org_id
    where opt.user_id = target_candidate_id
      and opt.consent_status = 'granted'
      and pm.user_id = auth.uid()
  );
$$;

-- -----------------------------------------------------------------------------
-- 1. Profiles
-- -----------------------------------------------------------------------------

drop policy if exists "profiles_select_own_or_consented_partner" on public.profiles;
create policy "profiles_select_own_or_consented_partner" on public.profiles
  for select to authenticated
  using (
    auth.uid() = id
    or (is_open_to_work = true and public.partner_has_candidate_opt_in(id))
  );

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- 2. Partner Orgs & Memberships
-- -----------------------------------------------------------------------------

drop policy if exists "partner_orgs_select_verified_or_member" on public.partner_orgs;
create policy "partner_orgs_select_verified_or_member" on public.partner_orgs
  for select to authenticated
  using (
    verified = true
    or public.is_partner_member(id)
  );

drop policy if exists "partner_orgs_update_org_admin" on public.partner_orgs;
create policy "partner_orgs_update_org_admin" on public.partner_orgs
  for update to authenticated
  using (public.is_partner_member(id, array['admin']))
  with check (public.is_partner_member(id, array['admin']));

drop policy if exists "partner_memberships_select_own_or_org_admin" on public.partner_memberships;
create policy "partner_memberships_select_own_or_org_admin" on public.partner_memberships
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_partner_member(org_id, array['admin'])
  );

-- -----------------------------------------------------------------------------
-- 3. Career Tracks & Scenarios
-- -----------------------------------------------------------------------------

drop policy if exists "career_tracks_read_active" on public.career_tracks;
create policy "career_tracks_read_active" on public.career_tracks
  for select to authenticated
  using (is_active = true);

drop policy if exists "scenarios_select_published_or_partner" on public.scenarios;
create policy "scenarios_select_published_or_partner" on public.scenarios
  for select to authenticated
  using (
    is_published = true
    or (partner_org_id is not null and public.is_partner_member(partner_org_id))
  );

drop policy if exists "scenarios_insert_partner_admin" on public.scenarios;
create policy "scenarios_insert_partner_admin" on public.scenarios
  for insert to authenticated
  with check (
    partner_org_id is not null
    and public.is_partner_member(partner_org_id, array['admin'])
  );

drop policy if exists "scenarios_update_partner_admin" on public.scenarios;
create policy "scenarios_update_partner_admin" on public.scenarios
  for update to authenticated
  using (
    partner_org_id is not null
    and public.is_partner_member(partner_org_id, array['admin'])
  )
  with check (
    partner_org_id is not null
    and public.is_partner_member(partner_org_id, array['admin'])
  );

-- -----------------------------------------------------------------------------
-- 4. Simulation Sessions & Append-Only Events
-- -----------------------------------------------------------------------------

drop policy if exists "sessions_select_own" on public.simulation_sessions;
create policy "sessions_select_own" on public.simulation_sessions
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "sessions_insert_own" on public.simulation_sessions;
create policy "sessions_insert_own" on public.simulation_sessions
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and status = 'in_progress'
  );

drop policy if exists "sessions_update_own_active" on public.simulation_sessions;
create policy "sessions_update_own_active" on public.simulation_sessions
  for update to authenticated
  using (
    auth.uid() = user_id
    and status in ('in_progress', 'paused')
  )
  with check (
    auth.uid() = user_id
    and status in ('in_progress', 'paused', 'submitted', 'abandoned')
  );

drop policy if exists "session_events_select_own" on public.session_events;
create policy "session_events_select_own" on public.session_events
  for select to authenticated
  using (
    exists (
      select 1
      from public.simulation_sessions s
      where s.id = session_events.session_id
        and s.user_id = auth.uid()
    )
  );

drop policy if exists "session_events_insert_own_active" on public.session_events;
create policy "session_events_insert_own_active" on public.session_events
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.simulation_sessions s
      where s.id = session_events.session_id
        and s.user_id = auth.uid()
        and s.status in ('in_progress', 'paused')
    )
  );

-- -----------------------------------------------------------------------------
-- 5. Evaluation Ledger, Verifiable Certificates & Skill Progress
--    (Read-only for clients; written strictly by server-side evaluation RPC)
-- -----------------------------------------------------------------------------

drop policy if exists "evaluation_results_select_own_or_consented_partner" on public.evaluation_results;
create policy "evaluation_results_select_own_or_consented_partner" on public.evaluation_results
  for select to authenticated
  using (
    auth.uid() = user_id
    or public.partner_has_candidate_opt_in(user_id)
  );

drop policy if exists "certificates_select_own_or_consented_partner" on public.certificates;
create policy "certificates_select_own_or_consented_partner" on public.certificates
  for select to authenticated
  using (
    auth.uid() = user_id
    or public.partner_has_candidate_opt_in(user_id)
  );

drop policy if exists "skill_progress_select_own_or_consented_partner" on public.candidate_skill_progress;
create policy "skill_progress_select_own_or_consented_partner" on public.candidate_skill_progress
  for select to authenticated
  using (
    auth.uid() = user_id
    or public.partner_has_candidate_opt_in(user_id)
  );

-- -----------------------------------------------------------------------------
-- 6. Talent Opt-Ins (Explicit B2B Consent for Cartera de Talento)
-- -----------------------------------------------------------------------------

drop policy if exists "talent_opt_ins_select_own_or_partner" on public.talent_opt_ins;
create policy "talent_opt_ins_select_own_or_partner" on public.talent_opt_ins
  for select to authenticated
  using (
    auth.uid() = user_id
    or (consent_status = 'granted' and public.is_partner_member(partner_org_id))
  );

drop policy if exists "talent_opt_ins_insert_own" on public.talent_opt_ins;
create policy "talent_opt_ins_insert_own" on public.talent_opt_ins
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "talent_opt_ins_update_own" on public.talent_opt_ins;
create policy "talent_opt_ins_update_own" on public.talent_opt_ins
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "talent_opt_ins_delete_own" on public.talent_opt_ins;
create policy "talent_opt_ins_delete_own" on public.talent_opt_ins
  for delete to authenticated
  using (auth.uid() = user_id);
