-- =====================================================================
-- Tier 2 and 3: what the commercial products carry that this did not.
--
--   tasks              — WeTrack and 24/7 both split follow-up actions
--                        from incidents. Here it was one boolean.
--   incident_checklist — "automated response plans" per incident type.
--                        Append-only: a step is worked once, and
--                        un-ticking it would be a silent edit.
--   attachments        — Halo's first job for frontline capture is
--                        "photo, video and document uploads".
--   risks              — WeTrack's original product. A realised risk is
--                        the point of keeping a register, so an incident
--                        can point back at one.
--   lost_property      — its own module in every venue product.
--   public_reports     — "see something, say something". WeTrack does it
--                        by SMS; a QR code to a web form does the same
--                        job without a telco account.
--   is_exercise        — a training exercise is real data in a real audit
--                        trail, marked EXERCISE everywhere and kept out
--                        of live statistics.
-- =====================================================================

create type public.task_status   as enum ('Open','In progress','Blocked','Done');
create type public.task_priority as enum ('Low','Normal','High','Urgent');

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete restrict,
  incident_id   uuid references public.incidents(id) on delete restrict,
  title         text not null check (length(title) between 1 and 200),
  detail        text check (detail is null or length(detail) <= 2000),
  status        public.task_status   not null default 'Open',
  priority      public.task_priority not null default 'Normal',
  owner_id      uuid references public.profiles(id),
  owner_label   text,
  due_at        timestamptz,
  done_at       timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id),
  created_by_name text not null
);
create index tasks_event_idx on public.tasks (event_id, status, due_at);

create table public.incident_checklist (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete restrict,
  event_id    uuid not null references public.events(id)    on delete restrict,
  step_key    text not null check (length(step_key) between 1 and 80),
  at          timestamptz not null default now(),
  by_id       uuid references public.profiles(id),
  by_name     text not null,
  unique (incident_id, step_key)
);

create table public.attachments (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete restrict,
  incident_id uuid references public.incidents(id) on delete restrict,
  path        text not null unique,
  filename    text not null check (length(filename) between 1 and 200),
  mime_type   text not null,
  bytes       integer not null check (bytes > 0),
  caption     text check (caption is null or length(caption) <= 300),
  at          timestamptz not null default now(),
  by_id       uuid references public.profiles(id),
  by_name     text not null
);
create index attachments_incident_idx on public.attachments (incident_id, at);

create table public.risks (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete restrict,
  title       text not null check (length(title) between 1 and 200),
  category    public.incident_category not null default 'Other',
  likelihood  smallint not null default 3 check (likelihood between 1 and 5),
  impact      smallint not null default 3 check (impact     between 1 and 5),
  mitigation  text check (mitigation is null or length(mitigation) <= 2000),
  owner_label text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id),
  created_by_name text not null
);
create index risks_event_idx on public.risks (event_id, active);

alter table public.incidents
  add column risk_id uuid references public.risks(id);

create type public.property_state as enum ('Held','Claimed','Handed to police','Disposed');

create table public.lost_property (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete restrict,
  ref          text,
  description  text not null check (length(description) between 1 and 400),
  found_at     timestamptz not null default now(),
  found_location text,
  state        public.property_state not null default 'Held',
  holder       text,
  claimed_at   timestamptz,
  claimed_by_name text,
  claimed_contact text,
  notes        text check (notes is null or length(notes) <= 1000),
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id),
  created_by_name text not null
);
create index lost_property_idx on public.lost_property (event_id, state, found_at desc);

-- anon may INSERT and nothing else, so the public form cannot be turned
-- into a feed of who reported what by anyone holding the publishable key.
create table public.public_reports (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete restrict,
  at           timestamptz not null default now(),
  what         text not null check (length(what) between 3 and 2000),
  where_text   text check (where_text is null or length(where_text) <= 200),
  contact      text check (contact is null or length(contact) <= 120),
  triaged_at   timestamptz,
  triaged_by   uuid references public.profiles(id),
  incident_id  uuid references public.incidents(id) on delete restrict,
  dismissed    boolean not null default false
);
create index public_reports_idx on public.public_reports (event_id, at desc);

alter table public.events
  add column is_exercise boolean not null default false;

comment on column public.events.is_exercise is
  'A training exercise. Everything logged against it is real data in a real audit trail, but it is marked EXERCISE everywhere and excluded from live statistics.';

