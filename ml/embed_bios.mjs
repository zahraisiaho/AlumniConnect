// Embeds bios with exactly the text model the app uses (backend/src/embeddings.js: all-MiniLM-L6-v2 via
// @huggingface/transformers), so semantic_sim in the synthetic data means the same as in the running app.
// Called by make_synthetic.py:  node ml/embed_bios.mjs <in.json: ["text", ...]> <out.json>
// Writes {"provider": "minilm-l6-v2", "vectors": [[...], ...]}. If the model cannot load, the app's fallback
// provider name ("lexical-hash-256") is written instead and make_synthetic.py refuses it unless told otherwise.
import { readFileSync, writeFileSync } from 'node:fs'
import { autoEmbedder } from '../backend/src/embeddings.js'

const [, , input, output] = process.argv
if (!input || !output) { console.error('usage: node ml/embed_bios.mjs in.json out.json'); process.exit(2) }
const texts = JSON.parse(readFileSync(input, 'utf8'))
const embedder = autoEmbedder()
const provider = await embedder.ready()
const vectors = []
for (const t of texts) vectors.push(await embedder.embed(t))
writeFileSync(output, JSON.stringify({ provider, vectors }))
console.log(`embedded ${texts.length} texts with ${provider}`)
