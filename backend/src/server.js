import 'dotenv/config'
import { clerkMiddleware, clerkClient, getAuth } from '@clerk/express'
import { createApp } from './app.js'

if (!process.env.DATABASE_URL) { console.error('Set DATABASE_URL in backend/.env'); process.exit(1) }
if (!process.env.CLERK_SECRET_KEY || !process.env.CLERK_PUBLISHABLE_KEY) {
  console.error('Set CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in backend/.env (Clerk Dashboard > API keys)'); process.exit(1)
}

// Turns a verified Clerk session into the identity the app uses. Email is only trusted when Clerk marks it verified.
const identity = async (req) => {
  const { userId } = getAuth(req)
  if (!userId) return null
  let user
  const load = async () => (user ??= await clerkClient.users.getUser(userId))
  return {
    clerkId: userId,
    getEmail: async () => {
      const u = await load()
      const e = u.emailAddresses.find((x) => x.id === u.primaryEmailAddressId)
      return e?.verification?.status === 'verified' ? e.emailAddress : undefined
    },
    getName: async () => {
      const u = await load()
      return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || ''
    },
  }
}

const deleteIdentity = (clerkId) => clerkClient.users.deleteUser(clerkId)
const app = createApp({ identity, deleteIdentity, pre: [clerkMiddleware()] })
const port = Number(process.env.PORT) || 4000
app.listen(port, () => console.log(`AlumniConnect API running on http://localhost:${port}`))
