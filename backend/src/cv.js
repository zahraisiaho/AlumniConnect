// "Fill in from CV": reads an uploaded CV in memory and suggests profile answers.
// Rule-based only, with no external service. The file and its text are never stored or logged, and nothing here
// writes to the database. Anything uncertain is left empty rather than guessed.
import mammoth from 'mammoth'
import { PDFParse, VerbosityLevel } from 'pdf-parse'

export const MAX_CV_BYTES = 5 * 1024 * 1024
export const UNREADABLE = "We couldn't read text from this file; please fill in manually."
export class CvError extends Error { constructor(message, status) { super(message); this.status = status } }

// 'pdf' or 'docx' when the name and the first bytes agree, 'mismatch' when the name is right but the content is not,
// null for any other file type.
export function kindOf(name, buf) {
  const ext = String(name || '').toLowerCase().split('.').pop()
  if (ext !== 'pdf' && ext !== 'docx') return null
  if (ext === 'pdf') return buf.subarray(0, 5).toString('latin1') === '%PDF-' ? 'pdf' : 'mismatch'
  return buf[0] === 0x50 && buf[1] === 0x4b ? 'docx' : 'mismatch'   // .docx is a zip file: starts with "PK"
}

export async function extractText(buf, kind) {
  let text = ''
  try {
    if (kind === 'pdf') {
      const parser = new PDFParse({ data: buf, isEvalSupported: false, verbosity: VerbosityLevel.ERRORS })
      try { text = (await parser.getText()).text } finally { await parser.destroy() }
    } else {
      text = (await mammoth.extractRawText({ buffer: buf })).value
    }
  } catch { throw new CvError(UNREADABLE, 422) }
  // A scanned or image-only PDF gives little or no text.
  if ((text.match(/[A-Za-z]/g) || []).length < 40) throw new CvError(UNREADABLE, 422)
  return text
}

// ---------- text helpers ----------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Whole-word match that also works for names such as C++, C# and Node.js.
const wordRe = (s, flags = 'i') => new RegExp(`(?<![A-Za-z0-9])${esc(s)}(?![A-Za-z0-9+#])`, flags)
const YEAR = /\b(19[89]\d|20[0-3]\d|2040)\b/g
const years = (line) => [...line.matchAll(YEAR)].map((m) => Number(m[1]))
const STILL_GOING = /\b(present|current|currently|ongoing|to date|now)\b/i

const HEADINGS = {
  profile: /^(profile|summary|professional summary|career summary|personal profile|professional profile|about me|personal statement|career objective|objective)$/i,
  education: /^(education|education (and|&) training|academic (background|qualifications|history)|educational background|qualifications)$/i,
  experience: /^(experience|work experience|professional experience|employment( history)?|work history|career history|relevant experience)$/i,
  other: /^(skills|key skills|technical skills|core skills|competencies|core competencies|languages|references|referees|interests|hobbies|certifications?|awards|projects|achievements|volunteer(ing)?( experience)?|leadership|activities|publications|contact|personal details|personal information)$/i,
}

function toLines(text) {
  return text.replace(/\r/g, '').split('\n')
    .map((l) => l.replace(/[•▪●◦·\t]+/g, ' ').replace(/^\s*[-*]\s+/, '').replace(/\s+/g, ' ').trim())
    .filter((l) => l && !/^-- \d+ of \d+ --$/.test(l))   // pdf-parse page markers
}

const headingOf = (line) => {
  const h = line.replace(/[:\s]+$/, '')
  return (h.length <= 40 && Object.keys(HEADINGS).find((k) => HEADINGS[k].test(h))) || null
}

function sections(lines) {
  const out = { profile: [], education: [], experience: [] }
  let current = null
  for (const line of lines) {
    const name = headingOf(line)
    if (name) { current = name; continue }
    if (current && out[current]) out[current].push(line)
  }
  return out
}

