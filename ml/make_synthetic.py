"""AlumniConnect: CLEARLY LABELLED SYNTHETIC mentor-student pairs for training and evaluating the learned matcher.

    py ml/make_synthetic.py                      -> ml/synthetic_pairs.csv (seed 2026, 300 students, 60 mentors)
    py ml/make_synthetic.py --seed 7 --out x.csv
    py ml/make_synthetic.py --lexical            (no model download: the app's word-overlap fallback; for quick runs only)

Every row has data_source = 'synthetic'. These are invented people and an invented "truth". A model trained on this file
shows that the METHOD can learn a compatibility signal from data; it says NOTHING about how well AlumniConnect works for
real students. Never present these numbers as real-world performance.

How the data is made (all assumptions, also in ml/SYNTHETIC_DATA.md)
--------------------------------------------------------------------
People
  * 300 students and 60 mentors (alumni open to mentoring). Every value comes from the app's own vocabularies, read from
    src/data/options.js at run time (universities, fields, industries, skills, interests, availability).
  * Fields are not equally common: 14 popular fields (Computer Science, Business Administration, Law, Nursing ...) are
    6 times more likely than the rest. 12 large Kenyan universities are 5 times more likely than the rest.
  * Skills correlate with the field. Each field belongs to one of 8 groups (tech, quantitative, business, engineering,
    health, social and law, creative, education and environment). A person's skills are drawn about 45% from the
    field's core skills (e.g. Data Science -> Python, SQL, Machine learning, Statistics, Data analysis), 35% from the
    group's wider pool and 20% from general skills (Communication, Leadership ...). Students have 3 to 5, mentors 4 to 6.
  * Industry: 80% from the field group's usual industries, otherwise any industry. For a student it is the industry
    they want to work in (the app stores it in the same profile field).
  * Interests: a student has one main goal (one of the app's 9 mentorship interests; CV prep, career guidance,
    technical skills and internships are more common) plus 1 or 2 more. A mentor offers 2 to 4 interests.
  * Availability: uniform over the 4 options.
  * Bios: short sentences from templates, built from the person's goals/offers, field, industry and skills, so the
    text similarity measures something real. 8% of people leave the bio empty (the app then uses similarity 0).

Pairs and features
  * Each student is paired with 15 mentors, drawn without replacement with weights 6 (same field), 3 (same field group)
    and 1 (other), because the mentors a student actually sees are mostly relevant ones.
  * The 7 features are computed exactly as the app does (backend/src/hybrid.js pairFeatures), and rule_score exactly as
    backend/src/matching.js scoreMatch. semantic_sim is the cosine similarity of the two bios under all-MiniLM-L6-v2, by
    default through the app's own embedding code (ml/embed_bios.mjs), so the number means the same as in the app.

The hidden label "match_success" (1 = the mentorship would work out, 0 = not)
  It comes from a latent compatibility score that is deliberately DIFFERENT from the rule weights:
      z = a + 2.0 * goal_met                         student's main goal is one the mentor offers
            + 2.5 * text                             (semantic_sim - 0.45) / 0.15, clipped to [-2, 2]; 0 if a bio is empty
            + 0.9 * min(shared interests, 3)          interest overlap matters a lot
            + 1.2 * (1 - exp(-0.9 * shared skills))   diminishing returns: the 1st shared skill helps most
            + 0.2 * field_match + 1.0 * field_match * (shared interests > 0)   field matters mainly with shared interests
            + 0.35 * industry_match
            - 0.9 * availability clash               both fixed and different; "Flexible" fits anything
            + 0.15 * same_university
            + noise ~ Normal(0, 0.6)                  unobserved "chemistry"; makes the label non-deterministic
      match_success ~ Bernoulli(sigmoid(z))
  The intercept a is solved by bisection so the average probability is 0.35 (target 30 to 40% positives).
  Compare the rules: field 30 points, skills 8 each up to 25, interests 12 each up to 25, industry 10, availability 5,
  university 5, and no use of goals or text. true_p (= sigmoid(z)) is saved for reference only. It is the unknowable
  truth, never a feature, and gives an upper bound for any ranking.

Reproducibility: everything is drawn from numpy's default_rng(seed); the same seed and embedder give an identical file.
"""
import argparse, hashlib, json, math, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OPTIONS_JS = ROOT / 'src' / 'data' / 'options.js'
FEATURES = ['field_match', 'skills_shared', 'interests_shared', 'industry_match', 'availability_match', 'same_university', 'semantic_sim']
COLUMNS = ['data_source', 'student_id', 'mentor_id', 'match_success', 'rule_score', *FEATURES, 'sim_provider', 'true_p']
TARGET_RATE = 0.35


