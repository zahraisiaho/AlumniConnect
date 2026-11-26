import 'dotenv/config'
import { clerkMiddleware, clerkClient, getAuth } from '@clerk/express'
import { createApp } from './app.js'
import { autoEmbedder } from './embeddings.js'
import { loadModel, methodLabel } from './hybrid.js'
import { semanticOn } from './matching.js'

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
const embedder = autoEmbedder()
// Load the text model before taking requests and run it once, so the first match request is not slow.
// The first start downloads the model (about 90 MB); after that it loads from the local cache.
const provider = await embedder.ready()
try { await embedder.embed('warm up') } catch (e) { console.warn(`Text model warm-up failed (${e.message}). Matching falls back if it keeps failing.`) }
console.log(`Text meaning: ${provider}${provider === 'lexical-hash-256' ? ' (fallback)' : ''}`)
const model = loadModel(new URL('../model/weights.json', import.meta.url))
const semantic = semanticOn()
// The mode itself is chosen on the Admin page (default: learned model). These say what is available to it.
console.log(model ? `Learned model: ${methodLabel('hybrid-learned', model)}, loaded (${model.trained_on?.pairs ?? '?'} ${model.data_source === 'synthetic' ? 'synthetic' : 'rated'} pairs)`
  : 'Learned model: not loaded (no model/weights.json), so matching falls back to rules + text meaning')
if (model?.embedding_provider && model.embedding_provider !== provider) console.warn(`Learned model needs ${model.embedding_provider}, but text meaning is ${provider}: matching falls back to rules + text meaning`)
if (!semantic) console.log('Text meaning: off (MATCH_SEMANTIC=off), so "rules + text meaning" falls back to rules only')
const app = createApp({ identity, deleteIdentity, embedder, model, semantic, pre: [clerkMiddleware()] })
const port = Number(process.env.PORT) || 4000
app.listen(port, () => console.log(`AlumniConnect API running on http://localhost:${port}`))
