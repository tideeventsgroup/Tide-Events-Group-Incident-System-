import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/**
 * The public's own reporting channel — "see something, say something".
 *
 * WeTrack does this over SMS. A QR code pointing here does the same job
 * without a telco account, and it works for anyone on site with a phone and no
 * account. `anon` holds INSERT on `public_reports` and nothing else, so
 * anybody holding the publishable key can submit a report and nobody can read
 * the reports back out.
 *
 * It deliberately says nothing about what is already happening on site. A
 * public page that confirmed an incident was live would be a gift to anyone
 * looking for one.
 */
export default function Report() {
  const { eventId } = useParams<{ eventId: string }>()
  const [what, setWhat] = useState('')
  const [where, setWhere] = useState('')
  const [contact, setContact] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Report something — Tide Events Group'
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (what.trim().length < 3) {
      setError('Tell us briefly what you have seen.')
      return
    }
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.from('public_reports').insert({
      event_id: eventId,
      what: what.trim(),
      where_text: where.trim() || null,
      contact: contact.trim() || null,
    })
    setBusy(false)
    if (err) {
      setError('That did not send. If it is urgent, find the nearest steward.')
      return
    }
    setSent(true)
  }

  return (
    <main className="mx-auto min-h-screen max-w-[560px] px-5 py-10">
      <div className="mb-6 flex items-center gap-3">
        <img src="/tide-logo.png" alt="Tide Events Group" className="h-[26px] w-auto" />
      </div>

      <div className="rounded-[10px] border-2 border-[#C41E3A] bg-[#fdf2f4] px-4 py-3">
        <p className="text-[14px] leading-[1.5] font-bold text-[#C41E3A]">
          If someone is in immediate danger, call 999 or find the nearest steward. This form is
          checked by event control, but it is not an emergency line.
        </p>
      </div>

      {sent ? (
        <div className="mt-6 rounded-[10px] border border-[#3D8361] bg-[#f3faf6] px-5 py-6">
          <h1 className="text-[20px] font-bold text-[#333]">Thank you — that has been sent.</h1>
          <p className="mt-2 text-[14px] leading-[1.6] text-[#555]">
            Event control has it. You will not get a reply here; if it needs one, a member of the
            team will use the contact details you gave.
          </p>
          <button
            type="button"
            onClick={() => {
              setSent(false)
              setWhat('')
              setWhere('')
            }}
            className="mt-4 rounded-[4px] bg-[#25BEC8] px-4 py-2.5 text-[13px] font-bold text-white"
          >
            Report something else
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6">
          <h1 className="text-[24px] leading-tight font-bold text-[#333]">Report something</h1>
          <p className="mt-1.5 mb-5 text-[14px] leading-[1.6] text-[#555]">
            Anything that does not look right — an unattended bag, someone unwell, a barrier
            that has moved, a person who needs help.
          </p>

          <label className="mb-1.5 block text-[12px] font-bold tracking-[0.5px] text-[#333]">
            WHAT HAVE YOU SEEN?
          </label>
          <textarea
            rows={4}
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            placeholder="Describe it as you would to a steward"
            className="mb-4"
          />

          <label className="mb-1.5 block text-[12px] font-bold tracking-[0.5px] text-[#333]">
            WHERE? (OPTIONAL)
          </label>
          <input
            type="text"
            value={where}
            onChange={(e) => setWhere(e.target.value)}
            placeholder="Near the main bar, by the harbour wall…"
            className="mb-4"
          />

          <label className="mb-1.5 block text-[12px] font-bold tracking-[0.5px] text-[#333]">
            YOUR NUMBER (OPTIONAL)
          </label>
          <input
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Only if you are happy to be contacted"
            className="mb-2"
          />
          <p className="mb-5 text-[12px] leading-[1.5] text-[#777]">
            You can report anonymously. If you leave a number it is used only to follow up this
            report, and is kept with the event's records under its retention period.
          </p>

          {error && (
            <p className="mb-4 rounded-[4px] border border-[#C41E3A] bg-[#fdf2f4] px-3 py-2.5 text-[13px] font-bold text-[#C41E3A]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-[4px] bg-[#25BEC8] px-5 py-3.5 text-[15px] font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send to event control'}
          </button>
        </form>
      )}
    </main>
  )
}
