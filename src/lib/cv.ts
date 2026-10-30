import type { HiringConfig, RoleProfile } from '../config/types.ts'
import { yearsMentioned } from './facts.ts'
import { canonicalSkill, extractSkills, sameSkill, skillPresent } from './skills.ts'
import { clamp } from './text.ts'

export interface ParsedCv {
  name: string
  email: string
  phone: string
  location: string
  skills: string[]
  yearsExperience: number | null
  currentCtc: string | null
  education: string
  rawText: string
  fileName: string
}

export interface CvScore {
  total: number
  skillScore: number
  experienceScore: number
  locationScore: number
  keywordScore: number
  matchedSkills: string[]
  missingSkills: string[]
  notes: string[]
  shortlisted: boolean
}

const SECTION = /^(summary|experience|education|skills|projects|contact|profile|objective|work history|certifications)\b/i

export function extractName(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  for (const line of lines.slice(0, 8)) {
    if (line.includes('@') || /\d{3,}/.test(line)) continue
    if (SECTION.test(line)) continue
    if (line.length > 80) continue
    const words = line.split(/\s+/)
    if (words.length < 2 || words.length > 5) continue
    if (words.every((word) => /^[\p{L}\p{M}.''-]+$/u.test(word))) return line
  }
  return ''
}

export function extractYears(text: string): number | null {
  const explicit = yearsMentioned(text)
  if (explicit != null) return explicit
  const years = [...text.matchAll(/\b(?:19|20)\d{2}\b/g)].map((match) => Number(match[0]))
  if (years.length === 0) return null
  const latest = /present|current/i.test(text) ? new Date().getFullYear() : Math.max(...years)
  const span = latest - Math.min(...years)
  if (span > 0 && span <= 50) return span
  return null
}

export function extractFields(text: string, fileName: string, extraSkills: string[] = []): ParsedCv {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? ''
  const phone = text.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[0]?.trim() ?? ''
  const location =
    text.match(/(?:location|based in|located in|city)\s*[:\-]?\s*([^\n,|]+)/i)?.[1]?.trim() ?? ''
  const currentCtc = text.match(/(?:ctc|salary|compensation)\s*[:\-]?\s*([^\n]+)/i)?.[1]?.trim() ?? null
  const educationBlock = text.match(/education\s*[:\-]?\s*\n+([^\n]+)/i)?.[1]?.trim() ?? ''
  return {
    name: extractName(text),
    email,
    phone,
    location,
    skills: extractSkills(text, extraSkills),
    yearsExperience: extractYears(text),
    currentCtc,
    education: educationBlock,
    rawText: text.replace(/\u0000/g, '').trim(),
    fileName,
  }
}

const STOPWORDS = new Set([
  'that',
  'with',
  'this',
  'from',
  'have',
  'will',
  'your',
  'about',
  'their',
  'they',
  'into',
  'what',
  'when',
  'where',
  'which',
  'been',
  'were',
  'them',
  'than',
  'then',
  'also',
  'such',
  'over',
  'under',
  'using',
  'used',
  'role',
  'team',
  'work',
])

export function scoreCv(cv: ParsedCv, role: RoleProfile, config: HiringConfig): CvScore {
  const weights = config.scoring.cv.weights
  const required = role.requiredSkills.map(canonicalSkill)
  const haystack = `${cv.rawText}\n${cv.skills.join(' ')}`
  const matched = required.filter(
    (skill) => skillPresent(haystack, skill) || cv.skills.some((item) => sameSkill(item, skill)),
  )
  const missing = required.filter((skill) => !matched.some((item) => sameSkill(item, skill)))
  const skillScore =
    required.length === 0 ? Math.round(weights.skills * 0.7) : Math.round(weights.skills * (matched.length / required.length))

  let experienceScore = config.scoring.cv.unknownExperiencePoints
  if (cv.yearsExperience != null) {
    if (role.minYears <= 0) experienceScore = weights.experience
    else experienceScore = Math.round(weights.experience * clamp(cv.yearsExperience / role.minYears, 0, 1))
  }

  let locationScore = config.scoring.cv.emptyLocationPoints
  const roleLocation = role.location.trim().toLowerCase()
  const cvLocation = cv.location.trim().toLowerCase()
  if (role.remoteOk) locationScore = config.scoring.cv.remoteLocationPoints
  else if (!roleLocation) locationScore = config.scoring.cv.emptyLocationPoints
  else if (cvLocation && (cvLocation.includes(roleLocation) || roleLocation.includes(cvLocation))) {
    locationScore = weights.location
  } else if (/remote|anywhere|relocat/i.test(cv.rawText)) locationScore = config.scoring.cv.relocateLocationPoints
  else if (cvLocation) locationScore = config.scoring.cv.mismatchLocationPoints

  const keywords = (role.description.toLowerCase().match(/[a-z][a-z+#.]{3,}/g) ?? []).filter(
    (word) => !STOPWORDS.has(word),
  )
  const uniqueKeywords = [...new Set(keywords)]
  let keywordScore = config.scoring.cv.emptyKeywordPoints
  if (uniqueKeywords.length > 0) {
    const hits = uniqueKeywords.filter((word) => cv.rawText.toLowerCase().includes(word)).length
    keywordScore = Math.round(weights.keywords * (hits / uniqueKeywords.length))
  }

  const total = clamp(skillScore + experienceScore + locationScore + keywordScore, 0, 100)
  const coverage = required.length === 0 ? 1 : matched.length / required.length
  const shortlisted = total >= config.scoring.cv.shortlistScore && coverage >= config.scoring.cv.minSkillCoverage
  const notes = [
    matched.length
      ? `Matched ${matched.join(', ')}.`
      : required.length
        ? 'None of the required skills were found.'
        : 'No required skills were set.',
    cv.yearsExperience == null ? 'Years were not found on the CV.' : `${cv.yearsExperience} years on the CV.`,
  ]
  return {
    total,
    skillScore,
    experienceScore,
    locationScore,
    keywordScore,
    matchedSkills: matched,
    missingSkills: missing,
    notes,
    shortlisted,
  }
}

async function textFromPdf(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise
  const pages: string[] = []
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber)
    const content = await page.getTextContent()
    const line = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pages.push(line)
  }
  return pages.join('\n')
}

async function textFromDocx(data: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth')
  const input =
    typeof Buffer === 'undefined' ? { arrayBuffer: data } : { buffer: Buffer.from(data) }
  const result = await mammoth.extractRawText(input as { arrayBuffer: ArrayBuffer })
  return result.value
}

export async function parseDocument(fileName: string, data: ArrayBuffer, extraSkills: string[] = []): Promise<ParsedCv> {
  const lower = fileName.toLowerCase()
  let text = ''
  if (lower.endsWith('.pdf')) text = await textFromPdf(data)
  else if (lower.endsWith('.docx')) text = await textFromDocx(data)
  else text = new TextDecoder('utf-8', { fatal: false }).decode(data)
  const parsed = extractFields(text, fileName, extraSkills)
  if (!parsed.name) {
    const fromFile = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
    parsed.name = fromFile || 'Candidate'
  }
  return parsed
}