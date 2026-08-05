import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LiveProvider } from './context/LiveContext'
import AppShell from './components/AppShell'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import NewIncident from './pages/NewIncident'
import IncidentDetail from './pages/IncidentDetail'
import History from './pages/History'
import EventSettings from './pages/EventSettings'
import Methane from './pages/Methane'
import EventLog from './pages/EventLog'
import Occupancy from './pages/Occupancy'
import Planning from './pages/Planning'
import PropertyAndReports from './pages/Property'
import Debrief from './pages/Debrief'
import SiteMap from './pages/SiteMap'
import PwaStatus from './components/PwaStatus'
import Home from './site/Home'
import Services from './site/Services'
import MartynsLaw from './site/MartynsLaw'
import About from './site/About'
import Contact from './site/Contact'
import Report from './site/Report'

/** The control room. Everything behind /control requires a signed-in profile. */
function ControlRoom() {
  const { session, profile, loading } = useAuth()

  if (!session) return <Login />

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-shell">
        <p className="text-[13px] text-faint">Connecting to event control…</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-shell px-6 text-center">
        <p className="text-[14px] font-bold text-ink">No control room profile</p>
        <p className="max-w-md text-[13px] text-muted">
          Your account is authenticated but has no assigned role. Ask an Incident Commander to set one up
          before you can access the incident board.
        </p>
      </div>
    )
  }

  return (
    <LiveProvider>
      <AppShell>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="new" element={<NewIncident />} />
          <Route path="incident/:id" element={<IncidentDetail />} />
          <Route path="log" element={<EventLog />} />
          <Route path="methane" element={<Methane />} />
          <Route path="occupancy" element={<Occupancy />} />
          <Route path="planning" element={<Planning />} />
          <Route path="public" element={<PropertyAndReports />} />
          <Route path="map" element={<SiteMap />} />
          <Route path="debrief" element={<Debrief />} />
          <Route path="history" element={<History />} />
          <Route path="settings" element={<EventSettings />} />
          <Route path="*" element={<Navigate to="/control" replace />} />
        </Routes>
      </AppShell>
    </LiveProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PwaStatus />
        <Routes>
          {/* Public site */}
          <Route path="/" element={<Home />} />
          <Route path="/services" element={<Services />} />
          <Route path="/martyns-law" element={<MartynsLaw />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          {/* Public "see something, say something" — reached by a QR code on site */}
          <Route path="/report/:eventId" element={<Report />} />

          {/* Incident Management System */}
          <Route path="/control/*" element={<ControlRoom />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
