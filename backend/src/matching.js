// Rule-based matching (Table 5.4). Deterministic and explainable. Maximum score 100.
const overlap = (a = [], b = []) => a.filter((x) => b.includes(x))

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