# ---------- vocabularies (from the app) ----------
def load_vocab(path=OPTIONS_JS):
    """Reads every `export const name = [ '...', ... ]` list from src/data/options.js."""
    src = Path(path).read_text(encoding='utf-8')
    vocab = {}
    for name, body in re.findall(r'export const (\w+) = \[(.*?)\]', src, flags=re.S):
        body = re.sub(r'//[^\n]*', '', body)
        vocab[name] = [a or b for a, b in re.findall(r"'([^']*)'|\"([^\"]*)\"", body)]
    return vocab


GROUPS = {
    'tech': dict(
        fields=['Computer Science', 'Information Technology', 'Software Engineering', 'Data Science', 'Information Systems', 'Telecommunications Engineering'],
        skills=['Python', 'JavaScript', 'React', 'SQL', 'Java', 'Node.js', 'Cloud', 'AWS', 'Git', 'Linux', 'Web development', 'Mobile development',
                'Cybersecurity', 'DevOps', 'Machine learning', 'Data analysis', 'Networking', 'TypeScript', 'UI/UX design'],
        industries=['Technology', 'Fintech', 'Telecommunications', 'Retail & E-commerce', 'Finance & Banking'],
        jobs=['Software Engineer', 'Data Scientist', 'Cloud Engineer', 'Product Manager', 'Security Analyst', 'Mobile Developer']),
    'quant': dict(
        fields=['Mathematics', 'Statistics & Actuarial Science', 'Economics', 'Physics'],
        skills=['Statistics', 'R', 'Python', 'Excel', 'Data analysis', 'Financial modelling', 'Research', 'SQL', 'Machine learning', 'Power BI'],
        industries=['Finance & Banking', 'Insurance', 'Research & Academia', 'Consulting', 'Fintech', 'Government & NGO'],
        jobs=['Actuarial Analyst', 'Economist', 'Data Analyst', 'Risk Analyst', 'Research Fellow']),
    'business': dict(
        fields=['Business Administration', 'Finance & Accounting', 'Commerce', 'Marketing', 'Human Resource Management', 'Procurement & Supply Chain', 'Hospitality & Tourism'],
        skills=['Accounting', 'Auditing', 'Taxation', 'Excel', 'Financial modelling', 'Business analysis', 'Project management', 'Sales', 'Marketing',
                'Digital marketing', 'Negotiation', 'Supply chain management', 'Procurement', 'Human resources', 'Entrepreneurship', 'Customer service', 'Power BI'],
        industries=['Finance & Banking', 'Accounting & Audit', 'Consulting', 'FMCG & Consumer Goods', 'Retail & E-commerce', 'Hospitality & Tourism',
                    'Marketing & Advertising', 'Human Resources & Recruitment', 'Insurance'],
        jobs=['Financial Analyst', 'Auditor', 'Marketing Manager', 'HR Business Partner', 'Supply Chain Manager', 'Management Consultant']),
    'engineering': dict(
        fields=['Engineering', 'Civil Engineering', 'Electrical & Electronic Engineering', 'Mechanical Engineering', 'Architecture & Urban Planning', 'Aviation'],
        skills=['AutoCAD', '3D modelling', 'Project management', 'GIS', 'Problem solving', 'Python', 'Excel', 'Research', 'C++'],
        industries=['Real Estate & Construction', 'Manufacturing', 'Renewable Energy', 'Aviation & Logistics', 'Transport & Automotive', 'Mining & Oil and Gas', 'Agriculture & Energy'],
        jobs=['Civil Engineer', 'Electrical Engineer', 'Project Engineer', 'Architect', 'Maintenance Engineer']),
    'health': dict(
        fields=['Medicine & Health Sciences', 'Nursing', 'Pharmacy', 'Public Health', 'Dentistry', 'Veterinary Medicine', 'Food Science & Nutrition',
                'Biology & Biochemistry', 'Biotechnology', 'Chemistry'],
        skills=['Clinical skills', 'Laboratory techniques', 'Research', 'Statistics', 'Monitoring & evaluation', 'Data analysis', 'Critical thinking'],
        industries=['Healthcare', 'Pharmaceuticals', 'Research & Academia', 'Government & NGO', 'International Development', 'FMCG & Consumer Goods'],
        jobs=['Medical Officer', 'Clinical Nurse', 'Pharmacist', 'Public Health Officer', 'Laboratory Scientist']),
    'social': dict(
        fields=['Law', 'International Relations', 'Political Science', 'Development Studies', 'Psychology', 'Sociology', 'Social Work', 'History',
                'Theology & Religious Studies', 'Languages & Literature'],
        skills=['Legal research', 'Contract drafting', 'Policy analysis', 'Research', 'Public speaking', 'Grant writing', 'Monitoring & evaluation',
                'Negotiation', 'Content writing', 'Swahili', 'French', 'Fundraising'],
        industries=['Legal Services', 'Government & NGO', 'International Development', 'Research & Academia', 'Consulting', 'Education'],
        jobs=['Advocate', 'Policy Analyst', 'Programme Officer', 'Counselling Psychologist', 'Legal Counsel']),
    'creative': dict(
        fields=['Design & Media', 'Journalism & Mass Communication', 'Fine Art', 'Music & Performing Arts', 'Film & Animation', 'Fashion Design'],
        skills=['Graphic design', 'UI/UX design', 'Video editing', 'Photography', 'Content writing', 'Copywriting', 'Social media management',
                'Digital marketing', 'SEO', '3D modelling', 'Public speaking'],
        industries=['Creative & Media', 'Marketing & Advertising', 'Sports & Entertainment', 'Fashion & Beauty', 'Technology'],
        jobs=['Creative Director', 'Journalist', 'Graphic Designer', 'Content Producer', 'Brand Strategist']),
    'education_env': dict(
        fields=['Education', 'Agriculture & Environment', 'Environmental Science', 'Sports Science'],
        skills=['Teaching', 'Mentoring', 'Research', 'GIS', 'Monitoring & evaluation', 'Event planning', 'Grant writing', 'Data analysis'],
        industries=['Education', 'Agriculture & Energy', 'Environment & Conservation', 'Water & Sanitation', 'Sports & Entertainment', 'Renewable Energy', 'International Development'],
        jobs=['Teacher', 'Agronomist', 'Conservation Officer', 'Sports Programme Coordinator', 'Education Programme Lead']),
}
FIELD_CORE = {
    'Data Science': ['Python', 'SQL', 'Machine learning', 'Statistics', 'Data analysis'],
    'Computer Science': ['Python', 'Java', 'Git', 'Web development', 'SQL'],
    'Software Engineering': ['JavaScript', 'React', 'Git', 'Node.js', 'TypeScript'],
    'Information Technology': ['Networking', 'Linux', 'Cloud', 'Cybersecurity'],
    'Information Systems': ['SQL', 'Business analysis', 'Data analysis', 'Project management'],
    'Statistics & Actuarial Science': ['Statistics', 'R', 'Excel', 'Financial modelling'],
    'Economics': ['Statistics', 'Excel', 'Policy analysis', 'Research'],
    'Finance & Accounting': ['Accounting', 'Excel', 'Financial modelling', 'Taxation', 'Auditing'],
    'Marketing': ['Digital marketing', 'Social media management', 'SEO', 'Marketing'],
    'Law': ['Legal research', 'Contract drafting', 'Negotiation', 'Public speaking'],
    'Nursing': ['Clinical skills', 'Communication', 'Teamwork'],
    'Medicine & Health Sciences': ['Clinical skills', 'Research', 'Laboratory techniques'],
    'Public Health': ['Monitoring & evaluation', 'Statistics', 'Research', 'Data analysis'],
    'Civil Engineering': ['AutoCAD', 'Project management', 'GIS'],
    'Journalism & Mass Communication': ['Content writing', 'Video editing', 'Photography', 'Public speaking'],
    'Education': ['Teaching', 'Mentoring', 'Public speaking'],
}
GENERAL_SKILLS = ['Communication', 'Leadership', 'Teamwork', 'Problem solving', 'Public speaking', 'Project management', 'Critical thinking']
POPULAR_FIELDS = ['Computer Science', 'Information Technology', 'Software Engineering', 'Data Science', 'Business Administration',
                  'Finance & Accounting', 'Economics', 'Law', 'Medicine & Health Sciences', 'Nursing', 'Civil Engineering', 'Marketing',
                  'Journalism & Mass Communication', 'Education']
