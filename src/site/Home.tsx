import { Link } from 'react-router-dom'
import SiteLayout, { ClosingCta } from './SiteLayout'

const HERO =
  'https://images.pexels.com/photos/1916816/pexels-photo-1916816.jpeg?auto=compress&cs=tinysrgb&w=1920'

const STATS = [
  { n: '6', label: 'Disciplines under one point of accountability' },
  { n: '3', label: 'Scottish licensing authorities worked with directly' },
  { n: '4', label: "Required procedures under Martyn's Law" },
  { n: '800+', label: 'Attendance where enhanced-tier duties apply' },
]

const SERVICES = [
  {
    n: '01',
    title: 'Event Safety Consultancy',
    body: 'Planning, advisory, and command oversight across safety, security, counter-terrorism, and licensing.',
    img: 'https://images.pexels.com/photos/34585117/pexels-photo-34585117.jpeg?auto=compress&cs=tinysrgb&w=900',
    to: '/services',
  },
  {
    n: '02',
    title: 'Operations Management',
    body: "End-to-end delivery of an event's plan: logistics, resourcing, on-the-day coordination and command.",
    img: 'https://images.pexels.com/photos/1916816/pexels-photo-1916816.jpeg?auto=compress&cs=tinysrgb&w=900',
    to: '/services',
  },
  {
    n: '03',
    title: 'Event Control',
    body: 'Running the room. Independent oversight of the live phase, coordinating contractors and agencies in real time.',
    img: 'https://images.pexels.com/photos/30651230/pexels-photo-30651230.jpeg?auto=compress&cs=tinysrgb&w=900',
    to: '/services',
  },
  {
    n: '04',
    title: 'Documentation',
    body: 'Safety management plans, control room manuals, communications protocols and incident procedures — written to be used, not shelved.',
    img: 'https://images.pexels.com/photos/7718755/pexels-photo-7718755.jpeg?auto=compress&cs=tinysrgb&w=900',
    to: '/services',
  },
  {
    n: '05',
    title: "Martyn's Law Readiness",
    body: 'Helping enhanced-tier venues and organisers understand and meet their new obligations.',
    img: 'https://images.pexels.com/photos/25016471/pexels-photo-25016471.jpeg?auto=compress&cs=tinysrgb&w=900',
    to: '/martyns-law',
  },
  {
    n: '06',
    title: 'Staff Training',
    body: "Building the knowledge and confidence of an organiser's own team, not just supplying our own.",
    img: 'https://images.pexels.com/photos/15509661/pexels-photo-15509661.jpeg?auto=compress&cs=tinysrgb&w=900',
    to: '/services',
  },
]

const WHY = [
  ['Independent.', "Not tied to security contractors. We recommend what's right for your event."],
  [
    'Whole picture.',
    'Safety, security, command, counter-terrorism, licensing and operations — one consultancy.',
  ],
  [
    'Scotland-wide.',
    'National reach across Scotland, with the local expertise and relationships that matter.',
  ],
  ['Complete package.', 'Plans, documentation, operational management and staff training.'],
]

