import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import SiteLayout, { ClosingCta } from './SiteLayout'

const KEY_FACTS = [
  'Formal name: Terrorism (Protection of Premises) Act 2025',
  'Royal Assent: 3 April 2025',
  'Statutory guidance published: April 2026',
  'Implementation period: at least 24 months from Royal Assent',
  'Regulator: the Security Industry Authority (SIA)',
]

const PROCEDURES = [
  ['01', 'Evacuation', 'Getting people safely away from danger and out of the premises.'],
  [
    '02',
    'Invacuation',
    'Moving people to safety within the premises when leaving is more dangerous.',
  ],
  ['03', 'Lockdown', 'Restricting access and movement to deny an attacker the target.'],
  [
    '04',
    'Communication',
    'Alerting staff and the public, and liaising with the emergency services.',
  ],
]

const HOW_WE_HELP = [
  ['Tier assessment.', 'Confirm whether — and how — the Act applies to your premises or event.'],
  ['Gap analysis.', 'Compare what you have against what the guidance requires.'],
  [
    'Procedures & documentation.',
    'Written, tested plans for all four procedures, plus vulnerability assessments at enhanced tier.',
  ],
  [
    'Training & ongoing support.',
    "Briefed, confident staff, and a compliance relationship that doesn't end at sign-off.",
  ],
]

/** Plain-English read on where a premises or event likely sits. */
function assess(attendance: number, isEvent: boolean, qualifying: boolean, ticketed: boolean) {
  if (!qualifying) {
    return {
      label: 'Out of scope',
      detail:
        "Martyn's Law only applies to premises and events used for a Schedule 1 activity — entertainment, retail, hospitality, sport, education, worship, healthcare or similar public-facing uses. On what you've told us, this falls outside scope, though it's worth a second look if the use changes.",
    }
  }

  if (isEvent) {
    if (attendance >= 800 && ticketed) {
      return {
        label: 'Enhanced tier — qualifying event',
        detail:
          'A one-off or occasional public event expecting 800+ with controlled access (tickets, guest list or payment) is treated as a qualifying event: enhanced-tier duties apply, including a vulnerability assessment and proportionate protective security measures.',
      }
    }
    if (attendance >= 800) {
      return {
        label: 'Borderline — check access control',
        detail:
          'Events are only separately in scope at 800+ where access is controlled (tickets, guest list or payment). Without controlled access, this event itself may sit outside the Act, though the host premises could still carry its own duty. Worth confirming with us.',
      }
    }
    return {
      label: 'Likely out of scope as a standalone event',
      detail:
        'Public events are only brought into scope in their own right at 800 or more attendees with controlled access. Below that, the event itself is unlikely to carry a separate duty — though the venue hosting it may.',
    }
  }

  if (attendance < 200) {
    return {
      label: 'Likely out of scope',
      detail:
        "Below 200, this premises is unlikely to fall within Martyn's Law as things stand. Worth a periodic re-check if your numbers grow, or before hosting a larger one-off event.",
    }
  }
  if (attendance < 800) {
    return {
      label: 'Standard tier',
      detail:
        'At 200–799, this premises likely sits in the standard tier: written evacuation, invacuation, lockdown and communication procedures, staff training, and SIA registration once the duty commences.',
    }
  }
  return {
    label: 'Enhanced tier',
    detail:
      'At 800 or more, this premises likely sits in the enhanced tier: everything required at standard tier, plus a documented vulnerability assessment, protective security measures, and a named senior responsible individual.',
  }
}

