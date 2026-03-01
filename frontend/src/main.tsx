import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { UnlinkProvider } from '@unlink-xyz/react'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UnlinkProvider chain="monad-testnet" {...{ chainRpcUrl: "https://rpc.ankr.com/monad_testnet" } as any}>
      <App />
    </UnlinkProvider>
  </StrictMode>,
)
