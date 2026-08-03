import { Link } from 'react-router-dom'
import SiteLayout, { ClosingCta } from './SiteLayout'

interface Discipline {
  n: string
  title: string
  body: string
  points: string[]
  img: string
  link?: { to: string; label: string }
  tint?: boolean
}

const DISCIPLINES: Discipline[] = [
  {
    n: '01',
    title: 'Event Safety Consultancy',
    body: 'Planning, advisory, and command oversight across health and safety, security strategy, counter-terrorism, and licensing. We sit above your contractors and tell you what needs to happen, and why.',
    points: [
      'Health & safety strategy and planning',
      'Security strategy, independent of any contractor',
      'Counter-terrorism advisory',
      'Licensing under Scots law and local authority requirements',
    ],
    img: 'https://images.pexels.com/photos/34585117/pexels-photo-34585117.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
  {
    n: '02',
    title: 'Operations Management',
    body: "End-to-end delivery of an event's operational plan: logistics, resourcing, on-the-day coordination, and command. Where a client wants it, we own how the event is delivered on the ground.",
    points: [
      'Logistics and resourcing planning',
      'On-the-day coordination across contractors and agencies',
      'Command structure and escalation',
    ],
    img: 'https://images.pexels.com/photos/1916816/pexels-photo-1916816.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
  {
    n: '03',
    title: 'Event Control',
    body: 'Running the room. Independent oversight of the event during the live phase, coordinating contractors and agencies in real time from a neutral position above them.',
    points: [
      'Live-phase command and coordination',
      'Real-time contractor and agency liaison',
      'Independent decision-making, free of contractor bias',
    ],
    img: 'https://images.pexels.com/photos/30651230/pexels-photo-30651230.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
  {
    n: '04',
    title: 'Documentation',
    body: 'The written plans and manuals a licensing authority, venue, or client expects to see — written to hold up under scrutiny and be used on the day.',
    points: [
      'A comprehensive Event Safety Management Plan',
      'A Control Room Operations Manual',
      'A communications plan and radio protocol',
      'Incident response procedures',
      "Martyn's Law preparedness documentation (where applicable)",
      'A post-event debrief and lessons-learned report',
    ],
    img: 'https://images.pexels.com/photos/7718755/pexels-photo-7718755.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
  {
    n: '05',
    title: "Martyn's Law Readiness",
    body: 'Helping enhanced-tier venues and organisers understand and meet their new obligations under the Terrorism (Protection of Premises) Act.',
    points: [
      'Tier assessment and gap analysis',
      'Procedure and plan development',
      'Ongoing compliance support',
    ],
    img: 'https://images.pexels.com/photos/25016471/pexels-photo-25016471.jpeg?auto=compress&cs=tinysrgb&w=1200',
    link: { to: '/martyns-law', label: 'Full details →' },
    tint: true,
  },
  {
    n: '06',
    title: 'Staff Training',
    body: "Building the knowledge and confidence of an organiser's own team, not just supplying our own — so capability stays with you.",
    points: [
      'Event control and command training',
      'Licensing and documentation workshops',
      "Martyn's Law awareness sessions",
    ],
    img: 'https://images.pexels.com/photos/15509661/pexels-photo-15509661.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
]

export default function Services() {
  return (
    <SiteLayout>
      <section className="hero" style={{ minHeight: '58vh' }}>
        <img
          className="media"
          src="https://images.pexels.com/photos/34585117/pexels-photo-34585117.jpeg?auto=compress&cs=tinysrgb&w=1920"
          alt=""
        />
        <div className="scrim-a" />
        <div className="scrim-b" />
        <div className="inner">
          <p className="eyebrow on-dark">
            <span className="dot" />
            Services
          </p>
          <h1 className="site-h1" style={{ maxWidth: '18ch', marginBottom: 22 }}>
            Two connected disciplines. One point of accountability.
          </h1>
          <p className="lede" style={{ maxWidth: '60ch' }}>
            We don't just advise on what should happen — where a client wants it, we take ownership
            of how an event is delivered on the ground, from planning and resourcing through to
            on-the-day command.
          </p>
        </div>
      </section>

      <div className="site-wrap">
        <div className="site-rule" style={{ marginTop: 80 }} />
      </div>

      {DISCIPLINES.map((d, i) => {
        const flip = i % 2 === 1
        const media = (
          <figure key="fig">
            <img src={d.img} alt="" />
            {d.tint && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'color-mix(in srgb, var(--accent) 30%, transparent)',
                }}
              />
            )}
          </figure>
        )
        const body = (
          <div className="body" key="body">
            <p
              style={{
                fontFamily: 'var(--heading)',
                fontWeight: 800,
                fontSize: 14,
                color: 'var(--accent-600)',
                margin: '0 0 10px',
              }}
            >
              {d.n}
            </p>
            <h2 className="site-h2" style={{ fontSize: 28, marginBottom: 14 }}>
              {d.title}
              {d.link && (
                <Link
                  to={d.link.to}
                  style={{
                    fontFamily: 'var(--body)',
                    fontWeight: 600,
                    fontSize: 13,
                    color: 'var(--accent-700)',
                    verticalAlign: 'middle',
                    marginLeft: 10,
                  }}
                >
                  {d.link.label}
                </Link>
              )}
            </h2>
            <p className="muted" style={{ fontSize: 15.5, margin: '0 0 20px', maxWidth: '52ch' }}>
              {d.body}
            </p>
            <ul className="ticks muted">
              {d.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )

        return (
          <section key={d.n} className={`split${flip ? ' flip' : ''}`}>
            {flip ? [body, media] : [media, body]}
          </section>
        )
      })}

      <ClosingCta
        heading="Not sure which of these you need?"
        body="Tell us about your event and we'll recommend the right shape of support."
        actions={
          <Link to="/contact">
            <button type="button" className="btn btn-primary">
              Request a consultation
            </button>
          </Link>
        }
      />
    </SiteLayout>
  )
}
