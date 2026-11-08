"""AlumniConnect: learn the matching weights from tester ratings.

Input : feedback.csv exported from the Admin page (ids and numbers only: no names, emails or text).
Output: weights.json for backend/model/ and metrics.json for your report.
Run   : python train.py feedback.csv          (or python train.py --demo for synthetic DEMO data)
"""
import hashlib, json, sys, datetime, platform
import numpy as np
import pandas as pd
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold, GroupShuffleSplit

SEED = 42
K = 3   # we judge the top-3 suggestions, because that is what a student realistically reads
FEATURES = ['field_match', 'skills_shared', 'interests_shared', 'industry_match',
            'availability_match', 'same_university', 'semantic_sim']
REQUIRED = ['student_id', 'mentor_id', 'helpful', 'rule_score'] + FEATURES


def load_csv(path):
    df = pd.read_csv(path)
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise ValueError(f'CSV is missing columns: {missing}')
    return df.drop_duplicates(['student_id', 'mentor_id']).reset_index(drop=True)


def check_data(df):
    """Print what the data looks like and return a list of warnings. Read these before trusting any result."""
    warnings = []
    n, s = len(df), df['student_id'].nunique()
    pos = int(df['helpful'].sum())
    print(f'{n} rated pairs from {s} students and {df["mentor_id"].nunique()} mentors; {pos} helpful ({pos / n:.0%}).')
    print('Pairs per student: min', df.groupby('student_id').size().min(), 'max', df.groupby('student_id').size().max())
    provider = ', '.join(sorted(df['sim_provider'].astype(str).unique())) if 'sim_provider' in df else 'unknown'
    print('Text-similarity provider(s):', provider)
    if s < 20: warnings.append(f'Only {s} students: results will be very uncertain (aim for 20 or more).')
    if n < 150: warnings.append(f'Only {n} rated pairs (aim for 150 or more).')
    if pos == 0 or pos == n: warnings.append('All ratings are the same: nothing to learn.')
    elif min(pos, n - pos) / n < 0.15: warnings.append('Very unbalanced ratings: interpret AUC with care.')
    if (df['semantic_sim'] == 0).mean() > 0.5: warnings.append('Over half the pairs have no text similarity: most profiles have no bio.')
    if 'sim_provider' in df and 'DEMO' in provider: warnings.append('DEMO DATA: synthetic, for testing the pipeline only. Never report these numbers.')
    for w in warnings: print('WARNING:', w)
    return warnings


def safe_auc(y, score):
    y = np.asarray(y)
    return float(roc_auc_score(y, score)) if 0 < y.sum() < len(y) else float('nan')


def rank_metrics(df, score_col, k=K, seed=SEED):
    """Per student: precision@k and NDCG@k of the ranking by score_col (students with no helpful mentor are skipped)."""
    rng = np.random.default_rng(seed)
    out = {}
    for sid, d in df.groupby('student_id'):
        y = d['helpful'].to_numpy()
        if y.sum() == 0:
            continue
        sc = d[score_col].to_numpy(dtype=float) + rng.random(len(d)) * 1e-9   # random tie-break, fixed seed
        top = y[np.argsort(-sc)][:k]
        ideal = np.sort(y)[::-1][:k]
        disc = 1 / np.log2(np.arange(2, len(top) + 2))
        out[sid] = (float(top.mean()), float((top * disc).sum() / (ideal * disc[:len(ideal)]).sum()))
    return out


def split_students(df, test_size=0.25, seed=SEED):
    """Hold out whole students, so no student appears in both training and test data (no leakage)."""
    tr, te = next(GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=seed).split(df, groups=df['student_id']))
    return df.iloc[tr].reset_index(drop=True), df.iloc[te].reset_index(drop=True)


def fit(df, C):
    return LogisticRegression(C=C, max_iter=2000).fit(df[FEATURES], df['helpful'])


def select_C(train_df, grid=(0.1, 0.3, 1, 3, 10), folds=5):
    """Choose the regularisation strength by grouped cross-validation on the training students only."""
    folds = max(2, min(folds, train_df['student_id'].nunique()))
    table = []
    for C in grid:
        aucs = []
        for a, b in GroupKFold(n_splits=folds).split(train_df, groups=train_df['student_id']):
            m = fit(train_df.iloc[a], C)
            aucs.append(safe_auc(train_df.iloc[b]['helpful'], m.predict_proba(train_df.iloc[b][FEATURES])[:, 1]))
        table.append({'C': C, 'cv_auc': float(np.nanmean(aucs))})
    best = max(table, key=lambda r: (r['cv_auc'], -r['C']))
    return best['C'], table


