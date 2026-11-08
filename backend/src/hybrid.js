// Hybrid matching: the six rule-based signals plus text similarity, combined by a logistic-regression model
// whose weights are learned from tester ratings (see ml/). Without a trained model the app uses plain rules.
import { readFileSync } from 'node:fs'

export const FEATURES = ['field_match', 'skills_shared', 'interests_shared', 'industry_match', 'availability_match', 'same_university', 'semantic_sim']

const shared = (a = [], b = []) => a.filter((x) => b.includes(x)).length

// Every feature is scaled to 0..1 so the exported weights can be applied without any preprocessing.
export function pairFeatures(student, mentor, sim = 0) {
  return {
    field_match: student.fieldOfStudy && student.fieldOfStudy === mentor.fieldOfStudy ? 1 : 0,
    skills_shared: Math.min(shared(student.skills, mentor.skills), 3) / 3,
    interests_shared: Math.min(shared(student.interests, mentor.interests), 3) / 3,
    industry_match: student.industry && student.industry === mentor.industry ? 1 : 0,
    availability_match: student.availability && student.availability === mentor.availability ? 1 : 0,
    same_university: student.university && student.university === mentor.university ? 1 : 0,
    semantic_sim: Math.max(0, Math.min(1, sim || 0)),
  }
}

// Probability that the student finds this mentor helpful: sigmoid(intercept + sum(weight * feature)).
export function predict(model, f) {
  const z = model.intercept + model.features.reduce((s, k) => s + model.coefficients[k] * f[k], 0)
  return 1 / (1 + Math.exp(-z))
}

export function validModel(m) {
  return !!m && m.type === 'logistic' && Number.isFinite(m.intercept) && Array.isArray(m.features) && m.features.length > 0 &&
    m.features.every((k) => FEATURES.includes(k) && Number.isFinite(m.coefficients?.[k]))
}

export function loadModel(path) {
  if (process.env.MATCH_MODEL === 'off') return null
  try {
    const m = JSON.parse(readFileSync(path, 'utf8'))
    if (validModel(m)) return m
    console.warn(`Ignoring ${path}: not a valid model file.`)
  } catch (e) { if (e.code !== 'ENOENT') console.warn(`Could not read model: ${e.message}`) }
  return null
}
