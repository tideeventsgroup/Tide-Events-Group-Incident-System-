-- =====================================================================
-- Audit fixes.
--
-- The update policies checked *who* was writing but not *where the row
-- was landing*, so a writer could move a unit, an action, a risk or a
-- property item from one event into another — carrying its history with
-- it, past a Client's event scoping, and into an event that may already
-- be locked. Reachable, and confirmed reachable before this fix.
--
-- Property references were also being counted in the browser, from the
-- rows that browser happened to have loaded, so two operators logging at
-- once both produced LP-004 and a reference stopped identifying an item.
-- =====================================================================

/*
 * A row belongs to the event it was raised against, permanently. Said in
 * a trigger as well as in the policies, so the guarantee does not depend
 * on remembering to repeat it in every future policy.
 */
create or replace function public.freeze_event_parent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.event_id is distinct from old.event_id then
    raise exception '% belongs to the event it was raised against and cannot be moved', tg_table_name
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

revoke all on function public.freeze_event_parent() from public, anon, authenticated;

create trigger resources_freeze_event      before update on public.resources
  for each row execute function public.freeze_event_parent();
create trigger tasks_freeze_event          before update on public.tasks
  for each row execute function public.freeze_event_parent();
create trigger risks_freeze_event          before update on public.risks
  for each row execute function public.freeze_event_parent();
create trigger property_freeze_event       before update on public.lost_property
  for each row execute function public.freeze_event_parent();
create trigger public_reports_freeze_event before update on public.public_reports
  for each row execute function public.freeze_event_parent();
create trigger incidents_freeze_event      before update on public.incidents
  for each row execute function public.freeze_event_parent();

drop policy resources_update      on public.resources;
drop policy tasks_update          on public.tasks;
drop policy risks_update          on public.risks;
drop policy property_update       on public.lost_property;
drop policy public_reports_update on public.public_reports;

create policy resources_update on public.resources
  for update to authenticated
  using (public.can_write_incidents() and public.can_see_event(event_id))
  with check (public.can_write_incidents() and public.can_see_event(event_id));

create policy tasks_update on public.tasks
  for update to authenticated
  using (public.can_write_incidents() and public.can_see_event(event_id))
  with check (public.can_write_incidents() and public.can_see_event(event_id));

create policy risks_update on public.risks
  for update to authenticated
  using (public.can_write_incidents() and public.can_see_event(event_id))
  with check (public.can_write_incidents() and public.can_see_event(event_id));

create policy property_update on public.lost_property
  for update to authenticated
  using (public.can_write_incidents() and public.can_see_event(event_id))
  with check (public.can_write_incidents() and public.can_see_event(event_id));

create policy public_reports_update on public.public_reports
  for update to authenticated
  using (public.can_write_incidents() and public.can_see_event(event_id))
  with check (public.can_write_incidents() and public.can_see_event(event_id));

-- A unit can only ever be committed to a call on its own event, and a row
-- that points at an incident must point at one from the same event.
create or replace function public.check_assignment_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_incident_id is not null
     and not exists (select 1 from public.incidents i
                      where i.id = new.assigned_incident_id
                        and i.event_id = new.event_id) then
    raise exception 'A unit can only be assigned to an incident on its own event'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create or replace function public.check_incident_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.incident_id is not null
     and not exists (select 1 from public.incidents i
                      where i.id = new.incident_id and i.event_id = new.event_id) then
    raise exception 'The linked incident belongs to a different event'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

revoke all on function public.check_assignment_event() from public, anon, authenticated;
revoke all on function public.check_incident_event()   from public, anon, authenticated;

create trigger resources_check_assignment
  before insert or update on public.resources
  for each row execute function public.check_assignment_event();

create trigger tasks_check_incident          before insert or update on public.tasks
  for each row execute function public.check_incident_event();
create trigger attachments_check_incident    before insert on public.attachments
  for each row execute function public.check_incident_event();
create trigger event_log_check_incident      before insert on public.event_log
  for each row execute function public.check_incident_event();
create trigger methane_check_incident        before insert on public.methane_reports
  for each row execute function public.check_incident_event();
create trigger public_reports_check_incident before update on public.public_reports
  for each row execute function public.check_incident_event();

-- ------------------------------------------- server-assigned references
create or replace function public.assign_property_ref()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select 'LP-' || lpad((coalesce(max(substring(ref from 4)::int), 0) + 1)::text, 3, '0')
    into new.ref
    from public.lost_property
   where event_id = new.event_id and ref ~ '^LP-[0-9]+$';
  return new;
end $$;

revoke all on function public.assign_property_ref() from public, anon, authenticated;

create trigger property_assign_ref
  before insert on public.lost_property
  for each row execute function public.assign_property_ref();

with numbered as (
  select id, event_id,
         'LP-' || lpad(row_number() over (partition by event_id order by found_at, id)::text, 3, '0') as new_ref
    from public.lost_property
)
update public.lost_property p set ref = n.new_ref
  from numbered n where n.id = p.id and p.ref is distinct from n.new_ref;
