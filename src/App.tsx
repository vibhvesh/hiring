import { HashRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import { CandidatesPage } from './pages/CandidatesPage.tsx'
import { InterviewPage } from './pages/InterviewPage.tsx'
import { ReportPage } from './pages/ReportPage.tsx'
import { SettingsPage } from './pages/SettingsPage.tsx'
import { WorkspaceProvider } from './state/workspace.tsx'

function Frame() {
  const location = useLocation()
  const interview = location.pathname.startsWith('/i')
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      {interview ? null : (
        <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-6">
          <Link to="/" className="text-2xl font-bold">Hiring</Link>
          <nav className="flex gap-5 text-lg">
            <Link to="/">Candidates</Link>
            <Link to="/settings">Settings</Link>
          </nav>
        </header>
      )}
      <main id="main" className={interview ? '' : 'mx-auto max-w-5xl px-5 pb-20'}>
        <Routes>
          <Route path="/" element={<CandidatesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/candidate/:id" element={<ReportPage />} />
          <Route path="/i/*" element={<InterviewPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <WorkspaceProvider>
      <HashRouter>
        <Frame />
      </HashRouter>
    </WorkspaceProvider>
  )
}