POPULAR_UNIS = ['Strathmore University', 'University of Nairobi', 'Kenyatta University', 'JKUAT', 'Moi University', 'KCA University',
                'USIU-Africa', 'Daystar University', 'Egerton University', 'Maseno University', 'Technical University of Kenya', 'Mount Kenya University']
GOAL_WEIGHTS = {'CV & interview prep': 3, 'Career guidance': 3, 'Technical skills': 2, 'Internships abroad': 2}   # others weight 1

# What a student says they want, and what a mentor says they offer, for each mentorship interest.
WANTS = {
    'Career guidance': ['choose the right career path', 'plan my career after graduation', 'understand which roles suit me'],
    'CV & interview prep': ['improve my CV and prepare for job interviews', 'get ready for graduate job interviews', 'write a stronger CV'],
    'Internships abroad': ['find an internship abroad', 'get international work experience', 'apply for overseas internships'],
    'Starting a business': ['start my own business', 'turn my idea into a startup', 'learn how to launch a company'],
    'Postgraduate study': ["apply for a master's degree", 'plan postgraduate study and scholarships', 'prepare a strong PhD application'],
    'Technical skills': ['deepen my practical technical skills', 'get better at the hands-on tools of my field', 'build real projects'],
    'Leadership growth': ['grow as a leader', 'build confidence leading teams', 'develop leadership skills'],
    'Networking': ['build a professional network', 'meet people working in my industry', 'grow my professional contacts'],
    'Work-life balance': ['manage stress and balance work and study', 'keep a healthy work-life balance', 'avoid burnout'],
}
OFFERS = {
    'Career guidance': ['guiding graduates through career choices', 'helping people plan their careers', 'talking through career options'],
    'CV & interview prep': ['reviewing CVs and running mock interviews', 'preparing people for job interviews', 'giving honest CV feedback'],
    'Internships abroad': ['helping students land internships overseas', 'sharing how to get international experience', 'advising on applications abroad'],
    'Starting a business': ['advising early-stage founders', 'helping people start businesses', 'sharing what I learnt building a startup'],
    'Postgraduate study': ["advising on master's and PhD applications", 'helping with scholarship applications', 'guiding people into postgraduate study'],
    'Technical skills': ['teaching hands-on technical skills', 'coaching people through practical projects', 'reviewing technical work'],
    'Leadership growth': ['coaching new team leads', 'helping people grow into leadership', 'mentoring emerging leaders'],
    'Networking': ['introducing mentees to my professional network', 'connecting people with contacts in my industry', 'helping people network'],
    'Work-life balance': ['talking honestly about balancing work and life', 'helping people avoid burnout', 'sharing how I manage a demanding job'],
}
STUDENT_TEMPLATES = [
    'I am a {level} {field} student at {uni}. I would like help to {w1} and to {w2}. I hope to work in {industry} and I am building my {s1} and {s2} skills.',
    '{field} student. My main goal is to {w1}. I am also keen to {w2}. Skills so far: {s1}, {s2}. Target sector: {industry}.',
    'Studying {field} at {uni}. I am looking for a mentor who can help me {w1}. Long term I want a career in {industry}, using {s1}.',
    'As a {level} student in {field}, I want to {w1}. Later I would also like to {w2}. I am interested in {industry} and enjoy {s1}.',
]
MENTOR_TEMPLATES = [
    'I am a {job} in {industry} and studied {field} at {uni}. I enjoy {o1} and {o2}. I use {s1} and {s2} every day.',
    '{job} with {years} years in {industry}. Happy to help with {o1}. My background is {field}, and my main skills are {s1} and {s2}.',
    'I work in {industry} as a {job}. I studied {field}. I like {o1}, and I can also help with {o2}.',
    'After studying {field} at {uni} I became a {job} in {industry}. As a mentor I focus on {o1}. Skills: {s1}, {s2}.',
]
LEVELS = ['first-year', 'second-year', 'third-year', 'final-year']


