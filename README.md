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
| `live_pings` | Content-free realtime signalling (see below) |

Two views sit in front of the tables and are what the app actually reads:

- **`incident_board`** — the status board. Runs with definer rights so *every* role sees
  the structured summary of a medical incident (category, severity, zone, status, command
  level) while the free text is masked in place for anyone outside Medical Lead / Ops
  Director. Carries its own `auth.uid()` guard.
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

| Role | Log & update | Close & sign off | Medical detail | Event config | Audit log |
| --- | --- | --- | --- | --- | --- |
| Incident Commander | ✅ | ✅ | — | ✅ | ✅ |
| Security Supervisor | ✅ | — | — | — | — |
| Medical Lead | ✅ | ✅ | ✅ | — | — |
| Ops Director | — | — | ✅ | ✅ | ✅ |

Medical restriction is per the GDPR brief: clinical narrative is visible to the **Medical
Lead and Ops Director only**. That includes the Incident Commander, who sees that a Major
medical incident is open in Zone C, with what resources and at what command level — but
not the casualty's condition.

A Security Supervisor can still *raise* a medical incident (they are often first on the
radio); they simply cannot read it back afterwards. The opening timeline entry is written
by a database trigger precisely so that this works.

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

| Minor | Moderate | Major | Critical |
| --- | --- | --- | --- |
| `#6B7280` | `#8C5A66` | `#A31B32` | `#C41E3A` (pulses) |

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
