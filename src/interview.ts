import { config, type Difficulty } from './config.ts'
import { extractFacts, isNo, isYes, missingPieces, readBack, seniorityOf, type Facts, type Seniority } from './extract.ts'
import type { Profile } from './profiles.ts'
import { selectQuestions, type TechQuestion } from './questions.ts'
import { scoreInterview, type Score } from './score.ts'

export type Kind = 'intro' | 'retry' | 'confirm' | 'mandatory' | 'tech' | 'followup' | 'closing'

export interface Turn {
  who: 'ai' | 'candidate'
  text: string
  at: number // ms since start
  kind?: Kind
  confidence?: number | null
  typed?: boolean
}

export interface AnswerMeta { confidence?: number | null; typed?: boolean }

export interface Item {
  kind: 'mandatory' | 'tech'
  text: string
  q?: TechQuestion
  answer: string
  confidence: number | null
  typed: boolean
  followedUp: boolean
}

export interface Result {
  version: 1
  inviteId: string
  candidateName: string
  profile: Profile
  startedAt: string
  durationSec: number
  complete: boolean
  endReason: string
  facts: Facts & { seniority: Seniority; confirmed: boolean }
  resumeFacts: Facts | null
  items: Item[]
  transcript: Turn[]
  score: Score
}

const FOLLOWUP_MIN_WORDS: Record<Difficulty, number> = { Easy: 0, Medium: 10, Hard: 20, Tough: 30 }
const fill = (s: string, name: string, sep = ', ') => s.replace('{name}', name ? `${sep}${name}` : '')
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

/** The whole conversation as a small, testable state machine. No browser APIs here. */
export class Interview {
  facts: Facts = { years: null, role: null, stack: [] }
  confirmed = false
  phase: Kind = 'intro'
  prompt = ''
  done = false
  endReason = ''
  items: Item[] = []
  transcript: Turn[] = []
  private retries: Record<string, number> = { years: 0, role: 0, stack: 0 }
  private confirmRounds = 0
  private queue: Item[] = []
  private current: Item | null = null
  private ackIndex = 0
  readonly startedAt = new Date()

  readonly profile: Profile
  readonly inviteId: string
  readonly name: string
  readonly resume: Facts | null

  constructor(profile: Profile, inviteId: string, name = '', resume: Facts | null = null) {
    this.profile = profile
    this.inviteId = inviteId
    this.name = name
    this.resume = resume
    this.say('intro', fill(config.opening, name, ' '))
  }

  private say(kind: Kind, text: string, at = 0) {
    this.phase = kind
    this.prompt = text
    this.transcript.push({ who: 'ai', text, at, kind })
  }

  private ack() {
    return config.acks[this.ackIndex++ % config.acks.length]
  }

  /** Optional facts from the in-browser model; only fills gaps, never overrides. */
  hint(f: Partial<Facts>) {
    this.merge({ years: f.years ?? null, role: f.role ?? null, stack: f.stack ?? [] }, false)
  }

  /** Feed the candidate's answer. `elapsedMs` enforces the time limit. */
  answer(text: string, meta: AnswerMeta = {}, elapsedMs = 0): void {
    if (this.done) return
    const clean = text.trim()
    this.transcript.push({ who: 'candidate', text: clean, at: elapsedMs, kind: this.phase, confidence: meta.confidence ?? null, typed: !!meta.typed })
    const outOfTime = elapsedMs >= config.maxMinutes * 60_000
    switch (this.phase) {
      case 'intro':
      case 'retry':
        this.merge(extractFacts(clean), false)
        if (outOfTime) return this.finish('time', elapsedMs)
        return this.askMissingOrConfirm(elapsedMs)
      case 'confirm':
        if (outOfTime) return this.finish('time', elapsedMs)
        return this.handleConfirm(clean, elapsedMs)
      case 'mandatory':
      case 'tech':
      case 'followup': {
        const it = this.current!
        it.answer = it.answer ? `${it.answer} ${clean}` : clean
        it.confidence = it.confidence == null ? meta.confidence ?? null : Math.min(it.confidence, meta.confidence ?? 1)
        it.typed = it.typed || !!meta.typed
        if (outOfTime) return this.finish('time', elapsedMs)
        const need = FOLLOWUP_MIN_WORDS[this.profile.difficulty]
        const wantsFollow = this.phase !== 'followup' && need > 0 && words(it.answer) < need && !/\b(don'?t know|not sure|haven'?t used|no idea|never used)\b/i.test(it.answer)
        if (wantsFollow && elapsedMs < config.maxMinutes * 60_000 - 45_000) {
          it.followedUp = true
          return this.say('followup', config.followUp[this.profile.difficulty as 'Medium'], elapsedMs)
        }
        return this.next(elapsedMs)
      }
    }
  }

