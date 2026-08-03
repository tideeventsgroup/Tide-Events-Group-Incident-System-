-- =====================================================================
-- Public website contact form.
--
-- Anyone may write an enquiry (that is the point of a contact form), but
-- only the roles with oversight may read them back. `anon` gets INSERT and
-- nothing else, so the table cannot be harvested with the publishable key.
-- =====================================================================
create table public.enquiries (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  request_type text not null check (request_type in ('consultation','brochure','general')),
  name         text not null check (length(name) between 1 and 120),
  organisation text check (length(organisation) <= 160),
  email        text not null check (length(email) between 3 and 200),
  phone        text check (length(phone) <= 40),
  event_type   text check (length(event_type) <= 160),
  message      text check (length(message) <= 4000),
  handled      boolean not null default false
);

create index enquiries_created_idx on public.enquiries (created_at desc);

alter table public.enquiries enable row level security;

create policy enquiries_insert on public.enquiries
  for insert to anon, authenticated with check (true);

create policy enquiries_select on public.enquiries
  for select to authenticated
  using (public.my_role() in ('Ops Director','Incident Commander'));

create policy enquiries_update on public.enquiries
  for update to authenticated
  using (public.my_role() in ('Ops Director','Incident Commander'))
  with check (public.my_role() in ('Ops Director','Incident Commander'));

revoke all on public.enquiries from anon, authenticated;
grant insert                 on public.enquiries to anon;
grant insert, select, update on public.enquiries to authenticated;