def evaluate(test_df, model, k=K, seed=SEED, n_boot=2000):
    """Compare the learned model with the rule-based baseline on students the model never saw."""
    t = test_df.copy()
    t['learned'] = model.predict_proba(t[FEATURES])[:, 1]
    base, learned = rank_metrics(t, 'rule_score', k), rank_metrics(t, 'learned', k)
    common = sorted(set(base) & set(learned))
    nb = np.array([base[s][1] for s in common]); nl = np.array([learned[s][1] for s in common])
    diff = nl - nb
    rng = np.random.default_rng(seed)
    boots = [diff[rng.integers(0, len(diff), len(diff))].mean() for _ in range(n_boot)] if len(diff) else [float('nan')]
    lo, hi = np.percentile(boots, [2.5, 97.5])
    return {
        'test_students': len(common), 'test_pairs': int(len(t)),
        'baseline': {'auc': safe_auc(t['helpful'], t['rule_score']), f'precision@{k}': float(np.mean([base[s][0] for s in common])), f'ndcg@{k}': float(nb.mean())},
        'learned':  {'auc': safe_auc(t['helpful'], t['learned']),    f'precision@{k}': float(np.mean([learned[s][0] for s in common])), f'ndcg@{k}': float(nl.mean())},
        f'ndcg@{k}_difference': {'mean': float(diff.mean()), 'ci95': [float(lo), float(hi)]},
        'beats_baseline': bool(len(diff) and diff.mean() > 0 and lo > 0),
    }


def fairness(test_df, model):
    """Does the model work as well for same-university and cross-university pairs?"""
    t = test_df.copy(); t['learned'] = model.predict_proba(t[FEATURES])[:, 1]
    out = {}
    for name, mask in (('same_university', t['same_university'] == 1), ('cross_university', t['same_university'] == 0)):
        d = t[mask]
        out[name] = {'pairs': int(len(d)), 'helpful_rate': float(d['helpful'].mean()) if len(d) else None,
                     'mean_predicted': float(d['learned'].mean()) if len(d) else None, 'auc': safe_auc(d['helpful'], d['learned']) if len(d) else float('nan')}
    return out


def export_weights(final, df, C, evaluation, csv_path=None):
    provider = str(df['sim_provider'].iloc[0]) if 'sim_provider' in df and df['sim_provider'].nunique() == 1 else None
    digest = hashlib.sha256(open(csv_path, 'rb').read()).hexdigest() if csv_path else None
    return {
        'type': 'logistic', 'version': datetime.date.today().isoformat(),
        'features': FEATURES, 'intercept': float(final.intercept_[0]),
        'coefficients': {f: float(c) for f, c in zip(FEATURES, final.coef_[0])},
        'embedding_provider': provider,
        'trained_on': {'pairs': int(len(df)), 'students': int(df['student_id'].nunique()), 'helpful': int(df['helpful'].sum()),
                       'C': C, 'seed': SEED, 'csv_sha256': digest, 'sklearn': sklearn.__version__, 'python': platform.python_version()},
        'evaluation_heldout': evaluation,
    }


def make_demo(n_students=40, n_mentors=8, seed=7):
    """SYNTHETIC ratings for testing the pipeline. The 'truth' is invented here, so results on it mean nothing."""
    rng = np.random.default_rng(seed)
    rows = []
    for s in range(1, n_students + 1):
        for m in range(1000, 1000 + n_mentors):
            f = {'field_match': float(rng.random() < 0.35), 'skills_shared': min(rng.poisson(0.9), 3) / 3,
                 'interests_shared': min(rng.poisson(0.9), 3) / 3, 'industry_match': float(rng.random() < 0.3),
                 'availability_match': float(rng.random() < 0.4), 'same_university': float(rng.random() < 0.15)}
            f['semantic_sim'] = float(np.clip(rng.beta(2, 5) + 0.25 * f['field_match'], 0, 1))
            z = (-2.4 + 1.3 * f['field_match'] + 1.1 * f['skills_shared'] + 1.5 * f['interests_shared'] + 0.6 * f['industry_match']
                 + 0.3 * f['availability_match'] + 0.1 * f['same_university'] + 3.0 * f['semantic_sim'])
            rule = int(30 * f['field_match'] + min(25, 8 * round(3 * f['skills_shared'])) + min(25, 12 * round(3 * f['interests_shared']))
                       + 10 * f['industry_match'] + 5 * f['availability_match'] + 5 * f['same_university'])
            rows.append({'student_id': s, 'mentor_id': m, 'helpful': int(rng.random() < 1 / (1 + np.exp(-z))), 'rule_score': rule,
                         **f, 'sim_provider': 'DEMO', 'created_at': '2000-01-01T00:00:00.000Z'})
    return pd.DataFrame(rows)


def main(csv_path=None, demo=False, out_dir='.'):
    df = make_demo() if demo else load_csv(csv_path)
    check_data(df)
    train_df, test_df = split_students(df)
    best_C, table = select_C(train_df)
    print('Cross-validation on training students:', table, '-> C =', best_C)
    held = fit(train_df, best_C)
    ev = evaluate(test_df, held)
    print(json.dumps(ev, indent=2))
    print('Fairness (held-out):', json.dumps(fairness(test_df, held), indent=2))
    final = fit(df, best_C)   # deployed model: refit on all rated pairs; the held-out numbers above come from the train-only fit
    weights = export_weights(final, df, best_C, ev, None if demo else csv_path)
    json.dump(weights, open(f'{out_dir}/weights.json', 'w'), indent=2)
    json.dump({'evaluation': ev, 'cv': table, 'fairness': fairness(test_df, held)}, open(f'{out_dir}/metrics.json', 'w'), indent=2)
    print('Beats the rule-based baseline on held-out students:', ev['beats_baseline'])
    return df, final, weights


if __name__ == '__main__':
    args = sys.argv[1:]
    if args == ['--demo']:
        main(demo=True)
    elif len(args) == 1:
        main(args[0])
    else:
        print(__doc__)
