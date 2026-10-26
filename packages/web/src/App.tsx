import { useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { AiBadge, DemoBadge, Glossary, Icon } from './components/ui';
import { usesRealAi, useProviderStatus } from './providerStatus';
import { SaveIndicator, SaveStatusProvider } from './saveStatus';
import { Welcome } from './pages/Welcome';
import { Settings } from './pages/Settings';
import { SessionRoute } from './pages/SessionRoute';

function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M12 3h8v2h-1v8l7 13a2 2 0 0 1-2 3H8a2 2 0 0 1-2-3l7-13V5h-1z" fill="#0f766e" />
      <path d="M9.5 22h13" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

function TutorModeBadge() {
  const status = useProviderStatus();
  if (!status) return null;
  return usesRealAi(status) ? <AiBadge /> : <DemoBadge />;
}

export function App() {
  const [glossary, setGlossary] = useState(false);
  return (
    <SaveStatusProvider>
      <a href="#main" className="skip-link">Skip to main content</a>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="LabGuide AI home">
          <Logo /> <span>LabGuide AI</span>
        </Link>
        <TutorModeBadge />
        <span className="spacer" />
        <SaveIndicator />
        <button className="btn btn-ghost" onClick={() => setGlossary(true)} aria-label="Open glossary">
          <Icon name="book" /> <span className="topbar-label">Glossary</span>
        </button>
        <Link className="btn btn-ghost" to="/settings" aria-label="Settings">
          <Icon name="gear" /> <span className="topbar-label">Settings</span>
        </Link>
      </header>
      <Glossary open={glossary} onClose={() => setGlossary(false)} />
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/s/:id/*" element={<SessionRoute />} />
        <Route path="*" element={<main id="main" className="page"><h1>Page not found</h1><Link to="/">Go to the welcome page</Link></main>} />
      </Routes>
    </SaveStatusProvider>
  );
}
