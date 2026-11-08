"""Builds AlumniConnect_matching_training.ipynb from train.py so the notebook and the script cannot drift apart."""
import inspect, nbformat as nbf
import train

md = nbf.v4.new_markdown_cell
code = nbf.v4.new_code_cell
fn = lambda *names: '\n\n'.join(inspect.getsource(getattr(train, n)) for n in names)

cells = [
 md("""# AlumniConnect: learning the matching weights

**Question.** Does a model that learns from tester ratings, using the rule-based signals plus text similarity, rank mentors better than the hand-weighted rules?

**Baseline.** The rule-based score (`rule_score`), exactly as used in the app.
**Model.** Logistic regression on 7 features (all scaled 0 to 1). It predicts the probability that a student finds a mentor helpful.
**Evaluation.** Whole students are held out (no student is in both training and test data). Metrics: AUC, precision@3 and NDCG@3, with a bootstrap 95% interval on the NDCG difference.

**How to use.** Runtime > Run all. When asked, upload `alumniconnect_feedback.csv` (Admin page > Export training data). At the end, download `weights.json` and put it in `backend/model/`.

If you have no real ratings yet, set `USE_DEMO = True` in the next cell to test the pipeline. **Demo results are synthetic and must never be reported.**"""),
 code("USE_DEMO = False   # True = synthetic data, only to test that the notebook runs\nCSV_PATH = 'alumniconnect_feedback.csv'   # used when running outside Colab\n\n!pip -q install scikit-learn pandas numpy 2>/dev/null\nimport hashlib, json, sys, datetime, platform\nimport numpy as np\nimport pandas as pd\nimport sklearn\nfrom sklearn.linear_model import LogisticRegression\nfrom sklearn.metrics import roc_auc_score\nfrom sklearn.model_selection import GroupKFold, GroupShuffleSplit\n\nSEED = 42\nK = 3\nFEATURES = " + repr(train.FEATURES) + "\nREQUIRED = ['student_id', 'mentor_id', 'helpful', 'rule_score'] + FEATURES\nprint('scikit-learn', sklearn.__version__, '| python', platform.python_version())"),
 md("## 1. Helper functions\nThese are the same functions as `ml/train.py`."),
 code(fn('load_csv','check_data','safe_auc','rank_metrics','split_students','fit','select_C','evaluate','fairness','export_weights','make_demo')),
 md("## 2. Load the data\nThe export contains only ids and numbers: no names, emails or profile text."),
 code("""if USE_DEMO:
    df = make_demo()
else:
    try:
        from google.colab import files
        CSV_PATH = next(iter(files.upload()))
    except ImportError:
        pass   # running locally: CSV_PATH above is used
    df = load_csv(CSV_PATH)
df.head()"""),
 md("## 3. Check the data\nRead every warning. With few students or ratings the results below are weak evidence, and the report must say so."),
 code("warnings = check_data(df)"),
 md("## 4. Hold out students, then evaluate the baseline\nThe test students are never used for training or for choosing settings."),
 code("""train_df, test_df = split_students(df)
print(len(train_df), 'training pairs from', train_df.student_id.nunique(), 'students;',
      len(test_df), 'test pairs from', test_df.student_id.nunique(), 'students')"""),
 md("## 5. Choose the regularisation strength (training students only)\nGrouped cross-validation keeps each student's pairs together."),
 code("best_C, cv_table = select_C(train_df)\npd.DataFrame(cv_table)"),
 md("## 6. Train and evaluate on the held-out students\n`beats_baseline` is true only if the whole 95% interval for the NDCG@3 difference is above zero."),
 code("""held_out_model = fit(train_df, best_C)
evaluation = evaluate(test_df, held_out_model)
print(json.dumps(evaluation, indent=2))"""),
 md("## 7. What did it learn?\nPositive weight = increases the predicted chance that the mentor is helpful. Compare with the hand-set weights in `matching.js`."),
 code("""pd.Series(dict(zip(FEATURES, held_out_model.coef_[0]))).sort_values().to_frame('learned weight').round(3)"""),
 md("## 8. Fairness check across universities\nIs the model equally useful for same-university and cross-university pairs?"),
 code("fair = fairness(test_df, held_out_model)\npd.DataFrame(fair).T"),
 md("## 9. Export the model\nThe deployed model is refitted on all rated pairs. The numbers above come from the train-only fit.\n\n**Only deploy it if the verdict above is `True`** or if you can justify using it anyway. Otherwise keep the rule-based matching and report the result honestly: a negative result with small data is still a valid finding."),
 code("""final_model = fit(df, best_C)
weights = export_weights(final_model, df, best_C, evaluation, None if USE_DEMO else CSV_PATH)
json.dump(weights, open('weights.json', 'w'), indent=2)
json.dump({'evaluation': evaluation, 'cv': cv_table, 'fairness': fair}, open('metrics.json', 'w'), indent=2)
print('Beats the rule-based baseline on held-out students:', evaluation['beats_baseline'])
try:
    from google.colab import files
    files.download('weights.json'); files.download('metrics.json')
except ImportError:
    print('Saved weights.json and metrics.json in the current folder.')"""),
 md("## 10. Record for your report\nKeep: the exported CSV and its SHA-256 (inside `weights.json`), the library versions, the seed, `metrics.json`, and a screenshot of sections 3, 6 and 8.")
]
nb = nbf.v4.new_notebook(cells=cells, metadata={'kernelspec': {'name': 'python3', 'display_name': 'Python 3'}, 'language_info': {'name': 'python'}})
nbf.write(nb, 'AlumniConnect_matching_training.ipynb')
print('notebook cells:', len(cells))