function TierChecker() {
  const [attendance, setAttendance] = useState('')
  const [isEvent, setIsEvent] = useState(false)
  const [qualifying, setQualifying] = useState(true)
  const [ticketed, setTicketed] = useState(false)
  const [checked, setChecked] = useState(false)

  const num = parseInt(attendance, 10)
  const valid = !Number.isNaN(num) && num >= 0
  const result = useMemo(
    () => (checked && valid ? assess(num, isEvent, qualifying, ticketed) : null),
    [checked, valid, num, isEvent, qualifying, ticketed],
  )

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setChecked(true)
  }

  return (
    <div className="grid g-2" style={{ gap: 40, alignItems: 'start' }}>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 460 }}>
        <div className="field">
          <label htmlFor="ml-attendance">
            Maximum number reasonably expected on site at once (including staff)
          </label>
          <input
            id="ml-attendance"
            className="input"
            type="number"
            min={0}
            placeholder="e.g. 450"
            value={attendance}
            onChange={(e) => {
              setAttendance(e.target.value)
              setChecked(false)
            }}
          />
        </div>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <p style={{ fontFamily: 'var(--heading)', fontWeight: 600, fontSize: 13.5, margin: '0 0 10px' }}>
            What are we assessing?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="choice">
              <input
                type="radio"
                name="ml-type"
                className="radio"
                checked={!isEvent}
                onChange={() => setIsEvent(false)}
              />
              A premises I run day-to-day (venue, site, building)
            </label>
            <label className="choice">
              <input
                type="radio"
                name="ml-type"
                className="radio"
                checked={isEvent}
                onChange={() => setIsEvent(true)}
              />
              A one-off or occasional public event
            </label>
          </div>
        </fieldset>

        <label className="choice" style={{ alignItems: 'flex-start', lineHeight: 1.4 }}>
          <input
            type="checkbox"
            className="radio"
            style={{ marginTop: 2 }}
            checked={qualifying}
            onChange={(e) => setQualifying(e.target.checked)}
          />
          Used for a public-facing activity in scope — entertainment, nightlife, retail,
          hospitality, sport, education, worship, healthcare or a public transport hub
        </label>

        {isEvent && (
          <label className="choice">
            <input
              type="checkbox"
              className="radio"
              checked={ticketed}
              onChange={(e) => setTicketed(e.target.checked)}
            />
            Access is controlled — tickets, guest list or payment on entry
          </label>
        )}

        <div>
          <button type="submit" className="btn btn-primary">
            Check my tier
          </button>
        </div>
      </form>

      <div
        style={{
          padding: 28,
          background: 'var(--bg)',
          border: '1px solid var(--divider)',
          minHeight: 180,
        }}
        aria-live="polite"
      >
        {result ? (
          <>
            <p
              className="eyebrow"
              style={{ display: 'block', fontWeight: 800, fontSize: 13, margin: '0 0 10px' }}
            >
              {result.label}
            </p>
            <p style={{ fontSize: 15, margin: '0 0 16px' }} className="muted">
              {result.detail}
            </p>
            <Link to="/contact">
              <button type="button" className="btn btn-secondary">
                Talk it through with us
              </button>
            </Link>
          </>
        ) : (
          <p
            style={{
              fontSize: 15,
              margin: 0,
              color: 'color-mix(in srgb, var(--text) 60%, transparent)',
            }}
          >
            Enter a number and press &ldquo;Check my tier&rdquo; for a plain-English read on where
            you likely stand. This is a starting point, not a legal determination — thresholds are
            based on numbers reasonably expected, including staff, not licence or seating capacity.
          </p>
        )}
      </div>
    </div>
  )
}

