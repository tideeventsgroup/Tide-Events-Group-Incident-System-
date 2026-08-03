import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'

/**
 * Service worker registration, plus the two states an installed control room
 * tool has to be honest about: a pending update, and being offline.
 *
 * The update is offered rather than applied. Auto-reloading would be fine on
 * a marketing page and unforgivable halfway through logging a casualty.
 */
export default function PwaStatus() {
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [offline, setOffline] = useState(() => !navigator.onLine)
  const [updateSW, setUpdateSW] = useState<(() => Promise<void>) | null>(null)
  const inControlRoom = useLocation().pathname.startsWith('/control')

  useEffect(() => {
    const update = registerSW({
      onNeedRefresh: () => setNeedsRefresh(true),
      onRegisteredSW: (_url, registration) => {
        // Event days run long. Check for a new build hourly so a fix does not
        // sit unapplied on a tablet that is never closed.
        if (registration) {
          setInterval(() => void registration.update(), 60 * 60 * 1000)
        }
      },
    })
    setUpdateSW(() => update)
  }, [])

  // The manifest is attached only inside the control room, so the install
  // prompt is offered to staff rather than to anyone reading the public site.
  useEffect(() => {
    const existing = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')

    if (!inControlRoom) {
      existing?.remove()
      return
    }
    if (existing) return

    const link = document.createElement('link')
    link.rel = 'manifest'
    link.href = '/manifest.webmanifest'
    document.head.appendChild(link)
  }, [inControlRoom])

  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (!offline && !needsRefresh) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 16,
        zIndex: 9999,
        maxWidth: 'min(560px, calc(100vw - 24px))',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontFamily: 'Arial, Helvetica, sans-serif',
      }}
    >
      {offline && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: '#333333',
            color: '#fff',
            borderRadius: 3,
            padding: '11px 16px',
            boxShadow: '0 6px 24px rgba(0,0,0,.28)',
            border: '1px solid #C41E3A',
          }}
        >
          <span
            aria-hidden="true"
            className="tide-pulse"
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#C41E3A',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>
            <b>OFFLINE.</b>{' '}
            {inControlRoom
              ? 'The board is not updating. Incidents you log now are held on this device and sync automatically when the signal returns.'
              : 'You are viewing a cached copy of this page.'}
          </span>
        </div>
      )}

      {needsRefresh && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: '#333333',
            color: '#fff',
            borderRadius: 3,
            padding: '11px 12px 11px 16px',
            boxShadow: '0 6px 24px rgba(0,0,0,.28)',
          }}
        >
          <span style={{ fontSize: 12.5, lineHeight: 1.45, flex: 1 }}>
            A new version is ready. It will apply when you reload.
          </span>
          <button
            type="button"
            onClick={() => void updateSW?.()}
            style={{
              background: '#25BEC8',
              color: '#fff',
              border: 0,
              borderRadius: 3,
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => setNeedsRefresh(false)}
            aria-label="Dismiss update notice"
            style={{
              background: 'transparent',
              color: '#b8b8b8',
              border: 0,
              padding: '8px 6px',
              fontSize: 14,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
