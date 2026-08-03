import { useEffect, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/services', label: 'Services', end: false },
  { to: '/martyns-law', label: "Martyn's Law", end: false },
  { to: '/about', label: 'About', end: false },
  { to: '/contact', label: 'Contact', end: false },
]

export function SiteNav({ cta = 'Get in touch', ctaTo = '/contact' }: { cta?: string; ctaTo?: string }) {
  return (
    <nav className="site-nav">
      <Link to="/" style={{ display: 'flex' }}>
        <img
          src="/tide-logo.png"
          alt="Tide Events Group"
          style={{ height: 24, width: 'auto', display: 'block' }}
        />
      </Link>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'clamp(14px, 2vw, 28px)',
          flexWrap: 'wrap',
        }}
        className="site-nav-links"
      >
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className="navlink"
            style={({ isActive }) => (isActive ? { color: 'var(--accent-700)' } : undefined)}
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      <Link to={ctaTo} className="hide-sm">
        <button type="button" className="btn btn-primary">
          {cta}
        </button>
      </Link>
    </nav>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="grid">
        <div>
          <img
            src="/tide-logo-white.png"
            alt="Tide Events Group"
            style={{ height: 40, width: 'auto', display: 'block', marginBottom: 18 }}
          />
          <p
            style={{
              fontSize: 14.5,
              color: 'rgba(255,255,255,.65)',
              margin: 0,
              maxWidth: '32ch',
            }}
          >
            Scotland's independent event safety and operations consultancy.
          </p>
        </div>

        <div>
          <p className="col-title">Navigate</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {NAV.map((item) => (
              <Link key={item.to} to={item.to}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <p className="col-title">Contact</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <a href="mailto:operations@tideeventsgroup.co.uk">operations@tideeventsgroup.co.uk</a>
            <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,.65)', margin: 0 }}>
              Scotland-wide
            </p>
          </div>
        </div>

        <div>
          <p className="col-title">Get Started</p>
          <p
            style={{
              fontSize: 14.5,
              color: 'rgba(255,255,255,.65)',
              margin: '0 0 18px',
              maxWidth: '30ch',
            }}
          >
            Tell us about your event and how we can help.
          </p>
          <Link to="/contact">
            <button type="button" className="btn btn-primary">
              Request a consultation
            </button>
          </Link>

          <div
            style={{
              marginTop: 28,
              paddingTop: 24,
              borderTop: '1px solid rgba(255,255,255,.15)',
            }}
          >
            <p className="col-title">Team Access</p>
            <Link to="/control" className="control-link">
              <span className="pip" aria-hidden="true" />
              Control Room Login
            </Link>
            <p
              style={{
                fontSize: 12.5,
                lineHeight: 1.5,
                color: 'rgba(255,255,255,.45)',
                margin: '12px 0 0',
                maxWidth: '30ch',
              }}
            >
              Incident Management System — authorised control room personnel only.
            </p>
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,.15)' }}>
        <div
          style={{
            padding: '20px clamp(24px,6vw,72px)',
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', margin: 0 }}>
            © {new Date().getFullYear()} Tide Events Group · tideeventsgroup.co.uk
          </p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', margin: 0 }}>
            Sole Trader · Scotland-wide
          </p>
        </div>
      </div>
    </footer>
  )
}

export default function SiteLayout({
  children,
  navCta,
  navCtaTo,
}: {
  children: ReactNode
  navCta?: string
  navCtaTo?: string
}) {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="site">
      <SiteNav cta={navCta} ctaTo={navCtaTo} />
      <main className="site-enter">{children}</main>
      <SiteFooter />
    </div>
  )
}

/** Shared closing call-to-action band. */
export function ClosingCta({
  heading,
  body,
  actions,
}: {
  heading: string
  body: string
  actions: ReactNode
}) {
  return (
    <div className="site-wrap">
      <section
        className="site-section site-rule"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 40,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 className="site-h2" style={{ marginBottom: 8 }}>
            {heading}
          </h2>
          <p className="muted" style={{ margin: 0, fontSize: 15.5 }}>
            {body}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>{actions}</div>
      </section>
    </div>
  )
}
