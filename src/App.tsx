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

function Gate() {
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
          Your account is authenticated but has no assigned role. Ask an Ops Director to set one
          up before you can access the incident board.
        </p>
      </div>
    )
  }

  return (
    <LiveProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new" element={<NewIncident />} />
          <Route path="/incident/:id" element={<IncidentDetail />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<EventSettings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </LiveProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  )
}
