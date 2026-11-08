# Matching modes (the backend prints which one is active when it starts)
#
# 1. Learned model ("hybrid-learned")
#    Put the trained weights.json from the Colab notebook (see ml/README.md) in this folder and restart the backend.
#    The model's learned weights rank mentors, using the rule features plus bio similarity. Always used when present.
#    If the model was trained with a different text-meaning provider than the one running now, bio similarity is
#    ignored (treated as 0) rather than mixed up. Set MATCH_MODEL=off in backend/.env to ignore weights.json.
#
# 2. Rules + text meaning ("rules+meaning")   <- the default when there is no weights.json
#    The rule score, plus up to 15 points when the student's and mentor's bios describe similar goals:
#      bonus = round(15 * clamp((similarity - 0.2) / 0.6, 0, 1)),  final score = min(100, rule score + bonus)
#    A mentor from another field with a rule score of 0 can appear if their goals match. No bio means no bonus.
#    The numbers 15, 0.2 and 0.6 are hand-set (SEMANTIC_BONUS in src/matching.js) until a learned model replaces them.
#
# 3. Rules only ("rules")
#    Set MATCH_SEMANTIC=off in backend/.env. Exactly the original rule-based score (Table 5.4).
#
# Text meaning uses the all-MiniLM-L6-v2 sentence model, run locally (downloaded once, about 90 MB).
# If it cannot load, a word-overlap fallback is used; the startup line then says "lexical-hash-256 (fallback)".