  private merge(f: Facts, override: boolean) {
    if (f.years != null && (override || this.facts.years == null)) this.facts.years = f.years
    if (f.role && (override || !this.facts.role)) this.facts.role = f.role
    this.facts.stack = [...new Set([...this.facts.stack, ...f.stack])]
  }

  private askMissingOrConfirm(at: number) {
    for (const piece of missingPieces(this.facts)) {
      // a resume can fill the gap; we still read it back for confirmation
      const r = this.resume
      if (piece === 'years' && r?.years != null) { this.facts.years = r.years; continue }
      if (piece === 'role' && r?.role) { this.facts.role = r.role; continue }
      if (piece === 'stack' && r?.stack.length) { this.facts.stack = r.stack.slice(0, 6); continue }
      if (piece === 'role' && this.facts.years === 0) { this.facts.role = 'Fresher'; continue }
      if (this.retries[piece] < 2) {
        this.retries[piece]++
        const ask = piece === 'years' ? config.askYears : piece === 'role' ? config.askRole : config.askStack
        return this.say('retry', this.retries[piece] === 2 ? `Sorry, I didn't catch that. ${ask.replace(/^[^.!]*[.!] /, '')}` : ask, at)
      }
    }
    this.say('confirm', readBack(this.facts), at)
  }

  private handleConfirm(text: string, at: number) {
    const f = extractFacts(text)
    const hasInfo = f.years != null || !!f.role || f.stack.length > 0
    if (hasInfo) {
      if (f.stack.length && isNo(text)) this.facts.stack = f.stack
      this.merge({ ...f, stack: f.stack }, true)
      this.confirmRounds++
      if (this.confirmRounds >= 2) return this.begin(at, true)
      return this.say('confirm', readBack(this.facts).replace(/^So /, 'Thanks for correcting me. So '), at)
    }
    if (isYes(text)) return this.begin(at, true)
    this.confirmRounds++
    if (this.confirmRounds > 2) return this.begin(at, false)
    this.say('confirm', isNo(text) ? config.askWhatToFix : config.askYesNo, at)
  }

  private begin(at: number, confirmed: boolean) {
    this.confirmed = confirmed
    const sen = seniorityOf(this.facts)
    const mk = (kind: Item['kind'], text: string, q?: TechQuestion): Item => ({ kind, text, q, answer: '', confidence: null, typed: false, followedUp: false })
    this.queue = [
      ...this.profile.questions.map((t) => mk('mandatory', t)),
      ...selectQuestions(this.facts.stack, this.profile.tech, sen, this.profile.difficulty).map((q) => mk('tech', q.text, q)),
    ]
    this.next(at, config.toMandatory)
  }

  private next(at: number, lead?: string) {
    const it = this.queue.shift()
    if (!it) return this.finish('complete', at)
    const intro = lead ?? (it.kind === 'tech' && this.current?.kind === 'mandatory' ? config.toTechnical : this.ack())
    this.current = it
    this.items.push(it)
    this.say(it.kind, `${intro} ${it.text}`, at)
  }

  finish(reason: 'complete' | 'time' | 'left' | 'ended', at: number) {
    if (this.done) return
    this.done = true
    this.endReason = reason
    const close = fill(config.closing, this.name)
    if (reason !== 'left') this.say('closing', reason === 'time' ? `${config.outOfTime} ${close}` : close, at)
  }

  result(elapsedMs: number): Result {
    const seniority = seniorityOf(this.facts)
    const answered = this.items.filter((i) => i.answer)
    return {
      version: 1,
      inviteId: this.inviteId,
      candidateName: this.name || 'Candidate',
      profile: this.profile,
      startedAt: this.startedAt.toISOString(),
      durationSec: Math.round(elapsedMs / 1000),
      complete: this.endReason === 'complete' || this.endReason === 'time',
      endReason: this.endReason || 'left',
      facts: { ...this.facts, seniority, confirmed: this.confirmed },
      resumeFacts: this.resume,
      items: answered,
      transcript: this.transcript,
      score: scoreInterview(this.profile, this.facts, answered, this.endReason === 'complete' || this.endReason === 'time'),
    }
  }
}
