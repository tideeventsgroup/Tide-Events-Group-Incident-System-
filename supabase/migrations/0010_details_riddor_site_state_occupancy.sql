-- =====================================================================
-- Tier 1: the gaps with a legal or licensing hook.
--
--  1. Structured detail per incident type. Every incident was one free
--     text description whatever its category. The commercial products
--     configure the form to the type — 24/7 Software does it by "incident
--     type, process or department"; Halo ships an Ejection / Refusal form
--     with steward ID, police involvement and a body-worn video
--     reference. Without it the record is prose and the debrief has no
--     statistics. The shape lives in the client (src/lib/incidentFields.ts)
--     and is versioned there; the database keeps it as evidence and audits
--     every change.
--
--  2. RIDDOR. A member of the public taken directly from the scene to
--     hospital for treatment is reportable to HSE regardless of how
--     trivial the injury proves, and the duty falls on the person in
--     control of the premises. The trigger is a field the control room
--     already knows at the time — the casualty's disposal — so the board
--     can raise the flag rather than someone remembering a fortnight
--     later.
--
--  3. Site state. HSE and the Purple Guide treat a controlled halt to a
--     performance as a distinct command action. It was not modelled: the
--     highest command action available was a METHANE report. Declaring
--     one is reserved to the Incident Commander in the insert policy.
--
--  4. Occupancy. The SGSA expects entry counts every fifteen minutes from
--     gate opening through to half an hour after the start, and it is a
--     licensing condition at many events.
-- =====================================================================

alter type public.incident_category add value if not exists 'Missing Person' after 'Welfare';

-- ---------------------------------------------- structured incident detail
create type public.casualty_disposal as enum (
  'Not applicable','Treated on site','Discharged','Referred to GP',
  'Refused treatment','Conveyed to hospital','Own transport to hospital'
);

alter table public.incidents
  add column details jsonb not null default '{}'::jsonb,
  add column disposal public.casualty_disposal not null default 'Not applicable',
  add column safeguarding_referral boolean not null default false,
  add column riddor_reportable boolean not null default false,
  add column riddor_reference text check (riddor_reference is null or length(riddor_reference) <= 60),
  add column riddor_reported_at timestamptz,
  add column riddor_reported_by uuid references public.profiles(id);

comment on column public.incidents.details is
  'Type-specific fields. The shape is defined per category in the client and versioned there; the database keeps it as evidence and audits every change.';
comment on column public.incidents.riddor_reportable is
  'A non-worker taken directly from the scene to hospital is reportable to HSE regardless of how trivial the injury proves.';

-- ------------------------------------------------------------- site state
create type public.site_state as enum (
  'Normal','Show stop','Evacuation','Invacuation','Lockdown'
);

alter table public.events
  add column site_state    public.site_state not null default 'Normal',
  add column site_state_at timestamptz,
  add column capacity      integer check (capacity is null or capacity > 0),
  add column site_plan_path text;

create table public.site_state_log (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete restrict,
  at             timestamptz not null default now(),
  state          public.site_state not null,
  previous_state public.site_state,
  declared_by    uuid references public.profiles(id),
  declared_by_name text not null,
  declared_by_role public.staff_role,
  reason         text check (reason is null or length(reason) <= 1000)
);

create index site_state_log_idx on public.site_state_log (event_id, at desc);

-- ------------------------------------------------------------- occupancy
create table public.occupancy_counts (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete restrict,
  at          timestamptz not null default now(),
  zone        text,
  count_in    integer not null default 0 check (count_in  >= 0),
  count_out   integer not null default 0 check (count_out >= 0),
  recorded_by uuid references public.profiles(id),
  recorded_by_name text not null,
  note        text check (note is null or length(note) <= 400)
);

create index occupancy_idx on public.occupancy_counts (event_id, at desc);

-- ------------------------------------------------------------- triggers
create trigger site_state_log_append_only
  before update or delete on public.site_state_log
  for each row execute function public.forbid_mutation();
create trigger occupancy_append_only
  before update or delete on public.occupancy_counts
  for each row execute function public.forbid_mutation();

create trigger site_state_log_ping
  after insert on public.site_state_log
  for each row execute function public.emit_live_ping();
create trigger occupancy_ping
  after insert on public.occupancy_counts
  for each row execute function public.emit_live_ping();