-- Pin position on the event's site plan, as a fraction of the image so it
-- survives the plan being re-uploaded at a different resolution.
alter table public.incidents
  add column map_x real check (map_x is null or (map_x >= 0 and map_x <= 1)),
  add column map_y real check (map_y is null or (map_y >= 0 and map_y <= 1));

-- ------------------------------------------------------------- triggers
create trigger checklist_append_only
  before update or delete on public.incident_checklist
  for each row execute function public.forbid_mutation();
create trigger attachments_no_delete
  before delete on public.attachments
  for each row execute function public.forbid_mutation();

create trigger tasks_audit    after insert or update on public.tasks
  for each row execute function public.write_audit();
create trigger risks_audit    after insert or update on public.risks
  for each row execute function public.write_audit();
create trigger property_audit after insert or update on public.lost_property
  for each row execute function public.write_audit();

create trigger tasks_ping          after insert or update on public.tasks
  for each row execute function public.emit_live_ping();
create trigger checklist_ping      after insert on public.incident_checklist
  for each row execute function public.emit_live_ping();
create trigger attachments_ping    after insert on public.attachments
  for each row execute function public.emit_live_ping();
create trigger public_reports_ping after insert on public.public_reports
  for each row execute function public.emit_live_ping();

create trigger tasks_reject_locked    before insert or update on public.tasks
  for each row execute function public.reject_when_locked();
create trigger property_reject_locked before insert or update on public.lost_property
  for each row execute function public.reject_when_locked();

create or replace function public.stamp_task_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Done' and old.status is distinct from 'Done' then
    new.done_at := now();
  elsif new.status <> 'Done' then
    new.done_at := null;
  end if;
  return new;
end $$;

create trigger tasks_stamp_done before update on public.tasks
  for each row execute function public.stamp_task_done();

create or replace function public.log_checklist_step()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.incident_updates
    (incident_id, event_id, author_id, author_name, author_role, entry_type, body)
  values (new.incident_id, new.event_id, new.by_id, new.by_name, public.my_role(),
          'update', 'Response plan step completed: ' || new.step_key || '.');
  return new;
end $$;

create trigger checklist_timeline after insert on public.incident_checklist
  for each row execute function public.log_checklist_step();

create or replace function public.log_attachment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.incident_id is not null then
    insert into public.incident_updates
      (incident_id, event_id, author_id, author_name, author_role, entry_type, body)
    values (new.incident_id, new.event_id, new.by_id, new.by_name, public.my_role(),
            'update', 'Evidence attached: ' || new.filename ||
            coalesce(' — ' || new.caption, '') || '.');
  end if;
  return new;
end $$;

create trigger attachments_timeline after insert on public.attachments
  for each row execute function public.log_attachment();

-- ------------------------------------------------------------------ RLS
alter table public.tasks              enable row level security;
alter table public.incident_checklist enable row level security;
alter table public.attachments        enable row level security;
alter table public.risks              enable row level security;
alter table public.lost_property      enable row level security;
alter table public.public_reports     enable row level security;

create policy tasks_select on public.tasks
  for select to authenticated using (public.can_see_event(event_id));
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (public.can_write_incidents() and created_by = auth.uid());
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.can_write_incidents() and public.can_see_event(event_id))
  with check (public.can_write_incidents());

-- The checklist follows the incident: a role that cannot read a medical
-- incident cannot read or tick its response plan either.
create policy checklist_select on public.incident_checklist
  for select to authenticated
  using (exists (
    select 1 from public.incidents i
     where i.id = incident_id
       and public.can_see_event(i.event_id)
       and (i.category <> 'Medical' or public.can_see_medical())
  ));
create policy checklist_insert on public.incident_checklist
  for insert to authenticated
  with check (by_id = auth.uid() and public.can_write_incidents() and exists (
    select 1 from public.incidents i
     where i.id = incident_id
       and (i.category <> 'Medical' or public.can_see_medical())
  ));

create policy attachments_select on public.attachments
  for select to authenticated
  using (public.can_see_event(event_id) and (incident_id is null or exists (
    select 1 from public.incidents i
     where i.id = incident_id
       and (i.category <> 'Medical' or public.can_see_medical())
  )));
create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (by_id = auth.uid() and public.can_write_incidents());

create policy risks_select on public.risks
  for select to authenticated using (public.can_see_event(event_id));
create policy risks_insert on public.risks
  for insert to authenticated
  with check (public.can_write_incidents() and created_by = auth.uid());
create policy risks_update on public.risks
  for update to authenticated
  using (public.can_write_incidents()) with check (public.can_write_incidents());

