# Learned matching (hybrid): how to train and deploy

## The three matching modes
The backend prints the active mode when it starts.

| Mode | When | Score |
|---|---|---|
| **Learned model** (`hybrid-learned`) | `backend/model/weights.json` exists (and `MATCH_MODEL` is not `off`) | Logistic regression over the rule features and bio similarity, with weights learned from ratings. Always wins when present. |
| **Rules + text meaning** (`rules+meaning`) | Default when there is no model | Rule score + a bonus of up to 15 points for similar bios: `round(15 * clamp((sim - 0.2) / 0.6, 0, 1))`, capped at 100. A mentor from another field with a rule score of 0 can appear if their goals match. |
| **Rules only** (`rules`) | `MATCH_SEMANTIC=off` in `backend/.env` | The original rule-based score (Table 5.4), unchanged. |

"Text meaning" is the cosine similarity of the two bios under a pretrained sentence-embedding model (all-MiniLM-L6-v2, run
locally; the startup line says `Text meaning: minilm-l6-v2`). If the model cannot load, a word-overlap fallback is used
(`Text meaning: lexical-hash-256 (fallback)`). A learned model trained with one provider ignores bio similarity from the other.

The middle mode's numbers (15, 0.2, 0.6) are **hand-set** (`SEMANTIC_BONUS` in `backend/src/matching.js`). Training the model
below replaces them with weights learned from real ratings, which is the point of the rest of this guide.

## What the learned model adds
The app ranks mentors by the rule-based score. The hybrid model adds **text similarity** between profile bios
(a pretrained sentence-embedding model) and **learns the weights** from tester ratings instead of setting them by hand.

## 1. Collect ratings (the data)
1. Create at least 8 to 10 real mentor profiles (alumni who tick "open to mentoring"), each with a real bio.
2. Ask 20+ students (classmates) to sign up with a real bio and open **Improve matching**.
   Each student reads every mentor profile and answers "Helpful" or "Not for me". Mentors are shown in an order unrelated to any score.
3. Tell participants what is collected, that taking part is voluntary, and that the export has no names, emails or text.
   Mention this consent step in your report (Data Protection Act, 2019).

## 2. Train (Google Colab)
1. Admin page > **Export training data (CSV)**.
2. Open `AlumniConnect_matching_training.ipynb` in Colab > Runtime > Run all. Upload the CSV when asked.
3. Read the warnings in section 3, the verdict in section 6 and the fairness table in section 8.
4. Download `weights.json` and `metrics.json`.

## 3. Deploy
Put `weights.json` in `backend/model/` and restart the backend. The terminal shows
`Matching: learned model loaded`. Delete the file (or set `MATCH_MODEL=off` in `backend/.env`) to go back to the rules.
**Deploy only if the learned model beat the baseline (`beats_baseline: true`), or you can justify it.**
Keep the exported CSV, `metrics.json` and the notebook output as evidence for Chapter 5.

## 4. Test the pipeline without real data
`python train.py --demo` (or `USE_DEMO = True` in the notebook) uses SYNTHETIC ratings. It only proves the code runs. Never report those numbers.

## What to say in the viva
"The rule-based score is my baseline. I added a pretrained sentence-embedding model (all-MiniLM-L6-v2) to measure how similar two
profiles' goals are, then trained a logistic regression in Colab on ratings from N students to learn the weights. I held out whole
students, compared against the baseline using NDCG@3 with a bootstrap interval, and checked fairness across universities.
With a small pilot the interval is wide, so I report it as a pilot result."
