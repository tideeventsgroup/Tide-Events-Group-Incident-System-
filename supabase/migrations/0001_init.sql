-- =====================================================================
-- Tide Incident Management System — core schema
-- Tide Events Group Scotland
--
-- Design principles:
--   * Append-only audit trail. No hard deletes anywhere, no silent edits.
--   * Medical free-text is restricted at the database, not in the UI, so an
--     unauthorised role cannot reach it via the REST API or realtime either.
--   * Multi-event / multi-client from the first row.
-- =====================================================================

-- ---------------------------------------------------------------- enums
create type public.incident_category as enum (
  'Medical','Security','Crowd','Weather','Fire','Welfare','Structural','CT-Suspicious','Other'
);

create type public.incident_severity as enum ('Minor','Moderate','Major','Critical');

create type public.incident_status as enum ('Open','Monitoring','Escalated','Resolved');

-- Tide's operating command tiers (ESMP L1-L4), the equivalent of Bronze/Silver/Gold.
create type public.command_level as enum (
  'Ground Team (L1)','Event Control (L2)','FMIC (L3)','Police Scotland (L4)'
);

create type public.staff_role as enum (
  'Incident Commander','Security Supervisor','Medical Lead','Ops Director'
);

create type public.event_status as enum ('Standby','Live','Closed');

-- ------------------------------------------------------------- profiles
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text not null,
  role        public.staff_role not null default 'Security Supervisor',
  callsign    text,
  email       text,
  created_at  timestamptz not null default now()
);

comment on table public.profiles is 'Control room personnel. Role drives access; see can_see_medical().';

-- --------------------------------------------------------------- events
create table public.events (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  client              text not null,
  venue               text,
  start_date          date not null,
  end_date            date,
  status              public.event_status not null default 'Standby',
  zones               text[] not null default '{}',
  expected_attendance text,
  active_day          integer not null default 1 check (active_day >= 1),
  -- GDPR: per-event retention flag, for future retention policy enforcement.
  retention_months    integer not null default 36 check (retention_months > 0),
  retention_notes     text,
  locked              boolean not null default false,
  incident_seq        integer not null default 0,
  created_at          timestamptz not null default now(),
  created_by          uuid references public.profiles(id)
);

comment on column public.events.retention_months is
  'Retention period for incident records from event end date (GDPR / Martyn''s Law audit).';
comment on column public.events.locked is
  'Set when the event is ended. Locks all incident logs against further writes.';

-- ------------------------------------------------------------ incidents
create table public.incidents (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references public.events(id) on delete restrict,
  seq                 integer not null,
  ref                 text not null,
  created_at          timestamptz not null default now(),
  created_by          uuid references public.profiles(id),
  category            public.incident_category not null,
  severity            public.incident_severity not null,
  location            text not null,
  reported_by         text not null,
  description         text not null,
  command_level       public.command_level not null default 'Ground Team (L1)',
  status              public.incident_status not null default 'Open',
  resources_deployed  text,
  closed_by           uuid references public.profiles(id),
  closed_at           timestamptz,
  outcome             text,
  follow_up_required  boolean not null default false,
  updated_at          timestamptz not null default now(),
  unique (event_id, seq)
);

create index incidents_event_created_idx on public.incidents (event_id, created_at desc);
create index incidents_status_idx        on public.incidents (status);
create index incidents_category_idx      on public.incidents (category);
create index incidents_severity_idx      on public.incidents (severity);

-- ----------------------------------------------------- incident_updates
-- Append-only running log. Every material change writes an entry here; the
-- entries are never rewritten, so the timeline is the record of truth.
create table public.incident_updates (
  id           uuid primary key default gen_random_uuid(),
  incident_id  uuid not null references public.incidents(id) on delete restrict,
  event_id     uuid not null references public.events(id) on delete restrict,
  at           timestamptz not null default now(),
  author_id    uuid references public.profiles(id),
  author_name  text not null,
  author_role  public.staff_role,
  entry_type   text not null default 'update'
                 check (entry_type in ('report','update','status','command','severity','resources','closure','system')),
  body         text not null
);

create index incident_updates_incident_idx on public.incident_updates (incident_id, at);

-- -------------------------------------------------------------- audit_log
-- Machine-written, immutable. Records who changed what, when.
create table public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  actor_name  text,
  actor_role  text,
  entity      text not null,
  entity_id   uuid,
  event_id    uuid,
  action      text not null,
  changes     jsonb
);

create index audit_log_entity_idx on public.audit_log (entity, entity_id, at desc);
create index audit_log_event_idx  on public.audit_log (event_id, at desc);

