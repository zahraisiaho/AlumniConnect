"""AlumniConnect: train the learned matcher and compare it with the rule-based baseline.

Run (from the project folder):
    py ml/make_synthetic.py                                  # writes ml/synthetic_pairs.csv (SYNTHETIC DATA)
    py ml/train.py ml/synthetic_pairs.csv --out ml/output    # trains, evaluates, writes the files below
    py ml/train.py ml/synthetic_pairs.csv --real pilot_outcomes.csv --out ml/output   # plus a check on real pilot outcomes

Input  : a pairs CSV with student_id, mentor_id, rule_score, the 7 features and a label column:
         match_success (synthetic data, ml/make_synthetic.py) or helpful (real outcomes, to be collected in a future pilot
         and saved as a CSV with the same columns).
Output : weights.json (for backend/model/), metrics.json, results.md and results_chart.png.

Method
  * Baseline: the app's rule score (backend/src/matching.js), unchanged.
  * Learned : logistic regression on the 7 features (all 0..1), the same model the backend serves (backend/src/hybrid.js).
  * Split by student: 25% of students are held out; none of their pairs are used for training or for choosing settings.
  * C (regularisation) is chosen by 5-fold cross-validation grouped by student, on the training students only.
  * Thresholds for accuracy and F1 are chosen on the TRAINING students only (best F1): for the baseline on the rule
    score, for the learned model on out-of-fold training predictions. The test students never influence them.
  * Metrics: precision@1/3/5 (per student, averaged over students with at least one positive; ties in the score are
    resolved by their expected value, so the baseline is not helped or hurt by an arbitrary order), accuracy, F1, AUC.
    95% intervals: 2000 bootstrap resamples of the test STUDENTS (each resample keeps a student's pairs together).
  * The deployed weights are refitted on all pairs with the chosen C; the reported numbers come from the train-only fit.
"""
import argparse, datetime, hashlib, json, platform, sys
from pathlib import Path
import numpy as np
import pandas as pd
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold, GroupShuffleSplit

SEED = 42
KS = (1, 3, 5)
K = 3   # the headline: a student realistically reads the top 3 suggestions
FEATURES = ['field_match', 'skills_shared', 'interests_shared', 'industry_match',
            'availability_match', 'same_university', 'semantic_sim']
C_GRID = (0.01, 0.03, 0.1, 0.3, 1, 3, 10)
METRICS = [f'precision@{k}' for k in KS] + ['accuracy', 'f1', 'auc']
BANNER = 'SYNTHETIC DATA: shows the method can learn from data, NOT real-world performance'


def banner(source):
    return BANNER if source == 'synthetic' else f'DATA SOURCE: {source}'


# ---------- data ----------
def load_csv(path):
    """Reads a pairs CSV and adds `label` (from match_success or helpful) and `data_source`."""
    df = pd.read_csv(path)
    label = 'match_success' if 'match_success' in df.columns else 'helpful' if 'helpful' in df.columns else None
    missing = [c for c in ['student_id', 'mentor_id', 'rule_score', *FEATURES] if c not in df.columns] + ([] if label else ['match_success or helpful'])
    if missing:
        raise ValueError(f'{path} is missing columns: {missing}')
    df = df.drop_duplicates(['student_id', 'mentor_id']).reset_index(drop=True)
    df['label'] = df[label].astype(int)
    if 'data_source' not in df.columns:
        df['data_source'] = 'real ratings'
    return df


def data_source(df):
    return ', '.join(sorted(df['data_source'].astype(str).unique()))


def describe(df):
    n, s = len(df), df['student_id'].nunique()
    return {'pairs': int(n), 'students': int(s), 'mentors': int(df['mentor_id'].nunique()),
            'positives': int(df['label'].sum()), 'positive_rate': round(float(df['label'].mean()), 4)}


