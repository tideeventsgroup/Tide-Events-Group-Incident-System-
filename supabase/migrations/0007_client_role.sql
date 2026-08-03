-- =====================================================================
-- Role model change.
--
--   * Incident Commander now has full access to everything, medical detail
--     included. They own the incident, so they see all of it, and they are
--     the only role that can change event configuration, assign roles, or
--     read the audit log and website enquiries.
--   * Ops Director is retired and replaced by Client — the event organiser.
--     A Client is read-only and scoped through event_access to the events
--     they are linked to, so one client can never see another's incidents.
--     By agreement they can see medical detail for their own event.
--
-- Removing an enum value means recreating the type, which means dropping
-- everything that depends on it first: both views, the role helpers, and
-- every policy that calls them.
-- =====================================================================
drop view public.incident_board;
drop view public.incident_timeline;
drop policy incidents_select        on public.incidents;
drop policy incidents_insert        on public.incidents;
drop policy incidents_update        on public.incidents;
drop policy incident_updates_select on public.incident_updates;
drop policy incident_updates_insert on public.incident_updates;
drop policy events_select           on public.events;
drop policy events_insert           on public.events;
drop policy events_update           on public.events;
drop policy audit_log_select        on public.audit_log;
drop policy profiles_update_self    on public.profiles;
drop policy enquiries_select        on public.enquiries;
drop policy enquiries_update        on public.enquiries;

drop function public.my_role();
drop function public.can_see_medical();
drop function public.can_write_incidents();

-- The role guard calls my_role(), which no longer exists at this point.
alter table public.profiles disable trigger profiles_guard_role;

alter table public.profiles         alter column role drop default;
alter table public.profiles         alter column role type text;
alter table public.incident_updates alter column author_role type text;

drop type public.staff_role;
create type public.staff_role as enum (
  'Incident Commander','Security Supervisor','Medical Lead','Client'
);

update public.profiles         set role = 'Client'        where role = 'Ops Director';
update public.incident_updates set author_role = 'Client' where author_role = 'Ops Director';

alter table public.profiles
  alter column role type public.staff_role using role::public.staff_role;
alter table public.profiles
  alter column role set default 'Security Supervisor';
alter table public.incident_updates
  alter column author_role type public.staff_role using author_role::public.staff_role;

-- Which events a client may see. Tide staff are not listed here; they see
-- everything.
create table public.event_access (
  event_id   uuid not null references public.events(id)   on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

alter table public.event_access enable row level security;

create function public.my_role()
returns public.staff_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create function public.can_see_medical()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() in
       ('Incident Commander','Medical Lead','Client'), false) $$;

create function public.can_write_incidents()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() in
       ('Incident Commander','Security Supervisor','Medical Lead'), false) $$;

create function public.can_see_event(p_event_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when public.my_role() = 'Client' then exists (
      select 1 from public.event_access ea
       where ea.event_id = p_event_id and ea.profile_id = auth.uid()
    )
    else auth.uid() is not null
  end
$$;

revoke all on function public.my_role()             from public, anon;
revoke all on function public.can_see_medical()     from public, anon;
revoke all on function public.can_write_incidents() from public, anon;
revoke all on function public.can_see_event(uuid)   from public, anon;
grant execute on function public.my_role()             to authenticated;
grant execute on function public.can_see_medical()     to authenticated;
grant execute on function public.can_write_incidents() to authenticated;
grant execute on function public.can_see_event(uuid)   to authenticated;

create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
     and public.my_role() is distinct from 'Incident Commander' then
    raise exception 'Only an Incident Commander can change a role assignment'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

alter table public.profiles enable trigger profiles_guard_role;

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.my_role() = 'Incident Commander')
  with check (id = auth.uid() or public.my_role() = 'Incident Commander');

create policy events_select on public.events
  for select to authenticated using (public.can_see_event(id));
create policy events_insert on public.events
  for insert to authenticated with check (public.my_role() = 'Incident Commander');
create policy events_update on public.events
  for update to authenticated
  using (public.my_role() = 'Incident Commander')
  with check (public.my_role() = 'Incident Commander');

create policy incidents_select on public.incidents
  for select to authenticated
  using (
    public.can_see_event(event_id)
    and (category <> 'Medical' or public.can_see_medical())
  );
create policy incidents_insert on public.incidents
  for insert to authenticated
  with check (public.can_write_incidents() and created_by = auth.uid());
create policy incidents_update on public.incidents
  for update to authenticated
  using (public.can_write_incidents() and (category <> 'Medical' or public.can_see_medical()))
  with check (public.can_write_incidents());

create policy incident_updates_select on public.incident_updates
  for select to authenticated
  using (
    public.can_see_event(event_id)
    and exists (
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

create policy audit_log_select on public.audit_log
  for select to authenticated using (public.my_role() = 'Incident Commander');

create policy enquiries_select on public.enquiries
  for select to authenticated using (public.my_role() = 'Incident Commander');
create policy enquiries_update on public.enquiries
  for update to authenticated
  using (public.my_role() = 'Incident Commander')
  with check (public.my_role() = 'Incident Commander');

create policy event_access_select on public.event_access
  for select to authenticated
  using (profile_id = auth.uid() or public.my_role() = 'Incident Commander');
create policy event_access_write on public.event_access
  for all to authenticated
  using (public.my_role() = 'Incident Commander')
  with check (public.my_role() = 'Incident Commander');

revoke all on public.event_access from anon, authenticated;
grant select, insert, update, delete on public.event_access to authenticated;

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
where auth.uid() is not null
  and public.can_see_event(i.event_id);

create view public.incident_timeline
with (security_invoker = true) as
select u.id, u.incident_id, u.event_id, u.at, u.author_id,
       u.author_name, u.author_role, u.entry_type, u.body
from public.incident_updates u;

revoke all on public.incident_board    from anon;
revoke all on public.incident_timeline from anon;
grant select on public.incident_board    to authenticated;
grant select on public.incident_timeline to authenticated;
