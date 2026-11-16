import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import App from './App.jsx'
import './index.css'

const KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Plainer wording for the sign-in and sign-up errors people meet most often (Clerk shows them next to the field).
const localization = {
  unstable__errors: {
    form_identifier_not_found: 'We could not find an account with that email. Check the spelling, or create an account.',
    form_password_incorrect: 'That password is not right. Try again, or choose "Forgot password?" to set a new one.',
    form_password_pwned: 'This password has appeared in a data breach elsewhere. Please choose a different one.',
    form_password_length_too_short: 'Your password is too short. Use at least 8 characters.',
    form_identifier_exists__email_address: 'An account with this email already exists. Sign in instead, or reset your password.',
    form_param_format_invalid__email_address: 'Enter a valid email address, like name@example.com.',
    form_code_incorrect: 'That code is not right. Check the latest email from us and try again.',
  },
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {KEY ? (
      <ClerkProvider publishableKey={KEY} afterSignOutUrl="/login" localization={localization}>
        <App />
      </ClerkProvider>
    ) : (
      <p style={{ padding: 32, fontFamily: 'sans-serif' }}>
        Missing <code>VITE_CLERK_PUBLISHABLE_KEY</code>. Create a <code>.env</code> file in the front-end folder (see <code>.env.example</code>) and restart <code>npm run dev</code>.
      </p>
    )}
  </React.StrictMode>
)