def check_data(df):
    """Prints what the data looks like and returns warnings. Read these before trusting any result."""
    d, src = describe(df), data_source(df)
    print(f"[{banner(src)}]\n{d['pairs']} pairs from {d['students']} students and {d['mentors']} mentors; "
          f"{d['positives']} positive ({d['positive_rate']:.0%}).")
    if 'sim_provider' in df:
        print('Text-similarity provider(s):', ', '.join(sorted(df['sim_provider'].astype(str).unique())))
    w = []
    if d['students'] < 20: w.append(f"Only {d['students']} students: results will be very uncertain.")
    if d['positives'] in (0, d['pairs']): w.append('All labels are the same: nothing to learn.')
    elif min(d['positive_rate'], 1 - d['positive_rate']) < 0.15: w.append('Very unbalanced labels: interpret F1 and AUC with care.')
    if src == 'synthetic': w.append(BANNER)
    for x in w: print('WARNING:', x)
    return w


def split_students(df, test_size=0.25, seed=SEED):
    """Hold out whole students, so no student appears in both training and test data (no leakage)."""
    tr, te = next(GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=seed).split(df, groups=df['student_id']))
    return df.iloc[tr].reset_index(drop=True), df.iloc[te].reset_index(drop=True)


# ---------- metrics ----------
def precision_at_k(y, score, k):
    """Precision@k of ranking by score. Tied scores at the cut-off count by their expected value (random order among ties)."""
    y = np.asarray(y, float); score = np.asarray(score, float)
    k = min(k, len(y)); hits = 0.0; left = k
    for v in np.unique(score)[::-1]:
        grp = y[score == v]
        take = min(left, len(grp))
        hits += take * grp.mean(); left -= take
        if not left:
            break
    return hits / k


def per_student_precision(df, score_col, k):
    """{student_id: precision@k} for students with at least one positive (others cannot be ranked well or badly)."""
    return {sid: precision_at_k(d['label'], d[score_col], k) for sid, d in df.groupby('student_id') if d['label'].sum() > 0}


def safe_auc(y, score):
    y = np.asarray(y)
    return float(roc_auc_score(y, score)) if 0 < y.sum() < len(y) else float('nan')


def accuracy_f1(y, score, threshold):
    y = np.asarray(y).astype(int); pred = (np.asarray(score, float) >= threshold).astype(int)
    tp = int(((pred == 1) & (y == 1)).sum()); fp = int(((pred == 1) & (y == 0)).sum()); fn = int(((pred == 0) & (y == 1)).sum())
    f1 = 2 * tp / (2 * tp + fp + fn) if tp else 0.0
    return float((pred == y).mean()), float(f1)


def choose_threshold(y, score):
    """Threshold (predict 1 when score >= t) with the best F1 on the data given. Call it with TRAINING data only.
    Ties in F1 go to the higher threshold. Returns (threshold, f1)."""
    best = (-1.0, None)
    for t in np.unique(score):
        f1 = accuracy_f1(y, score, t)[1]
        if f1 > best[0] or (f1 == best[0] and t > best[1]):
            best = (f1, float(t))
    return best[1], best[0]


def metrics_for(df, score_col, threshold):
    out = {f'precision@{k}': float(np.mean(list(per_student_precision(df, score_col, k).values()))) for k in KS}
    out['accuracy'], out['f1'] = accuracy_f1(df['label'], df[score_col], threshold)
    out['auc'] = safe_auc(df['label'], df[score_col])
    return out


def bootstrap(df, models, n_boot=2000, seed=SEED):
    """95% intervals by resampling test students with replacement. models = {name: (score_col, threshold)}.
    Returns {name: {metric: [lo, hi]}} plus 'difference' = learned - baseline when both are present."""
    rng = np.random.default_rng(seed)
    groups = [d for _, d in df.groupby('student_id')]
    ys = [d['label'].to_numpy() for d in groups]
    pre = {name: {k: np.array([precision_at_k(y, d[col], k) if y.sum() else np.nan for y, d in zip(ys, groups)]) for k in KS}
           for name, (col, _) in models.items()}
    sc = {name: [d[col].to_numpy(float) for d in groups] for name, (col, _) in models.items()}
    draws = {name: {m: [] for m in METRICS} for name in models}
    for _ in range(n_boot):
        idx = rng.integers(0, len(groups), len(groups))
        y = np.concatenate([ys[i] for i in idx])
        for name, (col, t) in models.items():
            for k in KS:
                draws[name][f'precision@{k}'].append(np.nanmean(pre[name][k][idx]))
            s = np.concatenate([sc[name][i] for i in idx])
            a, f = accuracy_f1(y, s, t)
            draws[name]['accuracy'].append(a); draws[name]['f1'].append(f); draws[name]['auc'].append(safe_auc(y, s))
    ci = lambda v: [float(x) for x in np.nanpercentile(v, [2.5, 97.5])]
    out = {name: {m: ci(v) for m, v in d.items()} for name, d in draws.items()}
    if 'baseline' in draws and 'learned' in draws:
        out['difference'] = {m: ci(np.array(draws['learned'][m]) - np.array(draws['baseline'][m])) for m in METRICS}
    return out


