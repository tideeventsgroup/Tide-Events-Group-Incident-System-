-- =====================================================================
-- Units, assignment and response milestones.
--
-- Every incident system built for this job — police/fire CAD, and the
-- event products (Momentus WeTrack, Controlled Events, Halo) — is really
-- two boards, not one: the calls, and the units. A dispatcher's loop is
-- "which call has nobody on it, and who is free to send". Until now this
-- system had only half of that: a free-text `resources_deployed` field
-- that nothing could count, filter or time.
--
-- So:
--   * `resources` — the deployable units for an event, each with a
--     callsign, a kind and a live state. Many units may be committed to
--     one incident, which is how CAD works and how a real response runs.
--   * Response milestones on the incident — acknowledged, first unit on
--     scene — set once and then frozen, because they are the response
--     times a debrief and a licensing review will ask about.
--
-- `resources_deployed` stays. It is the free-text note about what was
-- sent (kit, external services, mutual aid) and it is medical-restricted;
-- unit assignment is dispatch information and is not.
-- =====================================================================

create type public.resource_kind as enum (
  'Medical','Security','Steward','Traffic','Welfare','Command','Contractor','Other'
);

-- The CAD unit lifecycle, in event control's language. Assigned is
-- "dispatched"; Clearing is the unit finishing up but not yet free.
create type public.resource_state as enum (
  'Available','Assigned','En route','On scene','Clearing','Off duty'
);

create table public.resources (
  id                   uuid primary key default gen_random_uuid(),
  event_id             uuid not null references public.events(id) on delete restrict,
  callsign             text not null check (length(callsign) between 1 and 24),
  name                 text not null check (length(name) between 1 and 80),
  kind                 public.resource_kind  not null default 'Steward',
  state                public.resource_state not null default 'Available',
  assigned_incident_id uuid references public.incidents(id) on delete restrict,
  state_changed_at     timestamptz not null default now(),
  notes                text check (notes is null or length(notes) <= 400),
  created_at           timestamptz not null default now(),
  created_by           uuid references public.profiles(id),

  unique (event_id, callsign),

  -- A committed unit is committed to something, and a free unit is not
  -- holding a call. The board's counts depend on this being true.
  constraint resource_commitment check (
    (state in ('Assigned','En route','On scene','Clearing') and assigned_incident_id is not null)
    or
    (state in ('Available','Off duty') and assigned_incident_id is null)
  )
);

create index resources_event_idx    on public.resources (event_id, state);
create index resources_incident_idx on public.resources (assigned_incident_id)
  where assigned_incident_id is not null;

-- --------------------------------------------------- response milestones
alter table public.incidents
  add column acknowledged_at timestamptz,
  add column acknowledged_by uuid references public.profiles(id),
  add column on_scene_at     timestamptz;

comment on column public.incidents.acknowledged_at is
  'When event control took ownership — first unit committed, or an explicit ack.';
comment on column public.incidents.on_scene_at is
  'When the first assigned unit reported on scene.';

-- ------------------------------------------------------------- triggers

create or replace function public.stamp_resource_state()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.state is distinct from old.state
     or new.assigned_incident_id is distinct from old.assigned_incident_id then
    new.state_changed_at := now();
  end if;
  return new;
end $$;

create trigger resources_stamp_state
  before update on public.resources
  for each row execute function public.stamp_resource_state();

/*
 * Dispatch writes itself onto the incident's timeline, for the same reason
 * status changes do: the entry cannot be skipped by a client, and it runs
 * with definer rights so a Security Supervisor can commit a unit to a
 * medical incident they are not permitted to read back.
 */
create or replace function public.log_resource_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(public.my_name(), 'System');
  v_role public.staff_role := public.my_role();
  v_unit text := new.callsign || ' (' || new.name || ')';
