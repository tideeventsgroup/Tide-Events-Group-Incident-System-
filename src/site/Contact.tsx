import { useState, type FormEvent } from 'react'
import SiteLayout from './SiteLayout'
import { supabase } from '../lib/supabase'

type RequestType = 'consultation' | 'brochure' | 'general'

const TYPES: Array<[RequestType, string]> = [
  ['consultation', 'Request a consultation'],
  ['brochure', 'Download brochure'],
  ['general', 'General enquiry'],
]

const SUBMIT_LABEL: Record<RequestType, string> = {
  consultation: 'Request consultation',
  brochure: 'Send & download brochure',
  general: 'Send enquiry',
}

const TYPE_LABEL: Record<RequestType, string> = {
  consultation: 'consultation request',
  brochure: 'brochure request',
  general: 'enquiry',
}

export default function Contact() {
  const [reqType, setReqType] = useState<RequestType>('consultation')
  const [name, setName] = useState('')
  const [org, setOrg] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [eventType, setEventType] = useState('')
  const [message, setMessage] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<{ email: string; type: RequestType } | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)

    const { error: err } = await supabase.from('enquiries').insert({
      request_type: reqType,
      name: name.trim(),
      organisation: org.trim() || null,
      email: email.trim(),
      phone: phone.trim() || null,
      event_type: eventType.trim() || null,
      message: message.trim() || null,
    })

    setBusy(false)

    if (err) {
      setError(
        "We couldn't send that just now. Please email operations@tideeventsgroup.co.uk directly and we'll pick it up.",
      )
      return
    }

    setSubmitted({ email: email.trim(), type: reqType })
  }

  function reset() {
    setSubmitted(null)
    setName('')
    setOrg('')
    setEmail('')
    setPhone('')
    setEventType('')
    setMessage('')
  }

  return (
    <SiteLayout navCta="Email us" navCtaTo="/contact">
      <section className="hero" style={{ minHeight: '50vh' }}>
        <img
          className="media"
          src="https://images.pexels.com/photos/12657546/pexels-photo-12657546.jpeg?auto=compress&cs=tinysrgb&w=1920"
          alt=""
        />
        <div className="scrim-a" />
        <div className="scrim-b" />
        <div className="inner">
          <p className="eyebrow on-dark">
            <span className="dot" />
            Contact
          </p>
          <h1 className="site-h1" style={{ maxWidth: '18ch', marginBottom: 22 }}>
            Tell us about your event.
          </h1>
          <p className="lede" style={{ maxWidth: '58ch' }}>
            Request a free consultation, download our capability brochure, or send us a direct
            enquiry — we'll come back to you within one working day.
          </p>
        </div>
      </section>

      <div className="site-wrap">
        <div className="site-rule" style={{ marginTop: 80 }} />

        <section className="site-section grid g-75" style={{ gap: 64 }}>
          {submitted ? (
            <div>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  marginBottom: 20,
                }}
              />
              <h2 className="site-h2" style={{ fontSize: 28, marginBottom: 12 }}>
                Thanks — that's with us.
              </h2>
              <p className="muted" style={{ fontSize: 15.5, margin: '0 0 24px', maxWidth: '48ch' }}>
                We've received your {TYPE_LABEL[submitted.type]} and will be in touch at{' '}
                <strong style={{ color: 'var(--text)' }}>{submitted.email}</strong> within one
                working day.
              </p>
              <button type="button" className="btn btn-secondary" onClick={reset}>
                Send another enquiry
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <fieldset
                style={{ border: 0, padding: 0, margin: 0, display: 'flex', gap: 24, flexWrap: 'wrap' }}
              >
                <legend className="sr-only">What can we help with?</legend>
                {TYPES.map(([value, label]) => (
                  <label key={value} className="choice">
                    <input
                      type="radio"
                      name="reqtype"
                      className="radio"
                      checked={reqType === value}
                      onChange={() => setReqType(value)}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>

              <div className="field">
                <label htmlFor="c-name">Full name</label>
                <input
                  id="c-name"
                  className="input"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="c-org">Organisation</label>
                <input
                  id="c-org"
                  className="input"
                  type="text"
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                />
              </div>

              <div className="grid g-2" style={{ gap: 20 }}>
                <div className="field">
                  <label htmlFor="c-email">Email</label>
                  <input
                    id="c-email"
                    className="input"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="c-phone">Phone</label>
                  <input
                    id="c-phone"
                    className="input"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="c-event">Event type</label>
                <input
                  id="c-event"
                  className="input"
                  type="text"
                  placeholder="e.g. festival, conference, licensed venue"
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="c-msg">Message</label>
                <textarea
                  id="c-msg"
                  className="input"
                  rows={4}
                  style={{ resize: 'vertical' }}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              {error && (
                <p role="alert" style={{ fontSize: 14, color: '#c41e3a', margin: 0 }}>
                  {error}
                </p>
              )}

              <div>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Sending…' : SUBMIT_LABEL[reqType]}
                </button>
              </div>
            </form>
          )}

          <div>
            <div className="card">
              <h3 className="site-h3" style={{ fontSize: 18, marginBottom: 16 }}>
                Direct contact
              </h3>
              <p style={{ fontSize: 15, margin: '0 0 12px' }}>
                <strong style={{ fontFamily: 'var(--heading)' }}>Email</strong>
                <br />
                <a
                  href="mailto:operations@tideeventsgroup.co.uk"
                  style={{ color: 'var(--accent-700)' }}
                >
                  operations@tideeventsgroup.co.uk
                </a>
              </p>
              <p style={{ fontSize: 15, margin: '0 0 12px' }}>
                <strong style={{ fontFamily: 'var(--heading)' }}>Coverage</strong>
                <br />
                Scotland-wide
              </p>
              <p style={{ fontSize: 15, margin: 0 }}>
                <strong style={{ fontFamily: 'var(--heading)' }}>Structure</strong>
                <br />
                Sole Trader
              </p>
            </div>

            <hr style={{ margin: '32px 0', border: 0, borderTop: '1px solid var(--divider)' }} />

            <h3 className="site-h3" style={{ fontSize: 18, marginBottom: 12 }}>
              Capability brochure
            </h3>
            <p className="muted" style={{ fontSize: 15, margin: '0 0 16px', maxWidth: '40ch' }}>
              Our full services overview, including Martyn's Law readiness and operations
              management, as a downloadable PDF.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setReqType('brochure')
                setSubmitted(null)
                document.getElementById('c-name')?.focus()
              }}
            >
              Download brochure
            </button>
          </div>
        </section>
      </div>
    </SiteLayout>
  )
}