-- ------------------------------------------------------------ live_pings
-- Realtime fan-out channel. Carries no incident content, so every role can
-- subscribe to it and refetch, including for medical incidents whose rows
-- they are not permitted to receive over the incidents channel.
create table public.live_pings (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  event_id    uuid not null,
  incident_id uuid,
  kind        text not null
);

create index live_pings_at_idx on public.live_pings (at desc);

-- ====================================================================
-- Helper functions
-- ====================================================================
create or replace function public.my_role()
returns public.staff_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.my_name()
returns text
language sql stable security definer set search_path = public
as $$ select full_name from public.profiles where id = auth.uid() $$;

-- Medical detail is restricted to Medical Lead and Ops Director only.
create or replace function public.can_see_medical()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() in ('Medical Lead','Ops Director'), false) $$;

create or replace function public.can_write_incidents()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() in ('Incident Commander','Security Supervisor','Medical Lead'), false) $$;

create or replace function public.event_is_open(p_event_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select not locked from public.events where id = p_event_id), false) $$;

-- ====================================================================
-- Triggers
-- ====================================================================

-- Per-event incident reference: INC-0001, INC-0002 ...
create or replace function public.assign_incident_ref()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_seq integer;
begin
  update public.events
     set incident_seq = incident_seq + 1
   where id = new.event_id
  returning incident_seq into v_seq;

  if v_seq is null then
    raise exception 'Unknown event %', new.event_id;
  end if;

  new.seq := v_seq;
  new.ref := 'INC-' || lpad(v_seq::text, 4, '0');
  return new;
end $$;

create trigger incidents_assign_ref
  before insert on public.incidents
  for each row execute function public.assign_incident_ref();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger incidents_touch_updated_at
  before update on public.incidents
  for each row execute function public.touch_updated_at();

-- Audit: capture every insert and every field-level change.
-- Goes through jsonb rather than NEW.<field>, because plpgsql resolves every
-- branch of a CASE at plan time and these triggers serve tables with
-- different column sets.
create or replace function public.write_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_changes jsonb := '{}'::jsonb;
  v_key     text;
  v_old     jsonb;
  v_new     jsonb := to_jsonb(new);
  v_event   uuid;
begin
  if tg_op = 'INSERT' then
    v_changes := jsonb_build_object('created', v_new);
  else
    v_old := to_jsonb(old);
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key <> 'updated_at' and (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || jsonb_build_object(
          v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return new;
    end if;
  end if;

  v_event := case
               when tg_table_name = 'events' then (v_new ->> 'id')::uuid
               else (v_new ->> 'event_id')::uuid
             end;

  insert into public.audit_log (actor_id, actor_name, actor_role, entity, entity_id, event_id, action, changes)
  values (
    auth.uid(),
    coalesce(public.my_name(), 'system'),
    public.my_role()::text,
    tg_table_name,
    (v_new ->> 'id')::uuid,
    v_event,
    lower(tg_op),
    v_changes
  );
  return new;
end $$;

create trigger incidents_audit
  after insert or update on public.incidents
  for each row execute function public.write_audit();

create trigger events_audit
  after insert or update on public.events
  for each row execute function public.write_audit();

-- Realtime ping (content-free) so every role can stay in sync.
create or replace function public.emit_live_ping()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb := to_jsonb(new);
begin
  insert into public.live_pings (event_id, incident_id, kind)
  values (
    (v_new ->> 'event_id')::uuid,
    case when tg_table_name = 'incidents'
         then (v_new ->> 'id')::uuid
         else (v_new ->> 'incident_id')::uuid end,
    tg_table_name || '.' || lower(tg_op));

  -- Opportunistic housekeeping; pings are transient signalling only.
  if random() < 0.02 then
    delete from public.live_pings where at < now() - interval '2 hours';
  end if;
  return new;
end $$;

create trigger incidents_ping
  after insert or update on public.incidents
  for each row execute function public.emit_live_ping();

create trigger incident_updates_ping
  after insert on public.incident_updates
  for each row execute function public.emit_live_ping();

-- Append-only enforcement. Belt and braces alongside the absent RLS policies.
create or replace function public.forbid_mutation()
returns trigger language plpgsql as $$
begin
  raise exception '% is append-only: % is not permitted', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end $$;

create trigger incident_updates_append_only
  before update or delete on public.incident_updates
  for each row execute function public.forbid_mutation();

create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.forbid_mutation();

create trigger incidents_no_delete
  before delete on public.incidents
  for each row execute function public.forbid_mutation();

create trigger events_no_delete
  before delete on public.events
  for each row execute function public.forbid_mutation();

-- Locked events accept no further incident writes.
create or replace function public.reject_when_locked()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.event_is_open(new.event_id) then
    raise exception 'This event is locked; its incident records are closed to further edits'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger incidents_reject_locked
  before insert or update on public.incidents
  for each row execute function public.reject_when_locked();

create trigger incident_updates_reject_locked
  before insert on public.incident_updates
  for each row execute function public.reject_when_locked();

-- Only an Ops Director may change somebody's role.
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and public.my_role() is distinct from 'Ops Director' then
    raise exception 'Only an Ops Director can change a role assignment'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- New auth user -> profile row.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role, callsign, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'role')::public.staff_role, 'Security Supervisor'),
    new.raw_user_meta_data ->> 'callsign',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ====================================================================