export default function MartynsLaw() {
  return (
    <SiteLayout>
      <section className="hero" style={{ minHeight: '58vh' }}>
        <img
          className="media"
          src="https://images.pexels.com/photos/10864081/pexels-photo-10864081.jpeg?auto=compress&cs=tinysrgb&w=1920"
          alt=""
        />
        <div className="scrim-a" />
        <div className="scrim-b" />
        <div className="inner">
          <p className="eyebrow on-dark">
            <span className="dot" />
            Martyn's Law
          </p>
          <h1 className="site-h1" style={{ maxWidth: '18ch', marginBottom: 22 }}>
            The UK's new legal duty to protect the public from terrorism.
          </h1>
          <p className="lede" style={{ maxWidth: '56ch' }}>
            The Terrorism (Protection of Premises) Act 2025 is now law. If you run a venue,
            organise events, or hold a licence, you need to know whether — and how — it applies to
            you.
          </p>
        </div>
      </section>

      <div className="site-wrap">
        <div className="site-rule" style={{ marginTop: 80 }} />

        <section className="site-section grid g-75" style={{ gap: 64 }}>
          <div>
            <p className="eyebrow">What it is</p>
            <h2 className="site-h2" style={{ fontSize: 28, marginBottom: 20, maxWidth: '24ch' }}>
              Named for Martyn Hett, one of 22 people killed in the 2017 Manchester Arena attack.
            </h2>
            <p className="muted" style={{ fontSize: 15.5, marginTop: 0, maxWidth: '56ch' }}>
              Martyn's Law is the common name for the Terrorism (Protection of Premises) Act 2025,
              which received Royal Assent on 3 April 2025. It requires those responsible for
              certain publicly accessible premises and events to improve their preparedness for a
              terrorist attack, and — for larger sites — to consider and reduce their vulnerability
              to one.
            </p>
            <p className="muted" style={{ fontSize: 15.5, marginBottom: 0, maxWidth: '56ch' }}>
              The Home Office published its statutory guidance in April 2026. An implementation
              period of at least 24 months from Royal Assent gives those in scope time to
              understand their obligations and prepare — but the clock is running, and
              enhanced-tier requirements are substantial.
            </p>
          </div>
          <div className="card">
            <h3 className="site-h3" style={{ fontSize: 16, marginBottom: 16 }}>
              Key facts
            </h3>
            <ul className="ticks">
              {KEY_FACTS.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="site-section site-rule">
          <p className="eyebrow">Two tiers</p>
          <h2 className="site-h2" style={{ fontSize: 28, marginBottom: 32, maxWidth: '24ch' }}>
            Your duties depend on how many people can reasonably be expected on site.
          </h2>
          <div className="grid g-2">
            <div className="card">
              <p
                className="eyebrow"
                style={{ display: 'block', fontWeight: 800, margin: '0 0 8px' }}
              >
                Standard tier
              </p>
              <p className="num" style={{ fontSize: 40, lineHeight: 1.1, marginBottom: 20 }}>
                200–799
              </p>
              <p className="muted" style={{ fontSize: 15, margin: '0 0 20px' }}>
                Premises where it's reasonable to expect 200–799 people, including staff, from time
                to time.
              </p>
              <ul className="ticks">
                <li>Written evacuation, invacuation, lockdown and communication procedures</li>
                <li>Terrorism protection training for relevant workers</li>
                <li>Registration with the SIA once the duty commences</li>
                <li>No mandatory physical security upgrades</li>
              </ul>
            </div>
            <div className="card">
              <p
                className="eyebrow"
                style={{ display: 'block', fontWeight: 800, margin: '0 0 8px' }}
              >
                Enhanced tier
              </p>
              <p className="num" style={{ fontSize: 40, lineHeight: 1.1, marginBottom: 20 }}>
                800+
              </p>
              <p className="muted" style={{ fontSize: 15, margin: '0 0 20px' }}>
                Premises and qualifying events where 800 or more people may reasonably be expected
                at once.
              </p>
              <ul className="ticks">
                <li>Everything required at standard tier, plus:</li>
                <li>A documented assessment of vulnerability to terrorism</li>
                <li>Reasonably practicable physical and protective security measures</li>
                <li>A named senior individual responsible for compliance</li>
              </ul>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 14, margin: '24px 0 0', maxWidth: '70ch' }}>
            Qualifying events are always treated as enhanced tier where they expect 800 or more
            people, are open to the public, and control access — for example by checking tickets or
            taking payment on entry. Thresholds are measured on numbers reasonably expected,
            including staff, not on licence or seating capacity — many operators find they sit
            differently to how they assumed.
          </p>
        </section>
      </div>

      <section
        style={{
          background: 'var(--surface)',
          padding: 'clamp(48px,6vw,64px) clamp(24px,6vw,72px)',
        }}
      >
        <p className="eyebrow">Check your tier</p>
        <h2 className="site-h2" style={{ fontSize: 28, marginBottom: 28, maxWidth: '26ch' }}>
          Not sure where your premises or event sits? Get an instant read.
        </h2>
        <TierChecker />
      </section>

      <div className="site-wrap">
        <section className="site-section">
          <p className="eyebrow">The four procedures</p>
          <h2 className="site-h2" style={{ fontSize: 28, marginBottom: 32, maxWidth: '26ch' }}>
            Every in-scope premises needs a plan for each of these, written down, briefed, and
            tested.
          </h2>
          <div className="grid g-4" style={{ gap: 28 }}>
            {PROCEDURES.map(([n, title, body]) => (
              <div key={n} className="rule-top">
                <p
                  style={{
                    fontFamily: 'var(--heading)',
                    fontWeight: 800,
                    fontSize: 13,
                    color: 'var(--accent-600)',
                    margin: '0 0 10px',
                  }}
                >
                  {n}
                </p>
                <h3 className="site-h3" style={{ fontSize: 17, marginBottom: 8 }}>
                  {title}
                </h3>
                <p className="muted" style={{ fontSize: 14, margin: 0 }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 14, margin: '24px 0 0', maxWidth: '70ch' }}>
            A generic fire-evacuation plan is not a substitute — the guidance is explicit that
            procedures must be designed against a terrorist threat, and are only effective if the
            people running the venue on the day know what to do.
          </p>
        </section>
      </div>

      <section style={{ position: 'relative', color: '#fff', overflow: 'hidden' }}>
        <img
          src="https://images.pexels.com/photos/25016471/pexels-photo-25016471.jpeg?auto=compress&cs=tinysrgb&w=1920"
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,17,15,.82)' }} />
        <div style={{ position: 'relative', padding: 'clamp(56px,8vw,96px) clamp(24px,6vw,72px)' }}>
          <p className="eyebrow on-dark">How Tide helps</p>
          <h2 className="site-h2" style={{ maxWidth: '20ch', marginBottom: 20 }}>
            We get you from uncertain to compliant, and keep you there.
          </h2>
          <div className="grid g-4" style={{ gap: 28, marginTop: 32 }}>
            {HOW_WE_HELP.map(([lead, rest]) => (
              <p key={lead} style={{ fontSize: 14.5, margin: 0, color: 'rgba(255,255,255,.9)' }}>
                <strong style={{ fontFamily: 'var(--heading)', color: '#fff' }}>{lead}</strong>{' '}
                {rest}
              </p>
            ))}
          </div>
        </div>
      </section>

      <ClosingCta
        heading="Not sure which tier applies to you?"
        body="Tell us about your premises or event and we'll tell you plainly where you stand."
        actions={
          <>
            <Link to="/contact">
              <button type="button" className="btn btn-primary">
                Check your readiness
              </button>
            </Link>
            <Link to="/services">
              <button type="button" className="btn btn-secondary">
                See all services
              </button>
            </Link>
          </>
        }
      />
    </SiteLayout>
  )
}