def group_of(field):
    return next((g for g, d in GROUPS.items() if field in d['fields']), None)


def check_vocab(vocab):
    """Every hand-written list above must use values that exist in the app. Raises with the offending values."""
    bad = []
    for d in GROUPS.values():
        bad += [x for x in d['fields'] if x not in vocab['fields']]
        bad += [x for x in d['skills'] if x not in vocab['skills']]
        bad += [x for x in d['industries'] if x not in vocab['industries']]
    bad += [x for k, v in FIELD_CORE.items() for x in [k, *v] if x not in vocab['fields'] + vocab['skills']]
    bad += [x for x in GENERAL_SKILLS if x not in vocab['skills']] + [x for x in POPULAR_FIELDS if x not in vocab['fields']]
    bad += [x for x in POPULAR_UNIS if x not in vocab['universities']] + [x for x in WANTS if x not in vocab['interests']]
    if bad or set(WANTS) != set(vocab['interests']) or set(OFFERS) != set(vocab['interests']):
        raise ValueError(f'make_synthetic.py uses values that are not in src/data/options.js: {sorted(set(bad))}')


# ---------- people ----------
def _pick(rng, items, weights=None):
    if weights is None:
        return items[int(rng.integers(len(items)))]
    p = np.asarray(weights, float); return items[int(rng.choice(len(items), p=p / p.sum()))]


