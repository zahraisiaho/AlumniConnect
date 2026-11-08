"""Writes backend/test/fixtures/model_fixture.json: a model trained in Python plus the probabilities scikit-learn
predicts for sample rows. The Node test checks that the backend reproduces them (training and serving agree)."""
import json, sys
import numpy as np
import train

df = train.make_demo()
final = train.fit(df, 1)
w = train.export_weights(final, df, 1, {}, None)
rows = df.sample(25, random_state=3)
fixture = {
    'note': 'Synthetic demo data. Used only to test that Node and scikit-learn give the same probabilities.',
    'model': {k: w[k] for k in ('type', 'features', 'intercept', 'coefficients')},
    'rows': [{'features': {f: float(r[f]) for f in train.FEATURES}} for _, r in rows.iterrows()],
    'expected': [float(p) for p in final.predict_proba(rows[train.FEATURES])[:, 1]],
}
out = sys.argv[1] if len(sys.argv) > 1 else 'model_fixture.json'
json.dump(fixture, open(out, 'w'), indent=1)
print('wrote', out, len(fixture['rows']), 'rows')
