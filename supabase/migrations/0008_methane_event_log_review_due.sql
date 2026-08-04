-- =====================================================================
-- Three additions drawn from how event control rooms actually run.
--
--  1. M/ETHANE — the JESIP structure for passing major incident
--     information. Control rooms are expected to prompt for it and take
--     repeat updates, so reports are append-only snapshots rather than one
--     editable record. Current state is read off the latest report.
--  2. event_log — the radio loggist's running log. Most control room
--     traffic is not an incident and should not be forced to become one,
--     or the incident statistics a debrief relies on stop meaning anything.
--  3. last_update_at on the board, so an incident nobody has touched can be
--     surfaced before it is forgotten. Control rooms lose incidents to
--     silence, not to disagreement.
-- =====================================================================

create type public.methane_report_type as enum ('declaration','update','stand_down');

create table public.methane_reports (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete restrict,
  incident_id   uuid references public.incidents(id) on delete restrict,
  seq           integer not null,
  at            timestamptz not null default now(),
  author_id     uuid references public.profiles(id),
  author_name   text not null,
  author_role   public.staff_role,
  report_type   public.methane_report_type not null default 'declaration',

  major_incident      boolean not null default false,
  exact_location      text not null,
  incident_type       text not null,
  hazards             text,
  access              text,
  casualties          text,
  emergency_services  text,
  notes               text
);

create index methane_event_idx on public.methane_reports (event_id, at desc);

create or replace function public.assign_methane_seq()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select coalesce(max(seq), 0) + 1 into new.seq
    from public.methane_reports where event_id = new.event_id;
  return new;
end $$;

create trigger methane_assign_seq
  before insert on public.methane_reports
  for each row execute function public.assign_methane_seq();

create or replace function public.methane_to_timeline()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_label text;
begin
  v_label := case new.report_type
               when 'declaration' then
                 case when new.major_incident
                      then 'MAJOR INCIDENT DECLARED'
                      else 'ETHANE report sent' end
               when 'update'     then 'METHANE update sent'
               else 'Major incident STOOD DOWN' end;

  if new.incident_id is not null then
    insert into public.incident_updates
      (incident_id, event_id, at, author_id, author_name, author_role, entry_type, body)
    values (
      new.incident_id, new.event_id, new.at, new.author_id,
      new.author_name, new.author_role, 'command',
      v_label || ' (METHANE ' || new.seq || '). Location: ' || new.exact_location ||
      '. Type: ' || new.incident_type ||
      coalesce('. Casualties: ' || nullif(new.casualties, ''), '') ||
      coalesce('. Services: ' || nullif(new.emergency_services, ''), '') || '.'
    );
  end if;
  return new;
end $$;

create trigger methane_timeline
  after insert on public.methane_reports
  for each row execute function public.methane_to_timeline();

create trigger methane_ping
  after insert on public.methane_reports
  for each row execute function public.emit_live_ping();

create trigger methane_append_only
  before update or delete on public.methane_reports
  for each row execute function public.forbid_mutation();

-- ------------------------------------------------------------ event log
create table public.event_log (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete restrict,
  incident_id uuid references public.incidents(id) on delete restrict,
  at          timestamptz not null default now(),
  author_id   uuid references public.profiles(id),
  author_name text not null,
  author_role public.staff_role,
  entry_type  text not null default 'radio'
                check (entry_type in ('radio','note','handover','staffing','weather','check','visitor')),
  body        text not null check (length(body) between 1 and 4000)
);

create index event_log_idx on public.event_log (event_id, at desc);

create trigger event_log_ping
  after insert on public.event_log
  for each row execute function public.emit_live_ping();

create trigger event_log_append_only
  before update or delete on public.event_log
  for each row execute function public.forbid_mutation();

-- ------------------------------------------------------------------ RLS
alter table public.methane_reports enable row level security;
alter table public.event_log       enable row level security;

create policy methane_select on public.methane_reports
  for select to authenticated using (public.can_see_event(event_id));
-- Anyone who can work an incident may send an ETHANE, because whoever is on
-- scene sends it. Declaring a MAJOR incident is a command decision and is
-- reserved to the Incident Commander.
create policy methane_insert on public.methane_reports
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.can_write_incidents()
    and (major_incident = false or public.my_role() = 'Incident Commander')
  );

create policy event_log_select on public.event_log
  for select to authenticated using (public.can_see_event(event_id));
create policy event_log_insert on public.event_log
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_write_incidents());

revoke all on public.methane_reports from anon, authenticated;
revoke all on public.event_log       from anon, authenticated;
grant select, insert on public.methane_reports to authenticated;
grant select, insert on public.event_log       to authenticated;

-- --------------------------------------------- last touch, for review-due
drop view public.incident_board;

create view public.incident_board
with (security_invoker = false) as
select
  i.id, i.event_id, i.ref, i.seq, i.created_at, i.updated_at, i.created_by,
  i.category, i.severity, i.location, i.command_level, i.status,
  i.follow_up_required, i.closed_at, i.logged_offline, i.synced_at,
  greatest(
    i.created_at,
    coalesce((select max(u.at) from public.incident_updates u
               where u.incident_id = i.id), i.created_at)
  ) as last_update_at,
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

revoke all on public.incident_board from anon;
grant select on public.incident_board to authenticated;

alter publication supabase_realtime add table public.methane_reports;
alter publication supabase_realtime add table public.event_log;
