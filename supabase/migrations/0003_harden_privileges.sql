-- =====================================================================
-- Privilege hardening.
--
-- Supabase grants ALL on new public tables to anon and authenticated by
-- default. RLS masks most of that, but not everything:
--   * a SECURITY DEFINER view is not filtered by RLS at all, so anon could
--     read the whole board through public.incident_board;
--   * a missing UPDATE policy fails silently (zero rows matched) rather than
--     loudly, which is safe but hides tampering attempts from the logs.
-- Take the privileges away explicitly rather than relying on policies alone.
-- =====================================================================

revoke all on public.incidents         from anon;
revoke all on public.incident_updates  from anon;
revoke all on public.events            from anon;
revoke all on public.profiles          from anon;
revoke all on public.audit_log         from anon;
revoke all on public.live_pings        from anon;
revoke all on public.incident_board    from anon;
revoke all on public.incident_timeline from anon;

revoke delete, truncate                 on public.incidents        from authenticated;
revoke update, delete, truncate         on public.incident_updates from authenticated;
revoke insert, update, delete, truncate on public.audit_log        from authenticated;
revoke insert, update, delete, truncate on public.live_pings       from authenticated;
revoke delete, truncate                 on public.events           from authenticated;
revoke insert, delete, truncate         on public.profiles         from authenticated;

-- Defence in depth: the board view runs with definer rights, so it must
-- refuse to answer when there is no authenticated caller behind the request.
create or replace view public.incident_board
with (security_invoker = false) as
select
  i.id,
  i.event_id,
  i.ref,
  i.seq,
  i.created_at,
  i.updated_at,
  i.created_by,
  i.category,
  i.severity,
  i.location,
  i.command_level,
  i.status,
  i.follow_up_required,
  i.closed_at,
  (i.category = 'Medical' and not public.can_see_medical()) as restricted,
  case when i.category = 'Medical' and not public.can_see_medical()
       then null else i.description end            as description,
  case when i.category = 'Medical' and not public.can_see_medical()
       then null else i.reported_by end            as reported_by,
  case when i.category = 'Medical' and not public.can_see_medical()
       then null else i.resources_deployed end     as resources_deployed,
  case when i.category = 'Medical' and not public.can_see_medical()
       then null else i.outcome end                as outcome,
  cb.full_name  as created_by_name,
  cb.role       as created_by_role,
  clb.full_name as closed_by_name,
  e.name        as event_name,
  e.client      as event_client,
  e.locked      as event_locked
from public.incidents i
join public.events e          on e.id  = i.event_id
left join public.profiles cb  on cb.id  = i.created_by
left join public.profiles clb on clb.id = i.closed_by
where auth.uid() is not null;

grant select on public.incident_board to authenticated;

-- Manually seeded auth.users rows must carry empty strings, not NULLs, in the
-- token columns — GoTrue scans them into non-nullable Go strings and a NULL
-- makes every sign-in fail with "Database error querying schema".
update auth.users
   set confirmation_token         = coalesce(confirmation_token, ''),
       recovery_token             = coalesce(recovery_token, ''),
       email_change_token_new     = coalesce(email_change_token_new, ''),
       email_change_token_current = coalesce(email_change_token_current, ''),
       email_change               = coalesce(email_change, ''),
       phone_change               = coalesce(phone_change, ''),
       phone_change_token         = coalesce(phone_change_token, ''),
       reauthentication_token     = coalesce(reauthentication_token, '')
 where confirmation_token is null
    or recovery_token is null
    or email_change_token_new is null
    or email_change_token_current is null
    or email_change is null
    or phone_change is null
    or phone_change_token is null
    or reauthentication_token is null;
