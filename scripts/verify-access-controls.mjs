/**
 * Verifies the access controls and audit guarantees of the incident system
 * against a live Supabase project.
 *
 * It signs in as all four roles and asserts, among other things, that medical
 * free text never reaches a role that is not cleared for it — over
 * REST or realtime — and that nothing in the record can be deleted or
 * silently rewritten.
 *
 * NOTE: this writes real incident rows and they cannot be deleted afterwards
 * (that is the point). Run it against a scratch project, not a live event.
 *
 *   node --env-file=.env scripts/verify-access-controls.mjs
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.VITE_SUPABASE_ANON_KEY
const PW = process.env.TIDE_TEST_PASSWORD ?? 'TideControl2026!'

if (!URL || !KEY) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (try --env-file=.env).')
  process.exit(1)
}

const pass = []
const fail = []
const check = (name, ok, extra = '') =>
  (ok ? pass : fail).push(`${ok ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`)

async function login(email) {
  const c = createClient(URL, KEY, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: PW })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return { client: c, uid: data.user.id }
}

const ic = await login('kyle.robb@tideeventsgroup.co.uk')
const sec = await login('security@tideeventsgroup.co.uk')
const med = await login('medical@tideeventsgroup.co.uk')
const client = await login('client@tideeventsgroup.co.uk')
check('all four roles sign in', true)

const { data: events } = await ic.client.from('events').select('*').eq('status', 'Live')
const ev = events[0]
check('live event visible', !!ev, ev?.name)

// ---------------------------------------------------------------- 1. logging
const { data: sc, error: scErr } = await sec.client
  .from('incidents')
  .insert({
    event_id: ev.id,
    created_by: sec.uid,
    category: 'Security',
    severity: 'Moderate',
    location: 'Zone A — Entrance / Market',
    reported_by: 'M. Boyle — Sierra 1',
    description: 'Counterfeit ticket attempt at Zone A entrance; individual verbally aggressive.',
    command_level: 'Ground Team (L1)',
  })
  .select('id, ref, seq')
  .maybeSingle()
check('Security Supervisor logs a security incident', !scErr && !!sc, scErr?.message ?? sc?.ref)

// ------------------------------------------------- 2. server-side timeline
const { data: tl } = await sec.client
  .from('incident_timeline')
  .select('*')
  .eq('incident_id', sc.id)
  .order('at')
check(
  'opening report entry written by trigger',
  tl?.[0]?.entry_type === 'report' && tl[0].body.includes('Counterfeit'),
  `${tl?.length} entries`,
)

// ------------------------------------------------- 3. medical restriction
const { error: miErr } = await sec.client
  .from('incidents')
  .insert({
    event_id: ev.id,
    created_by: sec.uid,
    category: 'Medical',
    severity: 'Major',
    location: 'Zone C — Entertainment / Bar',
    reported_by: 'J. Kerr — Zone Steward',
    description: 'Casualty down, breathing difficulty, suspected cardiac. Diabetic, on insulin.',
    command_level: 'Event Control (L2)',
  })
check(
  'Security Supervisor may LOG a medical incident (no read-back)',
  !miErr,
  miErr ? `err: ${miErr.message}` : 'insert accepted',
)

const { error: miReadBackErr } = await sec.client
  .from('incidents')
  .insert({
    event_id: ev.id,
    created_by: sec.uid,
    category: 'Medical',
    severity: 'Minor',
    location: 'Medical Point',
    reported_by: 'M. Boyle',
    description: 'Should be rejected because of the read-back.',
    command_level: 'Ground Team (L1)',
  })
  .select('id')
check(
  'requesting the row back on a medical insert is refused',
  !!miReadBackErr,
  miReadBackErr?.message?.slice(0, 60),
)

const { data: medRows } = await med.client
  .from('incidents')
  .select('id, description')
  .eq('category', 'Medical')
  .eq('event_id', ev.id)
const medId = medRows?.[0]?.id
check(
  'Medical Lead reads full medical description',
  !!medId && medRows[0].description.includes('insulin'),
)

const { data: secBase } = await sec.client
  .from('incidents')
  .select('id')
  .eq('category', 'Medical')
  .eq('event_id', ev.id)
check(
  'Security Supervisor blocked from medical rows on base table',
  (secBase ?? []).length === 0,
  `${secBase?.length ?? 0} rows returned`,
)

const { data: secBoard } = await sec.client
  .from('incident_board')
  .select('*')
  .eq('id', medId)
  .maybeSingle()
check(
  'Security Supervisor sees medical row on board with detail masked',
  !!secBoard &&
    secBoard.restricted === true &&
    secBoard.description === null &&
    secBoard.severity === 'Major' &&
    secBoard.status === 'Open',
  secBoard ? `severity=${secBoard.severity} description=${secBoard.description}` : 'no row',
)

const { data: secTl } = await sec.client
  .from('incident_timeline')
  .select('*')
  .eq('incident_id', medId)
check(
  'Security Supervisor gets no medical timeline entries',
  (secTl ?? []).length === 0,
  `${secTl?.length ?? 0} entries`,
)

const { data: icBoard } = await ic.client
  .from('incident_board')
  .select('restricted, description')
  .eq('id', medId)
  .maybeSingle()
check(
  'Incident Commander now sees full medical detail',
  icBoard?.restricted === false && (icBoard?.description ?? '').includes('insulin'),
)

const { data: clientBoard } = await client.client
  .from('incident_board')
  .select('restricted, description')
  .eq('id', medId)
  .maybeSingle()
check(
  'Client sees medical detail for their own event',
  clientBoard?.restricted === false && (clientBoard?.description ?? '').includes('insulin'),
)

// -------------------------------------------------- 4. change logging
await ic.client.from('incidents').update({ status: 'Monitoring' }).eq('id', sc.id)
await ic.client
  .from('incidents')
  .update({ command_level: 'Event Control (L2)', severity: 'Major' })
  .eq('id', sc.id)
const { data: tl2 } = await ic.client
  .from('incident_timeline')
  .select('entry_type, body')
  .eq('incident_id', sc.id)
  .order('at')
const types = tl2.map((t) => t.entry_type)
check(
  'status / severity / command changes all logged to timeline',
  types.includes('status') && types.includes('severity') && types.includes('command'),
  types.join(','),
)

// ------------------------------------------------- 5. append-only guards
const { error: editErr } = await ic.client
  .from('incident_updates')
  .update({ body: 'tampered' })
  .eq('incident_id', sc.id)
const { data: tlIntact } = await ic.client
  .from('incident_timeline')
  .select('body')
  .eq('incident_id', sc.id)
check(
  'timeline entries cannot be edited',
  !!editErr && !tlIntact.some((t) => t.body === 'tampered'),
  editErr?.message?.slice(0, 60),
)

const { error: delErr, count: delCount } = await ic.client
  .from('incidents')
  .delete({ count: 'exact' })
  .eq('id', sc.id)
check(
  'incidents cannot be deleted',
  !!delErr || delCount === 0,
  delErr ? delErr.message.slice(0, 60) : `rows deleted: ${delCount}`,
)

const { error: descErr } = await ic.client
  .from('incidents')
  .update({ description: 'rewritten history' })
  .eq('id', sc.id)
check('opening description cannot be silently edited', !!descErr, descErr?.message?.slice(0, 70))

// ------------------------------------------------------- 6. write guards
const { error: clientWriteErr } = await client.client
  .from('incidents')
  .update({ status: 'Open' })
  .eq('id', sc.id)
  .select()
const { data: clientAfter } = await client.client
  .from('incident_board')
  .select('status')
  .eq('id', sc.id)
  .maybeSingle()
check(
  'Client is read-only on incidents',
  clientAfter?.status === 'Monitoring',
  `status still ${clientAfter?.status}${clientWriteErr ? `, err: ${clientWriteErr.message.slice(0, 40)}` : ''}`,
)

// ----------------------------------------------------------- 7. sign-off
const { error: closeErr } = await ic.client
  .from('incidents')
  .update({
    status: 'Resolved',
    outcome: 'Individual refused entry and escorted from site. No police involvement required.',
    closed_by: ic.uid,
    closed_at: new Date().toISOString(),
  })
  .eq('id', sc.id)
const { data: closed } = await ic.client
  .from('incident_board')
  .select('status, closed_by_name, outcome')
  .eq('id', sc.id)
  .maybeSingle()
check(
  'close & sign-off records who and when',
  !closeErr && closed?.status === 'Resolved' && closed?.closed_by_name === 'K. Robb',
  closeErr?.message ?? `closed by ${closed?.closed_by_name}`,
)

const { data: tl3 } = await ic.client
  .from('incident_timeline')
  .select('entry_type, body')
  .eq('incident_id', sc.id)
  .eq('entry_type', 'closure')
check('closure appended to timeline', tl3?.length === 1, tl3?.[0]?.body?.slice(0, 60))

// -------------------------------------------------------- 8. audit trail
const { data: auditIc } = await ic.client
  .from('audit_log')
  .select('*')
  .eq('entity_id', sc.id)
  .order('at')
check(
  'audit log captured insert + each update with actor',
  (auditIc?.length ?? 0) >= 4 && auditIc.every((a) => a.actor_name),
  `${auditIc?.length} entries, actors: ${[...new Set(auditIc?.map((a) => a.actor_name))].join('/')}`,
)

const { data: auditSec } = await sec.client.from('audit_log').select('id').limit(5)
check(
  'audit log not readable by Security Supervisor',
  (auditSec ?? []).length === 0,
  `${auditSec?.length ?? 0} rows`,
)

// ------------------------------------------------ 8b. client event scoping
const { data: clientEvents } = await client.client.from('events').select('name')
const { data: staffEvents } = await ic.client.from('events').select('name')
check(
  'Client sees only the events they are linked to',
  (clientEvents ?? []).length === 1 && clientEvents[0].name.includes('2026'),
  `client: ${(clientEvents ?? []).map((e) => e.name).join(', ')} | staff: ${(staffEvents ?? []).length} events`,
)

const { data: clientBoardAll } = await client.client.from('incident_board').select('event_name')
check(
  'Client board carries no other event',
  (clientBoardAll ?? []).every((r) => r.event_name.includes('2026')),
  `${new Set((clientBoardAll ?? []).map((r) => r.event_name)).size} event(s) on their board`,
)

// --------------------------------------------------------- 9. anon access
const anon = createClient(URL, KEY, { auth: { persistSession: false } })
const { data: anonInc } = await anon.from('incidents').select('id').limit(1)
const { data: anonBoard } = await anon.from('incident_board').select('id').limit(1)
check(
  'signed-out clients see nothing',
  (anonInc ?? []).length === 0 && (anonBoard ?? []).length === 0,
)

// --------------------------------------------------------- 10. realtime
const rt = await new Promise((resolve) => {
  const received = []
  let subscribed = false
  const ch = sec.client
    .channel('e2e-test')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_pings' }, (p) =>
      received.push(p.new),
    )
    .subscribe(async (status) => {
      if (status !== 'SUBSCRIBED' || subscribed) return
      subscribed = true
      // A medical update the Security Supervisor cannot read directly.
      await med.client
        .from('incident_updates')
        .insert({
          incident_id: medId,
          event_id: ev.id,
          author_id: med.uid,
          author_name: 'R. Ahmed',
          author_role: 'Medical Lead',
          entry_type: 'update',
          body: 'Casualty conscious, extracted to medical centre. BP stable.',
        })
      setTimeout(() => {
        sec.client.removeChannel(ch)
        resolve(received)
      }, 4000)
    })
})
check(
  'realtime ping reaches a role that cannot read the medical row itself',
  rt.length > 0 && rt.some((p) => p.event_id === ev.id),
  `${rt.length} ping(s): ${rt.map((p) => p.kind).join(',')}`,
)
check(
  'ping payload carries no incident content',
  rt.every((p) => !('body' in p) && !('description' in p)),
  `keys: ${Object.keys(rt[0] ?? {}).join(',')}`,
)

console.log('\n' + pass.concat(fail).join('\n'))
console.log(`\n${pass.length} passed, ${fail.length} failed`)
process.exit(fail.length ? 1 : 0)