begin
  -- Released from a call.
  if old.assigned_incident_id is not null
     and new.assigned_incident_id is distinct from old.assigned_incident_id then
    insert into public.incident_updates
      (incident_id, event_id, author_id, author_name, author_role, entry_type, body)
    values (old.assigned_incident_id, new.event_id, auth.uid(), v_name, v_role, 'resources',
            v_unit || ' stood down from this incident.');
  end if;

  -- Committed to a call.
  if new.assigned_incident_id is not null
     and new.assigned_incident_id is distinct from old.assigned_incident_id then
    insert into public.incident_updates
      (incident_id, event_id, author_id, author_name, author_role, entry_type, body)
    values (new.assigned_incident_id, new.event_id, auth.uid(), v_name, v_role, 'resources',
            v_unit || ' assigned to this incident.');

    -- First unit committed is the moment control took ownership.
    update public.incidents
       set acknowledged_at = now(), acknowledged_by = auth.uid()
     where id = new.assigned_incident_id and acknowledged_at is null;

  -- State moved on the same call.
  elsif new.state is distinct from old.state and new.assigned_incident_id is not null then
    insert into public.incident_updates
      (incident_id, event_id, author_id, author_name, author_role, entry_type, body)
    values (new.assigned_incident_id, new.event_id, auth.uid(), v_name, v_role, 'resources',
            v_unit || ' — ' || new.state || '.');
  end if;

  if new.state = 'On scene' and old.state is distinct from 'On scene'
     and new.assigned_incident_id is not null then
    update public.incidents
       set on_scene_at = now()
     where id = new.assigned_incident_id and on_scene_at is null;
  end if;

  return new;
end $$;

create trigger resources_log_change
  after update on public.resources
  for each row execute function public.log_resource_change();

create trigger resources_audit
  after insert or update on public.resources
  for each row execute function public.write_audit();

create trigger resources_ping
  after insert or update on public.resources
  for each row execute function public.emit_live_ping();

create trigger resources_reject_locked
  before insert or update on public.resources
  for each row execute function public.reject_when_locked();

/*
 * Response milestones are evidence, so once the clock has been stopped it
 * stays stopped. Corrections go on the timeline, where they are attributed.
 */
create or replace function public.freeze_response_milestones()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.acknowledged_at is not null and new.acknowledged_at is distinct from old.acknowledged_at then
    raise exception 'The acknowledgement time is part of the response record and cannot be changed'
      using errcode = 'check_violation';
  end if;
  if old.on_scene_at is not null and new.on_scene_at is distinct from old.on_scene_at then
    raise exception 'The on-scene time is part of the response record and cannot be changed'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger incidents_freeze_milestones
  before update on public.incidents
  for each row execute function public.freeze_response_milestones();

-- An explicit acknowledgement, for a call control has taken but not yet
-- committed a unit to. Also written to the timeline by the change logger.
create or replace function public.log_incident_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(public.my_name(), 'System');
  v_role public.staff_role := public.my_role();
  v_note text;
begin
  if new.status is distinct from old.status then
    insert into public.incident_updates
      (incident_id, event_id, author_id, author_name, author_role, entry_type, body)
    values (new.id, new.event_id, auth.uid(), v_name, v_role, 'status',
            'Status changed from ' || old.status || ' to ' || new.status || '.');
  end if;

  if new.severity is distinct from old.severity then
    insert into public.incident_updates
      (incident_id, event_id, author_id, author_name, author_role, entry_type, body)
    values (new.id, new.event_id, auth.uid(), v_name, v_role, 'severity',
            'Severity changed from ' || old.severity || ' to ' || new.severity || '.');
  end if;

  if new.command_level is distinct from old.command_level then
    insert into public.incident_updates
      (incident_id, event_id, author_id, author_name, author_role, entry_type, body)
    values (new.id, new.event_id, auth.uid(), v_name, v_role, 'command',
            'Command level changed from ' || old.command_level || ' to ' ||
            new.command_level || '.');
  end if;

  if new.acknowledged_at is not null and old.acknowledged_at is null then
    insert into public.incident_updates
      (incident_id, event_id, author_id, author_name, author_role, entry_type, body)
    values (new.id, new.event_id, auth.uid(), v_name, v_role, 'update',
            'Acknowledged by event control (' || v_name || ').');
  end if;

  if new.on_scene_at is not null and old.on_scene_at is null then
    insert into public.incident_updates
      (incident_id, event_id, author_id, author_name, author_role, entry_type, body)
    values (new.id, new.event_id, auth.uid(), v_name, v_role, 'update',
            'First unit on scene.');
  end if;

  if coalesce(new.resources_deployed,'') is distinct from coalesce(old.resources_deployed,'') then
    insert into public.incident_updates
      (incident_id, event_id, author_id, author_name, author_role, entry_type, body)
    values (new.id, new.event_id, auth.uid(), v_name, v_role, 'resources',
            'Resources deployed updated: ' ||
            coalesce(nullif(new.resources_deployed,''), 'none recorded') || '.');
  end if;

  if new.location is distinct from old.location then
    insert into public.incident_updates
      (incident_id, event_id, author_id, author_name, author_role, entry_type, body)
    values (new.id, new.event_id, auth.uid(), v_name, v_role, 'update',
            'Location changed from ' || old.location || ' to ' || new.location || '.');
  end if;

  if new.follow_up_required is distinct from old.follow_up_required then
    insert into public.incident_updates
      (incident_id, event_id, author_id, author_name, author_role, entry_type, body)
    values (new.id, new.event_id, auth.uid(), v_name, v_role, 'update',
            case when new.follow_up_required
                 then 'Flagged as requiring post-event follow-up.'
                 else 'Follow-up flag removed.' end);
  end if;

  if new.closed_at is not null and old.closed_at is null then
    v_note := 'Incident closed and signed off by ' || v_name ||
              coalesce(' (' || v_role::text || ')', '') || '.';
    if coalesce(new.outcome,'') <> '' then
      v_note := v_note || ' Outcome: ' || new.outcome;
    end if;
    insert into public.incident_updates
      (incident_id, event_id, author_id, author_name, author_role, entry_type, body)
    values (new.id, new.event_id, auth.uid(), v_name, v_role, 'closure', v_note);
  end if;

  return new;