# ---------- model ----------
def fit(df, C):
    return LogisticRegression(C=C, max_iter=5000).fit(df[FEATURES], df['label'])


def select_C(train_df, grid=C_GRID, folds=5):
    """Regularisation strength by cross-validation grouped by student, on the training students only (mean AUC)."""
    folds = max(2, min(folds, train_df['student_id'].nunique()))
    table = []
    for C in grid:
        aucs = []
        for a, b in GroupKFold(n_splits=folds).split(train_df, groups=train_df['student_id']):
            m = fit(train_df.iloc[a], C)
            aucs.append(safe_auc(train_df.iloc[b]['label'], m.predict_proba(train_df.iloc[b][FEATURES])[:, 1]))
        table.append({'C': C, 'cv_auc': float(np.nanmean(aucs))})
    best = max(table, key=lambda r: (round(r['cv_auc'], 6), -r['C']))   # ties go to the stronger regularisation
    return best['C'], table


def out_of_fold(train_df, C, folds=5):
    """Each training pair's prediction from a model that did not see that student (used to choose the threshold)."""
    folds = max(2, min(folds, train_df['student_id'].nunique()))
    p = np.zeros(len(train_df))
    for a, b in GroupKFold(n_splits=folds).split(train_df, groups=train_df['student_id']):
        p[b] = fit(train_df.iloc[a], C).predict_proba(train_df.iloc[b][FEATURES])[:, 1]
    return p


def coefficients(model):
    return {f: round(float(c), 4) for f, c in zip(FEATURES, model.coef_[0])}


# ---------- the experiment ----------
def run_experiment(df, seed=SEED, n_boot=2000):
    """Split by student, tune on training students, evaluate baseline vs learned on held-out students."""
    train_df, test_df = split_students(df, seed=seed)
    assert not set(train_df.student_id) & set(test_df.student_id)
    best_C, cv_table = select_C(train_df)
    model = fit(train_df, best_C)
    t_rule, _ = choose_threshold(train_df['label'], train_df['rule_score'])
    t_learned, _ = choose_threshold(train_df['label'], out_of_fold(train_df, best_C))
    t = test_df.copy(); t['learned'] = model.predict_proba(t[FEATURES])[:, 1]
    models = {'baseline': ('rule_score', t_rule), 'learned': ('learned', t_learned)}
    if 'true_p' in t:   # synthetic only: the hidden truth, as an upper bound; never used for training or choices
        models['oracle'] = ('true_p', choose_threshold(train_df['label'], train_df['true_p'])[0])
    point = {name: metrics_for(t, col, thr) for name, (col, thr) in models.items()}
    point['difference'] = {m: point['learned'][m] - point['baseline'][m] for m in METRICS}
    ci = bootstrap(t, models, n_boot=n_boot, seed=seed)
    return {
        'split': {'train': describe(train_df), 'test': describe(test_df), 'test_students_with_a_positive': len(per_student_precision(t, 'learned', 1))},
        'C': best_C, 'cv': cv_table,
        'thresholds_chosen_on_train': {'baseline_rule_score': t_rule, 'learned_probability': round(t_learned, 4)},
        'metrics': point, 'ci95': ci,
        'coefficients_train_fit': coefficients(model), 'intercept_train_fit': round(float(model.intercept_[0]), 4),
        'beats_baseline_precision@3': bool(ci['difference'][f'precision@{K}'][0] > 0),
    }, model, (train_df, test_df)


