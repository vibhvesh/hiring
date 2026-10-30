import { config, type Difficulty } from './config.ts'
import type { Facts } from './extract.ts'
import type { Item } from './interview.ts'
import type { Profile } from './profiles.ts'
import { canonicalTech, findTech } from './tech.ts'

export interface Score {
  total: number
  recommendation: string
  verdict: 'Strong yes' | 'Worth a call' | 'Not a fit yet' | 'Too short to judge'
  skillFit: number
  flagged: number
  notes: string[]
  perItem: { text: string; score: number; flagged: boolean }[]
}

const NEED: Record<Difficulty, number> = { Easy: 1, Medium: 2, Hard: 2, Tough: 3 }
const TARGET: Record<Difficulty, number> = { Easy: 12, Medium: 22, Hard: 32, Tough: 42 }
const BAR: Record<Difficulty, [number, number]> = { Easy: [65, 45], Medium: [72, 52], Hard: [76, 58], Tough: [80, 62] }
const DONT_KNOW = /\b(don'?t know|no idea|not sure|haven'?t (used|worked)|never used|skip)\b/i

export function scoreItem(it: Item, d: Difficulty): number {
  const a = it.answer.toLowerCase()
  const n = a.split(/\s+/).filter(Boolean).length
  if (!n) return 0
  const len = Math.min(1, n / TARGET[d])
  if (it.kind === 'mandatory') return Math.round(100 * Math.min(1, 0.25 + 0.75 * len))
  if (DONT_KNOW.test(a) && n < 15) return 5
  const kws = it.q?.keywords ?? []
  const hits = kws.filter((k) => a.includes(k.toLowerCase())).length
  const kw = kws.length ? Math.min(1, hits / Math.min(NEED[d], kws.length)) : len
  return Math.round(100 * (0.65 * kw + 0.35 * len))
}

/** Score out of 100. Low speech-recognition confidence is flagged and left out, never penalized. */
export function scoreInterview(p: Profile, f: Facts, items: Item[], complete: boolean): Score {
  const d = p.difficulty
  const isFlag = (i: Item) => !i.typed && i.confidence != null && i.confidence < config.lowConfidence
  const perItem = items.map((i) => ({ text: i.text, score: scoreItem(i, d), flagged: isFlag(i) }))
  const rows = items.map((i, k) => ({ kind: i.kind, ...perItem[k] }))
  const usable = rows.some((x) => !x.flagged) ? rows.filter((x) => !x.flagged) : rows
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const techS = avg(usable.filter((x) => x.kind === 'tech').map((x) => x.score))
  const mandS = avg(usable.filter((x) => x.kind === 'mandatory').map((x) => x.score))
  const req = p.tech.map(canonicalTech)
  const have = new Set([...f.stack, ...findTech(items.map((i) => i.answer).join(' '))])
  const skillFit = req.length ? Math.round((100 * req.filter((t) => have.has(t)).length) / req.length) : 100
  const anyTech = usable.some((x) => x.kind === 'tech')
  const total = Math.round(anyTech ? 0.6 * techS + 0.25 * mandS + 0.15 * skillFit : 0.6 * mandS + 0.4 * skillFit * (items.length ? 1 : 0))
  const flagged = perItem.filter((x) => x.flagged).length
  const notes: string[] = []
  if (!complete) notes.push('Partial interview: the candidate left before the end. Score covers answered questions only.')
  if (flagged) notes.push(`${flagged} answer(s) had low speech-recognition confidence (accent or noise). They were not counted against the candidate; please check the recording.`)
  const missing = req.filter((t) => !have.has(t))
  if (missing.length) notes.push(`Not mentioned: ${missing.join(', ')}.`)
  const [strong, ok] = BAR[d]
  let verdict: Score['verdict'] = total >= strong ? 'Strong yes' : total >= ok ? 'Worth a call' : 'Not a fit yet'
  if (items.filter((i) => i.answer).length < 2) verdict = 'Too short to judge'
  const recommendation = {
    'Strong yes': 'Clear, specific answers. Move to the next round.',
    'Worth a call': 'Some good signals with gaps. Worth a short follow-up call.',
    'Not a fit yet': 'Answers were thin for this level. Probably not a fit for this role right now.',
    'Too short to judge': 'Not enough answers to judge. Review the transcript or invite again.',
  }[verdict]
  return { total, recommendation, verdict, skillFit, flagged, notes, perItem }
}
