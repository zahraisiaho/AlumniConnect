// Rule-based matching (Table 5.4). Deterministic and explainable. Maximum score 100.
const overlap = (a = [], b = []) => a.filter((x) => b.includes(x))

// "Rules + text meaning": used when no learned model is loaded. A bonus for similar goals in the two bios,
//   bonus = round(maxBonus * clamp((similarity - floor) / span, 0, 1))
// so similarity at or below 0.2 adds nothing and 0.8 or above adds the full 15 points.
// These values are hand-set until the learned model (ml/, backend/model/weights.json) replaces them.
export const SEMANTIC_BONUS = { maxBonus: 15, floor: 0.2, span: 0.6 }

export function semanticBonus(similarity, c = SEMANTIC_BONUS) {
  const t = (Number(similarity) - c.floor) / c.span
  return Number.isFinite(t) ? Math.round(c.maxBonus * Math.min(1, Math.max(0, t))) : 0
}

// On unless MATCH_SEMANTIC=off.
export const semanticOn = (env = process.env) => String(env.MATCH_SEMANTIC || '').trim().toLowerCase() !== 'off'

// Matching needs a field of study, at least one skill and at least one interest. Until then the page asks for them.
export const profileComplete = (s) => !!s?.fieldOfStudy && s.skills?.length > 0 && s.interests?.length > 0

export const NO_OVERLAP_REASON = 'Suggested: no mentor shares your field, skills or interests yet'

// scored: [{ mentor, score, ruleScore, similarity?, method, reasons }]. Keeps the mentors who have something in common
// with the student, best first. If a complete profile has nothing in common with anyone (few mentors, or mentors with
// sparse profiles), every mentor is ranked anyway and the reason says so, so a new student is not left with an empty
// page. An incomplete profile gets an empty list, and the page asks the student to complete it.
export function rankMatches(scored, student, limit = 10) {
  const byScore = (a, b) => b.score - a.score || a.mentor.name.localeCompare(b.mentor.name)
  const related = scored.filter((x) => (x.method === 'hybrid-learned' ? x.ruleScore > 0 || x.similarity >= 0.3 : x.score > 0))
  const list = related.length || !profileComplete(student) ? related : scored.map((x) => ({ ...x, reasons: [...x.reasons, NO_OVERLAP_REASON] }))
  return list.sort(byScore).slice(0, limit)
}

export function scoreMatch(student, mentor) {
  let score = 0
  const reasons = []
  if (student.fieldOfStudy && student.fieldOfStudy === mentor.fieldOfStudy) { score += 30; reasons.push(`Same field of study: ${mentor.fieldOfStudy}`) }
  const skills = overlap(student.skills, mentor.skills)
  if (skills.length) { score += Math.min(25, skills.length * 8); reasons.push(`Shared skills: ${skills.join(', ')}`) }
  const interests = overlap(student.interests, mentor.interests)
  if (interests.length) { score += Math.min(25, interests.length * 12); reasons.push(`Shared mentorship interests: ${interests.join(', ')}`) }
  if (student.industry && student.industry === mentor.industry) { score += 10; reasons.push(`Works in ${mentor.industry}`) }
  if (student.availability && student.availability === mentor.availability) { score += 5; reasons.push(`Both available: ${mentor.availability}`) }
  if (student.university && student.university === mentor.university) { score += 5; reasons.push('Same university') }
  return { score, reasons }
}
