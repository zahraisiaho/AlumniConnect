// Writes the small sample CVs used by the tests. Run from backend/:  node test/fixtures/make_cv_fixtures.mjs
// Built by hand (no extra packages): a minimal .docx (a zip of three XML files) and minimal PDFs.
// The people in them are fictional.
import { writeFileSync } from 'node:fs'

const here = new URL('.', import.meta.url)

const LAW_CV = [
  'Wanjiku Test',
  'Nairobi, Kenya | wanjiku@example.com',
  'Profile',
  'Commercial lawyer with four years of experience in corporate transactions. I advise start-ups on contracts and compliance. I enjoy mentoring law students. I also write about technology policy.',
  'Experience',
  'Associate Advocate at Mwangi & Co Advocates',
  'Jan 2022 - Present',
  "Drafting commercial contracts and handling litigation for the firm's clients.",
  'Education',
  'Bachelor of Laws (LLB), UoN, 2017 - 2021',
  'Graduated 2021',
  'Skills',
  'Legal research, Contract drafting, Negotiation, Public speaking, Excel',
]

const NURSING_CV = [
  'Brian Test',
  'Summary',
  'Final-year nursing student passionate about community health. I want to specialise in paediatric care.',
  'Education',
  'BSc Nursing',
  'Jomo Kenyatta University of Agriculture and Technology',
  '2023 - Expected 2027',
  'Experience',
  'Student Nurse Intern at Kenyatta National Hospital',
  'May 2025 - Aug 2025',
  'Skills',
  'Clinical skills, Communication, Teamwork, Python',
]

// ---------- docx ----------
const crc32 = (buf) => {
  let crc = ~0
  for (const b of buf) { crc ^= b; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1)) }
  return ~crc >>> 0
}
function zip(files) {   // stored (uncompressed) zip
  const parts = []; const central = []; let offset = 0
  for (const [name, text] of files) {
    const data = Buffer.from(text, 'utf8'); const n = Buffer.from(name); const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x21, 12)
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x21, 14)
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42)
    parts.push(local, n, data); central.push(c, n); offset += 30 + n.length + data.length
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, cd, end])
}
const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function docx(lines) {
  const body = lines.map((l) => `<w:p><w:r><w:t xml:space="preserve">${xml(l)}</w:t></w:r></w:p>`).join('')
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`],
  ])
}

// ---------- pdf ----------
function pdf(content, withFont) {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << ${withFont ? '/Font << /F1 4 0 R >>' : ''} >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  ]
  let out = '%PDF-1.4\n'; const offsets = []
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = Buffer.byteLength(out, 'latin1')
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}
const pdfEsc = (s) => s.replace(/[\\()]/g, '\\$&')
const textPdf = (lines) => pdf(lines.map((l, i) => `BT /F1 10 Tf 40 ${800 - i * 16} Td (${pdfEsc(l)}) Tj ET`).join('\n'), true)
// A "scanned" CV: only shapes, no text layer, like a photo or scan of a page.
const scannedPdf = () => pdf(Array.from({ length: 20 }, (_, i) => `0.${i % 9} g 40 ${780 - i * 30} ${300 + (i % 5) * 40} 12 re f`).join('\n'), false)

writeFileSync(new URL('cv_law.docx', here), docx(LAW_CV))
writeFileSync(new URL('cv_nursing.pdf', here), textPdf(NURSING_CV))
writeFileSync(new URL('cv_scanned.pdf', here), scannedPdf())
console.log('wrote cv_law.docx, cv_nursing.pdf, cv_scanned.pdf')