// ---------- universities ----------
// Common short forms and long official names, mapped to the names in the universities list.
const UNI_ALIASES = [
  [/\bJomo Kenyatta University of Agriculture (and|&) Technology\b/i, 'JKUAT'],
  [/\bJKUAT\b/, 'JKUAT'],
  [/\bKCA\b/, 'KCA University'],
  [/\bUnited States International University( ?-? ?Africa)?\b/i, 'USIU-Africa'],
  [/\bUSIU\b/, 'USIU-Africa'],
  [/\bUoN\b/, 'University of Nairobi'],
  [/\bMKU\b/, 'Mount Kenya University'],
  [/\bCUEA\b/, 'Catholic University of Eastern Africa'],
  [/\bTU-?K\b/, 'Technical University of Kenya'],
  [/\bTUM\b/, 'Technical University of Mombasa'],
  [/\bMMU\b/, 'Multimedia University of Kenya'],
  [/\bDeKUT\b/, 'Dedan Kimathi University of Technology'],
  [/\bKeMU\b/, 'Kenya Methodist University'],
  [/\bMasinde Muliro University of Science (and|&) Technology\b/i, 'Masinde Muliro University'],
  [/\bMMUST\b/, 'Masinde Muliro University'],
  [/\bJOOUST\b/, 'Jaramogi Oginga Odinga University'],
  [/\bSEKU\b/, 'South Eastern Kenya University'],
  [/\bPAC University\b/i, 'Pan Africa Christian University'],
  [/\bUDSM\b/, 'University of Dar es Salaam'],
  [/\bUCT\b/, 'University of Cape Town'],
  [/\bWits University\b/i, 'University of the Witwatersrand'],
  [/\bALU\b/, 'African Leadership University'],
]

// Universities named on a line. Longer names are matched first and blanked out, so that
// "Jomo Kenyatta University of Agriculture and Technology" is not also read as "Kenyatta University".
function universitiesIn(line, list) {
  const canon = new Map(list.map((u) => [u.toLowerCase(), u]))
  const found = []
  let rest = line
  const take = (re, name) => {
    const hit = canon.get(name.toLowerCase())
    if (!hit) return
    const m = rest.match(re)
    if (m) { found.push(hit); rest = rest.replace(re, ' '.repeat(m[0].length)) }
  }
  for (const [re, name] of UNI_ALIASES) if (/\s/.test(re.source)) take(re, name)            // long official names
  for (const u of [...list].sort((a, b) => b.length - a.length)) take(wordRe(u), u)         // names from the list
  for (const [re, name] of UNI_ALIASES) if (!/\s/.test(re.source)) take(re, name)           // short forms
  return found
}

// ---------- degree and field of study ----------
const DEGREE_WORDS = /\b(bachelor'?s?|master'?s?|doctor of|doctorate|diploma|degree|certificate)\b/i
const DEGREE_ABBR = /(?<![A-Za-z])(B\.?\s?Sc|M\.?\s?Sc|B\.?A\.?|M\.?A\.?|B\.?\s?Com|B\.?\s?Ed|LL\.?\s?B|LL\.?\s?M|MBA|BBA|MBChB|B\.?\s?Tech|B\.?\s?Eng|B\.?\s?Pharm|BSN|Ph\.?\s?D|HND)(?![A-Za-z])/
const isDegree = (line) => DEGREE_WORDS.test(line) || DEGREE_ABBR.test(line)

