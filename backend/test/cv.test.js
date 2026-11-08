import test from 'node:test'
import assert from 'node:assert/strict'
import { kindOf, suggest } from '../src/cv.js'

const vocab = {
  universities: ['University of Nairobi', 'Kenyatta University', 'JKUAT', 'KCA University', 'USIU-Africa', 'Strathmore University'],
  fields: ['Law', 'Nursing', 'Commerce', 'Computer Science', 'Engineering', 'Civil Engineering', 'Education', 'Business Administration'],
  industries: ['Technology', 'Finance & Banking', 'Legal Services', 'Healthcare', 'Education'],
  skills: ['Java', 'JavaScript', 'React', 'SQL', 'R', 'Excel', 'C++', 'Node.js', 'Leadership'],
}
const cv = (...lines) => lines.join('\n')

test('university short forms map to the list: KCA, USIU, UoN, JKUAT', () => {
  for (const [line, uni] of [['BCom, KCA, 2020', 'KCA University'], ['BBA - USIU - 2019', 'USIU-Africa'], ['LLB, UoN, 2018', 'University of Nairobi'], ['BSc Civil Engineering, JKUAT, 2021', 'JKUAT']]) {
    assert.equal(suggest(cv('Education', line), vocab).university, uni, line)
  }
})

test('the full JKUAT name is not read as Kenyatta University', () => {
  const s = suggest(cv('Education', 'BSc Computer Science', 'Jomo Kenyatta University of Agriculture and Technology, 2022'), vocab)
  assert.equal(s.university, 'JKUAT'); assert.equal(s.fieldOfStudy, 'Computer Science'); assert.equal(s.gradYear, 2022)
})

test('field of study comes from the degree title; specific fields win over general ones', () => {
  assert.equal(suggest(cv('Education', 'LLB, University of Nairobi, 2018'), vocab).fieldOfStudy, 'Law')
  assert.equal(suggest(cv('Education', 'Bachelor of Science in Civil Engineering, 2019'), vocab).fieldOfStudy, 'Civil Engineering')
  // The heading "Education" must not make the field Education.
  assert.equal(suggest(cv('Education', 'Strathmore University, 2019'), vocab).fieldOfStudy, '')
})

test('a year on a line that says "present" is a start year, so the graduation year is left empty', () => {
  assert.equal(suggest(cv('Education', 'BCom, Strathmore University, 2024 - Present'), vocab).gradYear, null)
  assert.equal(suggest(cv('Education', 'BCom, Strathmore University, 2024 - Present (expected 2028)'), vocab).gradYear, 2028)
  assert.equal(suggest(cv('Education', 'BCom, Strathmore University, 1975'), vocab).gradYear, null)   // outside 1980-2040
})

test('skills are whole words: Java is not found in JavaScript, SQL not in MySQL, and lowercase "r" or "excel" are ignored', () => {
  const s = suggest(cv('I write JavaScript and MySQL, use React, Node.js and C++.', 'I excel at teamwork and r is a letter.', 'Strong leadership.'), vocab)
  assert.deepEqual(s.skills, ['JavaScript', 'React', 'C++', 'Node.js', 'Leadership'])
  assert.deepEqual(suggest('Analysis in R and Excel', vocab).skills, ['R', 'Excel'])
})

test('anything uncertain is left empty', () => {
  const s = suggest(cv('Jane Test', 'Experience', 'Worked on many interesting things', 'Skills', 'Kindness'), vocab)
  assert.deepEqual(s, { university: '', fieldOfStudy: '', course: '', gradYear: null, skills: [], industry: '', jobTitle: '', company: '', bio: '' })
})

test('job title and company come only from a clear first experience entry', () => {
  assert.deepEqual((({ jobTitle, company }) => ({ jobTitle, company }))(suggest(cv('Experience', 'Data Analyst | Equity Bank | 2021 - Present'), vocab)), { jobTitle: 'Data Analyst', company: 'Equity Bank' })
  assert.deepEqual((({ jobTitle, company }) => ({ jobTitle, company }))(suggest(cv('Experience', 'Software Engineer', 'Safaricom PLC', '2020 - 2023'), vocab)), { jobTitle: 'Software Engineer', company: 'Safaricom PLC' })
  assert.equal(suggest(cv('Experience', 'Helped my community with many projects over the years.'), vocab).jobTitle, '')
})

test('bio is the first three sentences of the profile section', () => {
  const s = suggest(cv('Profile', 'One sentence here. Two is here. Three as well. Four is dropped.', 'Education', 'LLB, 2019'), vocab)
  assert.equal(s.bio, 'One sentence here. Two is here. Three as well.')
})

test('file type is checked from the name and the first bytes', () => {
  assert.equal(kindOf('cv.pdf', Buffer.from('%PDF-1.7')), 'pdf')
  assert.equal(kindOf('CV.DOCX', Buffer.from('PK\x03\x04')), 'docx')
  assert.equal(kindOf('cv.pdf', Buffer.from('hello')), 'mismatch')
  assert.equal(kindOf('cv.txt', Buffer.from('%PDF-1.7')), null)
  assert.equal(kindOf('cv.doc', Buffer.from('PK')), null)
})