create policy property_select on public.lost_property
  for select to authenticated using (public.can_see_event(event_id));
create policy property_insert on public.lost_property
  for insert to authenticated
  with check (public.can_write_incidents() and created_by = auth.uid());
create policy property_update on public.lost_property
  for update to authenticated
  using (public.can_write_incidents()) with check (public.can_write_incidents());

create policy public_reports_insert on public.public_reports
  for insert to anon, authenticated with check (true);
create policy public_reports_select on public.public_reports
  for select to authenticated using (public.can_write_incidents());
create policy public_reports_update on public.public_reports
  for update to authenticated
  using (public.can_write_incidents()) with check (public.can_write_incidents());

revoke all on public.tasks              from anon, authenticated;
revoke all on public.incident_checklist from anon, authenticated;
revoke all on public.attachments        from anon, authenticated;
revoke all on public.risks              from anon, authenticated;
revoke all on public.lost_property      from anon, authenticated;
revoke all on public.public_reports     from anon, authenticated;

grant select, insert, update on public.tasks              to authenticated;
grant select, insert         on public.incident_checklist to authenticated;
grant select, insert         on public.attachments        to authenticated;
grant select, insert, update on public.risks              to authenticated;
grant select, insert, update on public.lost_property      to authenticated;
grant insert                 on public.public_reports     to anon;
grant select, insert, update on public.public_reports     to authenticated;

revoke all on function public.stamp_task_done()    from public, anon, authenticated;
revoke all on function public.log_checklist_step() from public, anon, authenticated;
revoke all on function public.log_attachment()     from public, anon, authenticated;

alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.public_reports;

-- ------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('evidence',  'evidence',  false, 15728640,
   array['image/jpeg','image/png','image/webp','image/heic','application/pdf','video/mp4']),
  ('siteplans', 'siteplans', false, 10485760,
   array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict (id) do nothing;

-- Evidence is readable exactly when its attachment row is. The subquery
-- runs as the querying user, so the medical restriction on `attachments`
-- decides, and a photo of a casualty cannot be fetched by a role that
-- cannot read the incident it belongs to.
create policy evidence_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidence'
    and exists (select 1 from public.attachments a where a.path = storage.objects.name)
  );

create policy evidence_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'evidence' and public.can_write_incidents());

-- Site plans are keyed by event id, so visibility follows client scoping.
create policy siteplan_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'siteplans'
    and public.can_see_event(nullif(split_part(name, '/', 1), '')::uuid)
  );

create policy siteplan_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'siteplans' and public.my_role() = 'Incident Commander');

create policy siteplan_replace on storage.objects
  for update to authenticated
  using (bucket_id = 'siteplans' and public.my_role() = 'Incident Commander')
  with check (bucket_id = 'siteplans' and public.my_role() = 'Incident Commander');

-- ------------------------------------------------- board view, rebuilt
drop view public.incident_board;

create view public.incident_board
with (security_invoker = false) as
select
  i.id, i.event_id, i.ref, i.seq, i.created_at, i.updated_at, i.created_by,
  i.category, i.severity, i.location, i.command_level, i.status,
  i.follow_up_required, i.closed_at, i.logged_offline, i.synced_at,
  i.acknowledged_at, i.on_scene_at,
  i.disposal, i.safeguarding_referral,
  i.riddor_reportable, i.riddor_reference, i.riddor_reported_at,
  i.risk_id, i.map_x, i.map_y,
  greatest(
    i.created_at,
    coalesce((select max(u.at) from public.incident_updates u
               where u.incident_id = i.id), i.created_at)
  ) as last_update_at,
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
  -- Type-specific fields can carry a casualty's name, age and presenting
  -- complaint, so the whole object is masked with the rest of the detail.
  case when i.category = 'Medical' and not public.can_see_medical()
       then '{}'::jsonb else i.details end     as details,
  cb.full_name  as created_by_name,
  cb.role       as created_by_role,
  clb.full_name as closed_by_name,
  e.name        as event_name,
  e.client      as event_client,
  e.locked      as event_locked,
  e.site_state  as event_site_state,
  e.is_exercise as event_is_exercise
from public.incidents i
join public.events e          on e.id  = i.event_id
left join public.profiles cb  on cb.id  = i.created_by
left join public.profiles clb on clb.id = i.closed_by
left join lateral (
  select count(*)::int                                   as assigned_count,
         string_agg(r.callsign, ' ' order by r.callsign)  as assigned_units,
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
