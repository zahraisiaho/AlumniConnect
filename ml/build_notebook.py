"""Builds AlumniConnect_matching_training.ipynb from train.py, so the notebook and the script cannot drift apart.
Run from ml/:  py build_notebook.py"""
import inspect, nbformat as nbf
import train

md = nbf.v4.new_markdown_cell
code = nbf.v4.new_code_cell
SRC = inspect.getsource(train).split("\nif __name__ == '__main__':")[0]
BANNER_MD = '> ## ⚠️ SYNTHETIC DATA\n> Every number in this notebook comes from invented people and an invented "truth" (see `SYNTHETIC_DATA.md`). It shows that the **method can learn from data**. It is **not** evidence of real-world performance.'

cells = [
 md(f"""# AlumniConnect: a learned matcher vs the rule-based baseline

{BANNER_MD}

**Question.** Can a model that learns from mentor-student features rank mentors better than the hand-weighted rules?

* **Baseline:** the app's rule score (`backend/src/matching.js`), unchanged.
* **Learned model (deployable):** logistic regression on the app's 7 features (all 0..1). The backend serves exactly this model from `weights.json`.
* **Comparison only (not deployed):** a random forest, in section 8.
* **Data:** `ml/synthetic_pairs.csv`, made by `ml/make_synthetic.py` (seeded; `data_source = 'synthetic'`). Its hidden label `match_success` comes from a compatibility function that is deliberately different from the rule weights.
* **Evaluation:** whole students held out; C chosen by grouped cross-validation on training students; accuracy/F1 thresholds chosen on training students only; precision@1/3/5, accuracy, F1 and AUC with 95% bootstrap intervals over test students.

**How to use.** Runtime > Run all. Upload `synthetic_pairs.csv` when asked. Optionally upload a real ratings export (Admin > Export training data) in section 9. Download `weights.json` and `metrics.json` at the end."""),
 code("!pip -q install scikit-learn pandas numpy matplotlib 2>/dev/null\nimport warnings; warnings.filterwarnings('ignore')\nCSV_PATH = 'synthetic_pairs.csv'   # used when running outside Colab"),
 md("## 1. The training and evaluation code\nThis is `ml/train.py`, copied in when the notebook is built."),
 code(SRC),
 md("## 2. Load the data"),
 code("""try:
    from google.colab import files
    CSV_PATH = next(iter(files.upload()))
except ImportError:
    pass   # running locally: CSV_PATH above is used
df = load_csv(CSV_PATH)
SOURCE = data_source(df); TITLE = banner(SOURCE)
print(TITLE)
df.head()"""),
 md("## 3. Check the data"),
 code("warnings_found = check_data(df)\ndf[FEATURES + ['rule_score', 'label']].describe().round(3)"),
 md("## 4. Split by student, choose C, choose thresholds (training students only), evaluate on held-out students"),
 code("""ev, held_out_model, (train_df, test_df) = run_experiment(df)
assert not set(train_df.student_id) & set(test_df.student_id), 'a student is in both train and test'
print('train:', ev['split']['train']); print('test :', ev['split']['test'])
print('C =', ev['C'], '| thresholds chosen on training students:', ev['thresholds_chosen_on_train'])
pd.DataFrame(ev['cv'])"""),
 md(f"## 5. Results: baseline vs learned\n{BANNER_MD}\n\n`Hidden truth` ranks by the true probability used to make the labels. Nothing can beat it; it shows how much room is left."),
 code("""from IPython.display import Markdown, Image, display
display(Markdown(results_table(ev, f"{TITLE}. Held-out students: {ev['split']['test']['students']}")))
print('Beats the baseline on precision@3 (whole 95% interval of the difference above 0):', ev['beats_baseline_precision@3'])"""),
 code("bar_chart(ev, 'results_chart.png', f'{TITLE}\\nHeld-out students, baseline vs learned'); display(Image('results_chart.png'))"),
 md("## 6. What did the model learn?\nPositive weight = raises the predicted chance of a successful match. All features are 0..1, so the sizes are comparable. Compare with the rule points: field 30, skills up to 25, interests up to 25, industry 10, availability 5, university 5, text 0."),
 code("""rule_points = {'field_match': 30, 'skills_shared': 25, 'interests_shared': 25, 'industry_match': 10, 'availability_match': 5, 'same_university': 5, 'semantic_sim': 0}
pd.DataFrame({'learned weight (SYNTHETIC DATA)': ev['coefficients_train_fit'], 'rule points (max)': rule_points}).sort_values('learned weight (SYNTHETIC DATA)', ascending=False)"""),
 md("## 7. Fairness check across universities\nIs the model equally useful for same-university and cross-university pairs?"),
 code("""t = test_df.copy(); t['learned'] = held_out_model.predict_proba(t[FEATURES])[:, 1]
pd.DataFrame({name: {'pairs': len(d), 'positive rate': d['label'].mean(), 'mean predicted': d['learned'].mean(), 'auc': safe_auc(d['label'], d['learned'])}
              for name, d in (('same university', t[t.same_university == 1]), ('other university', t[t.same_university == 0]))}).T.round(3)"""),
 md(f"## 8. Comparison only: random forest (not deployed)\n{BANNER_MD}\n\nSame split, same threshold rule (best F1 on out-of-fold training predictions), same metrics. The backend cannot serve a forest; this only shows whether a more flexible model finds more signal."),
 code("""from sklearn.ensemble import RandomForestClassifier
rf_make = lambda: RandomForestClassifier(n_estimators=300, min_samples_leaf=20, random_state=SEED, n_jobs=-1)
oof = np.zeros(len(train_df))
for a, b in GroupKFold(n_splits=5).split(train_df, groups=train_df['student_id']):
    oof[b] = rf_make().fit(train_df.iloc[a][FEATURES], train_df.iloc[a]['label']).predict_proba(train_df.iloc[b][FEATURES])[:, 1]
t_rf, _ = choose_threshold(train_df['label'], oof)
rf = rf_make().fit(train_df[FEATURES], train_df['label'])
t['forest'] = rf.predict_proba(t[FEATURES])[:, 1]
cmp_models = {'baseline': ('rule_score', ev['thresholds_chosen_on_train']['baseline_rule_score']),
              'learned': ('learned', ev['thresholds_chosen_on_train']['learned_probability']), 'forest': ('forest', t_rf)}
cmp_ci = bootstrap(t, cmp_models, n_boot=1000)
pd.DataFrame({f'{name} (SYNTHETIC)': {m: f"{metrics_for(t, col, thr)[m]:.3f} [{cmp_ci[name][m][0]:.3f}, {cmp_ci[name][m][1]:.3f}]" for m in METRICS}
              for name, (col, thr) in cmp_models.items()})"""),
 md("## 9. Optional external check: real pilot data (small)\nIf students have rated mentors on the Improve matching page, upload the export (Admin > Export training data). The synthetic-trained model and the synthetic-chosen thresholds are applied unchanged. With few ratings this is skipped, and even when it runs the intervals are wide."),
 code("""REAL_PATH = None   # e.g. 'alumniconnect_feedback.csv' when running locally
try:
    from google.colab import files
    up = files.upload()   # press Cancel to skip
    REAL_PATH = next(iter(up)) if up else None
except Exception:
    pass
real = None
if REAL_PATH:
    real = evaluate_real(held_out_model, load_csv(REAL_PATH), ev['thresholds_chosen_on_train'], str(df['sim_provider'].iloc[0]) if 'sim_provider' in df else None)
    if real['skipped']: print('Skipped:', real['reason'])
    else: display(Markdown(results_table(real, 'real pilot data (small). Model trained on SYNTHETIC data')))
else:
    print('No real ratings uploaded: external check skipped.')"""),
 md("## 10. Export\nThe deployed model is refitted on all synthetic pairs with the chosen C (the numbers above come from the train-only fit). Put `weights.json` in `backend/model/` and restart the backend; the matches page then says **Learned model (trained on synthetic data)**."),
 code("""final_model = fit(df, ev['C'])
weights = export_weights(final_model, df, ev['C'], ev, CSV_PATH)
metrics = {'banner': TITLE, 'data_source': SOURCE, 'dataset': describe(df), **ev, 'coefficients_deployed': coefficients(final_model), 'real_pilot': real}
json.dump(weights, open('weights.json', 'w'), indent=2); json.dump(metrics, open('metrics.json', 'w'), indent=2)
print(TITLE); print('data_source:', weights['data_source'], '| dataset:', weights['dataset'])
try:
    from google.colab import files
    files.download('weights.json'); files.download('metrics.json'); files.download('results_chart.png')
except ImportError:
    print('Saved weights.json, metrics.json and results_chart.png in the current folder.')"""),
 md(f"## 11. For the report\n{BANNER_MD}\n\nKeep `synthetic_pairs.csv` (its SHA-256 is in `weights.json`), the seed, library versions, `metrics.json`, the chart and sections 5, 6 and 8. Say plainly: *the learned model was trained and evaluated on synthetic data; this demonstrates the method, not real-world performance.*"),
]
nb = nbf.v4.new_notebook(cells=cells, metadata={'kernelspec': {'name': 'python3', 'display_name': 'Python 3'}, 'language_info': {'name': 'python'}})
nbf.write(nb, 'AlumniConnect_matching_training.ipynb')
print('notebook cells:', len(cells))
