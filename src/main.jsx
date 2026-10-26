import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import App from './App.jsx'
import './index.css'

const KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {KEY ? (
      <ClerkProvider publishableKey={KEY} afterSignOutUrl="/login">
        <App />
      </ClerkProvider>
    ) : (
      <p style={{ padding: 32, fontFamily: 'sans-serif' }}>
        Missing <code>VITE_CLERK_PUBLISHABLE_KEY</code>. Create a <code>.env</code> file in the front-end folder (see <code>.env.example</code>) and restart <code>npm run dev</code>.
      </p>
    )}
  </React.StrictMode>
)
