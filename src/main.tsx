import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TonConnectUIProvider } from '@tonconnect/ui-react'
import './index.css'
import App from './App.tsx'

// Served from public/, so this resolves to <site origin>/tonconnect-manifest.json in every
// environment (local dev, Netlify) without hardcoding a domain here — see that file's own
// comment for what needs to stay in sync with it (name, icon, and above all the "url" field,
// which must match wherever this is actually deployed for wallets to trust the connection).
const TON_CONNECT_MANIFEST_URL = `${window.location.origin}/tonconnect-manifest.json`;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TonConnectUIProvider manifestUrl={TON_CONNECT_MANIFEST_URL}>
      <App />
    </TonConnectUIProvider>
  </StrictMode>,
)