-- Row level security
-- ====================================================================
alter table public.profiles         enable row level security;
alter table public.events           enable row level security;
alter table public.incidents        enable row level security;
alter table public.incident_updates enable row level security;
alter table public.audit_log        enable row level security;
alter table public.live_pings       enable row level security;

-- profiles
create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid() or public.my_role() = 'Ops Director')
  with check (id = auth.uid() or public.my_role() = 'Ops Director');

-- events
create policy events_select on public.events
  for select to authenticated using (true);
create policy events_insert on public.events
  for insert to authenticated
  with check (public.my_role() in ('Incident Commander','Ops Director'));
create policy events_update on public.events
  for update to authenticated
  using (public.my_role() in ('Incident Commander','Ops Director'))
  with check (public.my_role() in ('Incident Commander','Ops Director'));

-- incidents: medical rows are not readable by unauthorised roles, over REST
-- or realtime. The structured summary reaches them via public.incident_board.
create policy incidents_select on public.incidents
  for select to authenticated
  using (category <> 'Medical' or public.can_see_medical());
create policy incidents_insert on public.incidents
  for insert to authenticated
  with check (public.can_write_incidents() and created_by = auth.uid());
create policy incidents_update on public.incidents
  for update to authenticated
  using (public.can_write_incidents() and (category <> 'Medical' or public.can_see_medical()))
  with check (public.can_write_incidents());
-- No delete policy: incidents cannot be deleted.

-- incident_updates: readable when the parent incident is readable.
create policy incident_updates_select on public.incident_updates
  for select to authenticated
  using (
    exists (
      select 1 from public.incidents i
       where i.id = incident_updates.incident_id
         and (i.category <> 'Medical' or public.can_see_medical())
    )
  );
create policy incident_updates_insert on public.incident_updates
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.can_write_incidents()
    and exists (
      select 1 from public.incidents i
       where i.id = incident_updates.incident_id
         and (i.category <> 'Medical' or public.can_see_medical())
    )
  );
-- No update or delete policy: the timeline is append-only.

-- audit_log
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.my_role() in ('Incident Commander','Ops Director'));

-- live_pings: content-free, so everyone may listen.
create policy live_pings_select on public.live_pings
  for select to authenticated using (true);

-- ====================================================================
-- Views
-- ====================================================================

-- The status board. Runs with definer rights so that every role can see the
-- structured summary of a medical incident (category, severity, zone, status,
-- command level) while the free-text detail is masked in place for anyone
-- outside Medical Lead / Ops Director.
create view public.incident_board
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
join public.events e         on e.id  = i.event_id
left join public.profiles cb  on cb.id  = i.created_by
left join public.profiles clb on clb.id = i.closed_by;

-- The timeline. Invoker rights, so incident_updates RLS decides what is
-- returned: medical entry bodies never leave the server for other roles.
create view public.incident_timeline
with (security_invoker = true) as
select
  u.id,
  u.incident_id,
  u.event_id,
  u.at,
  u.author_id,
  u.author_name,
  u.author_role,
  u.entry_type,
  u.body
from public.incident_updates u;

-- ====================================================================
-- Grants
-- ====================================================================
grant select                 on public.profiles         to authenticated;
grant update                 on public.profiles         to authenticated;
grant select, insert, update on public.events           to authenticated;
grant select, insert, update on public.incidents        to authenticated;
grant select, insert         on public.incident_updates to authenticated;
grant select                 on public.audit_log        to authenticated;
grant select                 on public.live_pings       to authenticated;
grant select                 on public.incident_board   to authenticated;
grant select                 on public.incident_timeline to authenticated;

revoke delete on public.incidents, public.incident_updates, public.events, public.audit_log
  from authenticated, anon;

-- ====================================================================
-- Realtime
-- ====================================================================
alter publication supabase_realtime add table public.incidents;
alter publication supabase_realtime add table public.incident_updates;
alter publication supabase_realtime add table public.live_pings;
alter publication supabase_realtime add table public.events;