def _skills(rng, field, n, vocab):
    g = GROUPS.get(group_of(field)) or {'skills': vocab['skills']}
    core = FIELD_CORE.get(field, g['skills'])
    out = []
    while len(out) < n:
        r = rng.random()
        pool = core if r < 0.45 else g['skills'] if r < 0.80 else GENERAL_SKILLS
        s = _pick(rng, pool)
        if s not in out:
            out.append(s)
    return out


def _person(rng, vocab, kind):
    fields = vocab['fields']
    field = _pick(rng, fields, [6 if f in POPULAR_FIELDS else 1 for f in fields])
    g = GROUPS.get(group_of(field))
    unis = vocab['universities']
    p = {
        'field': field, 'group': group_of(field),
        'university': _pick(rng, unis, [5 if u in POPULAR_UNIS else 1 for u in unis]),
        'industry': _pick(rng, g['industries']) if g and rng.random() < 0.8 else _pick(rng, vocab['industries']),
        'availability': _pick(rng, vocab['availability']),
        'skills': _skills(rng, field, int(rng.integers(3, 6)) if kind == 'student' else int(rng.integers(4, 7)), vocab),
    }
    ints = vocab['interests']
    if kind == 'student':
        goal = _pick(rng, ints, [GOAL_WEIGHTS.get(i, 1) for i in ints])
        rest = [i for i in ints if i != goal]
        extra = list(rng.choice(rest, size=int(rng.integers(1, 3)), replace=False))
        p.update(goal=goal, interests=[goal, *extra])
    else:
        p.update(interests=list(rng.choice(ints, size=int(rng.integers(2, 5)), replace=False)),
                 job=_pick(rng, g['jobs']) if g else 'Professional', years=int(rng.integers(3, 21)))
    p['bio'] = '' if rng.random() < 0.08 else _bio(rng, p, kind)
    return p


def _bio(rng, p, kind):
    s1, s2 = p['skills'][0], p['skills'][1]
    if kind == 'student':
        w2_interest = p['interests'][1]
        return _pick(rng, STUDENT_TEMPLATES).format(level=_pick(rng, LEVELS), field=p['field'], uni=p['university'], industry=p['industry'],
                                                     w1=_pick(rng, WANTS[p['goal']]), w2=_pick(rng, WANTS[w2_interest]), s1=s1, s2=s2)
    o = p['interests']
    return _pick(rng, MENTOR_TEMPLATES).format(job=p['job'], years=p['years'], field=p['field'], uni=p['university'], industry=p['industry'],
                                                o1=_pick(rng, OFFERS[o[0]]), o2=_pick(rng, OFFERS[o[1]]), s1=s1, s2=s2)