// Checked in order: specific subjects before general ones (Civil Engineering before Engineering).
const FIELD_RULES = [
  [/\b(bachelor of laws|master of laws|law)\b|(?<![A-Za-z])LL\.?\s?[BM](?![A-Za-z])/i, 'Law'],
  [/\bnursing\b|(?<![A-Za-z])BSN(?![A-Za-z])/i, 'Nursing'],
  [/\bpharmacy\b|(?<![A-Za-z])B\.?\s?Pharm/i, 'Pharmacy'],
  [/\bpublic health\b/i, 'Public Health'],
  [/\bdent(al|istry)\b/i, 'Dentistry'],
  [/\bveterinary\b/i, 'Veterinary Medicine'],
  [/\b(medicine|surgery|clinical medicine)\b|MBChB/i, 'Medicine & Health Sciences'],
  [/\bdata science\b/i, 'Data Science'],
  [/\bcomputer science\b/i, 'Computer Science'],
  [/\bsoftware engineering\b/i, 'Software Engineering'],
  [/\binformation systems\b/i, 'Information Systems'],
  [/\binformation technology\b|(?<![A-Za-z])B\.?\s?Sc\.? IT(?![A-Za-z])/i, 'Information Technology'],
  [/\b(actuarial|statistics)\b/i, 'Statistics & Actuarial Science'],
  [/\bmathematics\b/i, 'Mathematics'],
  [/\bcivil engineering\b/i, 'Civil Engineering'],
  [/\b(electrical|electronic)\b.*\bengineering\b/i, 'Electrical & Electronic Engineering'],
  [/\bmechanical engineering\b/i, 'Mechanical Engineering'],
  [/\btelecommunications? engineering\b/i, 'Telecommunications Engineering'],
  [/\bengineering\b|(?<![A-Za-z])B\.?\s?Eng(?![A-Za-z])/i, 'Engineering'],
  [/\barchitecture\b|\burban planning\b/i, 'Architecture & Urban Planning'],
  [/\bbiotechnology\b/i, 'Biotechnology'],
  [/\b(biochemistry|biology|biological sciences)\b/i, 'Biology & Biochemistry'],
  [/\bchemistry\b/i, 'Chemistry'],
  [/\bphysics\b/i, 'Physics'],
  [/\benvironmental (science|studies)\b/i, 'Environmental Science'],
  [/\b(food science|nutrition)\b/i, 'Food Science & Nutrition'],
  [/\bagricultur/i, 'Agriculture & Environment'],
  [/\beconomics\b/i, 'Economics'],
  [/\b(accounting|finance)\b/i, 'Finance & Accounting'],
  [/\bhuman resource/i, 'Human Resource Management'],
  [/\b(procurement|supply chain)\b/i, 'Procurement & Supply Chain'],
  [/\bmarketing\b/i, 'Marketing'],
  [/\bbusiness (administration|management)\b|(?<![A-Za-z])(MBA|BBA)(?![A-Za-z])/i, 'Business Administration'],
  [/\bcommerce\b|(?<![A-Za-z])B\.?\s?Com(?![A-Za-z])/i, 'Commerce'],
  [/\b(hospitality|tourism)\b/i, 'Hospitality & Tourism'],
  [/\b(journalism|mass communication)\b/i, 'Journalism & Mass Communication'],
  [/\binternational relations\b/i, 'International Relations'],
  [/\bpolitical science\b/i, 'Political Science'],
  [/\bpsychology\b/i, 'Psychology'],
  [/\bsociology\b/i, 'Sociology'],
  [/\bsocial work\b/i, 'Social Work'],
  [/\bdevelopment studies\b/i, 'Development Studies'],
  [/\b(film|animation)\b/i, 'Film & Animation'],
  [/\bfashion\b/i, 'Fashion Design'],
  [/\b(music|performing arts|theatre)\b/i, 'Music & Performing Arts'],
  [/\bfine arts?\b/i, 'Fine Art'],
  [/\b(design|media)\b/i, 'Design & Media'],
  [/\b(literature|linguistics|languages)\b/i, 'Languages & Literature'],
  [/\bhistory\b/i, 'History'],
  [/\b(theology|religious studies)\b/i, 'Theology & Religious Studies'],
  [/\baviation\b/i, 'Aviation'],
  [/\bsports? science\b/i, 'Sports Science'],
  [/\beducation\b|(?<![A-Za-z])B\.?\s?Ed(?![A-Za-z])/i, 'Education'],
]
const fieldFor = (text, list) => FIELD_RULES.find(([re, f]) => list.includes(f) && re.test(text))?.[1] || ''

