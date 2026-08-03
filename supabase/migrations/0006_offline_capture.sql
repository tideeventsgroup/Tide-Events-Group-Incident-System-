-- =====================================================================
-- Offline capture.
--
-- An incident logged on a dead signal is still evidence, so the record has
-- to say so rather than quietly presenting a client-supplied time as though
-- the server saw it live.
--
--   created_at     — when the operator says it happened (their device clock)
--   synced_at      — when the server actually received it (authoritative)
--   logged_offline — flags the gap so a debrief can see it
--
-- Idempotency is handled client-side: the queue holds the incident's primary
-- key, so a retried flush collides on the key and is treated as already sent
-- rather than producing a duplicate incident on the board.
-- =====================================================================
alter table public.incidents
  add column logged_offline boolean not null default false,
  add column synced_at      timestamptz;

comment on column public.incidents.created_at is
  'When the incident was raised. For offline capture this is the operator''s device clock.';
comment on column public.incidents.synced_at is
  'Server time the record was received. Always server-authoritative.';

-- The client supplies created_at when flushing a queued incident, so it must
-- be sanity-checked: a device clock running fast cannot place an incident in
-- the future.
create or replace function public.stamp_sync_time()
returns trigger language plpgsql set search_path = public as $$
begin
  new.synced_at := now();
  if new.created_at > now() then
    new.created_at := now();
  end if;
  return new;
end $$;

create trigger incidents_stamp_sync
  before insert on public.incidents
  for each row execute function public.stamp_sync_time();

-- The opening timeline entry now records the delay, where there was one.
create or replace function public.seed_incident_timeline()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name  text;
  v_role  public.staff_role;
  v_delay interval;
begin
  select full_name, role into v_name, v_role
    from public.profiles where id = new.created_by;

  insert into public.incident_updates
    (incident_id, event_id, at, author_id, author_name, author_role, entry_type, body)
  values (
    new.id, new.event_id, new.created_at, new.created_by,
    coalesce(v_name, 'System'), v_role, 'report', new.description
  );

  if new.logged_offline then
    v_delay := new.synced_at - new.created_at;
    insert into public.incident_updates
      (incident_id, event_id, at, author_id, author_name, author_role, entry_type, body)
    values (
      new.id, new.event_id, new.synced_at, new.created_by,
      coalesce(v_name, 'System'), v_role, 'system',
      'Logged offline at ' || to_char(new.created_at at time zone 'Europe/London', 'HH24:MI') ||
      ' and synced to the system at ' ||
      to_char(new.synced_at at time zone 'Europe/London', 'HH24:MI') ||
      ' (' || (greatest(0, extract(epoch from v_delay))::integer / 60)::text ||
      ' min later). The raised time is the reporting device''s clock.'
    );
  end if;

  if new.severity in ('Major','Critical') then
    insert into public.incident_updates
      (incident_id, event_id, at, author_id, author_name, author_role, entry_type, body)
    values (
      new.id, new.event_id, new.created_at + interval '1 second', new.created_by,
      coalesce(v_name, 'System'), v_role, 'severity',
      new.ref || ' raised at ' || new.severity || ' severity — ' || new.command_level ||
      ' engaged at ' || new.location || '.'
    );
  end if;

  return new;
end $$;

-- Recreated rather than replaced: the new columns sit mid-list, and
-- CREATE OR REPLACE VIEW cannot reorder columns.
drop view public.incident_board;

create view public.incident_board
with (security_invoker = false) as
select
  i.id, i.event_id, i.ref, i.seq, i.created_at, i.updated_at, i.created_by,
  i.category, i.severity, i.location, i.command_level, i.status,
  i.follow_up_required, i.closed_at, i.logged_offline, i.synced_at,
  (i.category = 'Medical' and not public.can_see_medical()) as restricted,
  case when i.category = 'Medical' and not public.can_see_medical()
       then null else i.description end        as description,
  case when i.category = 'Medical' and not public.can_see_medical()
       then null else i.reported_by end        as reported_by,
  case when i.category = 'Medical' and not public.can_see_medical()
       then null else i.resources_deployed end as resources_deployed,
  case when i.category = 'Medical' and not public.can_see_medical()
       then null else i.outcome end            as outcome,
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

revoke all on public.incident_board from anon;
grant select on public.incident_board to authenticated;