# ---------- features (same as the app) ----------
def rule_score(s, m):
    """backend/src/matching.js scoreMatch, ported line by line."""
    sc = 30 if s['field'] == m['field'] else 0
    n_sk = len(set(s['skills']) & set(m['skills'])); n_in = len(set(s['interests']) & set(m['interests']))
    sc += min(25, 8 * n_sk) if n_sk else 0
    sc += min(25, 12 * n_in) if n_in else 0
    sc += 10 if s['industry'] == m['industry'] else 0
    sc += 5 if s['availability'] == m['availability'] else 0
    sc += 5 if s['university'] == m['university'] else 0
    return sc


def pair_features(s, m, sim):
    """backend/src/hybrid.js pairFeatures, ported line by line (every value 0..1)."""
    return {
        'field_match': float(s['field'] == m['field']),
        'skills_shared': min(len(set(s['skills']) & set(m['skills'])), 3) / 3,
        'interests_shared': min(len(set(s['interests']) & set(m['interests'])), 3) / 3,
        'industry_match': float(s['industry'] == m['industry']),
        'availability_match': float(s['availability'] == m['availability']),
        'same_university': float(s['university'] == m['university']),
        'semantic_sim': float(min(1.0, max(0.0, sim))),
    }


def latent(s, m, sim):
    """The hidden compatibility score WITHOUT intercept and noise (see the module docstring)."""
    n_sk = len(set(s['skills']) & set(m['skills'])); n_in = min(len(set(s['interests']) & set(m['interests'])), 3)
    field = float(s['field'] == m['field'])
    text = 0.0 if not (s['bio'] and m['bio']) else float(np.clip((sim - 0.45) / 0.15, -2, 2))
    clash = float(s['availability'] != m['availability'] and 'Flexible' not in (s['availability'], m['availability']))
    return (2.0 * float(s['goal'] in m['interests']) + 2.5 * text + 0.9 * n_in + 1.2 * (1 - math.exp(-0.9 * n_sk))
            + 0.2 * field + 1.0 * field * (n_in > 0) + 0.35 * float(s['industry'] == m['industry'])
            - 0.9 * clash + 0.15 * float(s['university'] == m['university']))


def sigmoid(z):
    return 1 / (1 + np.exp(-z))


def solve_intercept(z, target=TARGET_RATE):
    """Bisection for a such that mean(sigmoid(a + z)) = target."""
    lo, hi = -30.0, 30.0
    for _ in range(100):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if sigmoid(mid + z).mean() < target else (lo, mid)
    return (lo + hi) / 2


# ---------- text similarity ----------
_STOP = set('a an and are as at be by for from has have i in is it me my of on or our that the their this to want was with you your will can help who'.split())


def lexical_embed(texts):
    """Python port of the app's lexical fallback (backend/src/embeddings.js hashEmbed), for quick runs and tests."""
    out = []
    for t in texts:
        v = np.zeros(256)
        for w in re.findall(r'[a-z0-9]+', str(t).lower()):
            if len(w) <= 1 or w in _STOP:
                continue
            w = re.sub(r'(ing|ers|er|es|s)$', '', w, count=1)
            h = hashlib.md5(w.encode()).digest()
            v[int.from_bytes(h[:2], 'big') % 256] += 1 if h[2] & 1 else -1
        n = np.linalg.norm(v)
        out.append(v / n if n else v)
    return 'lexical-hash-256', np.array(out)


def app_embed(texts):
    """all-MiniLM-L6-v2 through the app's own code (node ml/embed_bios.mjs); falls back to sentence-transformers (e.g. Colab)."""
    helper = HERE / 'embed_bios.mjs'
    if shutil.which('node') and helper.exists() and (ROOT / 'backend' / 'node_modules').exists():
        with tempfile.TemporaryDirectory() as d:
            src, dst = Path(d, 'in.json'), Path(d, 'out.json')
            src.write_text(json.dumps(list(texts)), encoding='utf-8')
            subprocess.run(['node', str(helper), str(src), str(dst)], check=True, cwd=ROOT)
            r = json.loads(dst.read_text(encoding='utf-8'))
        return r['provider'], np.array(r['vectors'])
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        raise SystemExit('No text model available: run from the project with backend/node_modules installed, '
                         'or pip install sentence-transformers, or use --lexical for a quick run.')
    m = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
    return 'minilm-l6-v2', m.encode(list(texts), normalize_embeddings=True)