// The degree title from a line such as "Bachelor of Laws (LLB), University of Nairobi, 2017 - 2021".
function courseFrom(line, list) {
  let s = line
  for (const u of universitiesIn(line, list)) s = s.replace(wordRe(u), ' ')
  for (const [re] of UNI_ALIASES) s = s.replace(re, ' ')
  s = s.replace(/\b(expected|graduated|graduating|class of)\b/gi, ' ').replace(YEAR, ' ')
  const part = s.split(/\s[|–—-]\s|,|;|\s{2,}/).map((x) => x.trim()).find(isDegree) || ''
  return part.replace(/^[\s\-–—|,:(]+|[\s\-–—|,:]+$/g, '').replace(/\(\s*\)/g, '').trim().slice(0, 120)
}

// ---------- industries ----------
const INDUSTRY_WORDS = {
  'Technology': ['software', 'developer', 'saas', 'tech company', 'technology company', 'it services'],
  'Finance & Banking': ['bank', 'banking', 'microfinance', 'sacco', 'investment bank', 'asset management'],
  'Fintech': ['fintech', 'mobile money', 'payments', 'm-pesa'],
  'Insurance': ['insurance', 'underwriting', 'insurer', 'reinsurance'],
  'Accounting & Audit': ['audit', 'auditor', 'audit firm', 'accounting firm', 'tax advisory'],
  'Legal Services': ['law firm', 'advocates', 'advocate', 'litigation', 'legal counsel', 'conveyancing'],
  'Healthcare': ['hospital', 'clinic', 'healthcare', 'patients', 'patient', 'nurse', 'nursing', 'medical'],
  'Pharmaceuticals': ['pharmaceutical', 'pharmaceuticals', 'pharma', 'pharmacy', 'pharmacist'],
  'Telecommunications': ['telecom', 'telecommunications', 'safaricom', 'airtel', 'mobile network'],
  'Education': ['school', 'teacher', 'teaching', 'lecturer', 'tutor', 'curriculum'],
  'Consulting': ['consulting', 'consultancy', 'consultant', 'advisory'],
  'Government & NGO': ['ministry', 'county government', 'government', 'ngo', 'non-profit', 'nonprofit', 'public service'],
  'International Development': ['usaid', 'undp', 'unicef', 'world bank', 'humanitarian', 'development partner'],
  'Creative & Media': ['media house', 'studio', 'broadcast', 'television', 'radio', 'newsroom', 'magazine'],
  'Marketing & Advertising': ['advertising', 'ad agency', 'marketing agency', 'brand', 'campaigns'],
  'Manufacturing': ['manufacturing', 'factory', 'production plant', 'assembly line'],
  'Real Estate & Construction': ['construction', 'real estate', 'property', 'contractor', 'site engineer'],
  'Retail & E-commerce': ['retail', 'e-commerce', 'ecommerce', 'supermarket', 'online store'],
  'FMCG & Consumer Goods': ['fmcg', 'consumer goods', 'beverages', 'distributor'],
  'Hospitality & Tourism': ['hotel', 'hospitality', 'tourism', 'restaurant', 'safari', 'travel agency'],
  'Aviation & Logistics': ['airline', 'airport', 'aviation', 'logistics', 'freight', 'shipping', 'courier'],
  'Transport & Automotive': ['automotive', 'motors', 'vehicle', 'transport company'],
  'Agriculture & Energy': ['agriculture', 'agribusiness', 'farm', 'farming', 'agronomy'],
  'Renewable Energy': ['solar', 'renewable', 'geothermal', 'wind energy', 'clean energy'],
  'Mining & Oil and Gas': ['mining', 'petroleum', 'oil and gas', 'upstream'],
  'Human Resources & Recruitment': ['recruitment', 'staffing', 'talent acquisition', 'recruiter'],
  'Research & Academia': ['research institute', 'research centre', 'laboratory', 'academia'],
  'Environment & Conservation': ['conservation', 'wildlife', 'climate', 'environmental'],
  'Security & Defence': ['defence', 'military', 'police', 'security firm'],
  'Sports & Entertainment': ['sports', 'football', 'entertainment', 'events company'],
  'Fashion & Beauty': ['fashion', 'beauty', 'salon', 'apparel'],
  'Water & Sanitation': ['water', 'sanitation', 'wash programme'],
}
// The industry with the most keyword hits, only when it has at least two and clearly beats the next one.
// Industry names themselves are not counted: "Education" is also a CV heading and "Technology" is part of university names.
function industryFor(text, list) {
  const scored = list.map((name) => {
    const words = INDUSTRY_WORDS[name] || []
    return [name, words.reduce((n, w) => n + (text.match(new RegExp(wordRe(w).source, 'gi')) || []).length, 0)]
  }).sort((a, b) => b[1] - a[1])
  const [top, second] = scored
  return top && top[1] >= 2 && top[1] > (second?.[1] || 0) ? top[0] : ''
}

// ---------- most recent job ----------
const JOB_WORDS = /\b(engineer|developer|manager|analyst|intern|officer|assistant|consultant|lawyer|advocate|associate|accountant|auditor|nurse|teacher|lecturer|tutor|designer|director|lead|specialist|coordinator|administrator|executive|scientist|researcher|architect|technician|pharmacist|doctor|clinician|clerk|head|founder|co-founder|ceo|cto|cfo|president|representative|agent|editor|writer|journalist|programmer|supervisor|trainee|attachee|volunteer|fellow|partner|counsel|planner|strategist|banker|underwriter|actuary|economist|surveyor|chef|pilot)\b/i
const MONTHS = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b\.?/gi
const stripDates = (l) => l.replace(MONTHS, ' ').replace(YEAR, ' ').replace(STILL_GOING, ' ').replace(/\(\s*[-–—\s]*\)/g, ' ')
  .replace(/\s+/g, ' ').replace(/^[\s\-–—|,:]+|[\s\-–—|,:]+$/g, '').trim()
const short = (s, words) => s && s.split(' ').length <= words && !/[.!?]$/.test(s)

function latestJob(experience) {
  const lines = experience.slice(0, 5).map(stripDates)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const at = line.match(/^(.{2,60}?)\s+(?:at|@)\s+(.{2,60})$/i)
    if (at && JOB_WORDS.test(at[1]) && short(at[1], 6) && short(at[2], 8)) return { jobTitle: at[1].trim(), company: at[2].trim() }
    const parts = line.split(/\s[|–—-]\s|\s*,\s*/).map((p) => p.trim()).filter(Boolean)
    if (parts.length >= 2 && parts.length <= 3) {
      const t = parts.findIndex((p) => JOB_WORDS.test(p) && short(p, 6))
      const c = t === 0 ? 1 : t - 1
      if (t >= 0 && parts[c] && !JOB_WORDS.test(parts[c]) && short(parts[c], 8)) return { jobTitle: parts[t], company: parts[c] }
    }
    // Title on one line, company on the next: "Software Engineer" / "Safaricom PLC | 2022 - Present"
    const nextLine = (lines[i + 1] || '').split(/\s[|–—-]\s|\s*,\s*/)[0]?.trim()
    if (parts.length === 1 && JOB_WORDS.test(line) && short(line, 6) && nextLine && !JOB_WORDS.test(nextLine) && short(nextLine, 6)) {
      return { jobTitle: line, company: nextLine }
    }
    break   // only the first entry counts; if it is not clear, leave both blank
  }
  return { jobTitle: '', company: '' }
}

