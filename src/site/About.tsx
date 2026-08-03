import { Link } from 'react-router-dom'
import SiteLayout, { ClosingCta } from './SiteLayout'

const POSITION = [
  [
    'Independent',
    'We are not tied to any security contractor. We understand the whole picture and recommend what’s right for your event.',
  ],
  [
    'Expert',
    'Health and safety, security, command and control, counter-terrorism, licensing, and operations management, in one consultancy.',
  ],
  [
    'Complete',
    'National reach across Scotland, with the local knowledge and relationships that matter wherever an event lands.',
  ],
]

const AUDIENCE = ['Event organisers', 'Venues', 'Local authorities', 'Licensing boards']

export default function About() {
  return (
    <SiteLayout>
      <section className="hero" style={{ minHeight: '58vh' }}>
        <img
          className="media"
          src="https://images.pexels.com/photos/3941291/pexels-photo-3941291.jpeg?auto=compress&cs=tinysrgb&w=1920"
          alt=""
        />
        <div className="scrim-a" />
        <div className="scrim-b" />
        <div className="inner">
          <p className="eyebrow on-dark">
            <span className="dot" />
            About Tide
          </p>
          <h1 className="site-h1" style={{ maxWidth: '20ch', marginBottom: 22 }}>
            Independent. Expert. Complete.
          </h1>
          <p className="lede" style={{ maxWidth: '62ch' }}>
            Tide Events Group is an independent specialist consultancy operating across Scotland.
            We are not a security company. We supply expertise, structure, command oversight, and
            the professional safety brain that sits above event contractors and tells organisers
            what needs to happen and why.
          </p>
        </div>
      </section>

      <div className="site-wrap">
        <div className="site-rule" style={{ marginTop: 80 }} />

        <section className="site-section grid g-75" style={{ gap: 64, alignItems: 'center' }}>
          <div>
            <h2 className="site-h2" style={{ fontSize: 28, marginBottom: 20, maxWidth: '24ch' }}>
              We operate at the gap in Scotland's events market.
            </h2>
            <p className="muted" style={{ fontSize: 15.5, marginTop: 0, maxWidth: '52ch' }}>
              Planning, advising, running event control, producing documentation, managing
              operational delivery, and representing the organiser's interests across the full
              event lifecycle.
            </p>
            <p className="muted" style={{ fontSize: 15.5, marginBottom: 0, maxWidth: '52ch' }}>
              We now work across two connected disciplines: event safety and operations management.
              Where a client wants it, we take ownership of how an event is delivered on the ground
              — from planning and resourcing through to on-the-day command.
            </p>
          </div>
          <figure style={{ margin: 0 }}>
            <img
              src="https://images.pexels.com/photos/1916816/pexels-photo-1916816.jpeg?auto=compress&cs=tinysrgb&w=1200"
              alt="Command oversight of a live event crowd"
              style={{ width: '100%', aspectRatio: '4/5', objectFit: 'cover', display: 'block' }}
            />
          </figure>
        </section>

        <section className="site-section site-rule grid g-57" style={{ gap: 56, alignItems: 'center' }}>
          <div
            style={{
              aspectRatio: '4/5',
              background: 'var(--surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: 13.5, margin: 0, color: 'color-mix(in srgb,var(--text) 45%,transparent)' }}>
              Principal consultant photo
            </p>
          </div>
          <div>
            <p className="eyebrow">Who's Behind Tide</p>
            <h2 className="site-h2" style={{ fontSize: 26, marginBottom: 16, maxWidth: '26ch' }}>
              Run as a sole trader, built on hands-on operational experience.
            </h2>
            <p className="muted" style={{ fontSize: 15.5, margin: 0, maxWidth: '52ch' }}>
              Tide Events Group is led directly by its principal consultant, which means every
              client deals with the same person from first enquiry through to delivery — no account
              handoffs, no diluted expertise.
            </p>
          </div>
        </section>

        <section className="site-section site-rule">
          <p className="eyebrow">Brand Position</p>
          <div className="grid g-3" style={{ gap: 40 }}>
            {POSITION.map(([title, body]) => (
              <div key={title}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    marginBottom: 16,
                  }}
                />
                <h3 className="site-h3" style={{ fontSize: 22, marginBottom: 10 }}>
                  {title}
                </h3>
                <p className="muted" style={{ fontSize: 15, margin: 0, maxWidth: '34ch' }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="site-section site-rule">
          <p className="eyebrow">Who We Serve</p>
          <h2 className="site-h2" style={{ fontSize: 28, marginBottom: 20, maxWidth: '26ch' }}>
            Organisers, venues, local authorities and licensing boards across Scotland.
          </h2>
          <div className="grid g-4" style={{ gap: 20 }}>
            {AUDIENCE.map((a) => (
              <div key={a} style={{ padding: '20px 0', borderTop: '1px solid var(--divider)' }}>
                <p style={{ fontWeight: 600, fontSize: 15, margin: 0 }}>{a}</p>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 15.5, margin: '24px 0 0', maxWidth: '60ch' }}>
            From single-site community events to multi-venue, touring, and enhanced-tier
            operations. Our expertise is grounded in Scots law and licensing, with local
            relationships across Scotland's councils and boards.
          </p>
        </section>

        <section className="site-section site-rule">
          <p className="eyebrow">Voice &amp; Tone</p>
          <p className="lede muted" style={{ maxWidth: '62ch' }}>
            We are expert, independent, and credible. We speak with authority without arrogance,
            explain what needs to happen and why, and work with organisers rather than at them.
            Direct, expert, professional, collaborative.
          </p>
        </section>
      </div>

      <section style={{ position: 'relative', color: '#fff', overflow: 'hidden' }}>
        <img
          src="https://images.pexels.com/photos/10930708/pexels-photo-10930708.jpeg?auto=compress&cs=tinysrgb&w=1920"
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg,rgba(20,17,15,.35) 0%,rgba(20,17,15,.82) 100%)',
          }}
        />
        <div style={{ position: 'relative', padding: 'clamp(56px,8vw,100px) clamp(24px,6vw,72px)' }}>
          <h2 className="site-h2" style={{ maxWidth: '22ch', margin: 0 }}>
            Independent oversight, on the ground, wherever the event lands in Scotland.
          </h2>
        </div>
      </section>

      <ClosingCta
        heading="Want the full picture?"
        body="Download our capability brochure or get in touch directly."
        actions={
          <>
            <Link to="/contact">
              <button type="button" className="btn btn-primary">
                Get in touch
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