def evaluate_real(model, real_df, thresholds, train_provider, min_students=5, min_pairs=40):
    """The synthetic-trained model on real outcomes from a future pilot ('real pilot data (small)'). Skipped cleanly if there are too few."""
    usable = real_df.groupby('student_id').filter(lambda d: 0 < d['label'].sum() < len(d))
    n_s = usable['student_id'].nunique()
    if n_s < min_students or len(real_df) < min_pairs:
        return {'skipped': True, 'reason': f'too few real ratings: {len(real_df)} pairs, {n_s} students with both a helpful and a not-helpful '
                                           f'rating (need at least {min_pairs} pairs and {min_students} such students)', 'size': describe(real_df)}
    r = real_df.copy()
    provider = ', '.join(sorted(r['sim_provider'].astype(str).unique())) if 'sim_provider' in r else None
    note = None
    if train_provider and provider != train_provider:   # the app does the same: never mix similarities from different models
        r['semantic_sim'] = 0.0; note = f'text similarity provider {provider} differs from training ({train_provider}); semantic_sim set to 0'
    r['learned'] = model.predict_proba(r[FEATURES])[:, 1]
    models = {'baseline': ('rule_score', thresholds['baseline_rule_score']), 'learned': ('learned', thresholds['learned_probability'])}
    point = {name: metrics_for(r, col, thr) for name, (col, thr) in models.items()}
    point['difference'] = {m: point['learned'][m] - point['baseline'][m] for m in METRICS}
    return {'skipped': False, 'label': 'real pilot data (small)', 'size': describe(r), 'note': note,
            'metrics': point, 'ci95': bootstrap(r, models, n_boot=1000)}


# ---------- reporting ----------
def fmt(v, ci=None, signed=False):
    s = f'{v:+.3f}' if signed else f'{v:.3f}'
    return f'{s} [{ci[0]:+.3f}, {ci[1]:+.3f}]' if ci and signed else f'{s} [{ci[0]:.3f}, {ci[1]:.3f}]' if ci else s


def results_table(ev, title):
    cols = [c for c in ('baseline', 'learned', 'oracle') if c in ev['metrics']]
    names = {'baseline': 'Rule-based baseline', 'learned': 'Learned model', 'oracle': 'Hidden truth (upper bound)'}
    head = '| Metric | ' + ' | '.join(names[c] for c in cols) + ' | Learned - baseline |'
    lines = [f'**{title}**', '', head, '|' + '---|' * (len(cols) + 2)]
    for m in METRICS:
        cells = [fmt(ev['metrics'][c][m], ev['ci95'][c][m]) for c in cols]
        lines.append(f'| {m} | ' + ' | '.join(cells) + f" | {fmt(ev['metrics']['difference'][m], ev['ci95']['difference'][m], signed=True)} |")
    lines.append('\nValues are point estimates with 95% bootstrap intervals over test students.')
    return '\n'.join(lines)


def bar_chart(ev, path, title):
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
    except ImportError:
        print('matplotlib is not installed: skipping the chart (pip install matplotlib).'); return None
    cols = [('baseline', 'Rule-based baseline', '#9aa5b1'), ('learned', 'Learned model', '#1f3a5f')]
    x = np.arange(len(METRICS)); w = 0.38
    fig, ax = plt.subplots(figsize=(9, 4.5))
    for i, (c, label, colour) in enumerate(cols):
        v = np.array([ev['metrics'][c][m] for m in METRICS]); lo, hi = np.array([ev['ci95'][c][m] for m in METRICS]).T
        ax.bar(x + (i - 0.5) * w, v, w, yerr=[v - lo, hi - v], capsize=3, label=label, color=colour)
    ax.set_xticks(x, METRICS); ax.set_ylim(0, 1); ax.set_ylabel('score (95% bootstrap interval)')
    ax.set_title(title, fontsize=10); ax.legend(loc='lower right'); ax.grid(axis='y', alpha=0.3)
    fig.text(0.5, 0.5, 'SYNTHETIC DATA', fontsize=44, color='red', alpha=0.12, ha='center', va='center', rotation=20) if 'SYNTHETIC' in title else None
    fig.tight_layout(); fig.savefig(path, dpi=150); plt.close(fig)
    return path


