# Tide Events Group

Two things in one React app:

1. **The public site** at `/` — the Tide Events Group marketing site (Home, Services,
   Martyn's Law, About, Contact), with a working Martyn's Law tier checker and a contact
   form that writes real enquiries to the database.
2. **The Incident Management System** at `/control` — live incident logging for event
   control rooms, built to be multi-event and multi-client from the first row and to hold
   up as audit evidence for licensing reviews, SAG debriefs and Martyn's Law.

Supabase (Postgres, Auth, Realtime) behind both. Staff reach the control room from the
**Control Room Login** button in the site footer.

## Routes

| Path | What |
| --- | --- |
| `/` | Home |
| `/services` | Services — six disciplines |
| `/martyns-law` | Martyn's Law explainer + interactive tier checker |
| `/about` | About |
| `/contact` | Contact form (writes to `enquiries`) |
| `/control` | Control room dashboard (sign-in required) |
| `/control/new` | Log a new incident |
| `/control/incident/:id` | Incident detail + timeline |
| `/control/log` | Event log — radio traffic, handovers, checks |
| `/control/methane` | M/ETHANE reports and major incident declaration |
| `/control/history` | History, search and audit export |
| `/control/map` | Site plan with incidents pinned on it |
| `/control/occupancy` | Entry counts against licensed capacity |
| `/control/planning` | Follow-up actions and the risk register |
| `/control/public` | Public reports awaiting triage, and lost property |
| `/control/debrief` | Post-event statistics and the debrief pack |
| `/control/settings` | Event settings, team, units, capacity, retention |
| `/report/:eventId` | Public "see something, say something" form — no account needed |

The two halves are deliberately different design languages: League Spartan and generous
whitespace out front, dense Arial and a severity-coded board in the control room. One is a
shopfront, the other is a tool used at 3am in a wind warning.

---

## Getting started

```bash
npm install
cp .env.example .env      # fill in your Supabase URL and publishable key
npm run dev
```

| Script | Does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check and production build |
| `npm run preview` | Serve the production build locally |
| `node --env-file=.env scripts/verify-access-controls.mjs` | Assert the role restrictions and audit guarantees against a live project |

The verification script writes real incident rows, and by design they cannot be deleted
afterwards. Point it at a scratch project, never a live event.

### Environment

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

The publishable key is safe in the browser. Every access decision is enforced in Postgres,
not in the interface.

---

## Data model

| Table | Purpose |
| --- | --- |
| `events` | Event name, client, venue, dates, zones, status, retention period |
| `incidents` | The incident record: category, severity, location, reporter, description, command level, status, resources, closure and sign-off |
| `incident_updates` | Append-only chronological timeline for each incident — who, what, when |
| `audit_log` | Machine-written field-level change history with actor and timestamp |
| `profiles` | Control room personnel and their role |
| `enquiries` | Public contact-form submissions — `anon` may INSERT only, never read |
| `event_access` | Which events a Client is linked to. Tide staff are not listed; they see everything |
| `methane_reports` | Append-only M/ETHANE snapshots, per JESIP |
| `event_log` | The radio loggist's running log — traffic that is not an incident |
| `resources` | The deployable units for an event — callsign, type, live state, and the call they are committed to |
| `site_state_log` | Append-only declarations: show stop, evacuation, invacuation, lockdown |
| `occupancy_counts` | Append-only entry counts, in and out, against licensed capacity |
| `tasks` | Follow-up actions with an owner, a due time and a status |
| `incident_checklist` | Append-only ticks against the response plan for an incident type |
| `attachments` | Photo, video and document evidence, in a private bucket |
| `risks` | The event's risk register; an incident can point back at the risk it realised |
| `lost_property` | Found items, who holds them, and who claimed them |
| `public_reports` | What the public sent in, awaiting triage. `anon` may INSERT only |
| `live_pings` | Content-free realtime signalling (see below) |

Two views sit in front of the tables and are what the app actually reads:

- **`incident_board`** — the status board. Runs with definer rights so *every* role sees
  the structured summary of a medical incident (category, severity, zone, status, command
  level) while the free text is masked in place for anyone without medical clearance. It
  also enforces client event scoping, and carries its own `auth.uid()` guard.
- **`incident_timeline`** — the narrative. Runs with invoker rights, so RLS decides what
  comes back and medical entry bodies never leave the server for other roles.

### Enum choices

Two enums follow Tide's operating model rather than the generic naming:

- **Command level** is `Ground Team (L1) → Event Control (L2) → FMIC (L3) → Police
  Scotland (L4)` — the ESMP tiering from the design reference, in place of
  Bronze/Silver/Gold. Same concept, Tide's language.
- **Severity** is `Minor / Moderate / Major / Critical`. The design mockups say
  "Significant" where this says "Moderate"; the spec's wording won. Renaming it is a
  one-line enum change if you'd rather match the mockups.

---

## Roles

| Role | Log & update | Dispatch units | Close & sign off | Medical detail | Event config | Audit log | Events visible |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Incident Commander | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | all |
| Security Supervisor | ✅ | ✅ | — | — | — | — | all |
| Medical Lead | ✅ | ✅ | ✅ | ✅ | — | — | all |
| Client | — | — | — | ✅ | — | — | **only theirs** |

The **Incident Commander** owns the incident, so they see all of it and are the only role
that can change event configuration, assign roles, or read the audit log and website
enquiries.

The **Client** is the event organiser. They are read-only and scoped through the
`event_access` table to the events they are linked to, so one client can never see
another's incidents. They can see medical detail for their own event by agreement — this
is health data, so make sure your contract and privacy notice actually cover sharing it
with the organiser.

The **Security Supervisor** is the only role without medical clearance. They can still
*raise* a medical incident (they are often first on the radio) but cannot read it back
afterwards. The opening timeline entry is written by a database trigger precisely so that
this works.

---

## Control room practice

Three things here come from how event control rooms actually run rather than from the
original brief.

### M/ETHANE

[JESIP](https://www.jesip.org.uk/joint-doctrine/early-stages-of-an-incident-m-ethane/) makes
M/ETHANE the common structure for passing major incident information, and expects control
rooms to prompt for it and take repeat updates as the picture changes. So reports are
**append-only snapshots**, not one editable record — the current state is read off the
latest report, and the history shows how understanding developed. Drop the M and the same
form is an ETHANE report, below the major incident threshold.

Whoever is on scene sends the report, so any role that can work an incident can send one.
Declaring a **major incident** is a command decision and is reserved to the Incident
Commander — enforced in the insert policy, not just greyed out in the interface. A report
linked to an incident writes itself onto that incident's timeline.

### Event log

Control rooms staff a radio loggist, and most of what they log is not an incident: gates
opening, shift handovers, wind readings, a contractor signing in. Forcing that through the
incident form slows the operator down and, worse, pollutes the incident statistics a
debrief depends on. The event log is the other half of the record — same append-only
treatment, typed and filterable, grouped by day.

### Review due

An open incident with no timeline entry for longer than its severity allows is flagged on
the board and counted in the tote. Thresholds are 15 minutes for Critical, 30 for Major, 60
for Moderate, 120 for Minor. Control rooms lose incidents to silence, not to disagreement.

### Units, assignment and response times

Every system built for this job puts **two** boards side by side, not one: the calls, and
the units. It is the same shape in police and fire CAD ([unit status
monitor](https://en.wikipedia.org/wiki/Computer-aided_dispatch), [PulsePoint's dispatched →
en route → on scene → cleared
lifecycle](https://www.pulsepoint.org/unit-status-legend)) and in the event products —
[Momentus WeTrack](https://gomomentus.com/incident-management-software) ("log issues, assign
owners, track progress"), [Controlled
Events](https://controlledevents.com/the-features-of-effective-incident-management/), and
[Halo](https://www.halosolutions.com/incident-management-system-buying-guide/), whose live
operational picture is defined as "incident status, priorities, **ownership**, and
location". A dispatcher's loop is *which call has nobody on it, and who is free to send*.

So an event has a roster of **units** — teams, vehicles, contractors — each with a callsign,
a type and a live state:

`Available → Assigned → En route → On scene → Clearing`, plus `Off duty`.

Many units may be committed to one call, which is how a real response runs. The board
answers both halves of the loop at a glance: an **UNASSIGNED** flag and count on the call
side, a unit status monitor grouped by state on the other. Dispatch happens on the board
itself — select a call, pick a free unit, move it along — because two clicks into a record
is not where a dispatcher works.

A database constraint keeps the two fields honest: a committed unit has a call, a free unit
does not, so the counts cannot drift. Every assignment and state change is written to that
incident's timeline **by the database**, with definer rights, so a Security Supervisor can
commit a unit to a medical incident they are not permitted to read back.

Two response milestones come out of it and are frozen once set, because they are what a
debrief and a licensing review will ask about:

- **Acknowledged** — when control took ownership, set by the first unit committed.
- **First unit on scene** — set when any assigned unit reports on scene.

Unit callsigns are **not** medical-restricted. Which team is committed to a call is dispatch
information, not clinical information, and a control room where one role cannot see that a
medic is already en route is a worse control room. The free-text `resources_deployed` note —
kit, external services, mutual aid — stays restricted with the rest of the medical detail.

Signing a unit on or off is a dispatcher's action rather than a configuration change, so
every role that can work an incident can do it. Units are never deleted; one that has been
committed to an incident is part of that incident's record, so it goes Off duty instead.

### The form matches the incident

Every incident used to be one free-text description whatever its category, which makes a
record that reads fine and counts for nothing. The type-specific fields live in
`src/lib/incidentFields.ts` — versioned in the client, stored as `jsonb`, audited on every
change, and masked wholesale on a medical incident for roles without clearance.

What they ask for is the part that matters:

- **Security** — action taken, steward's SIA badge number, police reference, **body-worn video
  reference**. Footage is routinely overwritten before anyone thinks to ask for it, so the
  form asks at the time.
- **Medical** — presenting complaint, treatment, clinician, ambulance reference, receiving
  hospital, patient report form number. The clinical record stays with the medical provider;
  this is the pointer to it.
- **Missing Person** — a category of its own, because a lost child is the highest-anxiety
  incident at a family event and has its own procedure and its own clock. Description,
  last seen, reunification time, whether police were notified.
- **CT-Suspicious** — the HOT assessment (Hidden, Obviously suspicious, Typical) in the
  language the police and the Martyn's Law guidance use, plus the cordon distance set.
- **Weather** — mean and gust readings with their source, and which action threshold was
  reached.

Each type also carries a **response plan** — the steps a control room is expected to have
worked. Ticking one is append-only and writes to the incident timeline, so the plan is
evidence rather than a to-do list, and a step cannot be un-ticked to make the record look
tidier afterwards. An unworked step is not a failure; it is a fact the debrief should see.

### Statutory reporting

**RIDDOR.** A member of the public taken directly from the scene to hospital for treatment
is reportable to HSE *regardless of how trivial the injury proves*, the report is due
without delay with the online submission inside 10 days, and the duty falls on the person in
control of the premises ([HSE](https://www.hse.gov.uk/riddor/reportable-incidents.htm)).
The trigger is the casualty's **disposal**, which the control room already knows at the time
— so recording "conveyed to hospital" raises the flag on the spot rather than leaving it to
someone's memory a fortnight later. Once the submission is marked sent, its timestamp is
frozen. History has a one-click RIDDOR view, and the debrief pack lists every reportable
incident with its submission status.

**Safeguarding.** A referral flag, on the record and in the timeline, for anything that has
to go further than this system.

### Site state

HSE and the Purple Guide treat a controlled halt to a performance as a command action in its
own right. The strongest thing this system could previously record was a METHANE report, so
the event now carries a **site state** — Normal, Show stop, Evacuation, Invacuation,
Lockdown — declared from the board's status line. Declaring one is reserved to the Incident
Commander in the insert policy, needs a reason on the record, and is append-only: the current
state is read off the latest declaration and the log shows how the night went. Every open
incident is untouched by it, because this is the site's state, not theirs.

### Occupancy

The [SGSA](https://sgsa.org.uk/physical-factors/communications-and-control/control-room/)
expects entry counts every fifteen minutes from gate opening through to half an hour after
the start, and at many events it is a licensing condition. Each entry is a **delta** — in and
out since the last count — so the running total is derived rather than edited, a mistyped
reading is corrected by the next one instead of by rewriting history, and the board flags a
count that is overdue.

### Actions, risks, property and the public

- **Actions** are follow-ups with an owner, a due time and a status, kept separate from
  incidents so a barrier inspection booked for tomorrow never becomes an incident statistic.
- **The risk register** is scored likelihood × impact, and an incident can point back at the
  risk it realised — which is the question a Safety Advisory Group asks afterwards.
- **Lost property** is logged, held, and claimed against a named person.
- **Public reports** are the "see something, say something" channel. WeTrack does this over
  SMS; a QR code pointing at `/report/:eventId` does the same job without a telco account,
  works for anyone on site with a phone and no account, and `anon` holds INSERT on the table
  and nothing else — so reports can be submitted by anybody and read back by nobody. The
  public page deliberately says nothing about what is already happening on site.

### Evidence

Photographs, video and documents attach to an incident. The bucket is private and its read
policy defers to the `attachments` table, which carries the same medical restriction as the
incident — so a photograph of a casualty cannot be fetched by a role that is not permitted
to read the incident it belongs to. URLs are signed and expire, so a link pasted into a group
chat does not become a permanent hole in the restriction. Files cannot be deleted; evidence
that can be removed is not evidence.

### The debrief pack

`/control/debrief` is the post-event report: incidents by category, severity, zone and hour;
median time to acknowledge, to first unit on scene and to close; review-threshold breaches;
conveyances, RIDDOR status and safeguarding referrals; site states declared; peak occupancy;
outstanding follow-ups and actions. Exportable as a PDF you can put in front of a SAG.
Everything on it is derived from the record, so the pack cannot say something the audit
trail contradicts.

### Exercise mode

An event can be marked a **training exercise**. Everything logged against it is a real record
in a real audit trail — that is the point of rehearsing on the actual tool — but the board,
the exports and the debrief pack all mark it EXERCISE, so it can never be mistaken for a live
event afterwards.

### The board is a console

`/control` is laid out as a dispatch screen rather than a dashboard: a status line, a tote
board of counts, a priority-ordered call queue filling the screen, and a rail carrying the
selected call, the unit status monitor, sector status and the command log.

- **Priority, not just severity.** Critical/Major/Moderate/Minor also read as **P1–P4**,
  because that is what goes over the radio. The queue's default order is dispatch order —
  highest priority first, then longest waiting.
- **Running clocks.** Each live call counts up rather than showing the time it came in. The
  clock brightens at three quarters of that incident's review threshold and turns crimson
  once it passes, so an incident going quiet is visible before anyone asks.
- **Preview and dispatch, don't navigate.** Selecting a call opens it in the rail, with its
  committed units and the controls to move them along. A control room that loses the board
  to read one record has lost the board. Opening the full record is a deliberate second
  action.
- **A status line, not an alert.** It is always there — event status, day, command tier
  engaged, units committed — and turns crimson with what is wrong, rather than appearing
  only when something is. Its absence never has to be noticed.
- **Keyboard first.** `↑`/`↓` (or `j`/`k`) walk the queue, `↵` opens the selected call, `/`
  jumps to the filter — and `↓` from the filter box steps straight into the results — and
  `N` starts a new incident. A focused chip keeps its own `↵`.
- **Restricted is not absent.** The deployment note reads *restricted*, never *none
  recorded*, for a role without medical clearance — those are different facts and a board
  must not conflate them.

The console is dark and the rest of the tool is not. That split is deliberate: the board is
the screen that stays open all night, so it throws less light at the operators and only the
things worth looking at are bright. Forms, records and exports are paperwork — read up
close, and printed — so they stay on the light surface.

---

## Audit integrity

Nothing in the record can be deleted or quietly rewritten:

- `DELETE` is revoked on every table and blocked by trigger for good measure.
- `incident_updates` and `audit_log` are append-only — `UPDATE` is revoked, and a trigger
  raises if anything gets through.
- The opening description, `created_at`, `created_by` and the incident reference are
  frozen after insert. Corrections go on the timeline, where they are attributed.
- The response milestones — acknowledged, first unit on scene — are frozen once the clock
  has stopped, so response times cannot be tidied up after the event.
- Every status, severity, command-level, resource, location and closure change is written
  to the timeline **by the database**, so the entry cannot be skipped by a client.
- `audit_log` additionally records a field-level `from`/`to` diff with the actor's name,
  role and timestamp.
- Ending an event sets `locked`, after which the whole event's records are read-only.

## Installable (PWA)

The control room installs to a tablet or phone home screen. `start_url` is `/control`,
because the thing worth installing is the tool, not the shopfront — but `scope` stays at
the root so the public site is still reachable from inside the installed app. Android
shortcuts jump straight to **Log new incident** and the **Incident board**.

The manifest is **not** linked from `index.html`. For a single-page app that link appears
on every page, so a member of the public reading about Martyn's Law could be offered an
install of an incident logging tool. It is attached at runtime, only inside `/control`.

### What offline does

- **Caches the app shell**, so the tool opens on a dead signal instead of a browser error.
- **Never caches incident data.** Every Supabase request is `NetworkOnly`, deliberately. A
  control room acting on a stale board is more dangerous than one that knows it is
  offline, so the data either comes from the server or does not come at all.
- **Caches event configuration** — names, zones, dates — in `localStorage`, so an operator
  who reloads on a dead signal can still open the form and pick the right zone.
  Configuration going slightly stale is harmless; an out-of-date board is not.
- **Queues incidents raised while offline** in IndexedDB, and drains them automatically the
  moment the connection returns.

### Offline capture, and why the record still holds up

The board is not a cache, so a queued incident is not a provisional record that later gets
rewritten — it is an insert that has not happened yet. Three things make that safe:

- **Idempotency.** The queue holds the incident's primary key, generated on the device. A
  retried flush collides on that key and is treated as already sent, so a half-completed
  sync cannot produce a duplicate incident on the board.
- **Honest timestamps.** `created_at` is the operator's device clock — when it happened —
  and `synced_at` is server-authoritative. A database trigger refuses a `created_at` in the
  future, sets `logged_offline`, and writes a timeline entry naming both times and the
  delay between them. Nothing presents a client clock as though the server saw it live.
- **Visible state.** Queued incidents appear on the board marked *not yet on the board*,
  with a note that they are held on that device only and carry no incident reference until
  they sync. They are never mixed into the live counts.

References are allocated in the order the server receives incidents, so an incident raised
offline can carry a later reference than one raised after it. That is why the gap is
recorded rather than hidden.

If the server refuses a queued incident outright — a locked event, or a permission the
role no longer holds — it is dropped from the queue and surfaced on the board with the
reason, rather than retried forever or silently discarded.

Updates are offered, never forced. A new build shows a "reload" prompt rather than
refreshing the page underneath somebody halfway through logging a casualty; a background
check runs hourly for tablets that are never closed.

## Realtime

Every client subscribes to `live_pings` — a table carrying only an event id, an incident
id and a change kind, never any content. Any insert or update fans out a ping and each
client refetches the board.

This is deliberate. Subscribing to `incidents` directly would mean a Security Supervisor
never receives events for medical incidents (RLS correctly filters them out of the
replication stream), so their board would silently go stale. The content-free ping lets
every role stay in sync without a byte of medical data crossing the wire to someone who
should not have it. A 30-second poll backs it up if the socket drops.

## Design

Arial throughout. Primary Black `#333333`, Tide Teal `#25BEC8`, White, Light Accent
`#FFF5F1`. Teal is reserved for headers, calls to action and active states.

Severity uses a separate neutral-to-crimson escalation scale so it never competes with the
brand accent, and contains no orange:

| | Minor | Moderate | Major | Critical |
| --- | --- | --- | --- | --- |
| Light surface | `#6B7280` | `#8C5A66` | `#A31B32` | `#C41E3A` (pulses) |
| Console | `#9AA3B2` | `#C08A97` | `#E0455E` | `#FF5069` (pulses) |

The console keeps the same hues and raises luminance, so each step still clears contrast
against a near-black panel.

Numerals on the console are Arial with `tabular-nums` rather than a monospace face. Digits
line up column to column, which is the point of a dispatch readout, without introducing a
second typeface.

## GDPR & retention

- Medical descriptions are treated as personal health data and restricted at the database.
- Each event carries a `retention_months` period (default 36 — ESMP minimum) plus free-text
  retention notes, surfaced under Event Settings with the computed review date. The flag is
  in place for a retention policy to act on; nothing is purged automatically yet.
- Exports mark restricted content as `RESTRICTED` rather than dropping it, so record counts
  stay accurate for audit.
- CSV exports are escaped against spreadsheet formula injection.

---

## Deployment

Vercel. `vercel.json` rewrites all paths to `index.html` for client-side routing.

`.env.production` is committed on purpose: a Supabase *publishable* key is designed to sit
in a browser bundle, and every access decision is made by row level security in Postgres
rather than by keeping that key secret. Committing it means the repo builds and deploys
anywhere with no extra configuration. Point it at a different project by editing that file,
or override it with real Vercel environment variables if you prefer. Never put the
**service role** key anywhere near this repo.

Database migrations are in `supabase/migrations/`, applied in order.

### Outstanding

- **Leaked password protection** is off in Supabase Auth. Turn it on under
  Authentication → Policies once you have set real passwords.
- Seeded accounts ship with a shared provisional password. Rotate it before the first
  live event.

### Not built, and deliberately

- **Push notifications to a closed app.** Alerting is in — a P1 arriving or a site state
  being declared raises a desktop notification and an audible tone — but those are
  *foreground* notifications, firing while the tool is open. Waking a phone with the app
  closed needs a push subscription, a VAPID key pair and a server to send from. That is a
  deployment decision with secrets attached, so it is not faked here.
- **SMS reporting.** The public channel is a web form behind a QR code rather than a text
  number, because a shortcode needs a telco account. It does the same job for anyone with a
  phone.
- **CCTV, access control and radio integrations.** 24/7 Software lists these; they need the
  venue's own systems and credentials, and there is nothing honest to build without them.
- **Automatic retention purging.** The retention period is recorded and surfaced; nothing
  deletes on it yet.
