# Matching modes (the backend prints which one is active when it starts; the matches page shows "Matching method: ...")
#
# 1. Learned model ("hybrid-learned")
#    Put weights.json from ml/train.py or the Colab notebook (see ml/README.md) in this folder and restart the backend.
#    Mentors are ranked by the model's predicted probability of a successful match (rule features plus bio similarity).
#    Always used when present. A model trained on ml/synthetic_pairs.csv has "data_source": "synthetic" and is labelled
#    "Learned model (trained on synthetic data)". Its numbers show the method works, not real-world performance.
#    If the model was trained with a different text-meaning provider than the one running now, bio similarity is
#    ignored (treated as 0) rather than mixed up. Set MATCH_MODEL=off in backend/.env to ignore weights.json.
#
# 2. Rules + text meaning ("rules+meaning")   <- the default when there is no weights.json
#    The rule score, plus up to 15 points when the student's and mentor's bios describe similar goals:
#      bonus = round(15 * clamp((similarity - 0.2) / 0.6, 0, 1)),  final score = min(100, rule score + bonus)
#    A mentor from another field with a rule score of 0 can appear if their goals match. No bio means no bonus.
#
# 3. Rules only ("rules")
#    Set MATCH_SEMANTIC=off in backend/.env. Exactly the original rule-based score (Table 5.4).
#
# Text meaning uses the all-MiniLM-L6-v2 sentence model, run locally (downloaded once, about 90 MB).
# If it cannot load, a word-overlap fallback is used; the startup line then says "lexical-hash-256 (fallback)".