export default function Home() {
  return (
    <SiteLayout>
      <section className="hero" style={{ minHeight: '100vh' }}>
        <img className="media" src={HERO} alt="" />
        <div className="scrim-a" />
        <div className="scrim-b" />

        <div className="inner">
          <p className="eyebrow on-dark">
            <span className="dot" />
            Scotland's Independent Event Safety &amp; Operations Consultancy
          </p>
          <h1 className="site-h1" style={{ maxWidth: '15ch', marginBottom: 26 }}>
            The professional safety brain that sits above your event.
          </h1>
          <p className="lede" style={{ maxWidth: '52ch', marginBottom: 36 }}>
            We are an independent specialist consultancy operating across Scotland — not a security
            company. We supply expertise, structure, command oversight, and the judgement that
            tells organisers what needs to happen and why.
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Link to="/contact">
              <button type="button" className="btn btn-primary">
                Request a consultation
              </button>
            </Link>
            <Link to="/contact">
              <button type="button" className="btn btn-secondary btn-on-dark">
                Download brochure
              </button>
            </Link>
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 2, borderTop: '1px solid rgba(255,255,255,.2)' }}>
          <div
            className="grid g-3"
            style={{ padding: '22px clamp(24px,6vw,72px)', gap: 24, color: '#fff' }}
          >
            <p style={{ fontSize: 14, margin: 0, color: 'rgba(255,255,255,.85)' }}>
              <strong style={{ fontFamily: 'var(--heading)', color: '#fff' }}>Independent.</strong>{' '}
              Not tied to any contractor.
            </p>
            <p style={{ fontSize: 14, margin: 0, color: 'rgba(255,255,255,.85)' }}>
              <strong style={{ fontFamily: 'var(--heading)', color: '#fff' }}>Expert.</strong> Safety,
              security, command, operations — one consultancy.
            </p>
            <p style={{ fontSize: 14, margin: 0, color: 'rgba(255,255,255,.85)' }}>
              <strong style={{ fontFamily: 'var(--heading)', color: '#fff' }}>Scotland-wide.</strong>{' '}
              National reach, local relationships.
            </p>
          </div>
        </div>
      </section>

      <div className="site-wrap">
        <section className="site-section site-rule" style={{ marginTop: 80 }}>
          <div className="grid g-4">
            {STATS.map((s) => (
              <div key={s.label}>
                <p
                  className="num"
                  style={{
                    fontSize: 'clamp(36px,4vw,52px)',
                    lineHeight: 1,
                    color: 'var(--accent-600)',
                    margin: '0 0 10px',
                  }}
                >
                  {s.n}
                </p>
                <p className="muted" style={{ fontSize: 14.5, margin: 0, maxWidth: '20ch' }}>
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="site-section site-rule" style={{ textAlign: 'center' }}>
          <p
            className="num"
            style={{
              fontSize: 'clamp(26px,3.2vw,42px)',
              lineHeight: 1.35,
              margin: '0 auto',
              maxWidth: '22ch',
            }}
          >
            Our goal is simple: help organisers plan and deliver safe, accountable events with
            confidence.
          </p>
        </section>

        <section style={{ paddingBottom: 56 }}>
          <p className="eyebrow">What Tide Does</p>
          <h2 className="site-h2" style={{ maxWidth: '20ch' }}>
            Six disciplines, one point of accountability.
          </h2>
        </section>

        <section className="grid g-3" style={{ gap: '36px 28px', paddingBottom: 96 }}>
          {SERVICES.map((s) => (
            <Link key={s.n} to={s.to} style={{ display: 'block' }}>
              <figure style={{ margin: '0 0 18px', aspectRatio: '4/3', overflow: 'hidden' }}>
                <img
                  src={s.img}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </figure>
              <p
                style={{
                  fontFamily: 'var(--heading)',
                  fontWeight: 800,
                  fontSize: 13,
                  color: 'var(--accent-600)',
                  margin: '0 0 8px',
                }}
              >
                {s.n}
              </p>
              <h3 className="site-h3" style={{ marginBottom: 8 }}>
                {s.title}
              </h3>
              <p className="muted" style={{ fontSize: 14, margin: 0, maxWidth: '30ch' }}>
                {s.body}
              </p>
            </Link>
          ))}
        </section>

        <section className="site-section site-rule grid g-57" style={{ alignItems: 'center', gap: 64 }}>
          <figure style={{ margin: 0 }}>
            <img
              src="https://images.pexels.com/photos/1916816/pexels-photo-1916816.jpeg?auto=compress&cs=tinysrgb&w=1200"
              alt="Large crowd inside an arena at a live event"
              style={{ width: '100%', aspectRatio: '4/5', objectFit: 'cover', display: 'block' }}
            />
          </figure>
          <div>
            <p className="eyebrow">Who We Serve</p>
            <h2 className="site-h2" style={{ maxWidth: '20ch', marginBottom: 20 }}>
              From single-site community events to enhanced-tier operations.
            </h2>
            <p className="muted" style={{ fontSize: 15.5, marginTop: 0, maxWidth: '52ch' }}>
              Event organisers, venues, local authorities, and licensing boards across Scotland —
              from single-site community events to multi-venue, touring, and enhanced-tier
              operations.
            </p>
            <p className="muted" style={{ fontSize: 15.5, marginBottom: 0, maxWidth: '52ch' }}>
              We work under Scots law and licensing, with the local relationships that matter
              across Scotland's councils and licensing boards.
            </p>
          </div>
        </section>
      </div>

      <section style={{ background: 'var(--surface)' }}>
        <div
          className="grid g-75"
          style={{ padding: 'clamp(56px,8vw,96px) clamp(24px,6vw,72px)', gap: 56, alignItems: 'center' }}
        >
          <div>
            <p className="eyebrow">Martyn's Law</p>
            <h2 className="site-h2" style={{ maxWidth: '16ch', marginBottom: 20 }}>
              Martyn's Law is here. Enhanced-tier venues need expertise now.
            </h2>
            <p className="muted" style={{ fontSize: 16, maxWidth: '52ch', margin: '0 0 28px' }}>
              We help organisers and venues understand and meet their obligations under the
              Terrorism (Protection of Premises) Act — and get ahead of it, not scramble to catch
              up.
            </p>
            <Link to="/martyns-law">
              <button type="button" className="btn btn-primary">
                Check your readiness
              </button>
            </Link>
          </div>
          <figure style={{ margin: 0 }}>
            <img
              src="https://images.pexels.com/photos/30651230/pexels-photo-30651230.jpeg?auto=compress&cs=tinysrgb&w=900"
              alt="Illuminated stadium at night"
              style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }}
            />
          </figure>
        </div>
      </section>

      <div className="site-wrap">
        <section className="site-section">
          <p className="eyebrow">Why Tide</p>
          <div className="grid g-2" style={{ gap: '0 48px' }}>
            {WHY.map(([lead, rest]) => (
              <p
                key={lead}
                style={{
                  fontSize: 16,
                  margin: 0,
                  padding: '20px 0',
                  borderTop: '1px solid var(--divider)',
                }}
              >
                <strong style={{ fontFamily: 'var(--heading)' }}>{lead}</strong> {rest}
              </p>
            ))}
          </div>
        </section>
      </div>

      <ClosingCta
        heading="Talk to us about your event."
        body="operations@tideeventsgroup.co.uk"
        actions={
          <>
            <Link to="/contact">
              <button type="button" className="btn btn-primary">
                Request a consultation
              </button>
            </Link>
            <Link to="/contact">
              <button type="button" className="btn btn-secondary">
                Download brochure
              </button>
            </Link>
          </>
        }
      />
    </SiteLayout>
  )
}
