import { findTech } from './tech.ts'

export type Seniority = 'Fresher' | 'Junior' | 'Mid-level' | 'Senior' | 'Lead'

export interface Facts {
  years: number | null
  role: string | null
  stack: string[]
}

const UNITS: Record<string, number> = {
  zero: 0, one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, couple: 2, few: 3,
}

/** Turn "five", "twenty two", "2.5", "two and a half" into numbers. */
export function wordsToNumber(raw: string): number | null {
  const s = raw.toLowerCase().replace(/-/g, ' ').trim()
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s)
  const half = s.match(/^(.*)\s+and a half$/)
  if (half) { const base = wordsToNumber(half[1]); return base == null ? null : base + 0.5 }
  let total = 0
  let seen = false
  for (const w of s.split(/\s+/)) {
    if (w === 'and' || w === 'of') continue
    if (/^\d+(\.\d+)?$/.test(w)) { total += Number(w); seen = true; continue }
    if (w in UNITS) { total += UNITS[w]; seen = true; continue }
    return null
  }
  return seen ? total : null
}

const NUM = String.raw`(?:\d+(?:\.\d+)?|(?:(?:twenty|thirty)[ -])?(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|a couple of|a couple|couple of|a few|an|a)(?: and a half)?)`

export function extractYears(text: string, now = new Date()): number | null {
  const t = text.toLowerCase()
  if (/\b(fresher|fresh graduate|just graduated|recent graduate|no (work )?experience|final year student)\b/.test(t)) return 0
  const found: number[] = []
  const re = new RegExp(String.raw`\b(${NUM})\s*(?:\+|plus)?\s*(?:years?|yrs?)\b`, 'g')
  for (const m of t.matchAll(re)) {
    let v = wordsToNumber(m[1].replace(/\b(a couple of|a couple|couple of)\b/, 'couple').replace(/\ba few\b/, 'few'))
    if (v == null) continue
    if (/\b(old|age|aged)\b/.test(t.slice(m.index! + m[0].length, m.index! + m[0].length + 6))) continue
    found.push(v)
  }
  const since = t.match(/\bsince (19[89]\d|20[0-3]\d)\b/)
  if (since) found.push(now.getFullYear() - Number(since[1]))
  if (found.length) return Math.max(...found)
  const months = t.match(new RegExp(String.raw`\b(${NUM})\s*months?\b`))
  if (months) {
    const v = wordsToNumber(months[1])
    if (v != null) return Math.round((v / 12) * 10) / 10
  }
  return null
}

const TITLE = String.raw`(?:(?:senior|sr\.?|junior|jr\.?|lead|staff|principal|associate|trainee)\s+)?(?:(?:software|frontend|front[- ]end|backend|back[- ]end|full[- ]?stack|java|python|android|ios|mobile|web|devops|cloud|qa|test|automation|data|ml|machine learning|\.net|dot net|react|node|ui|site reliability|platform|solutions?)\s+){0,2}(?:developer|engineer|architect|analyst|scientist|tester|consultant|intern|programmer|lead|manager)`

const tidy = (s: string) =>
  s.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bQa\b/, 'QA').replace(/\bIos\b/, 'iOS').replace(/\bMl\b/, 'ML').replace(/\bUi\b/, 'UI').replace(/\bSr\.?\b/, 'Senior').replace(/\bJr\.?\b/, 'Junior')

export function extractRole(text: string): string | null {
  const t = text.toLowerCase()
  const m = t.match(new RegExp(String.raw`\b${TITLE}\b`))
  if (m) return tidy(m[0].trim())
  if (/\b(fresher|student|recent graduate|fresh graduate)\b/.test(t)) return 'Fresher'
  return null
}

export function extractFacts(text: string): Facts {
  return { years: extractYears(text), role: extractRole(text), stack: findTech(text) }
}

export function seniorityOf(f: Facts): Seniority {
  const role = (f.role ?? '').toLowerCase()
  if (f.years == null) {
    if (/architect|principal|lead|staff/.test(role)) return 'Lead'
    if (/senior/.test(role)) return 'Senior'
    if (/fresher|intern|trainee/.test(role)) return 'Fresher'
    if (/junior|associate/.test(role)) return 'Junior'
    return 'Mid-level'
  }
  if (f.years < 1) return 'Fresher'
  if (f.years < 3) return 'Junior'
  if (f.years < 6) return 'Mid-level'
  if (f.years < 10) return /architect|principal|lead/.test(role) ? 'Lead' : 'Senior'
  return 'Lead'
}

export const missingPieces = (f: Facts): ('years' | 'role' | 'stack')[] =>
  [f.years == null ? 'years' : null, f.role == null ? 'role' : null, f.stack.length ? null : 'stack'].filter(Boolean) as ('years' | 'role' | 'stack')[]

export function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]
}

export function readBack(f: Facts): string {
  const parts: string[] = []
  if (f.years != null) parts.push(f.years === 0 ? "you're just starting out" : `you have about ${fmtYears(f.years)} of experience`)
  if (f.role && f.role !== 'Fresher') parts.push(`currently working as ${/^[aeiou]/i.test(f.role) ? 'an' : 'a'} ${f.role}`)
  if (f.stack.length) parts.push(`mainly with ${listJoin(f.stack.slice(0, 3))}`)
  if (!parts.length) return "I didn't quite catch your background, but that's okay. Shall we continue?"
  return `So ${listJoin(parts)}. Is that right?`
}

export function fmtYears(y: number): string {
  if (y < 1) return `${Math.round(y * 12)} months`
  return `${y} ${y === 1 ? 'year' : 'years'}`
}

export const isYes = (t: string) =>
  /\b(yes|yeah|yep|yup|correct|right|exactly|sure|absolutely|that's it|thats it|true|haan|ha ji|okay|ok)\b/i.test(t) && !isNo(t)
export const isNo = (t: string) => /\b(no|nope|not|wrong|incorrect|actually|change|nah)\b/i.test(t)