end $$;

-- ------------------------------------------------------------------ RLS
alter table public.resources enable row level security;

create policy resources_select on public.resources
  for select to authenticated using (public.can_see_event(event_id));

-- Signing a team on, dispatching it and standing it down are all the
-- dispatcher's job, not a configuration change, so any role that can work
-- an incident can do them. The Client is read-only, as everywhere else.
create policy resources_insert on public.resources
  for insert to authenticated
  with check (public.can_write_incidents() and public.can_see_event(event_id));

create policy resources_update on public.resources
  for update to authenticated
  using (public.can_write_incidents() and public.can_see_event(event_id))
  with check (public.can_write_incidents());

revoke all on public.resources from anon, authenticated;
grant select, insert, update on public.resources to authenticated;

revoke all on function public.stamp_resource_state()       from public, anon, authenticated;
revoke all on function public.log_resource_change()        from public, anon, authenticated;
revoke all on function public.freeze_response_milestones() from public, anon, authenticated;

alter publication supabase_realtime add table public.resources;

-- --------------------------------------------- board view, with dispatch
drop view public.incident_board;

create view public.incident_board
with (security_invoker = false) as
select
  i.id, i.event_id, i.ref, i.seq, i.created_at, i.updated_at, i.created_by,
  i.category, i.severity, i.location, i.command_level, i.status,
  i.follow_up_required, i.closed_at, i.logged_offline, i.synced_at,
  i.acknowledged_at, i.on_scene_at,
  greatest(
    i.created_at,
    coalesce((select max(u.at) from public.incident_updates u
               where u.incident_id = i.id), i.created_at)
  ) as last_update_at,

  -- Dispatch state. Unit callsigns are operational, not clinical, so they
  -- are not masked with the medical free text.
  coalesce(a.assigned_count, 0) as assigned_count,
  a.assigned_units,
  case a.state_rank
    when 4 then 'On scene' when 3 then 'Clearing'
    when 2 then 'En route' when 1 then 'Assigned' else null
  end as response_state,

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
left join lateral (
  select count(*)::int                                  as assigned_count,
         string_agg(r.callsign, ' ' order by r.callsign) as assigned_units,
         max(case r.state
               when 'Assigned' then 1 when 'En route' then 2
               when 'Clearing' then 3 when 'On scene' then 4 else 0 end) as state_rank
    from public.resources r
   where r.assigned_incident_id = i.id
) a on true
where auth.uid() is not null
  and public.can_see_event(i.event_id);

revoke all on public.incident_board from anon;
grant select on public.incident_board to authenticated;

-- Two trigger functions from 0008 were left callable as RPC. They are
-- triggers, not an API surface, so nothing should be able to invoke them
-- directly — the same treatment 0004 gave the rest.
revoke all on function public.assign_methane_seq()  from public, anon, authenticated;
revoke all on function public.methane_to_timeline() from public, anon, authenticated;
