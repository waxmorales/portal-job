-- =============================================================================
-- 003_triggers_and_functions.sql — Integrity Guards, Evaluation RPC & Verify RPC
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Automatic Profile Creation on Supabase Auth Sign-Up
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, region, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'user'), '@', 1)),
    coalesce(nullif(new.raw_user_meta_data->>'region', ''), 'Lima'),
    'candidate'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2. Column-Level Privilege Guard on Profiles (Prevents XP/Role Tampering)
-- -----------------------------------------------------------------------------

create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
as $$
declare
  is_trusted_ctx boolean := (
    current_setting('request.jwt.claim.role', true) = 'service_role'
    or current_setting('app.internal_evaluation', true) = 'on'
  );
begin
  if not is_trusted_ctx then
    if new.role is distinct from old.role
       or new.total_xp is distinct from old.total_xp
       or new.current_level is distinct from old.current_level then
      raise exception 'Forbidden: privileged profile fields cannot be modified from client context';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_privileged_columns on public.profiles;
create trigger trg_guard_profile_privileged_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- -----------------------------------------------------------------------------
-- 3. Session State Machine & Optimistic Version Guard
-- -----------------------------------------------------------------------------

create or replace function public.guard_session_lifecycle()
returns trigger
language plpgsql
as $$
declare
  is_trusted_ctx boolean := (
    current_setting('request.jwt.claim.role', true) = 'service_role'
    or current_setting('app.internal_evaluation', true) = 'on'
  );
begin
  if old.status in ('evaluated', 'abandoned', 'expired') then
    raise exception 'Invalid transition: terminal session state (%) cannot be modified', old.status;
  end if;

  if new.status = 'evaluated' and not is_trusted_ctx then
    raise exception 'Forbidden: only server-side evaluation service can mark a session evaluated';
  end if;

  if new.state_version <> old.state_version + 1 then
    raise exception 'Conflict: expected optimistic state_version %, got %', old.state_version + 1, new.state_version;
  end if;

  new.last_checkpoint_at := now();
  if new.status = 'submitted' and old.submitted_at is null then
    new.submitted_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_session_lifecycle on public.simulation_sessions;
create trigger trg_guard_session_lifecycle
  before update on public.simulation_sessions
  for each row execute function public.guard_session_lifecycle();

-- -----------------------------------------------------------------------------
-- 4. Atomic Deterministic Evaluation & Certificate Issuance RPC (Server-Only)
-- -----------------------------------------------------------------------------

create or replace function public.commit_deterministic_evaluation(
  p_session_id uuid,
  p_expected_version integer,
  p_engine_version text,
  p_input_hash text,
  p_final_score numeric,
  p_passed boolean,
  p_xp_awarded integer,
  p_kpi_breakdown jsonb,
  p_rule_violations jsonb
)
returns table (
  evaluation_id uuid,
  verification_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_scenario_id uuid;
  v_scenario_title text;
  v_partner_org_id uuid;
  v_skill_code text;
  v_eval_id uuid;
  v_verif_code text := null;
begin
  select s.user_id, sc.id, sc.title, sc.partner_org_id, sc.skill_code
  into v_user_id, v_scenario_id, v_scenario_title, v_partner_org_id, v_skill_code
  from public.simulation_sessions s
  join public.scenarios sc on sc.id = s.scenario_id
  where s.id = p_session_id
    and s.state_version = p_expected_version
    and s.status in ('in_progress', 'paused', 'submitted')
  for update;

  if not found then
    raise exception 'Session not found, already evaluated, or state_version conflict';
  end if;

  perform set_config('app.internal_evaluation', 'on', true);

  update public.simulation_sessions
  set status = 'evaluated',
      state_version = state_version + 1,
      submitted_at = coalesce(submitted_at, now())
  where id = p_session_id;

  insert into public.evaluation_results (
    session_id,
    user_id,
    engine_version,
    input_hash,
    final_score,
    passed,
    xp_awarded,
    kpi_breakdown,
    rule_violations
  ) values (
    p_session_id,
    v_user_id,
    p_engine_version,
    p_input_hash,
    p_final_score,
    p_passed,
    p_xp_awarded,
    p_kpi_breakdown,
    p_rule_violations
  )
  returning id into v_eval_id;

  if p_passed then
    v_verif_code := 'PJ-' || to_char(now(), 'YYYY') || '-' ||
      upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    insert into public.certificates (
      evaluation_id,
      user_id,
      scenario_id,
      co_endorser_org_id,
      verification_code,
      credential_title,
      status
    ) values (
      v_eval_id,
      v_user_id,
      v_scenario_id,
      v_partner_org_id,
      v_verif_code,
      'Certificado Práctico: ' || v_scenario_title,
      'active'
    );
  end if;

  update public.profiles
  set total_xp = total_xp + p_xp_awarded,
      current_level = greatest(1, floor((total_xp + p_xp_awarded) / 500.0)::integer + 1)
  where id = v_user_id;

  insert into public.candidate_skill_progress (
    user_id,
    skill_code,
    xp_points,
    completed_scenarios,
    best_score
  ) values (
    v_user_id,
    v_skill_code,
    p_xp_awarded,
    case when p_passed then 1 else 0 end,
    p_final_score
  )
  on conflict (user_id, skill_code) do update
  set xp_points = candidate_skill_progress.xp_points + excluded.xp_points,
      completed_scenarios = candidate_skill_progress.completed_scenarios + excluded.completed_scenarios,
      best_score = greatest(candidate_skill_progress.best_score, excluded.best_score),
      updated_at = now();

  return query select v_eval_id, v_verif_code;
end;
$$;

revoke all on function public.commit_deterministic_evaluation(
  uuid, integer, text, text, numeric, boolean, integer, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.commit_deterministic_evaluation(
  uuid, integer, text, text, numeric, boolean, integer, jsonb, jsonb
) to service_role;

-- -----------------------------------------------------------------------------
-- 5. Safe Point-Verification RPC for Employers & Co-Endorsers
-- -----------------------------------------------------------------------------

create or replace function public.verify_certificate(p_verification_code text)
returns table (
  valid boolean,
  verification_code text,
  credential_title text,
  candidate_name text,
  vertical text,
  final_score numeric,
  issued_at timestamptz,
  co_endorser_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (c.status = 'active') as valid,
    c.verification_code,
    c.credential_title,
    p.full_name as candidate_name,
    ct.vertical,
    er.final_score,
    c.issued_at,
    po.name as co_endorser_name
  from public.certificates c
  join public.profiles p on p.id = c.user_id
  join public.evaluation_results er on er.id = c.evaluation_id
  join public.scenarios sc on sc.id = c.scenario_id
  join public.career_tracks ct on ct.id = sc.track_id
  left join public.partner_orgs po on po.id = c.co_endorser_org_id
  where c.verification_code = p_verification_code
  limit 1;
$$;

grant execute on function public.verify_certificate(text) to anon, authenticated;
