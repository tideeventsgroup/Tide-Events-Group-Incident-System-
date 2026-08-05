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
| `/control/settings` | Event settings, team, retention |

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

| Role | Log & update | Close & sign off | Medical detail | Event config | Audit log | Events visible |
| --- | --- | --- | --- | --- | --- | --- |
| Incident Commander | ✅ | ✅ | ✅ | ✅ | ✅ | all |
| Security Supervisor | ✅ | — | — | — | — | all |
| Medical Lead | ✅ | ✅ | ✅ | — | — | all |
| Client | — | — | ✅ | — | — | **only theirs** |

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

### The board is a console

`/control` is laid out as a dispatch screen rather than a dashboard: an alert strip, a tote
board of counts, a priority-ordered call queue filling the screen, and a rail carrying the
selected call, sector status and the command log.

- **Priority, not just severity.** Critical/Major/Moderate/Minor also read as **P1–P4**,
  because that is what goes over the radio. The queue's default order is dispatch order —
  highest priority first, then longest waiting.
- **Running clocks.** Each live call counts up rather than showing the time it came in. The
  clock brightens at three quarters of that incident's review threshold and turns crimson
  once it passes, so an incident going quiet is visible before anyone asks.
- **Preview, don't navigate.** Selecting a call opens it in the rail. A control room that
  loses the board to read one record has lost the board. Opening the full record is a
  deliberate second action.
- **Keyboard first.** `↑`/`↓` (or `j`/`k`) walk the queue, `↵` opens the selected call, `/`
  jumps to the filter — and `↓` from the filter box steps straight into the results — and
  `N` starts a new incident. A focused chip keeps its own `↵`.
- **No resource means no resource.** The flag and its count exclude incidents whose
  deployment is masked by medical restriction, because "restricted" and "nothing sent" are
  different facts and a board must not conflate them.

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
