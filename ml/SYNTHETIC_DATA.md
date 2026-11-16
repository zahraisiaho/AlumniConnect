# Synthetic data: what it is, how it is made, what it can and cannot show

> **SYNTHETIC DATA.** `ml/synthetic_pairs.csv` contains invented students, invented mentors and an invented "truth".
> Results on it show that the **method can learn a compatibility signal from data**. They say **nothing** about how well
> AlumniConnect matches real students. Every row has `data_source = synthetic`, and every output of `train.py` and the
> notebook repeats this banner.

## Why synthetic data
The learned matcher needs labelled pairs (did this mentorship work out?). The app does not yet have enough real
ratings, so the model is trained on a clearly labelled synthetic dataset. Real ratings, once collected on the
Improve matching page, are used as a separate external check ("real pilot data (small)").

## How to make it
```
py ml/make_synthetic.py            # seed 2026, 300 students, 60 mentors, 15 mentors per student -> 4,500 pairs
```
The same seed gives an identical file. Bios are embedded with **all-MiniLM-L6-v2 through the app's own code**
(`ml/embed_bios.mjs` calls `backend/src/embeddings.js`), so `semantic_sim` means exactly what it means in the app.
If Node or the model is unavailable it uses `sentence-transformers` with the same model; `--lexical` uses the app's
word-overlap fallback for quick runs (not for reported results).

## Columns
| Column | Meaning |
|---|---|
| `data_source` | always `synthetic` |
| `student_id`, `mentor_id` | invented ids (students 1 to 300, mentors 1001 to 1060) |
| `match_success` | the label: 1 = the mentorship would work out |
| `rule_score` | the app's rule score (`backend/src/matching.js`), ported exactly |
| 7 features | `field_match`, `skills_shared`, `interests_shared`, `industry_match`, `availability_match`, `same_university`, `semantic_sim`, computed exactly as `backend/src/hybrid.js` |
| `sim_provider` | text model used (`minilm-l6-v2`) |
| `true_p` | the hidden probability behind the label. **Never a feature.** Used only as an upper bound ("hidden truth") in the results |

## Assumptions

### People
* All values come from the app's vocabularies, read from `src/data/options.js` when the script runs. The script stops if any hand-written list uses a value the app does not have.
* **Fields:** 14 popular fields (Computer Science, Information Technology, Software Engineering, Data Science, Business Administration, Finance & Accounting, Economics, Law, Medicine & Health Sciences, Nursing, Civil Engineering, Marketing, Journalism & Mass Communication, Education) are 6 times as likely as the rest.
* **Universities:** 12 large Kenyan universities are 5 times as likely as the rest.
* **Skills follow the field.** Every field is in one of 8 groups: tech, quantitative, business, engineering, health, social and law, creative, and education and environment. Each pick comes from one of three pools:
  * 45% from the field's core skills, e.g. Data Science gives Python, SQL, Machine learning, Statistics, Data analysis.
  * 35% from the group's wider pool.
  * 20% from general skills.

  Students have 3 to 5 skills; mentors have 4 to 6.
* **Industry:** 80% from the group's usual industries, 20% any. For a student this is the industry they want to work in.
* **Interests:**
  * A student has one main goal, plus 1 or 2 more interests. CV & interview prep and career guidance are 3 times as likely as the main goal; technical skills and internships abroad are twice as likely.
  * A mentor offers 2 to 4 interests.
* **Availability:** uniform over the 4 options.
* **Bios:** template sentences built from the person's goals (students) or offers (mentors), field, industry and skills, e.g. *"Studying Data Science at KCA University. I am looking for a mentor who can help me write a stronger CV..."*. 8% of people have no bio, and the app treats a missing bio as similarity 0.

### Pairs
* Each student is paired with 15 different mentors. Mentors from the same field are 6 times as likely to be picked, and mentors from the same field group 3 times as likely, compared with others. Real candidate lists are mostly relevant mentors.

### The hidden label (deliberately different from the rules)
```
z = a + 2.0 * goal_met                          the student's main goal is something the mentor offers
      + 2.5 * text                              (semantic_sim - 0.45) / 0.15 clipped to [-2, 2]; 0 if a bio is missing
      + 0.9 * min(shared interests, 3)
      + 1.2 * (1 - exp(-0.9 * shared skills))   diminishing returns
      + 0.2 * field_match + 1.0 * field_match * (shared interests > 0)
      + 0.35 * industry_match
      - 0.9 * availability clash                both fixed and different ("Flexible" fits anything)
      + 0.15 * same_university
      + Normal(0, 0.6) noise                    unobserved "chemistry"
match_success ~ Bernoulli(sigmoid(z))
```
* `a` is solved by bisection so that the average probability is 0.35. The file has 35.4% positives.
* **How this differs from the rules:**
  * Goals and text similarity carry the most weight; the rules ignore both.
  * Interest overlap matters more than skills.
  * Skills have diminishing returns.
  * Field mostly matters together with shared interests.
  * An availability clash is a penalty, but "Flexible" never clashes.
  * University barely matters.
* **Not a function of the rule score:** the tests check that pairs with the same rule score get both labels, and that the hidden probability is far from monotone in the rule score.
* **What the 7 features don't see:** `goal_met`, the availability-clash rule and the noise. No model on these features can reach the hidden truth, and the "hidden truth" column in the results shows how much is left.

## What the results can and cannot be used for
* **Can:**
  * The pipeline works end to end: data, a split by student, tuning, thresholds, metrics, export, and serving in the app.
  * A logistic regression recovers a signal the rules miss when such a signal exists.
  * The comparison and confidence-interval code is correct.
* **Cannot:**
  * Any claim about real match quality, or that real students prefer the learned ranking.
  * Any claim that the coefficients reflect real preferences: they reflect the assumptions above.