# ---------- the dataset ----------
def generate(n_students=300, n_mentors=60, pairs_per_student=15, seed=2026, embed=app_embed, vocab=None, return_people=False):
    vocab = vocab or load_vocab()
    check_vocab(vocab)
    rng = np.random.default_rng(seed)
    students = {i: _person(rng, vocab, 'student') for i in range(1, n_students + 1)}
    mentors = {1000 + i: _person(rng, vocab, 'mentor') for i in range(1, n_mentors + 1)}

    people = {('s', k): v for k, v in students.items()} | {('m', k): v for k, v in mentors.items()}
    keys = [k for k, v in people.items() if v['bio']]
    provider, vecs = embed([people[k]['bio'] for k in keys])
    vec = dict(zip(keys, vecs))

    mids = list(mentors)
    rows = []
    for sid, s in students.items():
        w = np.array([6.0 if mentors[m]['field'] == s['field'] else 3.0 if mentors[m]['group'] == s['group'] else 1.0 for m in mids])
        chosen = rng.choice(len(mids), size=min(pairs_per_student, len(mids)), replace=False, p=w / w.sum())
        for j in sorted(chosen):
            mid = mids[j]; m = mentors[mid]
            a, b = vec.get(('s', sid)), vec.get(('m', mid))
            sim = float(np.clip(np.dot(a, b), 0, 1)) if a is not None and b is not None else 0.0   # same as the app's cosine()
            rows.append({'student_id': sid, 'mentor_id': mid, 'rule_score': rule_score(s, m), **pair_features(s, m, sim),
                         '_z': latent(s, m, sim) + rng.normal(0, 0.6)})
    df = pd.DataFrame(rows)
    a = solve_intercept(df['_z'].to_numpy())
    df['true_p'] = sigmoid(a + df.pop('_z').to_numpy())
    df['match_success'] = (rng.random(len(df)) < df['true_p']).astype(int)
    df['data_source'] = 'synthetic'
    df['sim_provider'] = provider
    df = df[COLUMNS]
    return (df, students, mentors) if return_people else df


def main(argv=None):
    ap = argparse.ArgumentParser(description='Generate CLEARLY LABELLED synthetic mentor-student pairs.')
    ap.add_argument('--seed', type=int, default=2026)
    ap.add_argument('--students', type=int, default=300)
    ap.add_argument('--mentors', type=int, default=60)
    ap.add_argument('--pairs', type=int, default=15, help='mentors sampled per student')
    ap.add_argument('--out', default=str(HERE / 'synthetic_pairs.csv'))
    ap.add_argument('--lexical', action='store_true', help="use the app's word-overlap fallback instead of MiniLM (quick runs only)")
    ap.add_argument('--allow-fallback', action='store_true', help='accept the lexical fallback if MiniLM cannot load')
    a = ap.parse_args(argv)
    df = generate(a.students, a.mentors, a.pairs, a.seed, embed=lexical_embed if a.lexical else app_embed)
    provider = df['sim_provider'].iloc[0]
    if not a.lexical and provider != 'minilm-l6-v2' and not a.allow_fallback:
        raise SystemExit(f'Text model fell back to {provider}; semantic_sim would not be MiniLM. Fix the model or pass --allow-fallback.')
    df.to_csv(a.out, index=False, float_format='%.6f', lineterminator='\n')
    rate = df['match_success'].mean()
    print(f'SYNTHETIC DATA written to {a.out}: {len(df)} pairs, {df.student_id.nunique()} students, {df.mentor_id.nunique()} mentors, '
          f'{rate:.1%} positive, text similarity: {provider}, seed {a.seed}')
    if not 0.30 <= rate <= 0.40:
        print('WARNING: positive rate is outside the 30 to 40% target.')
    return df


if __name__ == '__main__':
    main()