create trigger occupancy_reject_locked
  before insert on public.occupancy_counts
  for each row execute function public.reject_when_locked();

-- The event row and the append-only log always move together.
create or replace function public.apply_site_state()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.events
     set site_state = new.state, site_state_at = new.at
   where id = new.event_id;
  return new;
end $$;

create trigger site_state_apply
  after insert on public.site_state_log
  for each row execute function public.apply_site_state();

-- RIDDOR, disposal and safeguarding changes belong on the timeline like
-- every other material change to the record.
create or replace function public.log_incident_extras()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(public.my_name(), 'System');
  v_role public.staff_role := public.my_role();
begin
  if new.disposal is distinct from old.disposal then
    insert into public.incident_updates
      (incident_id, event_id, author_id, author_name, author_role, entry_type, body)
    values (new.id, new.event_id, auth.uid(), v_name, v_role, 'update',
            'Disposal recorded as: ' || new.disposal || '.');
  end if;

  if new.riddor_reportable is distinct from old.riddor_reportable then
    insert into public.incident_updates
      (incident_id, event_id, author_id, author_name, author_role, entry_type, body)
    values (new.id, new.event_id, auth.uid(), v_name, v_role, 'update',
            case when new.riddor_reportable
                 then 'Flagged as RIDDOR reportable to HSE.'
                 else 'RIDDOR reportable flag removed.' end);
  end if;

  if new.riddor_reported_at is not null and old.riddor_reported_at is null then
    insert into public.incident_updates
      (incident_id, event_id, author_id, author_name, author_role, entry_type, body)
    values (new.id, new.event_id, auth.uid(), v_name, v_role, 'update',
            'Reported to HSE under RIDDOR' ||
            coalesce(' (ref ' || new.riddor_reference || ')', '') || '.');
  end if;

  if new.safeguarding_referral is distinct from old.safeguarding_referral then
    insert into public.incident_updates
      (incident_id, event_id, author_id, author_name, author_role, entry_type, body)
    values (new.id, new.event_id, auth.uid(), v_name, v_role, 'update',
            case when new.safeguarding_referral
                 then 'Safeguarding referral raised.'
                 else 'Safeguarding referral flag removed.' end);
  end if;

  if new.details is distinct from old.details then
    insert into public.incident_updates
      (incident_id, event_id, author_id, author_name, author_role, entry_type, body)
    values (new.id, new.event_id, auth.uid(), v_name, v_role, 'update',
            'Incident detail fields updated.');
  end if;

  return new;
end $$;

create trigger incidents_log_extras
  after update on public.incidents
  for each row execute function public.log_incident_extras();

-- Once submitted to HSE the reference is part of the record.
create or replace function public.freeze_riddor_submission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.riddor_reported_at is not null
     and new.riddor_reported_at is distinct from old.riddor_reported_at then
    raise exception 'The RIDDOR submission time is part of the record and cannot be changed'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger incidents_freeze_riddor
  before update on public.incidents
  for each row execute function public.freeze_riddor_submission();

-- ------------------------------------------------------------------ RLS
alter table public.site_state_log   enable row level security;
alter table public.occupancy_counts enable row level security;

create policy site_state_select on public.site_state_log
  for select to authenticated using (public.can_see_event(event_id));
-- Stopping a show or evacuating a site is a command decision.
create policy site_state_insert on public.site_state_log
  for insert to authenticated
  with check (declared_by = auth.uid() and public.my_role() = 'Incident Commander');

create policy occupancy_select on public.occupancy_counts
  for select to authenticated using (public.can_see_event(event_id));
create policy occupancy_insert on public.occupancy_counts
  for insert to authenticated
  with check (recorded_by = auth.uid() and public.can_write_incidents());

revoke all on public.site_state_log   from anon, authenticated;
revoke all on public.occupancy_counts from anon, authenticated;
grant select, insert on public.site_state_log   to authenticated;
grant select, insert on public.occupancy_counts to authenticated;

revoke all on function public.apply_site_state()         from public, anon, authenticated;
revoke all on function public.log_incident_extras()      from public, anon, authenticated;
revoke all on function public.freeze_riddor_submission() from public, anon, authenticated;

alter publication supabase_realtime add table public.site_state_log;
alter publication supabase_realtime add table public.occupancy_counts;

-- The board view is recreated once, in 0011, after the remaining columns
-- it exposes (risk_id, map pins, exercise flag) exist.
