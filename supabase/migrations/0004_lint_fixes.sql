-- =====================================================================
-- Database linter fixes.
--
-- Two findings are left standing deliberately:
--   * public.incident_board is SECURITY DEFINER on purpose — bypassing RLS
--     is exactly how it shows every role the structured summary of a medical
--     incident while masking the free text in place. It carries its own
--     auth.uid() guard (0003) in place of the RLS it skips.
--   * my_role / my_name / can_see_medical / can_write_incidents /
--     event_is_open stay executable by `authenticated` because the RLS
--     policies invoke them as the calling role. They only ever report on the
--     caller's own account, so exposing them as RPC discloses nothing the
--     caller does not already know.
-- =====================================================================

-- Pin search_path on the remaining trigger functions.
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.forbid_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception '% is append-only: % is not permitted', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end $$;

create or replace function public.freeze_incident_description()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.description is distinct from old.description then
    raise exception 'The opening description is part of the audit record and cannot be edited. Add a timeline update instead.'
      using errcode = 'insufficient_privilege';
  end if;
  if new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by
     or new.ref is distinct from old.ref then
    raise exception 'Incident provenance fields cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

-- Trigger functions are not API. PostgREST exposes every function in the
-- public schema as an RPC endpoint, so take EXECUTE away from the API roles.
do $$
declare fn text;
begin
  foreach fn in array array[
    'assign_incident_ref()', 'touch_updated_at()', 'write_audit()',
    'emit_live_ping()', 'forbid_mutation()', 'reject_when_locked()',
    'guard_profile_role()', 'handle_new_user()', 'seed_incident_timeline()',
    'log_incident_changes()', 'freeze_incident_description()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
  end loop;
end $$;

revoke all on function public.my_role()             from public, anon;
revoke all on function public.my_name()             from public, anon;
revoke all on function public.can_see_medical()     from public, anon;
revoke all on function public.can_write_incidents() from public, anon;
revoke all on function public.event_is_open(uuid)   from public, anon;

grant execute on function public.my_role()             to authenticated;
grant execute on function public.my_name()             to authenticated;
grant execute on function public.can_see_medical()     to authenticated;
grant execute on function public.can_write_incidents() to authenticated;
grant execute on function public.event_is_open(uuid)   to authenticated;
