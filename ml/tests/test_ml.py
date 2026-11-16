"""Tests for the synthetic generator and the training/evaluation code.  Run:  py -m unittest discover ml/tests -v
They use the app's lexical text fallback (no model download) and small datasets, so they run in seconds."""
import sys, unittest
from pathlib import Path
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import make_synthetic as ms   # noqa: E402
import train                  # noqa: E402


def small(seed=11, n_students=120):
    return ms.generate(n_students=n_students, n_mentors=30, pairs_per_student=12, seed=seed, embed=ms.lexical_embed)


def ranks(x):
    return pd.Series(x).rank().to_numpy()


class Generator(unittest.TestCase):
    def test_reproducible_with_the_same_seed(self):
        pd.testing.assert_frame_equal(small(5), small(5))

    def test_a_different_seed_gives_different_data(self):
        self.assertFalse(small(5).equals(small(6)))

    def test_clearly_labelled_and_shaped_like_the_app(self):
        df = small()
        self.assertEqual(list(df.columns), ms.COLUMNS)
        self.assertTrue((df['data_source'] == 'synthetic').all())
        self.assertTrue(df[ms.FEATURES].apply(lambda c: c.between(0, 1).all()).all())
        self.assertTrue(set(df['match_success'].unique()) <= {0, 1})
        self.assertTrue(0.28 <= df['match_success'].mean() <= 0.42, df['match_success'].mean())

    def test_people_only_use_the_app_vocabulary(self):
        vocab = ms.load_vocab()
        _, students, mentors = ms.generate(60, 20, 8, seed=3, embed=ms.lexical_embed, return_people=True)
        for p in [*students.values(), *mentors.values()]:
            self.assertIn(p['field'], vocab['fields']); self.assertIn(p['university'], vocab['universities'])
            self.assertIn(p['industry'], vocab['industries']); self.assertIn(p['availability'], vocab['availability'])
            self.assertTrue(set(p['skills']) <= set(vocab['skills'])); self.assertTrue(set(p['interests']) <= set(vocab['interests']))

    def test_skills_correlate_with_field(self):
        _, students, _ = ms.generate(600, 10, 2, seed=4, embed=ms.lexical_embed, return_people=True)
        tech = [p for p in students.values() if p['field'] == 'Data Science']
        other = [p for p in students.values() if p['group'] not in ('tech', 'quant')]
        rate = lambda ps: np.mean(['Python' in p['skills'] for p in ps])
        self.assertGreater(len(tech), 5)
        self.assertGreater(rate(tech), rate(other) + 0.25)   # about 0.41 vs 0.04 with this seed
        self.assertGreater(rate(tech), 5 * rate(other))

    def test_rule_score_and_features_match_the_app_worked_example(self):
        # backend/test/hybrid.test.js: Amina and Brian
        amina = dict(university='Strathmore University', field='Computer Science', industry='Technology', availability='Weekday evenings',
                     skills=['Python', 'React', 'SQL'], interests=['Career guidance', 'Internships abroad', 'Technical skills'])
        brian = dict(university='University of Nairobi', field='Computer Science', industry='Technology', availability='Weekday evenings',
                     skills=['Python', 'Cloud', 'SQL'], interests=['Technical skills', 'Career guidance'])
        self.assertEqual(ms.rule_score(amina, brian), 30 + 16 + 24 + 10 + 5)
        f = ms.pair_features(amina, brian, 0.4)
        self.assertEqual(list(f), ms.FEATURES)
        self.assertAlmostEqual(f['skills_shared'], 2 / 3); self.assertAlmostEqual(f['interests_shared'], 2 / 3)
        self.assertEqual((f['field_match'], f['same_university'], f['semantic_sim']), (1.0, 0.0, 0.4))


class LabelsAreNotTheRules(unittest.TestCase):
    df = small(n_students=200)

    def test_pairs_with_the_same_rule_score_get_both_labels(self):
        mixed = self.df.groupby('rule_score')['match_success'].agg(lambda y: 0 < y.mean() < 1)
        self.assertGreaterEqual(int(mixed.sum()), 10)

    def test_hidden_probability_is_not_a_monotone_function_of_the_rule_score(self):
        r, p = self.df['rule_score'].to_numpy(), self.df['true_p'].to_numpy()
        rng = np.random.default_rng(0); i, j = rng.integers(0, len(r), (2, 20000))
        keep = r[i] > r[j]
        discordant = np.mean(p[i][keep] < p[j][keep])
        self.assertGreater(discordant, 0.10)
        spearman = np.corrcoef(ranks(r), ranks(p))[0, 1]
        self.assertLess(spearman, 0.85)

    def test_the_rules_do_not_predict_the_label_perfectly(self):
        self.assertLess(train.safe_auc(self.df['match_success'], self.df['rule_score']), 0.9)

    def test_hidden_function_weights_differ_from_the_rules(self):
        # Two pairs the rules score the same way can differ in truth: only the goal (not a rule feature) differs.
        s = dict(field='Law', skills=['Legal research'], interests=['Career guidance', 'Networking'], goal='Career guidance', industry='Legal Services',
                 availability='Weekends', university='KCA University', bio='')
        m1 = dict(s, interests=['Career guidance'], bio='')
        m2 = dict(s, interests=['Networking'], bio='')
        self.assertEqual(ms.rule_score(s, m1), ms.rule_score(s, m2))
        self.assertGreater(ms.latent(s, m1, 0) - ms.latent(s, m2, 0), 1.5)


