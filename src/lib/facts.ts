import type { HiringConfig } from '../config/types.ts'
import { extractSkills } from './skills.ts'

export interface Facts {
  yearsExperience: number | null
  currentCtc: string | null
  expectedCtc: string | null
  currentCtcValue: number | null
  expectedCtcValue: number | null
  noticePeriod: string | null
  noticeDays: number | null
  location: string | null
  relocation: string | null
  skillsMentioned: string[]
}

export function emptyFacts(): Facts {
  return {
    yearsExperience: null,
    currentCtc: null,
    expectedCtc: null,
    currentCtcValue: null,
    expectedCtcValue: null,
    noticePeriod: null,
    noticeDays: null,
    location: null,
    relocation: null,
    skillsMentioned: [],
  }
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
}

export function yearsMentioned(text: string): number | null {
  const digits = [...text.matchAll(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years|yrs|year|yr)\b/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => value >= 0 && value <= 50)
  const words = [...text.matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(?:years|yrs)\b/gi)]
    .map((match) => NUMBER_WORDS[match[1]?.toLowerCase() ?? ''] ?? 0)
    .filter((value) => value > 0)
  const all = [...digits, ...words]
  return all.length ? Math.max(...all) : null
}

export function parseMoneyToken(raw: string): number | null {
  const text = raw.toLowerCase().replace(/,/g, '').trim()
  const lpa = /(\d+(?:\.\d+)?)\s*(?:lpa|lakhs|lacs|lac)\b/.exec(text)
  if (lpa?.[1]) return Number(lpa[1])
  const thousands = /(\d+(?:\.\d+)?)\s*k\b/.exec(text)
  if (thousands?.[1]) return Number(thousands[1]) * 1000
  const amount = /(\d+(?:\.\d+)?)/.exec(text)
  if (!amount?.[1]) return null
  return Number(amount[1])
}

export function parseNoticeDays(text: string): { label: string; days: number } | null {
  const lower = text.toLowerCase()
  if (/\bimmediate(?:ly)?\b|\bserving notice\b/.test(lower)) return { label: 'Immediate', days: 0 }
  const pair = /(\d+)\s*(day|days|week|weeks|month|months)\b/.exec(lower)
  if (!pair?.[1] || !pair[2]) return null
  const count = Number(pair[1])
  const unit = pair[2]
  const days = unit.startsWith('week') ? count * 7 : unit.startsWith('month') ? count * 30 : count
  return { label: `${count} ${unit}`, days }
}

export function extractFactsFromText(text: string, skills: string[]): Partial<Facts> {
  const facts: Partial<Facts> = {}
  const years = yearsMentioned(text)
  if (years != null) facts.yearsExperience = years

  const current = /current(?:\s+ctc|\s+pay|\s+salary|\s+package)?\s*(?:is|:)?\s*([^.,;\n]+)/i.exec(text)
  if (current?.[1] && /\d/.test(current[1])) {
    facts.currentCtc = current[1].trim()
    facts.currentCtcValue = parseMoneyToken(current[1])
  }
  const expected =
    /(?:expect(?:ing|ed|ation)?|hoping for|looking for|want(?:ing)?)\s*(?:around|about|a|an|ctc|pay|salary|package)?\s*(?:is|of|:)?\s*([^.,;\n]+)/i.exec(
      text,
    )
  if (expected?.[1] && /\d/.test(expected[1])) {
    facts.expectedCtc = expected[1].trim()
    facts.expectedCtcValue = parseMoneyToken(expected[1])
  }

  const notice = parseNoticeDays(text)
  if (notice) {
    facts.noticePeriod = notice.label
    facts.noticeDays = notice.days
  }

  const location =
    /(?:based in|i'm in|i am in|located in|live in|living in|location is)\s+([^.,;\n]+)/i.exec(text)
  if (location?.[1]) facts.location = location[1].trim()

  if (/\b(won't|will not|cannot|can't|not able|not willing|not open)\b[^.]{0,40}\brelocat/i.test(text)) {
    facts.relocation = 'No'
  } else if (/\b(can|could|would|willing|open|happy|able)\b[^.]{0,40}\brelocat/i.test(text) || /\brelocat\w*\s*(?:is\s*)?(?:yes|ok|fine|possible)\b/i.test(text)) {
    facts.relocation = 'Yes'
  }

  const mentioned = extractSkills(text, skills)
  if (mentioned.length) facts.skillsMentioned = mentioned
  return facts
}

export function mergeFacts(current: Facts, extra: Partial<Facts>): Facts {
  const skills = new Set([...current.skillsMentioned, ...(extra.skillsMentioned ?? [])])
  return {
    yearsExperience: extra.yearsExperience ?? current.yearsExperience,
    currentCtc: extra.currentCtc ?? current.currentCtc,
    expectedCtc: extra.expectedCtc ?? current.expectedCtc,
    currentCtcValue: extra.currentCtcValue ?? current.currentCtcValue,
    expectedCtcValue: extra.expectedCtcValue ?? current.expectedCtcValue,
    noticePeriod: extra.noticePeriod ?? current.noticePeriod,
    noticeDays: extra.noticeDays ?? current.noticeDays,
    location: extra.location ?? current.location,
    relocation: extra.relocation ?? current.relocation,
    skillsMentioned: [...skills],
  }
}

export function confidenceIsLow(confidence: number | null, config: HiringConfig): boolean {
  if (!config.interview.asr.flagForReview) return false
  if (confidence == null) return false
  if (config.interview.asr.treatZeroConfidenceAsUnknown && confidence <= 0) return false
  return confidence < config.interview.asr.lowConfidenceThreshold
}

export function isNoise(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 2) return true
  return /^(um+|uh+|hmm+|er+|ah+)$/i.test(trimmed)
}