def export_weights(final, df, C, ev, csv_path=None):
    """weights.json for backend/model/. The backend reads type, features, intercept, coefficients, embedding_provider
    and data_source (for the 'Learned model (trained on synthetic data)' label)."""
    provider = str(df['sim_provider'].iloc[0]) if 'sim_provider' in df and df['sim_provider'].nunique() == 1 else None
    digest = hashlib.sha256(Path(csv_path).read_bytes()).hexdigest() if csv_path else None
    src = data_source(df)
    return {
        'type': 'logistic', 'version': datetime.date.today().isoformat(),
        'data_source': src, 'banner': banner(src), 'dataset': describe(df),
        'features': FEATURES, 'intercept': float(final.intercept_[0]),
        'coefficients': {f: float(c) for f, c in zip(FEATURES, final.coef_[0])},
        'threshold': ev['thresholds_chosen_on_train']['learned_probability'] if ev else None,
        'embedding_provider': provider,
        'trained_on': {'pairs': int(len(df)), 'students': int(df['student_id'].nunique()), 'positives': int(df['label'].sum()),
                       'C': C, 'seed': SEED, 'csv_sha256': digest, 'sklearn': sklearn.__version__, 'python': platform.python_version()},
        'evaluation_heldout': {k: ev[k] for k in ('metrics', 'ci95', 'beats_baseline_precision@3')} if ev else None,
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('csv', help='pairs CSV (ml/synthetic_pairs.csv or a feedback export)')
    ap.add_argument('--real', help='optional CSV of real outcomes from a future pilot (same columns); checks the model against it')
    ap.add_argument('--out', default='.', help='output folder')
    ap.add_argument('--boot', type=int, default=2000)
    a = ap.parse_args(argv)
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)

    df = load_csv(a.csv)
    src = data_source(df); title = banner(src)
    check_data(df)
    ev, model, _ = run_experiment(df, n_boot=a.boot)
    print('\nCross-validation (training students only):', ev['cv'], '-> C =', ev['C'])
    print('Thresholds chosen on training students:', ev['thresholds_chosen_on_train'])
    table = results_table(ev, f'{title}. Held-out students: {ev["split"]["test"]["students"]} ({ev["split"]["test"]["pairs"]} pairs)')
    print('\n' + table)
    print('\nLearned coefficients (train-only fit; features are 0..1):')
    for f, c in sorted(ev['coefficients_train_fit'].items(), key=lambda kv: -abs(kv[1])):
        print(f'  {f:20s} {c:+.3f}')

    real = None
    if a.real:
        provider = str(df['sim_provider'].iloc[0]) if 'sim_provider' in df else None
        real = evaluate_real(model, load_csv(a.real), ev['thresholds_chosen_on_train'], provider)
        if real['skipped']:
            print('\nReal pilot check skipped:', real['reason'])
        else:
            print('\n' + results_table(real, f"real pilot data (small): {real['size']['pairs']} pairs, {real['size']['students']} students. "
                                             'Model trained on SYNTHETIC data, thresholds from synthetic training students.'))

    final = fit(df, ev['C'])   # deployed: refit on all pairs; the numbers above are from the train-only fit
    weights = export_weights(final, df, ev['C'], ev, a.csv)
    (out / 'weights.json').write_text(json.dumps(weights, indent=2))
    metrics = {'banner': title, 'data_source': src, 'dataset': describe(df), **ev,
               'coefficients_deployed': coefficients(final), 'real_pilot': real,
               'notes': ['Split by student; C, thresholds and model fitted on training students only.',
                         'precision@k: mean over test students with at least one positive; ties resolved by expected value.',
                         'oracle = the hidden true probability (synthetic only), an upper bound, never used for training.']}
    (out / 'metrics.json').write_text(json.dumps(metrics, indent=2))
    md = [f'# {title}', '', table]
    if real and not real['skipped']:
        md += ['', results_table(real, 'real pilot data (small)')]
    elif real:
        md += ['', f"Real pilot check skipped: {real['reason']}"]
    md += ['', '**Learned coefficients** (train-only fit): ' + ', '.join(f'{k} {v:+.3f}' for k, v in ev['coefficients_train_fit'].items())]
    (out / 'results.md').write_text('\n'.join(md) + '\n', encoding='utf-8')
    bar_chart(ev, out / 'results_chart.png', f'{title}\nHeld-out students, baseline vs learned')
    print(f'\nBeats the baseline on precision@{K} (95% interval of the difference above 0):', ev[f'beats_baseline_precision@{K}'])
    print(f'Wrote weights.json, metrics.json, results.md, results_chart.png to {out.resolve()}')
    print(f'[{title}]')
    return ev, weights


if __name__ == '__main__':
    main()