class Split(unittest.TestCase):
    def test_no_student_is_in_both_train_and_test(self):
        df = small(); df['label'] = df['match_success']
        tr, te = train.split_students(df)
        self.assertFalse(set(tr.student_id) & set(te.student_id))
        self.assertEqual(set(tr.student_id) | set(te.student_id), set(df.student_id))
        self.assertEqual(len(tr) + len(te), len(df))

    def test_settings_and_thresholds_never_look_at_test_labels(self):
        df = small(); df['label'] = df['match_success']
        ev1, _, (_, te) = train.run_experiment(df, n_boot=20)
        flipped = df.copy(); mask = flipped.student_id.isin(set(te.student_id))
        flipped.loc[mask, 'label'] = 1 - flipped.loc[mask, 'label']
        ev2, _, _ = train.run_experiment(flipped, n_boot=20)
        self.assertEqual(ev1['C'], ev2['C'])
        self.assertEqual(ev1['thresholds_chosen_on_train'], ev2['thresholds_chosen_on_train'])
        self.assertEqual(ev1['coefficients_train_fit'], ev2['coefficients_train_fit'])
        self.assertNotEqual(ev1['metrics']['learned']['auc'], ev2['metrics']['learned']['auc'])


class MetricsByHand(unittest.TestCase):
    # Student A: labels 1 0 1 0, scores .9 .8 .3 .1 -> p@1 = 1, p@3 = 2/3
    # Student B: labels 0 1 0, scores 5 5 1 (a tie at the top) -> p@1 = 1/2 (expected), p@3 = 1/3
    # Student C: no positives -> left out of precision@k
    tiny = pd.DataFrame({'student_id': ['A'] * 4 + ['B'] * 3 + ['C'] * 2,
                         'label': [1, 0, 1, 0, 0, 1, 0, 0, 0],
                         'score': [.9, .8, .3, .1, 5, 5, 1, 2, 3]})

    def test_precision_at_k(self):
        self.assertEqual(train.precision_at_k([1, 0, 1, 0], [.9, .8, .3, .1], 1), 1.0)
        self.assertAlmostEqual(train.precision_at_k([1, 0, 1, 0], [.9, .8, .3, .1], 3), 2 / 3)
        self.assertAlmostEqual(train.precision_at_k([0, 1, 0], [5, 5, 1], 1), 0.5)
        self.assertAlmostEqual(train.precision_at_k([0, 1, 0], [5, 5, 1], 3), 1 / 3)
        self.assertAlmostEqual(train.precision_at_k([1, 0], [1, 0], 5), 0.5)   # fewer pairs than k
        p = train.per_student_precision(self.tiny, 'score', 1)
        self.assertEqual(set(p), {'A', 'B'})
        self.assertAlmostEqual(np.mean(list(p.values())), 0.75)
        self.assertAlmostEqual(np.mean(list(train.per_student_precision(self.tiny, 'score', 3).values())), 0.5)

    def test_accuracy_f1_auc(self):
        y, s = [1, 0, 1, 0], [.9, .8, .3, .1]
        acc, f1 = train.accuracy_f1(y, s, 0.5)   # predicts 1 1 0 0: tp 1, fp 1, fn 1, tn 1
        self.assertAlmostEqual(acc, 0.5); self.assertAlmostEqual(f1, 0.5)
        self.assertAlmostEqual(train.safe_auc(y, s), 0.75)   # 3 of the 4 positive-negative pairs are ordered correctly
        self.assertEqual(train.accuracy_f1([0, 0], [.1, .2], 0.5), (1.0, 0.0))
        self.assertTrue(np.isnan(train.safe_auc([1, 1], [.2, .3])))

    def test_threshold_is_the_best_f1_on_the_data_given(self):
        # t = .1 -> F1 .667, t = .3 -> .8, t = .8 -> .5, t = .9 -> .667
        t, f1 = train.choose_threshold([1, 0, 1, 0], [.9, .8, .3, .1])
        self.assertEqual(t, .3); self.assertAlmostEqual(f1, 0.8)

    def test_bootstrap_interval_contains_the_point_estimate(self):
        df = small(); df['label'] = df['match_success']
        ci = train.bootstrap(df, {'baseline': ('rule_score', 20), 'learned': ('true_p', 0.5)}, n_boot=200)
        point = train.metrics_for(df, 'rule_score', 20)
        for m in train.METRICS:
            lo, hi = ci['baseline'][m]
            self.assertLessEqual(lo, point[m] + 1e-9); self.assertGreaterEqual(hi, point[m] - 1e-9)
        self.assertIn('difference', ci)


class RealPilot(unittest.TestCase):
    def test_too_few_real_ratings_are_skipped_cleanly(self):
        df = small(); df['label'] = df['match_success']
        _, model, _ = train.run_experiment(df, n_boot=10)
        few = df.head(12).drop(columns=['true_p']).assign(data_source='real ratings')
        r = train.evaluate_real(model, few, {'baseline_rule_score': 20, 'learned_probability': 0.4}, 'lexical-hash-256')
        self.assertTrue(r['skipped']); self.assertIn('too few', r['reason'])


if __name__ == '__main__':
    unittest.main()
