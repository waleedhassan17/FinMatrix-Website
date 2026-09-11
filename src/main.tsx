import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initObservability } from './app/observability'

// Before the first render, so a crash during boot is reported too. A no-op
// unless VITE_SENTRY_DSN is set.
initObservability()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
