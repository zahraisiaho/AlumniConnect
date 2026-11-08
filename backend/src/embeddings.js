// Turns a profile's free text into a vector so that similar goals can be compared (semantic matching).
//   minilm-l6-v2     : pretrained sentence-embedding model (all-MiniLM-L6-v2), run locally in Node with
//                      @huggingface/transformers. Downloads once (about 90 MB) on first use.
//   lexical-hash-256 : word-overlap fallback that needs no download. Used if the model cannot load, and in tests.
// Vectors are L2-normalised, so cosine similarity is a dot product.
import { createHash } from 'node:crypto'

const STOP = new Set('a an and are as at be by for from has have i in is it me my of on or our that the their this to want was with you your will can help who'.split(' '))
const DIM = 256

function tokens(text) {
  return String(text || '').toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 1 && !STOP.has(w)).map((w) => w.replace(/(ing|ers|er|es|s)$/, '')) || []
}
function hashEmbed(text) {
  const v = new Array(DIM).fill(0)
  for (const w of tokens(text)) {
    const h = createHash('md5').update(w).digest()
    v[h.readUInt16BE(0) % DIM] += h[2] & 1 ? 1 : -1       // signed hashing trick
  }
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  return n ? v.map((x) => x / n) : v
}

export const cosine = (a, b) => {
  if (!a || !b || a.length !== b.length) return 0
  let d = 0
  for (let i = 0; i < a.length; i++) d += a[i] * b[i]
  return Math.max(0, Math.min(1, d))
}

export const lexicalEmbedder = {
  ready: async () => 'lexical-hash-256',
  embed: async (text) => hashEmbed(text),
}

// Tries the pretrained model first and falls back to the lexical embedder, so the app always works.
export function autoEmbedder() {
  let state
  const init = async () => {
    try {
      const { pipeline } = await import('@huggingface/transformers')
      const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
      return { name: 'minilm-l6-v2', embed: async (t) => Array.from((await extractor(t, { pooling: 'mean', normalize: true })).data) }
    } catch (e) {
      console.warn(`Embedding model unavailable (${e.message}). Using the lexical fallback.`)
      return { name: 'lexical-hash-256', embed: async (t) => hashEmbed(t) }
    }
  }
  const get = () => (state ??= init())
  return { ready: async () => (await get()).name, embed: async (t) => (await get()).embed(t) }
}
