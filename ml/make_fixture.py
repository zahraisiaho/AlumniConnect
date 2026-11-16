"""Writes backend/test/fixtures/model_fixture.json: a model trained in Python plus the probabilities scikit-learn
predicts for sample rows. The Node test checks that the backend reproduces them (training and serving agree).
Uses a small SYNTHETIC dataset (ml/make_synthetic.py with the lexical text fallback, so no model download is needed)."""
import json, sys
import make_synthetic, train

df = make_synthetic.generate(n_students=40, n_mentors=12, pairs_per_student=8, seed=7, embed=make_synthetic.lexical_embed)
df['label'] = df['match_success']
final = train.fit(df, 1)
rows = df.sample(25, random_state=3)
fixture = {
    'note': 'Synthetic data. Used only to test that Node and scikit-learn give the same probabilities.',
    'model': {'type': 'logistic', 'features': train.FEATURES, 'intercept': float(final.intercept_[0]),
              'coefficients': {f: float(c) for f, c in zip(train.FEATURES, final.coef_[0])}},
    'rows': [{'features': {f: float(r[f]) for f in train.FEATURES}} for _, r in rows.iterrows()],
    'expected': [float(p) for p in final.predict_proba(rows[train.FEATURES])[:, 1]],
}
out = sys.argv[1] if len(sys.argv) > 1 else 'model_fixture.json'
json.dump(fixture, open(out, 'w'), indent=1)
print('wrote', out, len(fixture['rows']), 'rows')