// ---------- the suggestions ----------
// vocab: { universities, fields, industries, skills } as lists of names from the database.
export function suggest(text, vocab) {
  const lines = toLines(text)
  const sec = sections(lines)
  const edu = sec.education.length ? sec.education : lines.filter((l) => isDegree(l) && (years(l).length || universitiesIn(l, vocab.universities).length))

  // Graduation year: the latest year on an education or graduation line. Years on lines that say "present" are start years.
  const yearLines = [...edu.map((l, i) => ({ l, i })), ...lines.filter((l) => /\b(graduat\w*|class of|expected)\b/i.test(l)).map((l) => ({ l, i: -1 }))]
  const counted = yearLines.filter(({ l }) => !STILL_GOING.test(l) || /\bexpected\b/i.test(l))
  const all = counted.flatMap(({ l }) => (STILL_GOING.test(l) ? years(l.slice(l.search(/\bexpected\b/i))) : years(l)))
  const gradYear = all.length ? Math.max(...all) : null
  const yearAt = gradYear ? edu.findIndex((l) => years(l).includes(gradYear)) : -1

  // University: one named in the education section, preferring the one next to the graduation year.
  const unis = edu.map((l, i) => ({ i, names: universitiesIn(l, vocab.universities) })).filter((x) => x.names.length)
  const near = yearAt >= 0 && unis.find((x) => Math.abs(x.i - yearAt) <= 1)
  const university = (near || unis[0])?.names[0] || ''

  // Course: the degree line next to the graduation year, otherwise the first degree line.
  const degrees = edu.map((l, i) => ({ l, i })).filter(({ l }) => isDegree(l))
  const degree = (yearAt >= 0 && degrees.find((d) => Math.abs(d.i - yearAt) <= 2)) || degrees[0]
  const course = degree ? courseFrom(degree.l, vocab.universities) : ''
  const fieldOfStudy = degree ? fieldFor(course || degree.l, vocab.fields) || fieldFor(degree.l, vocab.fields) : ''

  // Skills: every listed skill named anywhere. Skills that are also everyday words must keep their capital letter.
  const CASE_SENSITIVE = new Set(['R', 'Excel', 'Swift', 'Go'])
  const skills = vocab.skills.filter((s) => wordRe(s, CASE_SENSITIVE.has(s) ? '' : 'i').test(text))

  const work = sec.experience.length ? sec.experience.join('\n') : lines.filter((l) => !edu.includes(l) && !headingOf(l)).join('\n')
  const industry = industryFor(work, vocab.industries)
  const { jobTitle, company } = latestJob(sec.experience)

  const sentences = sec.profile.join(' ').split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter(Boolean)
  const bio = sentences.slice(0, 3).join(' ').slice(0, 600).trim()

  return { university, fieldOfStudy, course, gradYear, skills, industry, jobTitle, company, bio }
}
