-- =====================================================================
-- Timeline entries are written by the database, not the client.
--
-- Two reasons:
--   1. Integrity. A status or command change cannot be made without the
--      matching timeline entry, whatever the client does.
--   2. Access. A Security Supervisor may log a Medical incident but is not
--      permitted to read it back, so they cannot write its opening entry
--      themselves. The trigger runs with definer rights and can.
-- =====================================================================

create or replace function public.seed_incident_timeline()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_role public.staff_role;
begin
  select full_name, role into v_name, v_role
    from public.profiles where id = new.created_by;

  insert into public.incident_updates
    (incident_id, event_id, at, author_id, author_name, author_role, entry_type, body)
  values (
    new.id, new.event_id, new.created_at, new.created_by,
    coalesce(v_name, 'System'), v_role, 'report', new.description
  );

  if new.severity in ('Major','Critical') then
    -- Carries the incident's own timestamp, not the wall clock, so a
    -- backdated record does not land out of order in the command log.
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

create trigger incidents_seed_timeline
  after insert on public.incidents
  for each row execute function public.seed_incident_timeline();

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

create trigger incidents_log_changes
  after update on public.incidents
  for each row execute function public.log_incident_changes();

-- The description is the opening statement of the record. Amending it after
-- the fact would be a silent edit, so it is fixed once written.
create or replace function public.freeze_incident_description()
returns trigger language plpgsql as $$
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

create trigger incidents_freeze_description
  before update on public.incidents
  for each row execute function public.freeze_incident_description();
